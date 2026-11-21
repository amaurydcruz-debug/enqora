import Link from "next/link";
import type { Metadata } from "next";
import {
  anularLiquidacionAction, aprobarLiquidacionAction, bajaTrabajadorAction, calcularLiquidacionAction, guardarMutualAction, guardarTrabajadorAction,
} from "@/app/actions/remuneraciones";
import { Notice } from "@/components/auth-card";
import { Callout } from "@/components/disclosure";
import { SubmitButton } from "@/components/submit-button";
import { booksCompany } from "@/lib/accounting-server";
import { messageForCode } from "@/lib/db-errors";
import { clp, todayCL } from "@/lib/pricing";
import { AFPS, CONTRATOS, MUTUALES, periodoValido, type Liquidacion, type Linea, type Novedades } from "@/lib/remuneraciones";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Remuneraciones" };

type Trab = {
  id: string; rut: string; nombre: string; cargo: string | null; fecha_ingreso: string; tipo_contrato: "indefinido" | "plazo_fijo" | "obra";
  sueldo_base: number; jornada_horas: number; afp: string; salud: "fonasa" | "isapre"; isapre: string | null; plan_isapre_uf: number | null;
  colacion: number; movilizacion: number; gratificacion: "art50" | "ninguna"; activo: boolean; fecha_baja: string | null; motivo_baja: string | null;
};
type Liq = {
  id: string; trabajador_id: string; version: number; estado: "borrador" | "aprobada" | "anulada"; detalle: Liquidacion; novedades: Novedades;
  total_imponible: number; liquido: number; costo_empresa: number; creado: string; aprobado_at: string | null; motivo_anulacion: string | null;
};
const AVISOS: Record<string, string> = {
  mutual: "Mutual guardada.", trabajador: "Trabajador agregado.", trabajador_editado: "Ficha actualizada (el cambio quedó en la bitácora).",
  baja: "Trabajador dado de baja. Su historial se conserva.", calculada: "Liquidación calculada como borrador. Revísala y apruébala.",
  aprobada: "Liquidación aprobada.", anulada: "Liquidación anulada con su motivo.",
};
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (p: string) => `${MESES[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;

// Remuneraciones: ficha de trabajadores, liquidación mensual con los parámetros aprobados por el equipo y aprobación humana.
export default async function RemuneracionesPage({ searchParams }: { searchParams: Promise<{ periodo?: string; aviso?: string; error?: string }> }) {
  const sp = await searchParams;
  const company = await booksCompany();
  if (!company) {
    return (
      <div className="page narrow">
        <header className="hero"><div className="hero-main"><span className="eyebrow">Tu equipo</span><h1>Remuneraciones</h1></div></header>
        <Callout kind="info" title="Registra tu empresa para comenzar" action={<Link href="/empresas/nueva" className="btn btn-gold btn-inline btn-sm">Registrar empresa</Link>}>
          Las remuneraciones se llevan por empresa.
        </Callout>
      </div>
    );
  }
  if (!company.canBook) {
    return (
      <div className="page narrow">
        <header className="hero"><div className="hero-main"><span className="eyebrow">{company.name}</span><h1>Remuneraciones</h1></div></header>
        <Callout kind="info" title="Acceso restringido">Las remuneraciones las ven el propietario, el administrador y el contador de la empresa (son datos personales de los trabajadores).</Callout>
      </div>
    );
  }
  const hoy = todayCL();
  const periodo = sp.periodo && periodoValido(sp.periodo) ? sp.periodo : hoy.slice(0, 7);
  const supabase = await createClient();
  const [{ data: tRows }, { data: lRows }, { data: par }, { data: emp }] = await Promise.all([
    supabase.from("rem_trabajadores").select("id, rut, nombre, cargo, fecha_ingreso, tipo_contrato, sueldo_base, jornada_horas, afp, salud, isapre, plan_isapre_uf, colacion, movilizacion, gratificacion, activo, fecha_baja, motivo_baja")
      .eq("company_id", company.id).order("activo", { ascending: false }).order("nombre"),
    supabase.from("rem_liquidaciones").select("id, trabajador_id, version, estado, detalle, novedades, total_imponible, liquido, costo_empresa, creado, aprobado_at, motivo_anulacion")
      .eq("company_id", company.id).eq("periodo", periodo).order("version", { ascending: false }),
    supabase.from("rem_parametros").select("id, version, fuente, aprobado_at").eq("periodo", periodo).eq("estado", "aprobado").maybeSingle(),
    supabase.from("rem_empresa").select("mutual, tasa_mutual").eq("company_id", company.id).maybeSingle(),
  ]);
  const trabajadores = (tRows ?? []) as Trab[];
  const liqs = (lRows ?? []) as Liq[];
  const parametros = par as { id: string; version: number; fuente: string; aprobado_at: string } | null;
  const mutual = emp as { mutual: string; tasa_mutual: number } | null;
  const activos = trabajadores.filter((t) => t.activo);
  const aprobadas = liqs.filter((l) => l.estado === "aprobada");
  const suma = (k: "liquido" | "costo_empresa" | "total_imponible") => aprobadas.reduce((s, l) => s + Number(l[k]), 0);
  const vigente = (tid: string) => liqs.find((l) => l.trabajador_id === tid && l.estado !== "anulada");
  const anuladas = (tid: string) => liqs.filter((l) => l.trabajador_id === tid && l.estado === "anulada");

  return (
    <div className="page narrow ps">
      {sp.aviso && AVISOS[sp.aviso] ? <Notice kind="ok">{AVISOS[sp.aviso]}</Notice> : null}
      {sp.error ? <Notice kind="error">{messageForCode(sp.error) ?? "No pudimos completar la operación."}</Notice> : null}
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">{company.name} · Tu equipo</span>
          <h1>Remuneraciones</h1>
          <p className="hero-lead">Ficha de tus trabajadores y liquidación de sueldo de cada mes. ENQORA calcula con los indicadores oficiales del mes; tú revisas y apruebas.</p>
        </div>
      </header>

      <form method="get" className="upload-row rem-periodo">
        <label htmlFor="rem-periodo">Mes</label>
        <input id="rem-periodo" name="periodo" type="month" className="input input-sm" defaultValue={periodo} max={hoy.slice(0, 7)} />
        <button type="submit" className="btn btn-ghost btn-inline btn-sm">Ver</button>
      </form>

      {parametros ? (
        <p className="muted-line">Indicadores de {nombreMes(periodo)} aprobados por el equipo ENQORA (versión {parametros.version}). Fuente: {parametros.fuente}</p>
      ) : (
        <Callout kind="info" title={`Indicadores de ${nombreMes(periodo)} en revisión`}>
          El equipo ENQORA carga y aprueba cada mes la UF, la UTM, los topes y las tasas previsionales con su fuente oficial. Puedes completar las fichas; las liquidaciones se calculan apenas estén aprobados.
        </Callout>
      )}

      <section className="ps-card" aria-labelledby="rem-resumen">
        <div className="ps-card-cab"><h2 id="rem-resumen">Resumen de {nombreMes(periodo)}</h2></div>
        <dl className="gx-totales">
          <div><dt>Trabajadores activos</dt><dd>{activos.length}</dd></div>
          <div><dt>Líquido aprobado</dt><dd>{clp(suma("liquido"))}</dd></div>
          <div><dt>Costo empresa aprobado</dt><dd>{clp(suma("costo_empresa"))}</dd></div>
        </dl>
        <p className="muted-line">{aprobadas.length} de {activos.length} liquidaciones aprobadas. La planilla de Previred y el Libro de Remuneraciones Electrónico se generan desde las liquidaciones aprobadas (próxima etapa).</p>
      </section>

      <section className="ps-card" aria-labelledby="rem-mutual">
        <div className="ps-card-cab"><h2 id="rem-mutual">Mutual de seguridad</h2></div>
        <form action={guardarMutualAction} className="form-grid">
          <input type="hidden" name="empresa" value={company.id} />
          <input type="hidden" name="periodo" value={periodo} />
          <div className="field">
            <label htmlFor="rem-mutual-sel">Organismo administrador</label>
            <select id="rem-mutual-sel" name="mutual" className="input" defaultValue={mutual?.mutual ?? ""} required>
              <option value="" disabled>Elige…</option>
              {MUTUALES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="rem-mutual-tasa">Tasa total (%)</label>
            <input id="rem-mutual-tasa" name="tasa" className="input" inputMode="decimal" required defaultValue={mutual ? String(mutual.tasa_mutual).replace(".", ",") : ""} placeholder="Ej.: 0,93" />
            <span className="hint">Básica más adicional, según el certificado de tu mutual.</span>
          </div>
          <div className="field"><label>&nbsp;</label><SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="Guardando…">Guardar</SubmitButton></div>
        </form>
      </section>

      <section className="ps-card" aria-labelledby="rem-trab">
        <div className="ps-card-cab"><h2 id="rem-trab">Trabajadores</h2></div>
        {trabajadores.length ? (
          <ul className="ps-filas rem-lista">
            {trabajadores.map((t) => {
              const liq = vigente(t.id);
              return (
                <li key={t.id} id={`t-${t.id}`} className={t.activo ? "" : "is-descartado"}>
                  <span>
                    <b>{t.nombre}</b>
                    <small>
                      {t.rut} · {t.cargo ? `${t.cargo} · ` : ""}{CONTRATOS[t.tipo_contrato]} · {clp(Number(t.sueldo_base))} base · {Number(t.jornada_horas)} h · AFP {t.afp} · {t.salud === "isapre" ? `Isapre ${t.isapre ?? ""} (${String(t.plan_isapre_uf).replace(".", ",")} UF)` : "Fonasa"}
                      {t.activo ? "" : ` · baja ${t.fecha_baja}${t.motivo_baja ? `: ${t.motivo_baja}` : ""}`}
                    </small>
                  </span>
                  {liq ? <b className="mono">{clp(Number(liq.liquido))}</b> : null}
                  {t.activo ? (
                    <div className="rem-acciones">
                      {liq ? <LiquidacionVista liq={liq} periodo={periodo} /> : null}
                      {anuladas(t.id).length ? <small className="muted-line">{anuladas(t.id).length} versión(es) anulada(s) en este mes, conservadas en el historial.</small> : null}
                      {parametros && liq?.estado !== "aprobada" ? (
                        <details className="ps-docs" open={!liq}>
                          <summary>{liq ? "Recalcular" : "Calcular liquidación"}</summary>
                          <form action={calcularLiquidacionAction} className="form-grid">
                            <input type="hidden" name="trabajador" value={t.id} />
                            <input type="hidden" name="periodo" value={periodo} />
                            <Campo id={`d-${t.id}`} name="dias" label="Días trabajados" def={String(liq?.novedades.dias_trabajados ?? 30)} />
                            <Campo id={`h-${t.id}`} name="horas_extra" label="Horas extra" def={String(liq?.novedades.horas_extra ?? 0)} />
                            <Campo id={`b-${t.id}`} name="bonos" label="Bonos imponibles ($)" def={String(liq?.novedades.bonos_imponibles ?? 0)} />
                            <Campo id={`a-${t.id}`} name="anticipos" label="Anticipos ($)" def={String(liq?.novedades.anticipos ?? 0)} />
                            <Campo id={`o-${t.id}`} name="otros" label="Otros descuentos ($)" def={String(liq?.novedades.otros_descuentos ?? 0)} />
                            <div className="field"><label>&nbsp;</label><SubmitButton className="btn-inline btn-sm" pendingText="Calculando…">Calcular</SubmitButton></div>
                          </form>
                        </details>
                      ) : null}
                      <details className="ps-docs">
                        <summary>Editar ficha</summary>
                        <FichaForm empresa={company.id} periodo={periodo} t={t} />
                      </details>
                      <details className="ps-docs">
                        <summary>Dar de baja</summary>
                        <form action={bajaTrabajadorAction} className="upload-row">
                          <input type="hidden" name="id" value={t.id} />
                          <input type="hidden" name="periodo" value={periodo} />
                          <input name="fecha" type="date" className="input input-sm" required defaultValue={hoy} aria-label="Fecha de término" />
                          <input name="motivo" className="input input-sm" required minLength={3} maxLength={300} placeholder="Causal o motivo" aria-label="Motivo" />
                          <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Dar de baja</SubmitButton>
                        </form>
                      </details>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : <p className="muted-line">Aún no registras trabajadores.</p>}
        <details className="ps-docs" open={!trabajadores.length}>
          <summary>Agregar trabajador</summary>
          <FichaForm empresa={company.id} periodo={periodo} />
        </details>
      </section>

      <Callout kind="info" title="Cálculo referencial, con revisión humana">
        La liquidación usa las reglas generales (gratificación del art. 50 con tope de 4,75 ingresos mínimos al año, horas extra con recargo del 50%, impuesto único por tramos en UTM). Casos especiales —licencias médicas, semana corrida, pactos de isapre en pesos, APV o cargas familiares— se ajustan con tu contador antes de aprobar.
      </Callout>
    </div>
  );
}

function Campo({ id, name, label, def }: { id: string; name: string; label: string; def: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} className="input" inputMode="decimal" defaultValue={def} />
    </div>
  );
}

function Lineas({ titulo, lineas }: { titulo: string; lineas: Linea[] }) {
  if (!lineas?.length) return null;
  return (
    <>
      <tr className="rem-sub"><th colSpan={2}>{titulo}</th></tr>
      {lineas.map((l, i) => <tr key={i}><td>{l.concepto}</td><td className="mono">{clp(l.monto)}</td></tr>)}
    </>
  );
}

function LiquidacionVista({ liq, periodo }: { liq: Liq; periodo: string }) {
  const d = liq.detalle;
  return (
    <details className="ps-docs" open={liq.estado === "borrador"}>
      <summary>
        Liquidación v{liq.version} · {liq.estado === "aprobada" ? "✓ aprobada" : "borrador por aprobar"} · costo empresa {clp(Number(liq.costo_empresa))}
      </summary>
      <table className="rem-tabla">
        <tbody>
          <Lineas titulo="Haberes imponibles" lineas={d.haberes_imponibles} />
          <Lineas titulo="Haberes no imponibles" lineas={d.haberes_no_imponibles} />
          <Lineas titulo="Descuentos" lineas={d.descuentos} />
          <tr className="rem-total"><td>Líquido a pagar</td><td className="mono">{clp(d.liquido)}</td></tr>
          <Lineas titulo="Aportes de cargo del empleador" lineas={d.aportes_empleador} />
          <tr className="rem-total"><td>Costo empresa</td><td className="mono">{clp(d.costo_empresa)}</td></tr>
        </tbody>
      </table>
      <small className="muted-line">Imponible {clp(d.total_imponible)} · base del impuesto {clp(d.base_tributable)}</small>
      {d.advertencias?.length ? <ul className="rem-adv">{d.advertencias.map((a, i) => <li key={i}>{a}</li>)}</ul> : null}
      {liq.estado === "borrador" ? (
        <form action={aprobarLiquidacionAction} className="upload-row">
          <input type="hidden" name="id" value={liq.id} />
          <input type="hidden" name="periodo" value={periodo} />
          <label className="field-check"><input type="checkbox" name="confirmo" value="si" required /> Revisé los días, haberes y descuentos</label>
          <SubmitButton className="btn-inline btn-sm" pendingText="Aprobando…">Aprobar liquidación</SubmitButton>
        </form>
      ) : null}
      <form action={anularLiquidacionAction} className="upload-row">
        <input type="hidden" name="id" value={liq.id} />
        <input type="hidden" name="periodo" value={periodo} />
        <input name="motivo" className="input input-sm" required minLength={3} maxLength={300} placeholder="Motivo para anular" aria-label="Motivo para anular" />
        <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Anular</SubmitButton>
      </form>
    </details>
  );
}

function FichaForm({ empresa, periodo, t }: { empresa: string; periodo: string; t?: Trab }) {
  const p = t ? t.id.slice(0, 8) : "nuevo";
  return (
    <form action={guardarTrabajadorAction} className="form-grid">
      <input type="hidden" name="empresa" value={empresa} />
      <input type="hidden" name="periodo" value={periodo} />
      {t ? <input type="hidden" name="id" value={t.id} /> : null}
      <div className="field">
        <label htmlFor={`${p}-rut`}>RUT</label>
        <input id={`${p}-rut`} name="rut" className="input" required={!t} disabled={!!t} defaultValue={t?.rut} placeholder="12.345.678-5" autoComplete="off" />
      </div>
      <div className="field field-wide">
        <label htmlFor={`${p}-nombre`}>Nombre completo</label>
        <input id={`${p}-nombre`} name="nombre" className="input" required minLength={3} maxLength={120} defaultValue={t?.nombre} autoComplete="off" />
      </div>
      <div className="field">
        <label htmlFor={`${p}-cargo`}>Cargo</label>
        <input id={`${p}-cargo`} name="cargo" className="input" maxLength={80} defaultValue={t?.cargo ?? ""} />
      </div>
      <div className="field">
        <label htmlFor={`${p}-ing`}>Fecha de ingreso</label>
        <input id={`${p}-ing`} name="fecha_ingreso" type="date" className="input" required defaultValue={t?.fecha_ingreso} />
      </div>
      <div className="field">
        <label htmlFor={`${p}-con`}>Contrato</label>
        <select id={`${p}-con`} name="tipo_contrato" className="input" defaultValue={t?.tipo_contrato ?? "indefinido"}>
          {Object.entries(CONTRATOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${p}-sb`}>Sueldo base mensual ($)</label>
        <input id={`${p}-sb`} name="sueldo_base" className="input" inputMode="numeric" required defaultValue={t ? String(t.sueldo_base) : ""} />
      </div>
      <div className="field">
        <label htmlFor={`${p}-jor`}>Jornada semanal (horas)</label>
        <input id={`${p}-jor`} name="jornada_horas" className="input" inputMode="decimal" required defaultValue={t ? String(t.jornada_horas) : "42"} />
      </div>
      <div className="field">
        <label htmlFor={`${p}-afp`}>AFP</label>
        <select id={`${p}-afp`} name="afp" className="input" defaultValue={t?.afp ?? ""} required>
          <option value="" disabled>Elige…</option>
          {AFPS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${p}-sal`}>Salud</label>
        <select id={`${p}-sal`} name="salud" className="input" defaultValue={t?.salud ?? "fonasa"}>
          <option value="fonasa">Fonasa</option>
          <option value="isapre">Isapre</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${p}-isa`}>Isapre (si aplica)</label>
        <input id={`${p}-isa`} name="isapre" className="input" maxLength={40} defaultValue={t?.isapre ?? ""} />
      </div>
      <div className="field">
        <label htmlFor={`${p}-plan`}>Plan isapre (UF)</label>
        <input id={`${p}-plan`} name="plan_isapre_uf" className="input" inputMode="decimal" defaultValue={t?.plan_isapre_uf != null ? String(t.plan_isapre_uf).replace(".", ",") : ""} />
      </div>
      <div className="field">
        <label htmlFor={`${p}-col`}>Colación mensual ($)</label>
        <input id={`${p}-col`} name="colacion" className="input" inputMode="numeric" defaultValue={t ? String(t.colacion) : "0"} />
      </div>
      <div className="field">
        <label htmlFor={`${p}-mov`}>Movilización mensual ($)</label>
        <input id={`${p}-mov`} name="movilizacion" className="input" inputMode="numeric" defaultValue={t ? String(t.movilizacion) : "0"} />
      </div>
      <div className="field">
        <label htmlFor={`${p}-gra`}>Gratificación</label>
        <select id={`${p}-gra`} name="gratificacion" className="input" defaultValue={t?.gratificacion ?? "art50"}>
          <option value="art50">Art. 50 (25%, con tope)</option>
          <option value="ninguna">No corresponde</option>
        </select>
      </div>
      <div className="field"><label>&nbsp;</label><SubmitButton variant={t ? "ghost" : undefined} className="btn-inline btn-sm" pendingText="Guardando…">{t ? "Guardar cambios" : "Agregar"}</SubmitButton></div>
    </form>
  );
}
