import { cancelActionAction, executeActionAction, planActionAction, verifyActionAction } from "@/app/actions/mandates";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { SubmitButton } from "@/components/submit-button";
import { day, moment } from "@/lib/billing";
import { ACTION_STATUSES, INSTITUTIONS, instList, type CaseAction, type Mandate } from "@/lib/mandates";

type AuthLite = { id: string; title: string; institution: string | null; valid_until: string | null; status: string };

const Check = ({ ok, label }: { ok: boolean | undefined; label: string }) => (
  <li className={ok ? "is-ok" : "is-info"}><b>{ok ? "Cumple" : "Pendiente"}</b><span>{label}</span></li>
);

// Actuaciones ante instituciones. Solo se ejecutan con mandato vigente que cubra la institución
// y una autorización vigente del cliente para este caso; la base de datos lo comprueba dos veces.
export function CaseActions({
  caseId,
  actions,
  mandates,
  authorizations,
  names,
  worker,
  canVerify,
  isAgent,
  isClosed,
  userId,
}: {
  caseId: string;
  actions: CaseAction[];
  mandates: Mandate[];
  authorizations: AuthLite[];
  names: Record<string, string>;
  worker: boolean;
  canVerify: boolean;
  isAgent: boolean;
  isClosed: boolean;
  userId: string;
}) {
  const vigentes = mandates.filter((m) => m.status === "vigente");
  const auths = authorizations.filter((a) => a.status === "autorizada");
  return (
    <div className="case-actions">
      <p className="panel-lead">
        {worker
          ? "Cada trámite ante una institución necesita un mandato vigente de la empresa que cubra esa institución y la autorización del cliente para este caso."
          : "Aquí ves cada trámite que ENQORA realiza en tu nombre, con el mandato y la autorización que lo respaldan."}
      </p>
      {actions.length ? (
        <ul className="quote-list" role="list">
          {actions.map((a) => {
            const m = mandates.find((x) => x.id === a.mandate_id);
            const au = authorizations.find((x) => x.id === a.authorization_id);
            return (
              <li key={a.id} className={`quote st-${a.status === "verificada" ? "enviada" : a.status === "ejecutada" ? "aceptada" : a.status}`}>
                <div className="quote-head">
                  <span className="quote-title">
                    <span className="mono">{INSTITUTIONS[a.institution] ?? a.institution}</span>
                    <b>{a.procedure}</b>
                  </span>
                  <span className={`status status-${ACTION_STATUSES[a.status].tone}`}>{ACTION_STATUSES[a.status].label}</span>
                </div>
                {a.detail ? <p className="pre muted-line">{a.detail}</p> : null}
                <ul className="sec-list" role="list">
                  <Check ok={a.status !== "planificada" ? a.checks.mandato_vigente : !!m && m.status === "vigente" && m.institutions.includes(a.institution)}
                    label={m ? `Mandato ${m.folio} (${instList(m.institutions)}) · hasta el ${day(m.valid_until)}` : "Sin mandato asociado"} />
                  <Check ok={a.status !== "planificada" ? a.checks.autorizacion_vigente : au?.status === "autorizada"}
                    label={au ? `Autorización «${au.title}»${au.valid_until ? ` · hasta el ${day(au.valid_until)}` : ""}` : "Sin autorización del cliente asociada"} />
                </ul>
                {a.result ? <p className="pre">{a.status === "ejecutada" ? "Resultado: " : "Motivo: "}{a.result}</p> : null}
                <p className="muted-line">
                  Planificada {moment(a.created_at)}{a.planned_by ? ` por ${names[a.planned_by] ?? "el equipo"}` : ""}
                  {a.verified_at ? ` · habilitada ${moment(a.verified_at)}${a.verified_by ? ` por ${names[a.verified_by] ?? "el equipo"}` : ""}` : ""}
                  {a.executed_at ? ` · registrada ${moment(a.executed_at)}` : ""}
                </p>
                {worker && !isClosed ? (
                  <div className="panel-actions">
                    {a.status === "planificada" && canVerify && a.planned_by !== userId ? (
                      <form action={verifyActionAction}>
                        <input type="hidden" name="case_id" value={caseId} />
                        <input type="hidden" name="action_id" value={a.id} />
                        <SubmitButton className="btn-inline btn-sm" pendingText="Comprobando…">Comprobar y habilitar</SubmitButton>
                      </form>
                    ) : null}
                    {a.status === "verificada" && !isAgent ? (
                      <details className="more inline-more">
                        <summary>Registrar resultado</summary>
                        <form action={executeActionAction} className="mini-form">
                          <input type="hidden" name="case_id" value={caseId} />
                          <input type="hidden" name="action_id" value={a.id} />
                          <select name="outcome" className="input input-sm" aria-label="Resultado">
                            <option value="ejecutada">Se realizó</option>
                            <option value="fallida">No se completó</option>
                          </select>
                          <textarea name="result" className="input" rows={2} required minLength={10} maxLength={2000}
                            placeholder="Folio, comprobante o motivo (mínimo 10 caracteres)" aria-label="Resultado" />
                          <SubmitButton className="btn-inline btn-sm" pendingText="Registrando…">Registrar</SubmitButton>
                        </form>
                      </details>
                    ) : null}
                    {["planificada", "verificada"].includes(a.status) ? (
                      <form action={cancelActionAction}>
                        <input type="hidden" name="case_id" value={caseId} />
                        <input type="hidden" name="action_id" value={a.id} />
                        <ConfirmSubmit variant="ghost" message="¿Cancelar esta actuación?">Cancelar</ConfirmSubmit>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted-line">{worker ? "Aún no hay actuaciones planificadas." : "ENQORA aún no ha realizado trámites ante instituciones en este caso."}</p>
      )}

      {worker && !isClosed ? (
        <details className="more inline-more" open={!actions.length}>
          <summary>Planificar actuación</summary>
          <form action={planActionAction} className="catalog-form">
            <input type="hidden" name="case_id" value={caseId} />
            <div className="form-grid">
              <div className="field">
                <label htmlFor="ac-inst">Institución</label>
                <select id="ac-inst" name="institution" className="input" required>
                  {Object.entries(INSTITUTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="field"><label htmlFor="ac-proc">Trámite</label><input id="ac-proc" name="procedure" className="input" required minLength={5} maxLength={200} /></div>
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="ac-man">Mandato</label>
                <select id="ac-man" name="mandate_id" className="input" defaultValue="">
                  <option value="">{vigentes.length ? "Elegir…" : "Sin mandatos vigentes"}</option>
                  {vigentes.map((m) => <option key={m.id} value={m.id}>{m.folio} · {instList(m.institutions)}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="ac-aut">Autorización del cliente</label>
                <select id="ac-aut" name="authorization_id" className="input" defaultValue="">
                  <option value="">{auths.length ? "Elegir…" : "Sin autorizaciones vigentes"}</option>
                  {auths.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
                </select>
              </div>
            </div>
            <div className="field"><label htmlFor="ac-det">Detalle <span className="optional">(opcional)</span></label><textarea id="ac-det" name="detail" className="input" rows={2} maxLength={2000} /></div>
            <p className="muted-line">
              Puedes planificarla sin mandato o autorización; no se habilitará hasta que ambos estén vigentes. La habilita otra persona
              (responsable, supervisión o abogado){isAgent ? "; un agente IA no habilita ni ejecuta" : ""}.
            </p>
            <div className="panel-actions"><SubmitButton className="btn-inline" pendingText="Guardando…">Planificar</SubmitButton></div>
          </form>
        </details>
      ) : null}
    </div>
  );
}
