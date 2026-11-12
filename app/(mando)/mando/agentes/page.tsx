import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { costoUsd, type Proveedor } from "@/lib/ai/gateway";
import { MODULOS_IA } from "@/lib/ai/uso";
import { agentName } from "@/lib/agents";
import { operacion, type AuditRow, type ProposalRow, type Run } from "@/lib/agentes/operacion";
import { createClient } from "@/lib/supabase/server";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";

export const metadata: Metadata = { title: "Operación de agentes" };
export const dynamic = "force-dynamic";

const PERIODOS = [7, 30, 90];
const DECISION: Record<string, string> = {
  aprobar: "Aprobadas", corregir: "Pidió corregir", investigar: "Pidió investigar", falta_dato: "Falta un dato", escalar: "Escalar a profesional",
  fallida: "Auditoría fallida", sin_decision: "Sin decisión",
};
const miles = (n: number) => n.toLocaleString("es-CL");
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);
const fecha = (s: string) => new Date(s).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" });

// Centro de Mando → Operación de agentes: producción, utilidad, eficiencia, costo y control de los agentes de IA.
export default async function AgentesPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  if (!isSupervisorRole(await myStaffRole())) notFound();
  const sp = await searchParams;
  const dias = PERIODOS.includes(Number(sp.dias)) ? Number(sp.dias) : 30;
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
  const supabase = await createClient();

  const [runsRes, propRes, audRes, learnRes, escRes, usoRes] = await Promise.all([
    supabase.from("agent_runs").select("id, case_id, agent, status, model, input_tokens, output_tokens, error, created_at").gte("created_at", desde).order("created_at", { ascending: false }).limit(3000),
    supabase.from("agent_proposals").select("run_id, status, created_at").gte("created_at", desde).limit(10000),
    supabase.from("agent_audits").select("run_id, status, decision, input_tokens, output_tokens, created_at").gte("created_at", desde).limit(5000),
    supabase.from("case_learnings").select("id", { count: "exact", head: true }).eq("status", "borrador"),
    supabase.rpc("escuela_resumen"),
    supabase.rpc("ia_uso_resumen", { p_dias: dias }),
  ]);
  // Uso de IA de TODOS los módulos (0049): consulta pública, carpetas, precios, vigilancia, agentes, laboratorio, escuela.
  type UsoFila = { modulo: string; proveedor: string; modelo: string; llamadas: number; fallidas: number; entrada: number; salida: number; busquedas: number; ms_promedio: number; ultima: string; ultimo_motivo: string | null };
  const uso = (Array.isArray(usoRes.data) ? usoRes.data : []) as UsoFila[];
  const usoCosto = (u: UsoFila) => (["anthropic", "hf", "openai"].includes(u.proveedor) ? costoUsd(u.proveedor as Proveedor, { entrada: Number(u.entrada), salida: Number(u.salida) }) : null);
  const usoTotal = uso.reduce((t, u) => ({ llamadas: t.llamadas + u.llamadas, fallidas: t.fallidas + u.fallidas, tokens: t.tokens + Number(u.entrada) + Number(u.salida), costo: t.costo + (usoCosto(u) ?? 0) }), { llamadas: 0, fallidas: 0, tokens: 0, costo: 0 });
  const conPrecio = uso.some((u) => usoCosto(u) !== null);
  const runs = (runsRes.data ?? []) as Run[];
  const op = operacion(runs, (propRes.data ?? []) as ProposalRow[], (audRes.data ?? []) as AuditRow[]);
  const costo = costoUsd("anthropic", { entrada: op.total.tokens_entrada, salida: op.total.tokens_salida });
  const examen = (escRes.data as { examenes?: { creado: string; total: number; aciertos_escuela: number; aciertos_agente: number }[] } | null)?.examenes?.[0];

  // Folios de los casos mencionados en alertas e incidentes.
  const ids = [...new Set([...op.incidentes.map((i) => i.case_id), ...op.alertas.flatMap((a) => (a.case_id ? [a.case_id] : []))])];
  const { data: folios } = ids.length ? await supabase.from("cases").select("id, folio").in("id", ids) : { data: [] };
  const folio = new Map(((folios ?? []) as { id: string; folio: string }[]).map((c) => [c.id, c.folio]));

  return (
    <div className="page">
      <Link href="/mando" className="back-link"><span aria-hidden="true">←</span> Centro de Mando</Link>
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Centro de Mando · Operación</span>
          <h1>Operación de agentes</h1>
          <p className="hero-lead">
            Qué hacen los agentes de IA, cuánto aportan y cuánto cuestan. La utilidad se mide por las propuestas que una persona acepta,
            no por lo que el agente produce. Las alertas sugieren revisar: ningún agente se cambia ni se suspende sin decisión humana.
          </p>
          <p className="inline-form" style={{ flexWrap: "wrap", marginTop: 12 }}>
            {PERIODOS.map((d) => (
              <Link key={d} href={`/mando/agentes?dias=${d}`} className={`btn-inline btn-sm ${d === dias ? "btn-gold" : "btn-ghost"}`}>Últimos {d} días</Link>
            ))}
          </p>
        </div>
      </header>

      <div className="kpis kpis-4" role="list" aria-label="Indicadores de agentes">
        <div className="kpi" role="listitem"><span>Ejecuciones</span><b>{miles(op.total.ejecuciones)}</b></div>
        <div className="kpi" role="listitem"><span>Propuestas aceptadas</span><b>{miles(op.total.aceptadas)}</b></div>
        <div className="kpi" role="listitem"><span>Esperan revisión</span><b>{miles(op.total.pendientes)}</b></div>
        <div className="kpi kpi-gold" role="listitem"><span>{costo !== null ? "Costo de IA" : "Tokens de IA"}</span><b>{costo !== null ? `US$ ${costo.toFixed(2)}` : miles(op.total.tokens_entrada + op.total.tokens_salida)}</b></div>
      </div>

      <section className="card">
        <h2>Alertas</h2>
        {op.alertas.length ? (
          <ul className="ref-list" role="list">
            {op.alertas.map((a, i) => (
              <li key={i}>
                <span className="ref-main">
                  <b>{a.titulo.replace(/^(\w+):/, (_, k) => `${agentName(k)}:`)}</b>
                  <small className="muted-line">{a.detalle}{a.case_id ? <> · <Link href={`/casos/${a.case_id}`}>{folio.get(a.case_id) ?? "ver caso"}</Link></> : null}</small>
                </span>
                <span className={`status status-${a.nivel === "critica" ? "risk" : a.nivel === "atencion" ? "warn" : "muted"}`}>{a.nivel === "critica" ? "Crítica" : a.nivel === "atencion" ? "Atención" : "Info"}</span>
              </li>
            ))}
          </ul>
        ) : <p className="muted-line">Sin alertas en el período.</p>}
      </section>

      <section className="card">
        <h2>Uso de IA en toda la plataforma</h2>
        <p className="muted-line">
          Cada llamada a un modelo, en cualquier módulo: {miles(usoTotal.llamadas)} llamadas, {miles(usoTotal.fallidas)} fallidas, {miles(usoTotal.tokens)} tokens
          {conPrecio ? ` · US$ ${usoTotal.costo.toFixed(2)} según ENQORA_IA_PRECIOS` : " · sin ENQORA_IA_PRECIOS el costo se muestra en tokens"}. Solo se registran cifras: nunca preguntas, respuestas ni documentos.
        </p>
        {usoRes.error ? (
          <p className="muted-line">Falta ejecutar la migración 0049_uso_ia.sql en Supabase.</p>
        ) : uso.length ? (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr><th>Módulo</th><th>Proveedor · modelo</th><th>Llamadas</th><th>Fallidas</th><th>Tokens</th><th>Búsquedas web</th><th>Tiempo medio</th><th>{conPrecio ? "Costo" : "Último error"}</th></tr>
              </thead>
              <tbody>
                {uso.map((u) => {
                  const c = usoCosto(u);
                  return (
                    <tr key={`${u.modulo}-${u.proveedor}`}>
                      <td>{MODULOS_IA[u.modulo] ?? u.modulo}</td>
                      <td>{u.proveedor} · {u.modelo}</td>
                      <td>{miles(u.llamadas)}</td>
                      <td>{miles(u.fallidas)}{u.llamadas ? ` (${pct(u.fallidas / u.llamadas)})` : ""}</td>
                      <td>{miles(Number(u.entrada) + Number(u.salida))}</td>
                      <td>{miles(u.busquedas)}</td>
                      <td>{(u.ms_promedio / 1000).toFixed(1)} s</td>
                      <td>{conPrecio ? (c !== null ? `US$ ${c.toFixed(2)}` : "—") : (u.ultimo_motivo ?? "—")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="muted-line">Sin llamadas de IA registradas en el período.</p>}
      </section>

      <section className="card">
        <h2>Rendimiento por agente</h2>
        {op.agentes.length ? (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr><th>Agente</th><th>Ejecuciones</th><th>Fallidas</th><th>Propuestas</th><th>Aceptadas</th><th>Aceptación</th><th>Tokens</th><th>Tokens por propuesta útil</th></tr>
              </thead>
              <tbody>
                {op.agentes.map((a) => (
                  <tr key={a.agente}>
                    <td>{agentName(a.agente)}</td>
                    <td>{miles(a.ejecuciones)}{a.en_curso ? ` (${a.en_curso} en curso)` : ""}</td>
                    <td>{miles(a.fallidas)}</td>
                    <td>{miles(a.propuestas)}{a.pendientes ? ` (${a.pendientes} por revisar)` : ""}</td>
                    <td>{miles(a.aceptadas)}</td>
                    <td>{pct(a.aceptacion)}</td>
                    <td>{miles(a.tokens_entrada + a.tokens_salida)}</td>
                    <td>{a.tokens_por_aceptada !== null ? miles(a.tokens_por_aceptada) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted-line">Los agentes no se ejecutaron en este período.</p>}
      </section>

      <section className="card">
        <h2>Auditor independiente</h2>
        {op.total.auditorias ? (
          <ul className="ref-list" role="list">
            {Object.entries(op.auditorias).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
              <li key={k}><span className="ref-main"><b>{DECISION[k] ?? k}</b></span><span className="status status-muted">{miles(n)}</span></li>
            ))}
          </ul>
        ) : <p className="muted-line">Sin auditorías en el período.</p>}
      </section>

      <section className="card">
        <h2>Formación y aprendizaje</h2>
        <ul className="ref-list" role="list">
          <li>
            <span className="ref-main">
              <b>Escuela Tributaria (piloto)</b>
              <small className="muted-line">{examen ? `Último examen ${fecha(examen.creado)}: escuela ${examen.aciertos_escuela}/${examen.total} contra agente individual ${examen.aciertos_agente}/${examen.total}.` : "Aún no rinde su primer examen."}</small>
            </span>
            <Link href="/mando/laboratorio#escuela" className="btn-inline btn-sm btn-ghost">Laboratorio</Link>
          </li>
          <li>
            <span className="ref-main"><b>Aprendizajes por aprobar</b><small className="muted-line">Lecciones de casos que esperan revisión antes de que los agentes las usen.</small></span>
            <Link href="/mando/aprendizajes" className="btn-inline btn-sm btn-ghost">{miles(learnRes.count ?? 0)} por revisar</Link>
          </li>
        </ul>
      </section>

      <section className="card">
        <h2>Incidentes recientes</h2>
        {op.incidentes.length ? (
          <ul className="ref-list" role="list">
            {op.incidentes.map((i, k) => (
              <li key={k}>
                <span className="ref-main"><b>{agentName(i.agente)} · {fecha(i.fecha)}</b><small className="muted-line">{i.error}</small></span>
                <Link href={`/casos/${i.case_id}`} className="btn-inline btn-sm btn-ghost">{folio.get(i.case_id) ?? "Ver caso"}</Link>
              </li>
            ))}
          </ul>
        ) : <p className="muted-line">Sin ejecuciones fallidas en el período.</p>}
        {costo === null ? <p className="muted-line">Para ver el costo en dólares, configura ENQORA_IA_PRECIOS en Vercel con el precio vigente de tu proveedor.</p> : null}
      </section>
    </div>
  );
}
