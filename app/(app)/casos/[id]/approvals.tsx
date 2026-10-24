import { ConfirmSubmit } from "@/components/confirm-submit";
import { SubmitButton } from "@/components/submit-button";
import { IconCheck } from "@/components/icons";
import { cancelApprovalAction, decideApprovalAction, requestApprovalAction } from "@/app/actions/approvals";
import {
  APPROVAL_KINDS,
  APPROVAL_STATUSES,
  APPROVER_ROLES,
  badgeClass,
  ON_APPROVE_STATUSES,
  type Approval,
} from "@/lib/approvals";
import { statusLabel, type StaffRole } from "@/lib/cases";

// Aprobaciones internas del caso (solo equipo ENQORA). El cliente nunca las ve.
const fmt = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(iso))
    : "—";
const clp = (n: unknown) =>
  typeof n === "number" ? new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n) : null;

// Espejo en pantalla de la regla de la base (la base decide siempre).
function canDecide(a: Approval, me: string, role: StaffRole | null, supervisor: boolean, responsibleId: string | null, assigned: boolean) {
  if (!role || role === "ai_agent") return false;
  if (a.requested_by === me && !supervisor) return false;
  if (supervisor) return true;
  if (a.approver_role === "supervisor") return false;
  if (a.approver_role === "responsable") return responsibleId === me;
  return role === a.approver_role && assigned;
}

export function Approvals({
  caseId,
  items,
  names,
  me,
  role,
  supervisor,
  assigned,
  responsibleId,
  isClosed,
}: {
  caseId: string;
  items: Approval[];
  names: Record<string, string>;
  me: string;
  role: StaffRole | null;
  supervisor: boolean;
  assigned: boolean;
  responsibleId: string | null;
  isClosed: boolean;
}) {
  const who = (uid: string | null) => (uid ? names[uid] ?? "Equipo ENQORA" : "ENQORA");

  return (
    <section className="card" id="aprobaciones">
      <h2 className="card-title"><IconCheck /> Aprobaciones internas</h2>
      <p className="muted-line">Solo el equipo ENQORA ve esta sección. Quien solicita no decide.</p>

      {items.length ? (
        <ul className="approval-list">
          {items.map((a) => {
            const decide = a.status === "pendiente" && !isClosed && canDecide(a, me, role, supervisor, responsibleId, assigned);
            const amount = clp(a.payload?.monto);
            return (
              <li key={a.id} className={`approval approval-${a.status}`}>
                <div className="auth-head">
                  <b>{a.title}</b>
                  <span className={badgeClass(APPROVAL_STATUSES[a.status]?.tone)}>{APPROVAL_STATUSES[a.status]?.label ?? a.status}</span>
                </div>
                <span className="muted-line">
                  {APPROVAL_KINDS[a.kind]?.label ?? a.kind} · decide: {APPROVER_ROLES[a.approver_role] ?? a.approver_role}
                  {a.on_approve_status ? ` · al aprobar: ${statusLabel(a.on_approve_status)}` : ""}
                  {amount ? ` · ${amount}` : ""}
                </span>
                {a.detail ? <p className="pre">{a.detail}</p> : null}
                <span className="muted-line">Solicitó {who(a.requested_by)} · {fmt(a.requested_at)}</span>
                {a.decided_at ? (
                  <span className="muted-line">
                    {a.status === "anulada" ? "Anuló" : "Decidió"} {who(a.decided_by)} · {fmt(a.decided_at)}
                    {a.self_decided ? " · decidida por quien la solicitó (supervisión)" : ""}
                  </span>
                ) : null}
                {a.decision_note ? <p className="pre approval-note">{a.decision_note}</p> : null}

                {decide ? (
                  <form action={decideApprovalAction} className="mini-form">
                    <input type="hidden" name="case_id" value={caseId} />
                    <input type="hidden" name="approval_id" value={a.id} />
                    <textarea name="note" className="input" rows={2} maxLength={4000}
                      placeholder="Observaciones (obligatorias para rechazar o devolver)" aria-label="Observaciones" />
                    <div className="inline-form">
                      <button type="submit" name="decision" value="aprobar" className="btn btn-gold btn-inline btn-sm">Aprobar</button>
                      <button type="submit" name="decision" value="devolver" className="btn btn-ghost btn-inline btn-sm">Devolver</button>
                      <button type="submit" name="decision" value="rechazar" className="btn btn-danger btn-inline btn-sm">Rechazar</button>
                    </div>
                  </form>
                ) : null}
                {a.status === "pendiente" && !isClosed && (a.requested_by === me || supervisor) ? (
                  <form action={cancelApprovalAction}>
                    <input type="hidden" name="case_id" value={caseId} />
                    <input type="hidden" name="approval_id" value={a.id} />
                    <ConfirmSubmit message="¿Anular esta solicitud de aprobación?" variant="ghost">Anular</ConfirmSubmit>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted-line">Sin solicitudes de aprobación.</p>
      )}

      {!isClosed ? (
        <details className="auth-new">
          <summary>Solicitar aprobación</summary>
          <form action={requestApprovalAction} className="mini-form">
            <input type="hidden" name="case_id" value={caseId} />
            <div className="inline-form">
              <select name="kind" className="input input-sm" defaultValue="diagnostico" aria-label="Tipo">
                {Object.entries(APPROVAL_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select name="approver_role" className="input input-sm" defaultValue={responsibleId ? "responsable" : "supervisor"} aria-label="Quién decide">
                {Object.entries(APPROVER_ROLES).map(([k, v]) => <option key={k} value={k}>Decide: {v}</option>)}
              </select>
            </div>
            <input name="title" className="input input-sm" placeholder="Qué se debe aprobar" required minLength={3} maxLength={160} aria-label="Título" />
            <textarea name="detail" className="input" rows={3} maxLength={4000} placeholder="Fundamento, fuente y riesgos" aria-label="Fundamento" />
            <div className="inline-form">
              <select name="on_approve_status" className="input input-sm" defaultValue="" aria-label="Al aprobar">
                <option value="">Al aprobar: sin cambio de estado</option>
                {Object.entries(ON_APPROVE_STATUSES).map(([k, v]) => <option key={k} value={k}>Al aprobar: {v}</option>)}
              </select>
              <input name="amount" className="input input-sm" inputMode="numeric" placeholder="Monto CLP (precio)" maxLength={15} aria-label="Monto" />
            </div>
            <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Enviar a aprobación</SubmitButton>
          </form>
        </details>
      ) : null}
    </section>
  );
}
