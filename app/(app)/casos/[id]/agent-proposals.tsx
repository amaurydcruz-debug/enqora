import { decideAgentProposalAction } from "@/app/actions/agents";
import { SubmitButton } from "@/components/submit-button";
import { AGENTS, STAGES } from "@/lib/mirror";

export type AgentRun = {
  id: string;
  agent: string;
  instruction: string | null;
  status: "en_curso" | "completada" | "fallida";
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  web_searches: number | null;
  summary: string | null;
  error: string | null;
  requested_by: string | null;
  created_at: string;
  finished_at: string | null;
};
export type AgentProposal = {
  id: string;
  run_id: string;
  position: number;
  kind: "paso" | "hallazgo" | "tarea" | "pregunta";
  payload: Record<string, unknown>;
  status: "pendiente" | "aceptada" | "descartada";
};

const KIND: Record<AgentProposal["kind"], { label: string; accept: string }> = {
  paso: { label: "Paso para MIRROR", accept: "Publicar paso" },
  hallazgo: { label: "Situación para el diagnóstico", accept: "Agregar al borrador" },
  tarea: { label: "Tarea", accept: "Crear tarea" },
  pregunta: { label: "Pregunta al cliente", accept: "Enviar al cliente" },
};
const RUN_STATUS = { en_curso: "Trabajando", completada: "Completada", fallida: "No se completó" } as const;
const RISK: Record<string, string> = { bajo: "Riesgo bajo", medio: "Riesgo medio", alto: "Riesgo alto" };
const CERT: Record<string, string> = { alta: "Certeza alta", media: "Certeza media", baja: "Certeza baja" };

const t = (v: unknown) => (typeof v === "string" ? v : "");
const fmt = (iso: string) =>
  new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(iso));

function Body({ p }: { p: AgentProposal }) {
  const d = p.payload;
  if (p.kind === "paso") {
    return (
      <>
        <b>{t(d.titulo)}</b>
        <small>{STAGES.find((s) => s.key === d.etapa)?.label ?? t(d.etapa)}</small>
        {t(d.detalle) ? <p className="pre">{t(d.detalle)}</p> : null}
      </>
    );
  }
  if (p.kind === "hallazgo") {
    const fuentes = Array.isArray(d.fuentes) ? (d.fuentes as Record<string, unknown>[]) : [];
    return (
      <>
        <b>{t(d.titulo)}</b>
        <small>{RISK[t(d.nivel_riesgo)] ?? ""} · {CERT[t(d.certeza)] ?? ""}</small>
        <p className="pre">{t(d.situacion)}</p>
        {t(d.normativa) ? <p className="pre"><b>Normativa:</b> {t(d.normativa)}</p> : null}
        {t(d.correcciones) ? <p className="pre"><b>Correcciones posibles:</b> {t(d.correcciones)}</p> : null}
        {t(d.falta) ? <p className="pre"><b>Falta para confirmar:</b> {t(d.falta)}</p> : null}
        {fuentes.length ? (
          <ul className="source-list">
            {fuentes.map((f, i) => (
              <li key={i}>
                {t(f.url) ? <a href={t(f.url)} target="_blank" rel="noopener noreferrer">{t(f.titulo)}</a> : t(f.titulo)}
                {t(f.articulo) ? ` · ${t(f.articulo)}` : ""}{t(f.vigencia) ? ` · ${t(f.vigencia)}` : ""}
              </li>
            ))}
          </ul>
        ) : null}
      </>
    );
  }
  if (p.kind === "tarea") {
    return (
      <>
        <b>{t(d.titulo)}</b>
        <small>{d.para === "cliente" ? "Para el cliente" : "Para el equipo (interna)"}</small>
      </>
    );
  }
  return <p className="pre">{t(d.texto)}</p>;
}

export function AgentProposals({ caseId, runs, proposals, nameOf, canDecide }: {
  caseId: string;
  runs: AgentRun[];
  proposals: AgentProposal[];
  nameOf: (id: string | null) => string;
  canDecide: boolean;
}) {
  if (!runs.length) return <p className="muted-line">Aún no se han ejecutado agentes IA en este caso.</p>;
  return (
    <ul className="agent-runs">
      {runs.map((r) => {
        const items = proposals.filter((p) => p.run_id === r.id);
        const pending = items.filter((p) => p.status === "pendiente");
        return (
          <li key={r.id} className={`agent-run run-${r.status}`}>
            <div className="agent-run-head">
              <b>{AGENTS[r.agent as keyof typeof AGENTS]?.name ?? r.agent}</b>
              <span className={`badge ${r.status === "fallida" ? "badge-risk" : r.status === "en_curso" ? "badge-gold" : "badge-muted"}`}>{RUN_STATUS[r.status]}</span>
              <small>
                {nameOf(r.requested_by)} · {fmt(r.created_at)}
                {r.model ? ` · ${r.model}` : ""}
                {r.input_tokens ? ` · ${(r.input_tokens + (r.output_tokens ?? 0)).toLocaleString("es-CL")} tokens` : ""}
                {r.web_searches ? ` · ${r.web_searches} búsqueda${r.web_searches === 1 ? "" : "s"} en fuentes oficiales` : ""}
              </small>
            </div>
            {r.instruction ? <p className="muted-line">Indicación: {r.instruction}</p> : null}
            {r.summary ? <p className="pre">{r.summary}</p> : null}
            {r.status === "fallida" && r.error ? <p className="muted-line">Motivo: {r.error}</p> : null}
            {items.length ? (
              <ul className="proposal-list">
                {items.map((p) => (
                  <li key={p.id} className={`proposal proposal-${p.status}`}>
                    <span className="eyebrow">{KIND[p.kind].label}</span>
                    <div className="proposal-body"><Body p={p} /></div>
                    {p.status === "pendiente" && canDecide ? (
                      <div className="proposal-actions">
                        <form action={decideAgentProposalAction} className="inline-form">
                          <input type="hidden" name="case_id" value={caseId} />
                          <input type="hidden" name="proposal_id" value={p.id} />
                          <input type="hidden" name="decision" value="aceptar" />
                          {p.kind === "paso" ? <label className="check-inline"><input type="checkbox" name="internal" /> Solo equipo</label> : null}
                          <SubmitButton variant="gold" className="btn-inline btn-sm" pendingText="…">{KIND[p.kind].accept}</SubmitButton>
                        </form>
                        <form action={decideAgentProposalAction}>
                          <input type="hidden" name="case_id" value={caseId} />
                          <input type="hidden" name="proposal_id" value={p.id} />
                          <input type="hidden" name="decision" value="descartar" />
                          <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Descartar</SubmitButton>
                        </form>
                      </div>
                    ) : p.status !== "pendiente" ? (
                      <span className={`badge ${p.status === "aceptada" ? "badge-ok" : "badge-muted"}`}>{p.status === "aceptada" ? "Aceptada" : "Descartada"}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {pending.length ? <p className="muted-line">{pending.length} pendiente{pending.length === 1 ? "" : "s"} de revisión.</p> : null}
          </li>
        );
      })}
    </ul>
  );
}
