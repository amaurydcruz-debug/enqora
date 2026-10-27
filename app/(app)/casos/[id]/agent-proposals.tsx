import { decideAgentProposalAction } from "@/app/actions/agents";
import { SubmitButton } from "@/components/submit-button";
import { AGENTS, STAGES } from "@/lib/mirror";
import { AUDIT_STATUS, DECISION_TEXT, OBS_TYPE, VERDICT_LABEL } from "@/lib/audit-labels";
import { AuditActions } from "./agent-audit-actions";

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
  parent_run_id?: string | null;
  correction_round?: number;
  audit_status?: "no_aplica" | "pendiente" | "auditando" | "auditada" | "fallida";
  audit_decision?: string | null;
};
export type AgentAudit = {
  id: string;
  run_id: string;
  status: "completada" | "fallida";
  decision: string | null;
  summary: string | null;
  checks: { propuesta: string; tipo: string; ok: boolean; detalle: string }[];
  auditor: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  web_searches: number | null;
  error: string | null;
  created_at: string;
};
type Note = { tipo?: string; detalle?: string; correccion_sugerida?: string };
export type AgentProposal = {
  id: string;
  run_id: string;
  position: number;
  kind: "paso" | "hallazgo" | "tarea" | "pregunta";
  payload: Record<string, unknown>;
  status: "pendiente" | "aceptada" | "descartada" | "reemplazada";
  audit_verdict?: string | null;
  audit_severity?: string | null;
  audit_notes?: Note[];
  override_note?: string | null;
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
// Resultado de un cálculo en lenguaje claro: montos con separador de miles, porcentajes tal cual.
const calcText = (r: unknown) =>
  Object.entries(r && typeof r === "object" ? (r as Record<string, unknown>) : {})
    .map(([k, v]) => `${k.replace(/_/g, " ")} ${typeof v === "number" ? (/dias|meses|anio/.test(k) ? v : `$${v.toLocaleString("es-CL")}`) : String(v)}`)
    .join(" · ");
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
        {Array.isArray(d.calculos) && d.calculos.length ? (
          <ul className="calc-list">
            {(d.calculos as Record<string, unknown>[]).map((c, i) => (
              <li key={i}><b>{t(c.herramienta).replace("calcular_", "").replace(/_/g, " ")}:</b> {calcText(c.resultado)}</li>
            ))}
          </ul>
        ) : null}
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

const STATUS_BADGE: Record<AgentProposal["status"], [string, string]> = {
  pendiente: ["", ""], aceptada: ["badge-ok", "Aceptada"], descartada: ["badge-muted", "Descartada"], reemplazada: ["badge-muted", "Reemplazada por una versión corregida"],
};

export function AgentProposals({ caseId, runs, proposals, audits, nameOf, canDecide, supervisor, auditOn }: {
  caseId: string;
  runs: AgentRun[];
  proposals: AgentProposal[];
  audits: AgentAudit[];
  nameOf: (id: string | null) => string;
  canDecide: boolean;
  supervisor: boolean;
  auditOn: boolean;
}) {
  if (!runs.length) return <p className="muted-line">Aún no se han ejecutado agentes IA en este caso.</p>;
  return (
    <ul className="agent-runs">
      {runs.map((r) => {
        const items = proposals.filter((p) => p.run_id === r.id);
        const pending = items.filter((p) => p.status === "pendiente");
        const audit = audits.find((a) => a.run_id === r.id && a.status === "completada") ?? audits.find((a) => a.run_id === r.id) ?? null;
        const awaiting = r.audit_status === "pendiente" || r.audit_status === "auditando" || r.audit_status === "fallida";
        const canAudit = canDecide && auditOn && r.status === "completada" && !!pending.length && (r.audit_status === "pendiente" || r.audit_status === "fallida");
        const canCorrect = canDecide && r.audit_status === "auditada" && ["corregir", "investigar", "falta_dato"].includes(r.audit_decision ?? "")
          && (r.correction_round ?? 0) < 2 && !!pending.length;
        return (
          <li key={r.id} className={`agent-run run-${r.status}`}>
            <div className="agent-run-head">
              <b>{AGENTS[r.agent as keyof typeof AGENTS]?.name ?? r.agent}</b>
              <span className={`badge ${r.status === "fallida" ? "badge-risk" : r.status === "en_curso" ? "badge-gold" : "badge-muted"}`}>{RUN_STATUS[r.status]}</span>
              {r.correction_round ? <span className="badge badge-gold">Corrección {r.correction_round} de 2</span> : null}
              {r.status === "completada" && r.audit_status && r.audit_status !== "no_aplica" ? (
                <span className={`badge ${r.audit_status === "auditada" ? (r.audit_decision === "aprobar" ? "badge-ok" : r.audit_decision === "escalar" ? "badge-risk" : "badge-gold") : r.audit_status === "fallida" ? "badge-risk" : "badge-gold"}`}>
                  {r.audit_status === "auditada" ? `Auditada · ${r.audit_decision === "aprobar" ? "sin observaciones" : r.audit_decision === "escalar" ? "escalada" : "con observaciones"}` : AUDIT_STATUS[r.audit_status]}
                </span>
              ) : null}
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
            {audit ? (
              <div className={`audit-box audit-${audit.status === "fallida" ? "fallida" : audit.decision ?? ""}`}>
                <span className="eyebrow">Auditoría independiente{audit.auditor ? ` · ${audit.auditor}` : ""}</span>
                <p className="pre">{audit.status === "fallida" ? `No se completó: ${audit.error ?? "error"}.` : `${DECISION_TEXT[audit.decision ?? ""] ?? ""} ${audit.summary ?? ""}`}</p>
                {audit.checks?.length ? (
                  <details className="audit-checks">
                    <summary>Verificaciones automáticas ({audit.checks.filter((c) => !c.ok).length} con observaciones de {audit.checks.length})</summary>
                    <ul>
                      {audit.checks.map((c, i) => <li key={i} className={c.ok ? "is-ok" : "is-bad"}>{OBS_TYPE[c.tipo] ?? c.tipo}: {c.detalle}</li>)}
                    </ul>
                  </details>
                ) : null}
              </div>
            ) : !auditOn && r.status === "completada" && items.length && r.audit_status === "no_aplica" ? (
              <p className="muted-line">Sin auditoría automática: revisa cada propuesta con especial cuidado.</p>
            ) : null}
            <AuditActions caseId={caseId} runId={r.id} agent={r.agent} canAudit={canAudit} canCorrect={canCorrect} />
            {items.length ? (
              <ul className="proposal-list">
                {items.map((p) => {
                  const observed = !!p.audit_verdict && p.audit_verdict !== "aprobada";
                  const blocked = awaiting || observed;
                  const v = p.audit_verdict ? VERDICT_LABEL[p.audit_verdict] : null;
                  return (
                    <li key={p.id} className={`proposal proposal-${p.status}`}>
                      <div className="proposal-top">
                        <span className="eyebrow">{KIND[p.kind].label}</span>
                        {v ? <span className={`badge badge-${v.tone === "gold" ? "gold" : v.tone}`}>{v.label}</span> : null}
                      </div>
                      <div className="proposal-body"><Body p={p} /></div>
                      {p.audit_notes?.length ? (
                        <ul className="audit-notes">
                          {p.audit_notes.map((n, i) => (
                            <li key={i}><b>{OBS_TYPE[n.tipo ?? ""] ?? n.tipo}:</b> {n.detalle}{n.correccion_sugerida ? <em> → {n.correccion_sugerida}</em> : null}</li>
                          ))}
                        </ul>
                      ) : null}
                      {p.status === "pendiente" && canDecide ? (
                        <div className="proposal-actions">
                          {!blocked ? (
                            <form action={decideAgentProposalAction} className="inline-form">
                              <input type="hidden" name="case_id" value={caseId} />
                              <input type="hidden" name="proposal_id" value={p.id} />
                              <input type="hidden" name="decision" value="aceptar" />
                              {p.kind === "paso" ? <label className="check-inline"><input type="checkbox" name="internal" /> Solo equipo</label> : null}
                              <SubmitButton variant="gold" className="btn-inline btn-sm" pendingText="…">{KIND[p.kind].accept}</SubmitButton>
                            </form>
                          ) : supervisor ? (
                            <form action={decideAgentProposalAction} className="override-form">
                              <input type="hidden" name="case_id" value={caseId} />
                              <input type="hidden" name="proposal_id" value={p.id} />
                              <input type="hidden" name="decision" value="aceptar" />
                              <label htmlFor={`ov-${p.id}`} className="muted-line">Aceptar igualmente (supervisión): escribe el fundamento</label>
                              <textarea id={`ov-${p.id}`} name="override_note" className="input" rows={2} minLength={10} maxLength={1000} required
                                placeholder="Qué verificaste y por qué la propuesta es correcta pese a la auditoría" />
                              <div className="inline-form">
                                {p.kind === "paso" ? <label className="check-inline"><input type="checkbox" name="internal" /> Solo equipo</label> : null}
                                <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Aceptar con fundamento</SubmitButton>
                              </div>
                            </form>
                          ) : (
                            <span className="muted-line">{awaiting ? "Disponible cuando termine la auditoría." : "Bloqueada por la auditoría: pide la corrección o la revisión de la supervisión."}</span>
                          )}
                          <form action={decideAgentProposalAction}>
                            <input type="hidden" name="case_id" value={caseId} />
                            <input type="hidden" name="proposal_id" value={p.id} />
                            <input type="hidden" name="decision" value="descartar" />
                            <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Descartar</SubmitButton>
                          </form>
                        </div>
                      ) : p.status !== "pendiente" ? (
                        <span className={`badge ${STATUS_BADGE[p.status][0]}`}>{STATUS_BADGE[p.status][1]}{p.override_note ? " · con excepción de la supervisión" : ""}</span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {pending.length ? <p className="muted-line">{pending.length} pendiente{pending.length === 1 ? "" : "s"} de revisión.</p> : null}
          </li>
        );
      })}
    </ul>
  );
}
