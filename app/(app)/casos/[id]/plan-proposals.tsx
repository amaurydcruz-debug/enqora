import Link from "next/link";
import { cancelProposalAction, createProposalAction, decideProposalAction } from "@/app/actions/billing";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { SubmitButton } from "@/components/submit-button";
import { day, LINES, moment, PROPOSAL_STATUSES, type Plan, type PlanPrice, type PlanProposal } from "@/lib/billing";
import { clp } from "@/lib/pricing";

// Propuesta mensual al cerrar un caso: basada en el expediente real, sin presión,
// sin exagerar riesgos y sin garantizar ahorros. El cliente decide; aceptar crea el plan y su primer cobro.
export function PlanProposals({
  caseId,
  proposals,
  plans,
  prices,
  names,
  worker,
  canDecide,
  canPropose,
  isAgent,
}: {
  caseId: string;
  proposals: PlanProposal[];
  plans: Plan[];
  prices: PlanPrice[];
  names: Record<string, string>;
  worker: boolean;
  canDecide: boolean;
  canPropose: boolean;
  isAgent: boolean;
}) {
  const priceOf = new Map(prices.filter((p) => p.status === "vigente").map((p) => [p.plan_id, p]));
  const offer = plans.filter((p) => p.active && priceOf.has(p.id));
  const hasOpen = proposals.some((p) => ["pendiente_aprobacion", "observada", "enviada"].includes(p.status));

  return (
    <div className="proposals">
      {proposals.length ? (
        <ul className="quote-list" role="list">
          {proposals.map((p) => (
            <li key={p.id} className={`quote st-${p.status}`}>
              <div className="quote-head">
                <span className="quote-title">
                  <span className="mono">{p.plan_code}</span>
                  <b>{p.plan_name}</b>
                </span>
                <span className={`status status-${PROPOSAL_STATUSES[p.status].tone}`}>{PROPOSAL_STATUSES[p.status].label}</span>
              </div>
              <div className="quote-price">
                <span className="quote-final">{clp(p.monthly_price)}</span>
                <span className="quote-final-note">al mes · precio vigente del plan · válida hasta el {day(p.valid_until)}</span>
              </div>
              <div className="quote-terms proposal-terms">
                <div><h5>Qué se resolvió</h5><p className="pre">{p.resolved}</p></div>
                <div><h5>Qué obligaciones continúan</h5><p className="pre">{p.ongoing}</p></div>
                {p.next_month ? <div><h5>Qué toca el próximo mes</h5><p className="pre">{p.next_month}</p></div> : null}
                {p.risks ? <div><h5>Qué podría volver a fallar sin seguimiento</h5><p className="pre">{p.risks}</p></div> : null}
                {p.benefit ? <div><h5>Por qué conviene frente a contratar por separado</h5><p className="pre">{p.benefit}</p></div> : null}
              </div>
              <p className="muted-line">
                <Link href={`/planes#plan-${p.plan_code}`}>Ver qué incluye y qué no incluye el plan</Link>. Es una propuesta: no estás obligado a
                contratarla y no garantiza ahorros tributarios.
              </p>
              {p.decided_at && ["aceptada", "rechazada"].includes(p.status) ? (
                <p className="muted-line">
                  {p.status === "aceptada" ? "Aceptada" : "No aceptada"} por {p.decided_by ? names[p.decided_by] ?? "la empresa" : "la empresa"} · {moment(p.decided_at)}
                  {p.decision_note ? ` · «${p.decision_note}»` : ""}
                  {p.status === "aceptada" ? <> · <Link href="/facturacion#cobros">ver el cobro del primer mes</Link></> : null}
                </p>
              ) : null}

              {p.status === "enviada" && canDecide ? (
                <div className="quote-decide">
                  <form action={decideProposalAction} className="quote-accept">
                    <input type="hidden" name="case_id" value={caseId} />
                    <input type="hidden" name="proposal_id" value={p.id} />
                    <input type="hidden" name="decision" value="aceptar" />
                    <label className="check-inline">
                      <input type="checkbox" name="confirm" required />
                      Contrato {p.plan_name} por {clp(p.monthly_price)} al mes. Se activará cuando se confirme el pago del primer mes.
                    </label>
                    <SubmitButton className="btn-inline" pendingText="Registrando…">Aceptar propuesta</SubmitButton>
                  </form>
                  <details className="more inline-more">
                    <summary>No por ahora</summary>
                    <form action={decideProposalAction} className="mini-form">
                      <input type="hidden" name="case_id" value={caseId} />
                      <input type="hidden" name="proposal_id" value={p.id} />
                      <input type="hidden" name="decision" value="rechazar" />
                      <textarea name="note" className="input" rows={2} maxLength={1000} placeholder="Cuéntanos por qué (opcional)." aria-label="Motivo" />
                      <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Registrar respuesta</SubmitButton>
                    </form>
                  </details>
                </div>
              ) : null}
              {p.status === "enviada" && !canDecide && !worker ? (
                <p className="muted-line">La decide el Propietario o un Administrador de la empresa.</p>
              ) : null}
              {worker && ["pendiente_aprobacion", "observada", "enviada"].includes(p.status) ? (
                <form action={cancelProposalAction}>
                  <input type="hidden" name="case_id" value={caseId} />
                  <input type="hidden" name="proposal_id" value={p.id} />
                  <ConfirmSubmit variant="ghost" message="¿Anular esta propuesta?">Anular</ConfirmSubmit>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="panel-lead">
          {worker
            ? "Al cerrar el caso puedes proponer un plan mensual basado en lo que se resolvió y en las obligaciones que continúan."
            : "Si conviene un acompañamiento mensual después de este caso, el equipo ENQORA te lo propondrá aquí."}
        </p>
      )}

      {worker && canPropose && !hasOpen ? (
        offer.length ? (
          <details className="more inline-more" open={!proposals.length}>
            <summary>Proponer plan mensual</summary>
            <form action={createProposalAction} className="catalog-form">
              <input type="hidden" name="case_id" value={caseId} />
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="pp-plan">Plan</label>
                  <select id="pp-plan" name="plan_id" className="input" required>
                    {offer.map((p) => (
                      <option key={p.id} value={p.id}>{LINES[p.line].name.replace("ENQORA ", "")} · {p.name} · {clp(priceOf.get(p.id)!.monthly_price)}/mes</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="pp-days">Validez (días)</label>
                  <input id="pp-days" name="valid_days" type="number" min={1} max={60} defaultValue={15} className="input" />
                </div>
              </div>
              <div className="field"><label htmlFor="pp-res">Qué se resolvió</label><textarea id="pp-res" name="resolved" className="input" rows={3} required minLength={10} maxLength={4000} /></div>
              <div className="field"><label htmlFor="pp-ong">Qué obligaciones continúan</label><textarea id="pp-ong" name="ongoing" className="input" rows={3} required minLength={10} maxLength={4000} /></div>
              <div className="field"><label htmlFor="pp-next">Qué toca el próximo mes <span className="optional">(opcional)</span></label><textarea id="pp-next" name="next_month" className="input" rows={2} maxLength={2000} /></div>
              <div className="field"><label htmlFor="pp-risk">Qué podría volver a fallar <span className="optional">(sin exagerar)</span></label><textarea id="pp-risk" name="risks" className="input" rows={2} maxLength={2000} /></div>
              <div className="field"><label htmlFor="pp-ben">Por qué conviene frente a contratar por separado <span className="optional">(sin garantizar ahorros)</span></label><textarea id="pp-ben" name="benefit" className="input" rows={2} maxLength={2000} /></div>
              <p className="muted-line">
                El precio es el vigente del plan; no se aplican descuentos en la propuesta.
                {isAgent ? " Como agente IA, tu propuesta pasará por la aprobación de un profesional antes de llegar al cliente." : ""}
              </p>
              <div className="panel-actions"><SubmitButton className="btn-inline" pendingText="Enviando…">{isAgent ? "Enviar a aprobación" : "Enviar propuesta"}</SubmitButton></div>
            </form>
          </details>
        ) : (
          <p className="muted-line">No hay planes activos con precio publicado. El Administrador ENQORA los define en Centro de Mando → Planes.</p>
        )
      ) : null}
    </div>
  );
}
