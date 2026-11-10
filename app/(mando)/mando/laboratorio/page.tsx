import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { precioDe, proveedoresDisponibles } from "@/lib/ai/gateway";
import { PERSPECTIVAS, TOTAL_MISIONES, presupuestoMision, tribunalConfigurado, versionConocimiento } from "@/lib/ai/escuela";
import { decidirEstrategiaAction } from "@/app/actions/escuela";
import { createClient } from "@/lib/supabase/server";
import { messageForCode } from "@/lib/db-errors";
import { Notice } from "@/components/auth-card";
import { TOTAL_CASOS } from "@/lib/ai/evaluacion";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";
import { PanelEvaluacion } from "./panel";
import { PanelEscuela } from "./panel-escuela";

export const metadata: Metadata = { title: "Laboratorio ENQORA BRAIN" };
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const NOMBRE: Record<string, string> = { anthropic: "Claude (Anthropic)", hf: "Hugging Face · modelos abiertos", openai: "OpenAI" };
const VARIABLES: Record<string, string> = { anthropic: "ANTHROPIC_API_KEY y ANTHROPIC_MODEL", hf: "HF_TOKEN y HF_MODEL (p. ej., un modelo Qwen del catálogo de Inference Providers)", openai: "OPENAI_API_KEY y OPENAI_CHAT_MODEL" };

type Examen = {
  id: string; creado: string; proveedor: string; modelo: string; tribunal_modelo: string; independencia: string; version_conocimiento: string;
  total: number; aciertos_escuela: number; aciertos_agente: number; tokens_escuela: number; tokens_agente: number; costo_escuela: number | null; costo_agente: number | null;
};
type Ranking = { perspectiva: string; misiones: number; aciertos: number; puntaje_promedio: number | null; tokens_promedio: number };
type Estrategia = { id: string; texto: string; version: number; estado: "propuesta" | "aprobada" | "descartada" | "revertida"; mision: string | null; propuesta: string; nota: string | null };
type Resumen = { examenes: Examen[]; ranking: Ranking[]; estrategias: Estrategia[] };

const AVISOS: Record<string, string> = {
  estrategia_aprobada: "Estrategia aprobada: desde el próximo examen los alumnos la reciben como memoria.",
  estrategia_descartada: "Estrategia descartada.",
  estrategia_revertida: "Estrategia revertida: los alumnos dejan de recibirla.",
};
const ESTADO_ESTRATEGIA: Record<Estrategia["estado"], string> = { propuesta: "Por revisar", aprobada: "Aprobada", descartada: "Descartada", revertida: "Revertida" };
const fecha = (s: string) => new Date(s).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" });
const usd = (n: number | null) => (n === null || n === undefined ? null : `US$ ${Number(n).toFixed(Number(n) < 1 ? 4 : 2)}`);

// Graduación: la escuela se gradúa solo si supera al agente individual en el examen vigente (mismo modelo y misma
// versión del conocimiento). Si cambian el modelo o las reglas, la certificación debe renovarse.
function estadoEscuela(examenes: Examen[], modelo: string, version: string): { texto: string; tono: "ok" | "warn" | "muted"; detalle: string } {
  const vigentes = examenes.filter((e) => e.modelo === modelo && e.version_conocimiento === version);
  const ultimo = vigentes[0];
  if (ultimo && ultimo.aciertos_escuela > ultimo.aciertos_agente) {
    return { texto: "Graduada · certificación vigente", tono: "ok", detalle: `En el último examen vigente obtuvo ${ultimo.aciertos_escuela} de ${ultimo.total} contra ${ultimo.aciertos_agente} del agente individual.` };
  }
  if (!ultimo && examenes.some((e) => e.aciertos_escuela > e.aciertos_agente)) {
    return { texto: "Certificación por renovar", tono: "warn", detalle: "Se graduó con otro modelo u otra versión del conocimiento. Debe rendir el examen de nuevo." };
  }
  if (ultimo) {
    return { texto: "En formación", tono: "muted", detalle: ultimo.aciertos_escuela === ultimo.aciertos_agente
      ? `Último examen: empate (${ultimo.aciertos_escuela} de ${ultimo.total}). Todavía no demuestra mejora, así que no se gradúa ni se amplía.`
      : `Último examen: ${ultimo.aciertos_escuela} de ${ultimo.total} contra ${ultimo.aciertos_agente} del agente individual.` };
  }
  return { texto: "En formación", tono: "muted", detalle: "Aún no rinde su primer examen." };
}

