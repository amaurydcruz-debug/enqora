import { ConfirmSubmit } from "@/components/confirm-submit";
import { SubmitButton } from "@/components/submit-button";
import { cancelQuoteAction, decideQuoteAction } from "@/app/actions/pricing";
import {
  clp,
  COMPLEXITY,
  QUOTE_STATUSES,
  quoteStatus,
  referenceIsFresh,
  REVIEW_REASONS,
  UNITS,
  type MarketReference,
  type Quote,
  type Service,
  type Tariff,
} from "@/lib/pricing";
import { QuoteForm } from "./quote-form";

const fmtDate = (d: string) =>
  new Intl.DateTimeFormat("es-CL", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
const fmt = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(iso)) : "—";

// Cotizaciones del caso. El cliente ve las que ya le fueron enviadas, con su desglose honesto:
// precio estándar ENQORA, descuento y motivo, precio final y, aparte, referencias de mercado con fuente.
export function Quotes({
  caseId,
  quotes,
  references,
  services,
  tariffs,
  names,
  canDecide,
  worker,
  isAgent,
  isClosed,
}: {
  caseId: string;
  quotes: Quote[];
  references: MarketReference[];
  services: Service[];
  tariffs: Tariff[];
  names: Record<string, string>;
  canDecide: boolean;
  worker: boolean;
  isAgent: boolean;
  isClosed: boolean;
}) {
  return (
    <div className="quotes">
      {quotes.length ? (
        <ul className="quote-list" role="list">
          {quotes.map((q) => {
            const st = quoteStatus(q);
            const refs = references.filter((r) => r.service_id === q.service_id && referenceIsFresh(r));
            const unitWord = q.quantity === 1 ? UNITS[q.unit]?.per ?? q.unit : UNITS[q.unit]?.plural ?? q.unit;
            return (
              <li key={q.id} className={`quote st-${st}`}>
                <div className="quote-head">
                  <span className="quote-title">
                    <span className="mono">{q.service_code}</span>
                    <b>{q.service_name}</b>
                  </span>
                  <span className={`status status-${QUOTE_STATUSES[st]?.tone ?? "muted"}`}>{QUOTE_STATUSES[st]?.label ?? st}</span>
                </div>

                <div className="quote-price">
                  <span className="quote-final">{clp(q.final_price)}</span>
                  <span className="quote-final-note">
                    {q.quantity} {unitWord} · complejidad {COMPLEXITY[q.complexity]?.toLowerCase()}
                    {q.external_costs ? ` · más ${clp(q.external_costs)} de gastos externos` : ""}
                  </span>
                </div>

                <dl className="quote-lines">
                  <div><dt>Precio estándar ENQORA <small>(tarifa vigente, versión {q.tariff_version})</small></dt><dd>{clp(q.standard_price)}</dd></div>
                  {q.urgency_amount ? <div><dt>Incluye recargo por urgencia</dt><dd>{clp(q.urgency_amount)}</dd></div> : null}
                  {q.onsite_amount ? <div><dt>Incluye gestión presencial</dt><dd>{clp(q.onsite_amount)}</dd></div> : null}
                  {q.discount_amount ? (
                    <div><dt>Descuento {q.discount_pct}% <small>{q.discount_reason ? `· ${q.discount_reason}` : ""}</small></dt><dd>− {clp(q.discount_amount)}</dd></div>
                  ) : null}
                  <div className="is-final"><dt>Precio final</dt><dd>{clp(q.final_price)}</dd></div>
                  {q.external_costs ? (
                    <div><dt>Gastos externos estimados <small>{q.external_detail ? `· ${q.external_detail}` : ""} · se informan aparte</small></dt><dd>{clp(q.external_costs)}</dd></div>
                  ) : null}
                </dl>

                <div className="quote-terms">
                  <div><h5>Incluye</h5><p className="pre">{q.scope}</p></div>
                  {q.exclusions ? <div><h5>No incluye</h5><p className="pre">{q.exclusions}</p></div> : null}
                  {q.payment_terms ? <div><h5>Condiciones de pago</h5><p>{q.payment_terms}</p></div> : null}
                  <div><h5>Válida hasta</h5><p>{fmtDate(q.valid_until)}</p></div>
                </div>

                {refs.length ? (
                  <div className="quote-refs">
                    <h5>Referencias de mercado <small>· no son precios oficiales; se muestran con su fuente</small></h5>
                    <ul role="list">
                      {refs.map((r) => (
                        <li key={r.id}>
                          <span>{r.provider}: {clp(r.amount_min)}{r.amount_max ? ` – ${clp(r.amount_max)}` : ""} / {UNITS[r.unit]?.per ?? r.unit}{r.scope_note ? ` · ${r.scope_note}` : ""}</span>
                          <a href={r.url} target="_blank" rel="noopener noreferrer">Fuente · consultada {fmtDate(r.consulted_on)}</a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {worker && q.review_reasons.length ? (
                  <p className="muted-line">Revisión interna: {q.review_reasons.map((r) => REVIEW_REASONS[r] ?? r).join(" · ")}.</p>
                ) : null}
                {q.decided_at && ["aceptada", "rechazada"].includes(q.status) ? (
                  <p className="muted-line">
                    {q.status === "aceptada" ? "Aceptada" : "No aceptada"} por {q.decided_by ? names[q.decided_by] ?? "la empresa" : "la empresa"} · {fmt(q.decided_at)}
                    {q.decision_note ? ` · «${q.decision_note}»` : ""}
                  </p>
                ) : null}

                {st === "enviada" && canDecide && !isClosed ? (
                  <div className="quote-decide">
                    <form action={decideQuoteAction} className="quote-accept">
                      <input type="hidden" name="case_id" value={caseId} />
                      <input type="hidden" name="quote_id" value={q.id} />
                      <input type="hidden" name="decision" value="aceptar" />
                      <label className="check-inline">
                        <input type="checkbox" name="confirm" required />
                        Acepto esta cotización por {clp(q.final_price)}{q.external_costs ? ` más gastos externos estimados en ${clp(q.external_costs)}` : ""}, con el alcance y las condiciones descritas.
                      </label>
                      <SubmitButton className="btn-inline" pendingText="Registrando…">Aceptar cotización</SubmitButton>
                    </form>
                    <details className="more inline-more">
                      <summary>No la acepto</summary>
                      <form action={decideQuoteAction} className="mini-form">
                        <input type="hidden" name="case_id" value={caseId} />
                        <input type="hidden" name="quote_id" value={q.id} />
                        <input type="hidden" name="decision" value="rechazar" />
                        <textarea name="note" className="input" rows={2} maxLength={1000} placeholder="Cuéntanos por qué (opcional): así podemos ajustarla." aria-label="Motivo" />
                        <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Registrar respuesta</SubmitButton>
                      </form>
                    </details>
                  </div>
                ) : null}
                {st === "enviada" && !canDecide && !worker ? (
                  <p className="muted-line">La decide el Propietario o un Administrador de la empresa.</p>
                ) : null}

                {worker && ["pendiente_aprobacion", "observada", "enviada"].includes(q.status) && !isClosed ? (
                  <form action={cancelQuoteAction}>
                    <input type="hidden" name="case_id" value={caseId} />
                    <input type="hidden" name="quote_id" value={q.id} />
                    <ConfirmSubmit variant="ghost" message="¿Anular esta cotización?">Anular</ConfirmSubmit>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="panel-lead">{worker ? "Aún no hay cotizaciones en este caso." : "Cuando el equipo ENQORA prepare una cotización para este caso, la verás aquí con su desglose completo."}</p>
      )}

      {worker && !isClosed ? (
        <details className="more inline-more" open={!quotes.length}>
          <summary>Nueva cotización</summary>
          <QuoteForm caseId={caseId} services={services} tariffs={tariffs} isAgent={isAgent} />
        </details>
      ) : null}
    </div>
  );
}
