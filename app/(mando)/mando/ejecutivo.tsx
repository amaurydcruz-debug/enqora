import Link from "next/link";
import { operacion, type AuditRow, type ProposalRow, type Run } from "@/lib/agentes/operacion";
import { MODULES } from "@/lib/cases";
import { ejecutivo, type AhorroE, type CalificacionE, type CasoE, type CobroE } from "@/lib/mando/ejecutivo";
import { createClient } from "@/lib/supabase/server";

// ENQORA Command Center · vista ejecutiva (solo supervisión): cómo está funcionando ENQORA, qué está fallando,
// dónde se pierde dinero, qué clientes necesitan atención y qué decisiones esperan a una persona.
const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
const DIAS = 30;

export async function VistaEjecutiva({ aprobaciones }: { aprobaciones: number }) {
  const supabase = await createClient();
  const desde = new Date(Date.now() - DIAS * 86_400_000).toISOString();
  const [casosR, cobrosR, calR, ahoR, empR, empNuevasR, solR, runsR, propR, audR] = await Promise.all([
    supabase.from("cases").select("id, module, status, created_at, closed_at, due_date, responsible_id").limit(10000),
    supabase.from("charges").select("amount, status, due_date, paid_at").limit(10000),
    supabase.from("case_ratings").select("case_id, resuelto, satisfaccion, created_at").gte("created_at", desde).limit(5000),
    supabase.from("case_savings").select("monto, estado").limit(10000),
    supabase.from("companies").select("id", { count: "exact", head: true }),
    supabase.from("companies").select("id", { count: "exact", head: true }).gte("created_at", desde),
    supabase.rpc("solicitudes_caso_listar", { p_estado: "nueva" }),
    supabase.from("agent_runs").select("id, case_id, agent, status, model, input_tokens, output_tokens, error, created_at").gte("created_at", desde).limit(3000),
    supabase.from("agent_proposals").select("run_id, status, created_at").gte("created_at", desde).limit(10000),
    supabase.from("agent_audits").select("run_id, status, decision, input_tokens, output_tokens, created_at").gte("created_at", desde).limit(5000),
  ]);
  const e = ejecutivo((casosR.data ?? []) as CasoE[], (cobrosR.data ?? []) as CobroE[], (calR.data ?? []) as CalificacionE[], (ahoR.data ?? []) as AhorroE[], DIAS);
  const ia = operacion((runsR.data ?? []) as Run[], (propR.data ?? []) as ProposalRow[], (audR.data ?? []) as AuditRow[]);
  const alertasIA = ia.alertas.filter((a) => a.nivel !== "info").length;
  const solicitudes = Array.isArray(solR.data) ? solR.data.length : 0;

  // Centro de alertas: solo lo que requiere una decisión o una acción, con su acceso directo.
  const alertas = [
    { n: e.casos.atrasados, nivel: "risk", texto: "casos atrasados (vencimiento pasado)", href: "/mando?vista=activos" },
    { n: aprobaciones, nivel: "gold", texto: "aprobaciones humanas pendientes", href: "/mando?vista=aprobaciones" },
    { n: e.casos.sin_responsable, nivel: "gold", texto: "casos sin responsable", href: "/mando?vista=sin_asignar" },
    { n: solicitudes, nivel: "gold", texto: "solicitudes nuevas de clientes por cotizar", href: "/mando/solicitudes" },
    { n: e.finanzas.cobros_vencidos, nivel: "risk", texto: `cobros vencidos (${clp(e.finanzas.vencido)})`, href: "/mando/cobros" },
    { n: e.experiencia.bajas, nivel: "risk", texto: "calificaciones bajas o casos que el cliente considera no resueltos", href: "/mando?vista=cerrados" },
    { n: e.ahorro.por_verificar, nivel: "muted", texto: "ahorros por verificar", href: "/mando?vista=cerrados" },
    { n: alertasIA, nivel: "warn", texto: "alertas de los agentes de IA", href: "/mando/agentes" },
  ].filter((a) => a.n > 0);

  return (
    <section className="card" aria-labelledby="ejecutivo-titulo">
      <div className="zone-head">
        <h2 id="ejecutivo-titulo">Vista ejecutiva · últimos {DIAS} días</h2>
        <Link href="/mando/agentes" className="link-arrow">Operación de agentes</Link>
      </div>

      <div className="kpis kpis-4" role="list" aria-label="Indicadores ejecutivos">
        <div className="kpi" role="listitem"><span>Empresas clientes</span><b>{(empR.count ?? 0).toLocaleString("es-CL")}</b>{empNuevasR.count ? <small>+{empNuevasR.count} en el período</small> : null}</div>
        <div className="kpi" role="listitem"><span>Casos abiertos</span><b>{e.casos.abiertos}</b>{e.casos.atrasados ? <small>{e.casos.atrasados} atrasados</small> : null}</div>
        <div className="kpi" role="listitem"><span>Resueltos</span><b>{e.casos.resueltos}</b>{e.casos.mediana_dias !== null ? <small>Mediana {e.casos.mediana_dias.toLocaleString("es-CL")} días</small> : null}</div>
        <div className="kpi kpi-gold" role="listitem"><span>Satisfacción</span><b>{e.experiencia.satisfaccion !== null ? `${e.experiencia.satisfaccion.toFixed(1).replace(".", ",")}/5` : "—"}</b><small>{e.experiencia.calificaciones ? `${e.experiencia.calificaciones} calificaciones` : "Sin calificaciones aún"}</small></div>
      </div>

      <div className="hoy-grid" style={{ marginTop: 16 }}>
        <div className="hoy-card">
          <h3>Centro de alertas</h3>
          {alertas.length ? (
            <ul className="hoy-list">
              {alertas.map((a) => (
                <li key={a.texto}>
                  <Link href={a.href}><span className={`status status-${a.nivel}`}>{a.n}</span> {a.texto}</Link>
                </li>
              ))}
            </ul>
          ) : <p className="hoy-lead">Nada requiere intervención en este momento.</p>}
        </div>

        <div className="hoy-card">
          <h3>Finanzas y resultados</h3>
          <dl className="facts">
            <div><dt>Cobrado en el período</dt><dd>{clp(e.finanzas.cobrado)}</dd></div>
            <div><dt>Por cobrar (al día)</dt><dd>{clp(e.finanzas.por_cobrar)}</dd></div>
            <div><dt>Vencido</dt><dd>{clp(e.finanzas.vencido)}</dd></div>
            <div><dt>Ahorro verificado a clientes</dt><dd>{clp(e.ahorro.verificado)}</dd></div>
            <div><dt>Resueltos según el cliente</dt><dd>{e.experiencia.resueltos_segun_cliente !== null ? `${Math.round(e.experiencia.resueltos_segun_cliente * 100)}%` : "—"}</dd></div>
          </dl>
          <p className="hoy-note">Un caso cerrado no se cuenta como éxito por sí solo: «resueltos según el cliente» viene de su propia calificación.</p>
        </div>

        <div className="hoy-card">
          <h3>Rendimiento por servicio</h3>
          {e.servicios.length ? (
            <ul className="hoy-list">
              {e.servicios.slice(0, 8).map((s) => (
                <li key={s.modulo}>
                  <b>{MODULES[s.modulo as keyof typeof MODULES]?.name ?? s.modulo}</b>
                  <small>
                    {s.abiertos} abiertos · {s.resueltos} resueltos{s.atrasados ? ` · ${s.atrasados} atrasados` : ""}
                    {s.satisfaccion !== null ? ` · satisfacción ${s.satisfaccion.toFixed(1).replace(".", ",")}/5` : ""}
                  </small>
                </li>
              ))}
            </ul>
          ) : <p className="hoy-lead">Aún no hay casos en el período.</p>}
        </div>
      </div>
    </section>
  );
}
