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
import { CAUSALES, CCAFS, ISAPRES, JORNADAS_LRE } from "@/lib/rem-archivos";
import { prepararArchivos } from "@/lib/rem-archivos-server";
import { AFPS, CONTRATOS, MUTUALES, periodoValido, type Liquidacion, type Linea, type Novedades } from "@/lib/remuneraciones";
import { createClient } from "@/lib/supabase/server";
import { saldoVacaciones, type RegistroVacacion } from "@/lib/vacaciones";
import { type Fin, FiniquitoBloque } from "./finiquito-bloque";
import { VacacionesBloque } from "./vacaciones-bloque";
import { ContratoBloque, type DocContrato } from "./contrato-bloque";

export const metadata: Metadata = { title: "Remuneraciones" };

type Trab = {
  id: string; rut: string; nombre: string; cargo: string | null; fecha_ingreso: string; tipo_contrato: "indefinido" | "plazo_fijo" | "obra";
  sueldo_base: number; jornada_horas: number; afp: string; salud: "fonasa" | "isapre"; isapre: string | null; plan_isapre_uf: number | null;
  colacion: number; movilizacion: number; gratificacion: "art50" | "ninguna"; activo: boolean; fecha_baja: string | null; motivo_baja: string | null;
  apellido_paterno: string | null; apellido_materno: string | null; nombres: string | null; sexo: "M" | "F" | null; extranjero: boolean;
  comuna: number | null; jornada_lre: number | null; fun: string | null; causal_termino: number | null;
  apv_regimen: "A" | "B" | null; apv_monto: number | null; apv_afp: string | null; apv_contrato: string | null; apv_forma: number | null;
  tramo_af: "A" | "B" | "C" | "D" | null; cargas_simples: number; cargas_maternales: number; cargas_invalidez: number;
};
type Liq = {
  id: string; trabajador_id: string; version: number; estado: "borrador" | "aprobada" | "anulada"; detalle: Liquidacion; novedades: Novedades;
  total_imponible: number; liquido: number; costo_empresa: number; creado: string; aprobado_at: string | null; motivo_anulacion: string | null;
};
const AVISOS: Record<string, string> = {
  mutual: "Datos de la empresa guardados.", trabajador: "Trabajador agregado.", trabajador_editado: "Ficha actualizada (el cambio quedó en la bitácora).",
  baja: "Trabajador dado de baja. Su historial se conserva.", calculada: "Liquidación calculada como borrador. Revísala y apruébala.",
  aprobada: "Liquidación aprobada.", anulada: "Liquidación anulada con su motivo.",
  finiquito: "Finiquito calculado y enviado a revisión del equipo ENQORA. Te avisaremos cuando esté aprobado.",
  finiquito_anulado: "Versión del finiquito anulada con su motivo.",
  contrato: "Contrato enviado a revisión del abogado de ENQORA. Te avisaremos cuando esté aprobado.", anexo: "Anexo enviado a revisión del abogado de ENQORA.", pacto: "Pacto de horas extraordinarias enviado a revisión del abogado de ENQORA.",
  contrato_anulado: "Documento anulado con su motivo.",
  vacacion: "Registro de vacaciones guardado.", vacacion_anulada: "Registro de vacaciones anulado con su motivo.",
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
  const [{ data: tRows }, { data: lRows }, { data: par }, { data: emp }, { data: xRows }, prep, { data: fRows }, { data: ultPar }, { data: vRows }, { data: kRows }, { data: emp2 }] = await Promise.all([
    supabase.from("rem_trabajadores").select("id, rut, nombre, cargo, fecha_ingreso, tipo_contrato, sueldo_base, jornada_horas, afp, salud, isapre, plan_isapre_uf, colacion, movilizacion, gratificacion, activo, fecha_baja, motivo_baja, apellido_paterno, apellido_materno, nombres, sexo, extranjero, comuna, jornada_lre, fun, causal_termino, apv_regimen, apv_monto, apv_afp, apv_contrato, apv_forma, tramo_af, cargas_simples, cargas_maternales, cargas_invalidez")
      .eq("company_id", company.id).order("activo", { ascending: false }).order("nombre"),
    supabase.from("rem_liquidaciones").select("id, trabajador_id, version, estado, detalle, novedades, total_imponible, liquido, costo_empresa, creado, aprobado_at, motivo_anulacion")
      .eq("company_id", company.id).eq("periodo", periodo).order("version", { ascending: false }),
    supabase.from("rem_parametros").select("id, version, fuente, aprobado_at").eq("periodo", periodo).eq("estado", "aprobado").maybeSingle(),
    supabase.from("rem_empresa").select("mutual, tasa_mutual, ccaf, mutual_sucursal").eq("company_id", company.id).maybeSingle(),
    supabase.from("rem_exportaciones").select("tipo, trabajadores, sha256, creado").eq("company_id", company.id).eq("periodo", periodo).order("creado", { ascending: false }).limit(6),
    prepararArchivos(company.id, periodo),
    supabase.from("rem_finiquitos").select("id, trabajador_id, version, estado, datos, detalle, total, creado, revisado_at, observacion")
      .eq("company_id", company.id).order("version", { ascending: false }),
    supabase.from("rem_parametros").select("valores").eq("estado", "aprobado").order("periodo", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("rem_vacaciones").select("id, trabajador_id, tipo, desde, hasta, dias, nota, estado, creado, motivo_anulacion")
      .eq("company_id", company.id).order("desde", { ascending: false }),
    supabase.from("rem_contratos").select("id, trabajador_id, tipo, version, numero_anexo, estado, datos, avisos, observacion, creado")
      .eq("company_id", company.id).order("version", { ascending: false }),
    supabase.from("companies").select("commune").eq("id", company.id).maybeSingle(),
  ]);
  const contratos = (kRows ?? []) as DocContrato[];
  const ciudadEmpresa = (emp2 as { commune?: string | null } | null)?.commune ?? "";
  const vacaciones = (vRows ?? []) as RegistroVacacion[];
  const vacDe = (tid: string) => vacaciones.filter((v) => v.trabajador_id === tid);
  const saldoDe = (t: Trab) => {
    const corte = t.fecha_baja && t.fecha_baja < hoy ? t.fecha_baja : hoy;
    return saldoVacaciones(t.fecha_ingreso, corte, corte, vacDe(t.id));
  };
  const finiquitos = (fRows ?? []) as Fin[];
  const finDe = (tid: string) => finiquitos.find((f) => f.trabajador_id === tid && f.estado !== "anulado") ?? finiquitos.find((f) => f.trabajador_id === tid) ?? null;
  const pv = (ultPar as { valores?: { uf?: number; imm?: number } } | null)?.valores;
  // Propuesta inicial de la base del art. 172 desde la ficha (la empresa la corrige si hay otros pagos mensuales).
  const prefill = (t: Trab) => {
    const s = Number(t.sueldo_base);
    const grat = t.gratificacion === "art50" && pv?.imm ? Math.min(Math.round(s * 0.25), Math.round((4.75 * pv.imm) / 12)) : 0;
    // Días pendientes de períodos cumplidos, desde el control de vacaciones (solo si hay registros).
    const dp = vacDe(t.id).length ? Math.max(0, saldoDe(t).saldo) : null;
    return { base: s + grat + Number(t.colacion) + Number(t.movilizacion), base_feriado: s, uf: pv?.uf ?? null, dias_pendientes: dp };
  };
  const exportes = (xRows ?? []) as { tipo: string; trabajadores: number; sha256: string; creado: string }[];
  const trabajadores = (tRows ?? []) as Trab[];
  const liqs = (lRows ?? []) as Liq[];
  const parametros = par as { id: string; version: number; fuente: string; aprobado_at: string } | null;
  const mutual = emp as { mutual: string; tasa_mutual: number; ccaf: number; mutual_sucursal: number | null } | null;
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
        <p className="muted-line"><Link href="/remuneraciones/anual" className="ps-link">Resumen anual y certificados de sueldos (N° 6) →</Link></p>
      </section>

      <section className="ps-card" aria-labelledby="rem-mutual">
        <div className="ps-card-cab"><h2 id="rem-mutual">Datos previsionales de la empresa</h2></div>
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
          <div className="field">
            <label htmlFor="rem-mutual-suc">Sucursal de pago de la mutual</label>
            <input id="rem-mutual-suc" name="sucursal" className="input" inputMode="numeric" defaultValue={mutual?.mutual_sucursal ?? ""} placeholder="Ej.: 1" />
            <span className="hint">Código que asigna la mutual (Previred, campo 99). No aplica al ISL.</span>
          </div>
          <div className="field">
            <label htmlFor="rem-ccaf">Caja de compensación</label>
            <select id="rem-ccaf" name="ccaf" className="input" defaultValue={String(mutual?.ccaf ?? 0)}>
              {Object.entries(CCAFS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
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
                      {t.activo ? "" : ` · baja ${t.fecha_baja}${t.causal_termino ? ` · ${CAUSALES[t.causal_termino] ?? ""}` : ""}${t.motivo_baja ? `: ${t.motivo_baja}` : ""}`}
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
                            <Campo id={`l-${t.id}`} name="dias_licencia" label="Días con licencia médica" def={String(liq?.novedades.dias_licencia ?? 0)} />
                            <div className="field">
                              <label htmlFor={`lt-${t.id}`}>Tipo de licencia</label>
                              <select id={`lt-${t.id}`} name="licencia_tipo" className="input" defaultValue={liq?.novedades.licencia?.tipo ?? "comun"}>
                                <option value="comun">Enfermedad o accidente común</option>
                                <option value="laboral">Accidente del trabajo o enfermedad profesional</option>
                              </select>
                            </div>
                            <div className="field">
                              <label htmlFor={`ld-${t.id}`}>Licencia desde</label>
                              <input id={`ld-${t.id}`} name="licencia_desde" type="date" className="input" defaultValue={liq?.novedades.licencia?.desde ?? ""} />
                            </div>
                            <div className="field">
                              <label htmlFor={`lh-${t.id}`}>Licencia hasta</label>
                              <input id={`lh-${t.id}`} name="licencia_hasta" type="date" className="input" defaultValue={liq?.novedades.licencia?.hasta ?? ""} />
                              <span className="hint">Fecha de término de la licencia, aunque pase al mes siguiente.</span>
                            </div>
                            <div className="field">
                              <label htmlFor={`lr-${t.id}`}>Renta imponible del mes anterior a la licencia ($)</label>
                              <input id={`lr-${t.id}`} name="rima" className="input" inputMode="numeric" defaultValue={liq?.novedades.rima ? String(liq.novedades.rima) : ""} />
                              <span className="hint">Si la dejas vacía, se toma de la liquidación aprobada de ese mes.</span>
                            </div>
                            <div className="field"><label>&nbsp;</label><SubmitButton className="btn-inline btn-sm" pendingText="Calculando…">Calcular</SubmitButton></div>
                          </form>
                        </details>
                      ) : null}
                      <ContratoBloque t={t} docs={contratos.filter((k) => k.trabajador_id === t.id)} hoy={hoy} ciudad={ciudadEmpresa} />
                      <VacacionesBloque t={t} saldo={saldoDe(t)} registros={vacDe(t.id)} hoy={hoy} />
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
                          <select name="causal" className="input input-sm" required defaultValue="" aria-label="Causal de término">
                            <option value="" disabled>Causal legal…</option>
                            {Object.entries(CAUSALES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                          <input name="motivo" className="input input-sm" maxLength={300} placeholder="Nota (opcional)" aria-label="Nota" />
                          <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Dar de baja</SubmitButton>
                        </form>
                      </details>
                    </div>
                  ) : t.fecha_baja ? (
                    <FiniquitoBloque t={t} fin={finDe(t.id)} prefill={prefill(t)} />
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

      <section className="ps-card" id="archivos" aria-labelledby="rem-archivos">
        <div className="ps-card-cab"><h2 id="rem-archivos">Archivos de {nombreMes(periodo)}</h2></div>
        {prep.filas.length === 0 ? (
          <p className="muted-line">Los archivos se generan con las liquidaciones aprobadas del mes. Aún no hay ninguna aprobada.</p>
        ) : (
          <>
            {prep.faltanEmpresa.length || prep.filas.some((f) => f.faltan.length) ? (
              <ul className="rem-adv">
                {prep.faltanEmpresa.map((x) => <li key={x}>Empresa: falta {x}.</li>)}
                {prep.filas.filter((f) => f.faltan.length).map((f) => <li key={f.ficha.rut}>{f.ficha.nombre}: falta {f.faltan.join(", ")}.</li>)}
              </ul>
            ) : null}
            <div className="upload-row">
              {prep.listo ? (
                <>
                  <a className="btn btn-gold btn-inline btn-sm" href={`/remuneraciones/archivo?tipo=previred&periodo=${periodo}`}>Nómina Previred (.txt)</a>
                  <a className="btn btn-ghost btn-inline btn-sm" href={`/remuneraciones/archivo?tipo=lre&periodo=${periodo}`}>Libro de Remuneraciones (.csv)</a>
                </>
              ) : <span className="muted-line">Completa los datos pendientes para descargar.</span>}
            </div>
            <p className="muted-line">
              {prep.filas.length} liquidación(es) aprobada(s). Previred: formato estándar por separador de 105 campos (al cargar, elige ese formato y revisa la cuadratura antes de pagar). LRE: carga masiva CSV en el portal de la Dirección del Trabajo, dentro de los 15 primeros días hábiles del mes siguiente. Los aportes de la Ley 21.735 se informan en el código 4155 mientras la Dirección del Trabajo no publique códigos propios.
            </p>
            {exportes.length ? (
              <ul className="ps-filas">
                {exportes.map((x) => (
                  <li key={x.sha256 + x.creado}><span><b>{x.tipo === "previred" ? "Previred" : "LRE"} · {x.trabajadores} trabajador(es)</b><small>{new Date(x.creado).toLocaleString("es-CL", { timeZone: "America/Santiago" })} · huella {x.sha256.slice(0, 12)}…</small></span></li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </section>

      <Callout kind="info" title="Cálculo referencial, con revisión humana">
        La liquidación usa las reglas generales (gratificación del art. 50 con tope de 4,75 ingresos mínimos al año, horas extra con recargo del 50%, impuesto único por tramos en UTM). Casos especiales —licencias médicas, semana corrida, pactos de isapre en pesos, APV en bancos o compañías de seguros, cargas familiares, pensionados o un ingreso y retiro en el mismo mes— se ajustan con tu contador antes de aprobar.
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
      <div className="field">
        <label htmlFor={`${p}-nom`}>Nombres</label>
        <input id={`${p}-nom`} name="nombres" className="input" required maxLength={30} defaultValue={t?.nombres ?? (t && !t.apellido_paterno ? t.nombre : "")} autoComplete="off" />
      </div>
      <div className="field">
        <label htmlFor={`${p}-ap`}>Apellido paterno</label>
        <input id={`${p}-ap`} name="apellido_paterno" className="input" required maxLength={30} defaultValue={t?.apellido_paterno ?? ""} autoComplete="off" />
      </div>
      <div className="field">
        <label htmlFor={`${p}-am`}>Apellido materno</label>
        <input id={`${p}-am`} name="apellido_materno" className="input" maxLength={30} defaultValue={t?.apellido_materno ?? ""} autoComplete="off" />
      </div>
      <div className="field">
        <label htmlFor={`${p}-sexo`}>Sexo (registro civil)</label>
        <select id={`${p}-sexo`} name="sexo" className="input" defaultValue={t?.sexo ?? ""} required>
          <option value="" disabled>Elige…</option>
          <option value="F">Femenino</option>
          <option value="M">Masculino</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${p}-nac`}>Nacionalidad</label>
        <select id={`${p}-nac`} name="extranjero" className="input" defaultValue={t?.extranjero ? "si" : "no"}>
          <option value="no">Chilena</option>
          <option value="si">Extranjera</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${p}-com`}>Comuna donde trabaja (código)</label>
        <input id={`${p}-com`} name="comuna" className="input" inputMode="numeric" required defaultValue={t?.comuna ?? ""} placeholder="Ej.: 13101 (Santiago)" />
        <span className="hint">Código de comuna de la tabla del LRE (Dirección del Trabajo).</span>
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
        <label htmlFor={`${p}-jlre`}>Tipo de jornada (LRE)</label>
        <select id={`${p}-jlre`} name="jornada_lre" className="input" defaultValue={String(t?.jornada_lre ?? 101)}>
          {Object.entries(JORNADAS_LRE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
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
        <select id={`${p}-isa`} name="isapre" className="input" defaultValue={t?.isapre && t.isapre in ISAPRES ? t.isapre : ""}>
          <option value="">—</option>
          {Object.keys(ISAPRES).map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${p}-fun`}>N° de FUN (isapre)</label>
        <input id={`${p}-fun`} name="fun" className="input" maxLength={16} defaultValue={t?.fun ?? ""} />
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
      <div className="field">
        <label htmlFor={`${p}-apv`}>APV por planilla</label>
        <select id={`${p}-apv`} name="apv_regimen" className="input" defaultValue={t?.apv_regimen ?? ""}>
          <option value="">No tiene</option>
          <option value="A">Régimen A (bonificación 15%)</option>
          <option value="B">Régimen B (rebaja de impuesto)</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${p}-apvm`}>APV mensual ($)</label>
        <input id={`${p}-apvm`} name="apv_monto" className="input" inputMode="numeric" defaultValue={t?.apv_monto != null ? String(t.apv_monto) : ""} />
      </div>
      <div className="field">
        <label htmlFor={`${p}-apva`}>AFP del APV</label>
        <select id={`${p}-apva`} name="apv_afp" className="input" defaultValue={t?.apv_afp ?? ""}>
          <option value="">—</option>
          {AFPS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${p}-apvc`}>N° de contrato APV</label>
        <input id={`${p}-apvc`} name="apv_contrato" className="input" maxLength={20} defaultValue={t?.apv_contrato ?? ""} />
      </div>
      <div className="field">
        <label htmlFor={`${p}-apvf`}>Forma de pago del APV</label>
        <select id={`${p}-apvf`} name="apv_forma" className="input" defaultValue={String(t?.apv_forma ?? 1)}>
          <option value="1">Directa</option>
          <option value="2">Indirecta</option>
        </select>
        <span className="hint">Según el mandato que firmó el trabajador con la AFP.</span>
      </div>
      <div className="field">
        <label htmlFor={`${p}-taf`}>Tramo de asignación familiar</label>
        <select id={`${p}-taf`} name="tramo_af" className="input" defaultValue={t?.tramo_af ?? ""}>
          <option value="">Sin cargas</option>
          <option value="A">Tramo A</option>
          <option value="B">Tramo B</option>
          <option value="C">Tramo C</option>
          <option value="D">Tramo D (sin pago)</option>
        </select>
        <span className="hint">El de la resolución del IPS o de la CCAF, según el ingreso promedio del trabajador.</span>
      </div>
      <div className="field">
        <label htmlFor={`${p}-cs`}>Cargas simples</label>
        <input id={`${p}-cs`} name="cargas_simples" className="input" inputMode="numeric" defaultValue={String(t?.cargas_simples ?? 0)} />
      </div>
      <div className="field">
        <label htmlFor={`${p}-cm`}>Cargas maternales</label>
        <input id={`${p}-cm`} name="cargas_maternales" className="input" inputMode="numeric" defaultValue={String(t?.cargas_maternales ?? 0)} />
      </div>
      <div className="field">
        <label htmlFor={`${p}-ci`}>Cargas por invalidez</label>
        <input id={`${p}-ci`} name="cargas_invalidez" className="input" inputMode="numeric" defaultValue={String(t?.cargas_invalidez ?? 0)} />
        <span className="hint">Estas cuentan doble.</span>
      </div>
      <div className="field"><label>&nbsp;</label><SubmitButton variant={t ? "ghost" : undefined} className="btn-inline btn-sm" pendingText="Guardando…">{t ? "Guardar cambios" : "Agregar"}</SubmitButton></div>
    </form>
  );
}
