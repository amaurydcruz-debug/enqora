import Link from "next/link";
import type { Metadata } from "next";
import {
  cancelSubscriptionAction,
  reportTransferAction,
  resumeSubscriptionAction,
  startGatewayPaymentAction,
} from "@/app/actions/billing";
import { Accordion, type AccordionItem } from "@/components/accordion";
import { Notice } from "@/components/auth-card";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { Callout } from "@/components/disclosure";
import { Emblem } from "@/components/emblems";
import { SubmitButton } from "@/components/submit-button";
import {
  CHARGE_STATUSES,
  day,
  LINES,
  moment,
  payable,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  SUBSCRIPTION_STATUSES,
  todayCl,
  type BillingSettings,
  type Charge,
  type Payment,
  type Subscription,
} from "@/lib/billing";
import { activeCompany } from "@/lib/companies";
import { messageForCode } from "@/lib/db-errors";
import { flowEnabled, flowIsSandbox } from "@/lib/flow";
import { clp } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Facturación" };

const AVISOS: Record<string, string> = {
  suscripcion_creada: "Plan registrado. Se activa cuando se confirme el pago del primer mes.",
  suscripcion_cancelada: "Suscripción cancelada. Sus cobros pendientes quedaron anulados.",
  no_renovar: "Listo: tu plan seguirá vigente hasta el último día pagado y no se renovará.",
  suscripcion_reanudada: "Tu plan volverá a renovarse cada mes.",
  transferencia_informada: "Recibimos el aviso de tu transferencia. El equipo ENQORA la confirmará y verás el cobro como pagado.",
};

const PAGO: Record<string, { kind: "ok" | "info" | "error"; text: string }> = {
  pagado: { kind: "ok", text: "Pago recibido. El cobro quedó pagado y puedes descargar su comprobante." },
  pendiente: { kind: "info", text: "Tu pago está en proceso. Cuando la pasarela lo confirme, el cobro aparecerá como pagado." },
  rechazado: { kind: "error", text: "La pasarela rechazó el pago. No se hizo ningún cargo; puedes intentarlo nuevamente." },
  anulado: { kind: "info", text: "El pago se anuló antes de completarse. No se hizo ningún cargo." },
  duplicado: { kind: "info", text: "Este cobro ya estaba pagado. El equipo ENQORA revisará la devolución del pago adicional." },
  revision: { kind: "error", text: "La pasarela informó un monto distinto al del cobro. El equipo ENQORA lo revisará contigo." },
};