// Centro de Mando → Laboratorio ENQORA BRAIN: qué modelos están conectados al AI Gateway y qué tan bien responden.
export default async function LaboratorioPage({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const role = await myStaffRole();
  if (!isSupervisorRole(role)) notFound();
  const sp = await searchParams;
  const provs = proveedoresDisponibles();
  const orden = process.env.ENQORA_IA_ORDEN?.trim() || "anthropic,hf,openai";
  const supabase = await createClient();
  const { data: resumenData, error: resumenError } = await supabase.rpc("escuela_resumen");
  const resumen: Resumen = (resumenData as Resumen | null) ?? { examenes: [], ranking: [], estrategias: [] };
  const base = provs.find((p) => p.configurado);
  const trib = base ? tribunalConfigurado(base.proveedor) : null;
  const version = versionConocimiento();
  const estado = base ? estadoEscuela(resumen.examenes, base.modelo, version) : null;
  const presupuesto = presupuestoMision();
  const hayPrecio = provs.some((p) => p.configurado && precioDe(p.proveedor));

  return (
    <div className="page">
      <Link href="/mando" className="back-link"><span aria-hidden="true">←</span> Centro de Mando</Link>
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Centro de Mando · ENQORA BRAIN</span>
          <h1>Laboratorio de IA</h1>
          <p className="hero-lead">
            ENQORA habla con los modelos a través de su propio AI Gateway: ningún proveedor es indispensable y se pueden cambiar sin reconstruir
            la plataforma. Aquí se mide, con {TOTAL_CASOS} preguntas contables y tributarias ficticias, qué tan bien responde cada modelo. La
            respuesta correcta la calcula el motor contable determinista de ENQORA, no una persona ni otra IA.
          </p>
        </div>
      </header>

      <section className="card">
        <h2>Proveedores conectados</h2>
        <ul className="ref-list" role="list">
          {provs.map((p) => (
            <li key={p.proveedor}>
              <span className="ref-main">
                <b>{NOMBRE[p.proveedor]}</b>
                <small className="muted-line">
                  {p.configurado ? `Modelo: ${p.modelo}` : `Sin configurar: agrega ${VARIABLES[p.proveedor]} en Vercel.`}
                  {p.configurado ? (p.privados ? " · autorizado para datos privados de clientes" : " · solo datos públicos o ficticios") : ""}
                </small>
              </span>
              <span className={`status status-${p.configurado ? "ok" : "muted"}`}>{p.configurado ? "Conectado" : "No configurado"}</span>
            </li>
          ))}
        </ul>
        <p className="muted-line">
          Orden de uso: <code>{orden}</code>. Si el primero falla o su respuesta no pasa la validación, ENQORA prueba con el siguiente.
          Los datos privados de clientes solo van a los proveedores indicados en <code>ENQORA_IA_PRIVADOS</code> (por defecto, solo Claude).
        </p>
      </section>

      <PanelEvaluacion proveedores={provs.filter((p) => p.configurado).map((p) => ({ id: p.proveedor, nombre: NOMBRE[p.proveedor], modelo: p.modelo }))} />

      <section className="card" id="escuela">
        <h2>ENQORA University · Escuela Tributaria (piloto)</h2>
        {sp.aviso && AVISOS[sp.aviso] ? <Notice kind="ok">{AVISOS[sp.aviso]}</Notice> : null}
        {messageForCode(sp.error) ? <Notice kind="error">{messageForCode(sp.error)}</Notice> : null}
        <p className="muted-line">
          La escuela no es un producto: es un mecanismo interno para mejorar la respuesta que recibe el cliente. Un profesor (código, no IA)
          asigna la misión según su dificultad; hasta cinco alumnos con enfoques distintos la resuelven cada uno por su cuenta; sus cálculos los
          ejecuta el motor contable; y un tribunal independiente recibe las propuestas anónimas, decide y califica. Se compara siempre con el
          agente individual. Solo se gradúa y se amplía si demuestra una mejora medible.
        </p>
        {estado ? (
          <ul className="ref-list" role="list">
            <li>
              <span className="ref-main"><b>Estado</b><small className="muted-line">{estado.detalle}</small></span>
              <span className={`status status-${estado.tono}`}>{estado.texto}</span>
            </li>
            <li>
              <span className="ref-main">
                <b>Composición</b>
                <small className="muted-line">
                  Alumnos: {Object.values(PERSPECTIVAS).map((p) => p.nombre).join(" · ")}. Versión 2: simple, 1 alumno (cálculo) · media, 2 (cálculo y crítico) · compleja, 3 (normativa, cálculo y crítico). Si los alumnos coinciden con cálculos verificados, no se llama al tribunal.
                </small>
              </span>
            </li>
            <li>
              <span className="ref-main">
                <b>Tribunal</b>
                <small className="muted-line">
                  {trib ? `${NOMBRE[trib.proveedor]} · ${trib.independencia}.` : ""} Para usar otro proveedor en el tribunal (por ejemplo,
                  OpenAI) agrega <code>ENQORA_ESCUELA_TRIBUNAL</code> en Vercel. Hoy no está activado: no genera costos adicionales.
                </small>
              </span>
            </li>
            <li>
              <span className="ref-main">
                <b>Presupuesto por misión</b>
                <small className="muted-line">
                  Máximo {presupuesto.llamadas} llamadas y {presupuesto.tokens.toLocaleString("es-CL")} tokens (variables
                  {" "}<code>ENQORA_ESCUELA_MAX_LLAMADAS</code> y <code>ENQORA_ESCUELA_MAX_TOKENS</code>). Si se agota, el tribunal no se llama y se
                  usa el consenso de los alumnos, marcado como tal.
                  {hayPrecio ? "" : " El costo se muestra en tokens; para verlo en dólares, configura ENQORA_IA_PRECIOS con el precio vigente de tu proveedor."}
                </small>
              </span>
            </li>
            <li>
              <span className="ref-main">
                <b>Versión del conocimiento</b>
                <small className="muted-line">{version}. Si cambian las reglas o las tasas, la certificación debe renovarse.</small>
              </span>
            </li>
          </ul>
        ) : null}

        <PanelEscuela proveedores={provs.filter((p) => p.configurado).map((p) => ({ id: p.proveedor, nombre: NOMBRE[p.proveedor], modelo: p.modelo }))} misiones={TOTAL_MISIONES} />

        {resumenError ? (
          <p className="muted-line">La memoria académica aún no está disponible: ejecuta la migración 0031 en Supabase para guardar exámenes y estrategias.</p>
        ) : (
          <>
            <h3>Estrategias propuestas por el tribunal</h3>
            <p className="muted-line">Ninguna se usa sin aprobación humana. Una estrategia aprobada pasa a la memoria de los alumnos y se puede revertir.</p>
            {resumen.estrategias.length ? (
              <ul className="ref-list" role="list">
                {resumen.estrategias.map((e) => (
                  <li key={e.id}>
                    <span className="ref-main">
                      <b>{e.texto}</b>
                      <small className="muted-line">
                        Versión {e.version}{e.mision ? ` · misión ${e.mision}` : ""} · {fecha(e.propuesta)}{e.nota ? ` · Nota: ${e.nota}` : ""}
                      </small>
                      {e.estado === "propuesta" || e.estado === "aprobada" ? (
                        <form action={decidirEstrategiaAction} className="inline-form" style={{ flexWrap: "wrap" }}>
                          <input type="hidden" name="id" value={e.id} />
                          <input name="nota" className="input input-sm" placeholder="Nota (opcional)" maxLength={500} aria-label="Nota" />
                          {e.estado === "propuesta" ? (
                            <>
                              <button type="submit" name="estado" value="aprobada" className="btn-inline btn-sm">Aprobar</button>
                              <button type="submit" name="estado" value="descartada" className="btn-inline btn-sm">Descartar</button>
                            </>
                          ) : <button type="submit" name="estado" value="revertida" className="btn-inline btn-sm">Revertir</button>}
                        </form>
                      ) : null}
                    </span>
                    <span className={`status status-${e.estado === "aprobada" ? "ok" : e.estado === "propuesta" ? "warn" : "muted"}`}>{ESTADO_ESTRATEGIA[e.estado]}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="muted-line">Aún no hay estrategias propuestas.</p>}

            {resumen.ranking.length ? (
              <>
                <h3>Desempeño de los alumnos</h3>
                <ul className="ref-list" role="list">
                  {resumen.ranking.map((r) => (
                    <li key={r.perspectiva}>
                      <span className="ref-main">
                        <b>{PERSPECTIVAS[r.perspectiva as keyof typeof PERSPECTIVAS]?.nombre ?? r.perspectiva}</b>
                        <small className="muted-line">
                          {r.aciertos} de {r.misiones} misiones correctas{r.puntaje_promedio !== null ? ` · nota del tribunal ${r.puntaje_promedio}/10` : ""} · {r.tokens_promedio.toLocaleString("es-CL")} tokens por misión
                        </small>
                      </span>
                      <span className="status status-muted">{Math.round((r.aciertos / Math.max(1, r.misiones)) * 100)}%</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {resumen.examenes.length ? (
              <>
                <h3>Exámenes anteriores</h3>
                <ul className="ref-list" role="list">
                  {resumen.examenes.map((e) => (
                    <li key={e.id}>
                      <span className="ref-main">
                        <b>{fecha(e.creado)} · Escuela {e.aciertos_escuela}/{e.total} · Agente {e.aciertos_agente}/{e.total}</b>
                        <small className="muted-line">
                          {e.modelo} · tribunal {e.tribunal_modelo} · {e.tokens_escuela.toLocaleString("es-CL")} contra {e.tokens_agente.toLocaleString("es-CL")} tokens
                          {usd(e.costo_escuela) ? ` · ${usd(e.costo_escuela)} contra ${usd(e.costo_agente)}` : ""} · conocimiento {e.version_conocimiento}
                        </small>
                      </span>
                      <span className={`status status-${e.aciertos_escuela > e.aciertos_agente ? "ok" : "muted"}`}>{e.aciertos_escuela > e.aciertos_agente ? "Mejora" : "Sin mejora"}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
