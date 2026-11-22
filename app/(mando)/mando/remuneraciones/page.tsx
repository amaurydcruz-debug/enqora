import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { decidirParametrosAction, proponerParametrosAction } from "@/app/actions/remuneraciones";
import { Notice } from "@/components/auth-card";
import { Callout } from "@/components/disclosure";
import { SubmitButton } from "@/components/submit-button";
import { messageForCode } from "@/lib/db-errors";
import { todayCL } from "@/lib/pricing";
import { AFPS, CLAVES_PARAMETROS, leerParametros, periodoValido, type Parametros } from "@/lib/remuneraciones";
import { myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Parámetros de remuneraciones" };

type Fila = { id: string; periodo: string; version: number; valores: unknown; fuente: string; observaciones: string | null; estado: string; creado: string; aprobado_at: string | null };
const AVISOS: Record<string, string> = {
  propuesto: "Parámetros guardados como borrador. Otra revisión y se aprueban.",
  aprobado: "Parámetros aprobados: los clientes ya pueden calcular las liquidaciones de ese mes.",
  descartado: "Borrador descartado (queda en el historial).",
};
const ESTADO: Record<string, string> = { borrador: "Borrador", aprobado: "Aprobado", reemplazado: "Reemplazado", descartado: "Descartado" };
const num = (n: number) => n.toLocaleString("es-CL", { maximumFractionDigits: 3 });

// Indicadores previsionales y tributarios del mes. Se proponen con su fuente (Previred, SII, Superintendencia de
// Pensiones) y los aprueba una persona del equipo. Nunca se edita una versión aprobada: se propone otra.
export default async function ParametrosRemPage({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string; periodo?: string }> }) {
  const role = await myStaffRole();
  if (!role) notFound();
  const puedeAprobar = ["enqora_admin", "ops_director", "accountant_pro"].includes(role);
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("rem_parametros").select("id, periodo, version, valores, fuente, observaciones, estado, creado, aprobado_at")
    .order("periodo", { ascending: false }).order("version", { ascending: false }).limit(60);
  const filas = (data ?? []) as Fila[];
  const ultimo = filas.find((f) => f.estado === "aprobado");
  const base: Parametros | null = ultimo ? leerParametros(ultimo.valores) : null;
  const mesSiguiente = (() => {
    const p = sp.periodo && periodoValido(sp.periodo) ? sp.periodo : todayCL().slice(0, 7);
    return p;
  })();

  return (
    <div className="page">
      {sp.aviso && AVISOS[sp.aviso] ? <Notice kind="ok">{AVISOS[sp.aviso]}</Notice> : null}
      {sp.error ? <Notice kind="error">{messageForCode(sp.error) ?? "No pudimos completar la operación."}</Notice> : null}
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Configuración</span>
          <h1>Parámetros de remuneraciones</h1>
          <p className="hero-lead">UF, UTM, ingreso mínimo, topes y tasas de cada mes. Sin parámetros aprobados, ningún cliente puede calcular liquidaciones de ese mes.</p>
        </div>
      </header>

      <Callout kind="warn" title="Antes de aprobar">
        Compara cada valor con la fuente oficial del mes (indicadores de Previred, valores del SII y comunicados de la Superintendencia de Pensiones). Desde agosto de 2026 el aporte del empleador de la Ley 21.735 se informa en partes: SIS (campo 29), capitalización individual (va con la cotización AFP), expectativa de vida (campo 94) y rentabilidad protegida (campo 95). Confirma también qué tope imponible rige en el mes y la distribución vigente del 7% entre Fonasa y la CCAF. Los montos de la asignación familiar por tramo salen de la circular de la Superintendencia de Seguridad Social que los reajusta.
      </Callout>

      {puedeAprobar || role === "ai_agent" ? (
        <section className="card" aria-labelledby="rp-nuevo">
          <h2 id="rp-nuevo">Proponer parámetros</h2>
          <p className="muted-line">{base ? `Precargado con lo aprobado para ${ultimo!.periodo}: actualiza lo que cambió este mes.` : "Aún no hay meses aprobados: ingresa todos los valores."}</p>
          <form action={proponerParametrosAction} className="form-grid">
            <div className="field">
              <label htmlFor="rp-periodo">Mes</label>
              <input id="rp-periodo" name="periodo" type="month" className="input" required defaultValue={mesSiguiente} />
            </div>
            {CLAVES_PARAMETROS.map(({ k, etiqueta, unidad }) => (
              <div className="field" key={k}>
                <label htmlFor={`rp-${k}`}>{etiqueta} ({unidad})</label>
                <input id={`rp-${k}`} name={k} className="input" inputMode="decimal" required defaultValue={base ? String(base[k]).replace(".", ",") : ""} />
              </div>
            ))}
            <div className="field">
              <label htmlFor="rp-ccaf">Parte del 7% de Fonasa que va a la CCAF (%)</label>
              <input id="rp-ccaf" name="ccaf_salud" className="input" inputMode="decimal" defaultValue={base?.ccaf_salud != null ? String(base.ccaf_salud).replace(".", ",") : ""} />
            </div>
            {(["A", "B", "C"] as const).map((tr) => {
              const k = `af_${tr.toLowerCase()}` as "af_a" | "af_b" | "af_c";
              return (
                <div className="field" key={k}>
                  <label htmlFor={`rp-${k}`}>Asignación familiar tramo {tr} · por carga ($)</label>
                  <input id={`rp-${k}`} name={k} className="input" inputMode="decimal" defaultValue={base?.[k] != null ? String(base[k]) : ""} />
                </div>
              );
            })}
            {AFPS.map((a) => (
              <div className="field" key={a}>
                <label htmlFor={`rp-afp-${a}`}>AFP {a} · cargo trabajador (%)</label>
                <input id={`rp-afp-${a}`} name={`afp_${a}`} className="input" inputMode="decimal" defaultValue={base?.afp[a] != null ? String(base.afp[a]).replace(".", ",") : ""} />
              </div>
            ))}
            <div className="field field-wide">
              <label htmlFor="rp-fuente">Fuente (documento y fecha)</label>
              <input id="rp-fuente" name="fuente" className="input" required minLength={5} maxLength={600} placeholder="Ej.: Indicadores Previsionales Previred noviembre 2026; SII valores UTM" />
            </div>
            <div className="field field-wide">
              <label htmlFor="rp-obs">Observaciones</label>
              <input id="rp-obs" name="observaciones" className="input" maxLength={1000} placeholder="Diferencias entre fuentes, supuestos, etc." />
            </div>
            <div className="field"><label>&nbsp;</label><SubmitButton className="btn-inline" pendingText="Guardando…">Guardar borrador</SubmitButton></div>
          </form>
        </section>
      ) : null}

      <section className="card" aria-labelledby="rp-hist">
        <h2 id="rp-hist">Historial</h2>
        {filas.length ? (
          <ul className="ps-filas">
            {filas.map((f) => {
              const v = leerParametros(f.valores);
              return (
                <li key={f.id}>
                  <span>
                    <b>{f.periodo} · v{f.version} · {ESTADO[f.estado] ?? f.estado}</b>
                    <small>
                      {v ? `UF $${num(v.uf)} · UTM $${num(v.utm)} · IMM $${num(v.imm)} · topes ${num(v.tope_afp_uf)} / ${num(v.tope_afc_uf)} UF · SIS ${num(v.sis)}% · CI ${num(v.aporte_ci)}% · EV ${num(v.aporte_ev)}% · RP ${num(v.aporte_rp)}%${v.ccaf_salud != null ? ` · CCAF ${num(v.ccaf_salud)}%` : ""}${v.af_a != null ? ` · AF $${num(v.af_a)}/${num(v.af_b ?? 0)}/${num(v.af_c ?? 0)}` : ""} · AFC ${num(v.afc_indefinido_trab)}/${num(v.afc_indefinido_emp)}/${num(v.afc_plazo_emp)}% · AFP ${Object.entries(v.afp).map(([a, t]) => `${a} ${num(t)}%`).join(", ")}` : "Valores incompletos"}
                    </small>
                    <small>Fuente: {f.fuente}{f.observaciones ? ` · ${f.observaciones}` : ""}</small>
                  </span>
                  {f.estado === "borrador" && puedeAprobar ? (
                    <form action={decidirParametrosAction} className="upload-row">
                      <input type="hidden" name="id" value={f.id} />
                      <label className="field-check"><input type="checkbox" name="confirmo" value="si" /> Lo comparé con la fuente oficial</label>
                      <SubmitButton name="decision" value="aprobar" className="btn-inline btn-sm" pendingText="…">Aprobar</SubmitButton>
                      <SubmitButton name="decision" value="descartar" variant="ghost" className="btn-inline btn-sm" pendingText="…">Descartar</SubmitButton>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : <p className="muted-line">Aún no hay parámetros cargados.</p>}
      </section>
    </div>
  );
}