// Facturación de la empresa: suscripciones, cobros por pagar, pagos y comprobantes.
export default async function BillingPage({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string; pago?: string }> }) {
  const sp = await searchParams;
  const { active } = await activeCompany();
  const allowed = !!active && ["owner", "admin", "accountant"].includes(active.role);

  if (!active || !allowed) {
    return (
      <div className="page narrow">
        <header className="hero">
          <div className="hero-main">
            <span className="eyebrow">Facturación</span>
            <h1>Planes y pagos</h1>
          </div>
          <Emblem name="pagos" size="xl" />
        </header>
        <Callout kind="info" title={active ? "Tu rol no incluye la facturación" : "Aún no tienes una empresa activa"}
          action={active ? undefined : <Link href="/empresas/nueva" className="btn btn-gold btn-inline btn-sm">Registrar empresa</Link>}>
          {active
            ? "La facturación la ven el Propietario, los Administradores y el Contador de la empresa."
            : "La facturación se organiza por empresa."}
        </Callout>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: sRows }, { data: cRows }, { data: pRows }, { data: settings }] = await Promise.all([
    supabase.from("subscriptions").select("*").eq("company_id", active.id).order("created_at", { ascending: false }),
    supabase.from("charges").select("*").eq("company_id", active.id).order("due_date", { ascending: false }).limit(200),
    supabase.from("payments").select("*").eq("company_id", active.id).order("created_at", { ascending: false }).limit(200),
    supabase.from("billing_settings").select("*").maybeSingle(),
  ]);
  const subs = (sRows ?? []) as Subscription[];
  const charges = (cRows ?? []) as Charge[];
  const payments = (pRows ?? []) as Payment[];
  const bank = settings as BillingSettings | null;
  const bankReady = !!(bank?.bank_name && bank?.account_number && bank?.holder_name && bank?.holder_rut);

  const open = charges.filter((c) => ["pendiente", "vencido", "en_revision"].includes(c.status)).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const closed = charges.filter((c) => !open.includes(c));
  const liveSubs = subs.filter((s) => s.status !== "cancelada");
  const pendingTotal = open.filter(payable).reduce((n, c) => n + c.amount, 0);
  const overdue = open.filter((c) => c.status === "vencido").length;
  const gateway = flowEnabled();
  const canManage = ["owner", "admin"].includes(active.role);
  const today = todayCl();
  const chargeOf = new Map(charges.map((c) => [c.id, c]));

  const bankBlock = bankReady ? (
    <dl className="data-grid bank-data">
      <div><dt>Banco</dt><dd>{bank!.bank_name}</dd></div>
      <div><dt>Tipo de cuenta</dt><dd>{bank!.account_type ?? "—"}</dd></div>
      <div><dt>Número</dt><dd className="mono">{bank!.account_number}</dd></div>
      <div><dt>Titular</dt><dd>{bank!.holder_name}</dd></div>
      <div><dt>RUT</dt><dd className="mono">{bank!.holder_rut}</dd></div>
      {bank!.notify_email ? <div><dt>Aviso a</dt><dd>{bank!.notify_email}</dd></div> : null}
    </dl>
  ) : (
    <p className="muted-line">ENQORA aún no publica sus datos de transferencia.</p>
  );

  const items: AccordionItem[] = [
    {
      id: "cobros",
      title: "Cobros por pagar",
      description: open.length ? `${open.length} abierto${open.length === 1 ? "" : "s"}` : "Estás al día",
      emblem: <Emblem name="cobros" size="sm" />,
      tone: overdue ? "risk" : open.some(payable) ? "gold" : "default",
      status: open.length ? <span className={`status status-${overdue ? "risk" : "gold"}`}>{clp(pendingTotal)}</span> : <span className="status status-ok">Al día</span>,
      content: open.length ? (
        <ul className="charge-list" role="list">
          {open.map((c) => {
            const informed = payments.find((p) => p.charge_id === c.id && p.status === "informado");
            return (
              <li key={c.id} className={`charge st-${c.status}`} id={`cobro-${c.folio}`}>
                <div className="charge-head">
                  <span className="charge-title">
                    <span className="mono">{c.folio}</span>
                    <b>{c.description}</b>
                  </span>
                  <span className={`status status-${CHARGE_STATUSES[c.status].tone}`}>{CHARGE_STATUSES[c.status].label}</span>
                </div>
                <div className="charge-amount">
                  <b>{clp(c.amount)}</b>
                  <small>
                    {c.status === "vencido" ? "Venció" : "Vence"} el {day(c.due_date)}
                    {c.period_start && c.period_end ? ` · período ${day(c.period_start, "medium")} al ${day(c.period_end, "medium")}` : ""}
                  </small>
                </div>
                {c.kind === "cotizacion" && c.case_id ? (
                  <p className="muted-line">Cotización aceptada · <Link href={`/casos/${c.case_id}#cotizacion`}>ver el caso</Link>. Los gastos externos se informan y pagan aparte.</p>
                ) : null}
                {c.status === "en_revision" ? (
                  <p className="muted-line">
                    Informaste una transferencia{informed?.reference ? ` (referencia ${informed.reference})` : ""}
                    {informed?.paid_on ? ` del ${day(informed.paid_on)}` : ""}. El equipo ENQORA la está confirmando.
                  </p>
                ) : null}
                {payable(c) ? (
                  <div className="charge-pay">
                    {gateway ? (
                      <form action={startGatewayPaymentAction} className="pay-online">
                        <input type="hidden" name="charge_id" value={c.id} />
                        <SubmitButton className="btn-inline" pendingText="Conectando con la pasarela…">Pagar en línea {clp(c.amount)}</SubmitButton>
                        <small className="muted-line">
                          Webpay, tarjetas y otros medios a través de Flow.{flowIsSandbox() ? " Modo de pruebas: no se hace ningún cargo real." : ""}
                        </small>
                      </form>
                    ) : null}
                    <details className="more inline-more" open={!gateway}>
                      <summary>Pagar por transferencia</summary>
                      {bankBlock}
                      {bank?.transfer_note ? <p className="muted-line pre">{bank.transfer_note}</p> : null}
                      <p className="muted-line">Usa el folio <span className="mono">{c.folio}</span> como comentario de la transferencia.</p>
                      {bankReady ? (
                        <form action={reportTransferAction} className="mini-form transfer-form">
                          <input type="hidden" name="charge_id" value={c.id} />
                          <div className="form-grid">
                            <div className="field">
                              <label htmlFor={`ref-${c.id}`}>N° de operación o referencia</label>
                              <input id={`ref-${c.id}`} name="reference" className="input" required minLength={3} maxLength={120} autoComplete="off" />
                            </div>
                            <div className="field">
                              <label htmlFor={`date-${c.id}`}>Fecha de la transferencia</label>
                              <input id={`date-${c.id}`} name="paid_on" type="date" className="input" required max={today} defaultValue={today} />
                            </div>
                          </div>
                          <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="Enviando…">Informar transferencia</SubmitButton>
                        </form>
                      ) : null}
                    </details>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="panel-lead">No tienes cobros pendientes.</p>
      ),
    },
    {
      id: "suscripciones",
      title: "Mis planes",
      description: liveSubs.length ? liveSubs.map((s) => s.plan_name).join(" · ") : "Sin planes contratados",
      emblem: <Emblem name="planes" size="sm" />,
      status: liveSubs.length ? (
        <span className={`status status-${SUBSCRIPTION_STATUSES[liveSubs[0].status].tone}`}>{SUBSCRIPTION_STATUSES[liveSubs[0].status].label}</span>
      ) : undefined,
      content: (
        <div className="sub-list">
          {subs.length ? (
            <ul role="list">
              {subs.map((s) => (
                <li key={s.id} className={`sub st-${s.status}`}>
                  <div className="charge-head">
                    <span className="charge-title">
                      <span className="mono">{s.plan_code}</span>
                      <b>{s.plan_name}</b>
                      <small className="muted-line">{LINES[s.line]?.name}</small>
                    </span>
                    <span className={`status status-${SUBSCRIPTION_STATUSES[s.status].tone}`}>{SUBSCRIPTION_STATUSES[s.status].label}</span>
                  </div>
                  <dl className="data-grid">
                    <div><dt>Precio mensual</dt><dd>{clp(s.monthly_price)}</dd></div>
                    <div><dt>Desde</dt><dd>{s.started_on ? day(s.started_on) : "Al confirmarse el primer pago"}</dd></div>
                    <div><dt>Pagado hasta</dt><dd>{s.paid_until ? day(s.paid_until) : "—"}</dd></div>
                    <div>
                      <dt>Renovación</dt>
                      <dd>{s.status === "cancelada" ? `Cancelada ${moment(s.canceled_at)}` : s.cancel_at_period_end ? "No se renovará" : "Mensual automática"}</dd>
                    </div>
                  </dl>
                  {canManage && s.status !== "cancelada" ? (
                    s.cancel_at_period_end ? (
                      <form action={resumeSubscriptionAction}>
                        <input type="hidden" name="subscription_id" value={s.id} />
                        <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Volver a renovar cada mes</SubmitButton>
                      </form>
                    ) : (
                      <details className="more inline-more">
                        <summary>{s.status === "activa" ? "No renovar" : "Cancelar"}</summary>
                        <form action={cancelSubscriptionAction} className="mini-form">
                          <input type="hidden" name="subscription_id" value={s.id} />
                          <p className="muted-line">
                            {s.status === "activa"
                              ? `El plan sigue vigente hasta el ${day(s.paid_until)} y no se cobrará el mes siguiente. No hay devoluciones por días no usados.`
                              : "Se cancela de inmediato y se anulan sus cobros pendientes."}
                          </p>
                          <textarea name="reason" className="input" rows={2} maxLength={500} placeholder="Motivo (opcional): nos ayuda a mejorar." aria-label="Motivo" />
                          <ConfirmSubmit message={s.status === "activa" ? "¿Dejar de renovar este plan?" : "¿Cancelar este plan?"}>
                            {s.status === "activa" ? "Confirmar: no renovar" : "Confirmar cancelación"}
                          </ConfirmSubmit>
                        </form>
                      </details>
                    )
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="panel-lead">Aún no tienes planes mensuales.</p>
          )}
          <Link href="/planes" className="btn btn-ghost btn-inline btn-sm">Ver planes</Link>
        </div>
      ),
    },
    {
      id: "pagos",
      title: "Pagos y comprobantes",
      description: payments.filter((p) => p.status === "confirmado").length
        ? `${payments.filter((p) => p.status === "confirmado").length} pagos confirmados`
        : "Sin pagos registrados",
      emblem: <Emblem name="pagos" size="sm" />,
      content: payments.length ? (
        <ul className="pay-list" role="list">
          {payments.map((p) => {
            const c = chargeOf.get(p.charge_id);
            return (
              <li key={p.id}>
                <span className="pay-main">
                  <b>{clp(p.amount)}</b>
                  <small>
                    {PAYMENT_METHODS[p.method]}{p.media ? ` · ${p.media}` : ""} · {c ? <span className="mono">{c.folio}</span> : null} · {moment(p.confirmed_at ?? p.created_at)}
                  </small>
                  {p.review_note && p.status !== "confirmado" ? <small className="muted-line">{p.review_note}</small> : null}
                </span>
                <span className={`status status-${PAYMENT_STATUSES[p.status].tone}`}>{PAYMENT_STATUSES[p.status].label}</span>
                {p.status === "confirmado" ? (
                  <Link href={`/facturacion/comprobante/${p.id}`} className="btn btn-ghost btn-inline btn-sm">Comprobante</Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="panel-lead">Cuando pagues un cobro, aquí verás el pago y su comprobante.</p>
      ),
    },
    {
      id: "historial",
      title: "Cobros anteriores",
      description: closed.length ? `${closed.length} pagados o anulados` : "Sin historial",
      emblem: <Emblem name="actividad" size="sm" />,
      content: closed.length ? (
        <ul className="pay-list" role="list">
          {closed.map((c) => (
            <li key={c.id}>
              <span className="pay-main">
                <b>{c.description}</b>
                <small><span className="mono">{c.folio}</span> · {clp(c.amount)} · {c.status === "pagado" ? `pagado ${moment(c.paid_at)}` : c.void_reason ?? "anulado"}</small>
              </span>
              <span className={`status status-${CHARGE_STATUSES[c.status].tone}`}>{CHARGE_STATUSES[c.status].label}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="panel-lead">Aún no hay cobros cerrados.</p>
      ),
    },
    {
      id: "transferencia",
      title: "Datos de transferencia",
      description: bankReady ? `${bank!.bank_name} · ${bank!.holder_name}` : "Aún no publicados",
      emblem: <Emblem name="empresas" size="sm" />,
      content: (
        <div>
          {bankBlock}
          {bank?.transfer_note ? <p className="muted-line pre">{bank.transfer_note}</p> : null}
        </div>
      ),
    },
  ];

  const pago = sp.pago ? PAGO[sp.pago] : null;

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Facturación · {active.trade_name || active.legal_name}</span>
          <h1>Planes y pagos</h1>
          <p className="hero-lead">Tus planes mensuales, los cobros por pagar y el historial de pagos con sus comprobantes.</p>
        </div>
        <Emblem name="pagos" size="xl" />
      </header>

      {sp.aviso && AVISOS[sp.aviso] ? <Notice kind="ok">{AVISOS[sp.aviso]}</Notice> : null}
      {pago ? <Notice kind={pago.kind === "ok" ? "ok" : pago.kind === "error" ? "error" : "info"}>{pago.text}</Notice> : null}
      {messageForCode(sp.error) ? <Notice kind="error">{messageForCode(sp.error)}</Notice> : null}

      <div className="kpis">
        <div className={`kpi${pendingTotal ? " kpi-gold" : ""}`}><span>Por pagar</span><b>{clp(pendingTotal)}</b></div>
        <div className="kpi"><span>Próximo vencimiento</span><b>{open.filter(payable)[0] ? day(open.filter(payable)[0].due_date, "medium") : "—"}</b></div>
        <div className="kpi"><span>Planes activos</span><b>{subs.filter((s) => s.status === "activa").length}</b></div>
      </div>

      {overdue ? (
        <Callout kind="warn" title={overdue === 1 ? "Tienes un cobro vencido" : `Tienes ${overdue} cobros vencidos`}>
          Ponte al día para mantener tus planes activos. Si ya pagaste por transferencia, infórmala para que el equipo la confirme.
        </Callout>
      ) : null}

      <Accordion label="Facturación" items={items} defaultOpen={open.length ? "cobros" : undefined} syncHash />

      <p className="muted-line plan-foot">
        Los montos están en pesos chilenos. El comprobante de pago de ENQORA no reemplaza la boleta o factura electrónica, que se emite aparte.
      </p>
    </div>
  );
}
