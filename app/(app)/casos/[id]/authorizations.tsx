import { ConfirmSubmit } from "@/components/confirm-submit";
import { SubmitButton } from "@/components/submit-button";
import { IconShield } from "@/components/icons";
import {
  cancelAuthorizationAction,
  decideAuthorizationAction,
  requestAuthorizationAction,
  revokeAuthorizationAction,
} from "@/app/actions/approvals";
import { AUTH_STATUSES, authStatus, badgeClass, todayCL, type ClientAuthorization } from "@/lib/approvals";

// Autorizaciones del cliente dentro del caso: explícitas, limitadas a lo descrito y revocables.
const fmt = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(iso))
    : "—";
const fmtDate = (d: string | null) =>
  d ? new Intl.DateTimeFormat("es-CL", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`)) : null;

export function Authorizations({
  caseId,
  items,
  names,
  canDecide,
  canRequest,
  isClosed,
}: {
  caseId: string;
  items: ClientAuthorization[];
  names: Record<string, string>;
  canDecide: boolean; // Propietario o Administrador de la empresa
  canRequest: boolean; // equipo con acceso al caso (no agentes IA)
  isClosed: boolean;
}) {
  if (!items.length && !canRequest) return null;
  const who = (uid: string | null) => (uid ? names[uid] ?? "Participante" : "ENQORA");

  return (
    <section className="card" id="autorizaciones">
      <h2 className="card-title"><IconShield /> Autorizaciones</h2>

      {items.length ? (
        <ul className="auth-list">
          {items.map((a) => {
            const st = authStatus(a);
            const pending = a.status === "pendiente";
            return (
              <li key={a.id} className={`auth-item auth-${st}`}>
                <div className="auth-head">
                  <b>{a.title}</b>
                  <span className={badgeClass(AUTH_STATUSES[st]?.tone)}>{AUTH_STATUSES[st]?.label ?? st}</span>
                </div>
                <p className="auth-scope pre">{a.scope}</p>
                <dl className="auth-meta">
                  {a.institution ? <><dt>Institución</dt><dd>{a.institution}</dd></> : null}
                  <dt>Vigencia</dt>
                  <dd>{a.valid_until ? `Hasta el ${fmtDate(a.valid_until)}` : "Mientras dure este caso"}</dd>
                  <dt>Solicitada</dt>
                  <dd>{who(a.requested_by)} · {fmt(a.requested_at)}</dd>
                  {a.decided_at && a.status !== "anulada" ? (
                    <>
                      <dt>{a.status === "autorizada" || a.status === "revocada" ? "Autorizada por" : "Decidida por"}</dt>
                      <dd>{who(a.decided_by)} · {fmt(a.decided_at)}</dd>
                    </>
                  ) : null}
                  {a.revoked_at ? <><dt>Revocada</dt><dd>{who(a.revoked_by)} · {fmt(a.revoked_at)}</dd></> : null}
                  {a.decision_note ? <><dt>Observación</dt><dd>{a.decision_note}</dd></> : null}
                </dl>

                {pending && canDecide ? (
                  <div className="auth-decide">
                    <form action={decideAuthorizationAction} className="mini-form">
                      <input type="hidden" name="case_id" value={caseId} />
                      <input type="hidden" name="authorization_id" value={a.id} />
                      <input type="hidden" name="decision" value="autorizar" />
                      <label className="check-inline auth-confirm">
                        <input type="checkbox" name="confirm" required />
                        <span>
                          Autorizo a ENQORA a realizar exactamente lo descrito
                          {a.valid_until ? `, hasta el ${fmtDate(a.valid_until)}` : ""}. Puedo revocarlo cuando quiera.
                        </span>
                      </label>
                      <SubmitButton variant="gold" className="btn-inline btn-sm" pendingText="Registrando…">Autorizar</SubmitButton>
                    </form>
                    <details className="auth-reject">
                      <summary>No autorizo</summary>
                      <form action={decideAuthorizationAction} className="mini-form">
                        <input type="hidden" name="case_id" value={caseId} />
                        <input type="hidden" name="authorization_id" value={a.id} />
                        <input type="hidden" name="decision" value="rechazar" />
                        <textarea name="note" className="input" rows={2} maxLength={2000} placeholder="Motivo (opcional), para que el equipo lo considere" aria-label="Motivo" />
                        <ConfirmSubmit message="¿Rechazar esta autorización? El equipo revisará el caso contigo." variant="ghost">Rechazar</ConfirmSubmit>
                      </form>
                    </details>
                  </div>
                ) : null}
                {pending && !canDecide && !canRequest ? (
                  <p className="muted-line">Solo el Propietario o un Administrador de la empresa puede decidir esta autorización.</p>
                ) : null}

                {a.status === "autorizada" && canDecide && st !== "vencida" ? (
                  <details className="auth-reject">
                    <summary>Revocar autorización</summary>
                    <form action={revokeAuthorizationAction} className="mini-form">
                      <input type="hidden" name="case_id" value={caseId} />
                      <input type="hidden" name="authorization_id" value={a.id} />
                      <textarea name="note" className="input" rows={2} maxLength={2000} placeholder="Motivo (opcional)" aria-label="Motivo" />
                      <ConfirmSubmit message="¿Revocar esta autorización? ENQORA detendrá la ejecución de esta gestión.">Revocar</ConfirmSubmit>
                    </form>
                  </details>
                ) : null}

                {pending && canRequest && !isClosed ? (
                  <form action={cancelAuthorizationAction}>
                    <input type="hidden" name="case_id" value={caseId} />
                    <input type="hidden" name="authorization_id" value={a.id} />
                    <ConfirmSubmit message="¿Anular esta solicitud de autorización?" variant="ghost">Anular solicitud</ConfirmSubmit>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted-line">Este caso no tiene autorizaciones solicitadas.</p>
      )}

      <p className="auth-legal">
        Una autorización es tu consentimiento dentro de ENQORA para la gestión descrita. No es un mandato legal ni un poder
        notarial: si un trámite lo exige, te lo pediremos por separado. ENQORA nunca te pedirá tu ClaveÚnica ni tu clave del SII.
      </p>

      {canRequest && !isClosed ? (
        <details className="auth-new">
          <summary>Solicitar autorización al cliente</summary>
          <form action={requestAuthorizationAction} className="mini-form">
            <input type="hidden" name="case_id" value={caseId} />
            <input name="title" className="input input-sm" placeholder="Qué se autoriza (ej.: Presentar F29 rectificatorio)" required minLength={3} maxLength={160} aria-label="Título" />
            <textarea name="scope" className="input" rows={3} required minLength={10} maxLength={2000}
              placeholder="Alcance exacto: qué se hará, períodos, montos o documentos involucrados." aria-label="Alcance" />
            <div className="inline-form">
              <input name="institution" className="input input-sm" placeholder="Institución (opcional)" maxLength={160} aria-label="Institución" />
              <input type="date" name="valid_until" className="input input-sm" min={todayCL()} aria-label="Vigente hasta" />
            </div>
            <SubmitButton variant="gold" className="btn-inline btn-sm" pendingText="…">Enviar al cliente</SubmitButton>
          </form>
        </details>
      ) : null}
    </section>
  );
}
