"use client";

import { useMemo, useState } from "react";
import { createQuoteAction } from "@/app/actions/pricing";
import { SubmitButton } from "@/components/submit-button";
import { clp, COMPLEXITY, previewQuote, UNITS, type Service, type Tariff } from "@/lib/pricing";

// Formulario del equipo para cotizar. La vista previa usa la misma fórmula que la base de datos,
// pero el precio oficial lo calcula siempre la base al guardar.
export function QuoteForm({
  caseId,
  services,
  tariffs,
  isAgent,
}: {
  caseId: string;
  services: Service[];
  tariffs: Tariff[];
  isAgent: boolean;
}) {
  const priced = services.filter((s) => tariffs.some((t) => t.service_id === s.id));
  const [serviceId, setServiceId] = useState(priced[0]?.id ?? "");
  const [complexity, setComplexity] = useState("simple");
  const [quantity, setQuantity] = useState(1);
  const [onsite, setOnsite] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [discount, setDiscount] = useState(0);

  const service = priced.find((s) => s.id === serviceId) ?? null;
  const tariff = tariffs.find((t) => t.service_id === serviceId) ?? null;
  const calc = useMemo(
    () => (tariff ? previewQuote(tariff, { complexity, quantity, onsite, urgent, discountPct: discount }) : null),
    [tariff, complexity, quantity, onsite, urgent, discount],
  );

  if (!priced.length) {
    return (
      <p className="muted-line">
        Ningún servicio activo tiene una tarifa vigente. El Administrador ENQORA debe publicarla en Catálogo y precios antes de cotizar.
      </p>
    );
  }

  const review = !!calc && (!calc.within || service?.requires_professional || isAgent);
  const per = UNITS[service?.unit ?? "caso"]?.per ?? "unidad";

  return (
    <form action={createQuoteAction} className="quote-form">
      <input type="hidden" name="case_id" value={caseId} />
      <div className="form-grid">
        <div className="field field-wide">
          <label htmlFor="q-service">Servicio</label>
          <select id="q-service" name="service_id" className="input" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            {priced.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="q-complexity">Complejidad</label>
          <select id="q-complexity" name="complexity" className="input" value={complexity} onChange={(e) => setComplexity(e.target.value)}>
            {Object.entries(COMPLEXITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="q-qty">Cantidad ({per})</label>
          <input id="q-qty" name="quantity" type="number" min={1} max={1000} className="input mono" value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))} />
        </div>
        <div className="field">
          <label htmlFor="q-disc">Descuento (%)</label>
          <input id="q-disc" name="discount_pct" type="number" min={0} max={100} className="input mono" value={discount}
            onChange={(e) => setDiscount(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} />
        </div>
        <div className="field">
          <label htmlFor="q-valid">Validez (días)</label>
          <input id="q-valid" name="valid_days" type="number" min={1} max={90} defaultValue={15} className="input mono" />
        </div>
      </div>
      <div className="check-row">
        <label className="check-inline"><input type="checkbox" name="onsite" checked={onsite} onChange={(e) => setOnsite(e.target.checked)} /> Gestión presencial</label>
        <label className="check-inline"><input type="checkbox" name="urgent" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /> Urgente</label>
      </div>
      {discount > 0 ? (
        <div className="field">
          <label htmlFor="q-reason">Motivo del descuento</label>
          <input id="q-reason" name="discount_reason" className="input" required minLength={10} maxLength={500}
            placeholder="Se calcula sobre la tarifa estándar vigente. Explica por qué se aplica." />
        </div>
      ) : null}
      <div className="form-grid">
        <div className="field">
          <label htmlFor="q-ext">Gastos externos estimados (CLP)</label>
          <input id="q-ext" name="external_costs" className="input mono" inputMode="numeric" placeholder="0" />
        </div>
        <div className="field field-wide">
          <label htmlFor="q-extd">Detalle de gastos externos</label>
          <input id="q-extd" name="external_detail" className="input" maxLength={500} placeholder="Notaría, aranceles, derechos…" />
        </div>
      </div>
      <div className="field">
        <label htmlFor="q-terms">Condiciones de pago</label>
        <input id="q-terms" name="payment_terms" className="input" maxLength={500} placeholder="Ej.: 50% al aceptar y 50% al entregar" />
      </div>

      {calc && tariff ? (
        <div className={`quote-preview${review ? " needs-review" : ""}`} aria-live="polite">
          <span className="eyebrow">Vista previa · tarifa versión {tariff.version}</span>
          <dl className="quote-lines">
            <div><dt>Base × complejidad × cantidad</dt><dd>{clp(calc.subtotal)}</dd></div>
            {calc.urgency ? <div><dt>Urgencia (+{tariff.urgency_pct}%)</dt><dd>{clp(calc.urgency)}</dd></div> : null}
            {calc.onsite ? <div><dt>Gestión presencial</dt><dd>{clp(calc.onsite)}</dd></div> : null}
            <div className="is-strong"><dt>Precio estándar ENQORA</dt><dd>{clp(calc.standard)}</dd></div>
            {calc.discount ? <div><dt>Descuento ({discount}%)</dt><dd>− {clp(calc.discount)}</dd></div> : null}
            <div className="is-final"><dt>Precio final</dt><dd>{clp(calc.final)}</dd></div>
          </dl>
          <p className="quote-route">
            {review
              ? `Irá a aprobación en el Centro de Mando antes de llegar al cliente${calc.reasons.length ? `: ${calc.reasons.join(", ").toLowerCase()}` : service?.requires_professional ? ": el servicio exige criterio profesional" : ": propuesta de un agente IA"}.`
              : "Dentro de los parámetros aprobados: se enviará al cliente de inmediato."}
          </p>
        </div>
      ) : null}

      <div className="panel-actions">
        <SubmitButton className="btn-inline" pendingText="Calculando…">{review ? "Enviar a aprobación" : "Enviar cotización"}</SubmitButton>
      </div>
    </form>
  );
}
