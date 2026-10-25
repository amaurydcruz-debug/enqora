import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  registerPaymentAction,
  reviewPaymentAction,
  runBillingAction,
  saveBillingSettingsAction,
  voidChargeAction,
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
  moment,
  PAYMENT_METHODS,
  SUBSCRIPTION_STATUSES,
  todayCl,
  type BillingSettings,
  type Charge,
  type Payment,
  type Subscription,
} from "@/lib/billing";
import { messageForCode } from "@/lib/db-errors";
import { flowEnabled, flowIsSandbox } from "@/lib/flow";
import { clp } from "@/lib/pricing";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";
import { ServiceToken } from "./service-token";

export const metadata: Metadata = { title: "Cobros y pagos" };

const AVISOS: Record<string, string> = {
  pago_confirmado: "Pago confirmado. El cobro quedó pagado y, si es de un plan, la suscripción quedó al día.",
  pago_rechazado: "Pago rechazado. El cobro volvió a quedar por pagar y el cliente verá el motivo.",
  pago_registrado: "Pago registrado y confirmado.",
  cobro_anulado: "Cobro anulado.",
  datos_guardados: "Datos de transferencia guardados. Los clientes los verán al pagar.",
  facturacion_ejecutada: "Facturación ejecutada: vencimientos, renovaciones y fin de suscripciones al día.",
};

// Cobros y pagos de todas las empresas. Lo ven el Administrador ENQORA y la Dirección de
// operaciones; solo el Administrador confirma pagos, anula cobros y cambia la configuración.
export default async function ChargesAdminPage({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const role = await myStaffRole();
  if (!isSupervisorRole(role)) notFound();
  const admin = role === "enqora_admin";
  const sp = await searchParams;

  const supabase = await createClient();
  const [{ data: cRows }, { data: pRows }, { data: sRows }, { data: settings }, { data: status }] = await Promise.all([
    supabase.from("charges").select("*").order("due_date", { ascending: true }).limit(500),
    supabase.from("payments").select("*").order("created_at", { ascending: false }).limit(300),
    supabase.from("subscriptions").select("*").neq("status", "cancelada").order("created_at", { ascending: false }),
    supabase.from("billing_settings").select("*").maybeSingle(),
    supabase.rpc("billing_status"),
  ]);
  const charges = (cRows ?? []) as Charge[];
  const payments = (pRows ?? []) as Payment[];
  const subs = (sRows ?? []) as Subscription[];
  const bank = (settings ?? {}) as Partial<BillingSettings>;
  const st = (status ?? {}) as { clave_configurada?: boolean; rotada?: string | null };

  const companyIds = [...new Set([...charges.map((c) => c.company_id), ...subs.map((s) => s.company_id)])];
  const { data: coRows } = companyIds.length
    ? await supabase.from("companies").select("id, legal_name, trade_name").in("id", companyIds)
    : { data: [] };
  const companyName = new Map(((coRows ?? []) as { id: string; legal_name: string; trade_name: string | null }[]).map((c) => [c.id, c.trade_name || c.legal_name]));
  const chargeOf = new Map(charges.map((c) => [c.id, c]));

  const toReview = payments.filter((p) => p.status === "informado");
  const open = charges.filter((c) => ["pendiente", "vencido", "en_revision"].includes(c.status));
  const overdue = open.filter((c) => c.status === "vencido");
  const confirmed = payments.filter((p) => p.status === "confirmado");
  const duplicates = confirmed.filter((p) => p.duplicate);
  const monthStart = `${todayCl().slice(0, 7)}-01`;
  const collectedMonth = confirmed.filter((p) => (p.confirmed_at ?? "") >= monthStart).reduce((n, p) => n + p.amount, 0);
  const gateway = flowEnabled();
  const today = todayCl();

  const items: AccordionItem[] = [
    {
      id: "por-confirmar",
      title: "Transferencias por confirmar",
      description: toReview.length ? "Revisa el depósito en la cuenta antes de confirmar" : "Sin transferencias informadas",
      emblem: <Emblem name="pagos" size="sm" />,
      tone: toReview.length ? "gold" : "default",
      status: toReview.length ? <span className="status status-warn">{toReview.length}</span> : undefined,
      content: toReview.length ? (
        <ul className="charge-list" role="list">
          {toReview.map((p) => {
            const c = chargeOf.get(p.charge_id);
            return (
              <li key={p.id} className="charge st-en_revision">
                <div className="charge-head">
                  <span className="charge-title">
                    <span className="mono">{c?.folio}</span>
                    <b>{companyName.get(p.company_id) ?? "Empresa"}</b>
                    <small className="muted-line">{c?.description}</small>
                  </span>
                  <b>{clp(p.amount)}</b>
                </div>
                <dl className="data-grid">
                  <div><dt>Referencia</dt><dd className="mono">{p.reference}</dd></div>
                  <div><dt>Fecha informada</dt><dd>{day(p.paid_on)}</dd></div>
                  <div><dt>Informada</dt><dd>{moment(p.created_at)}</dd></div>
                </dl>
                {admin ? (
                  <div className="panel-actions">
                    <form action={reviewPaymentAction}>
                      <input type="hidden" name="payment_id" value={p.id} />
                      <input type="hidden" name="decision" value="confirmar" />
                      <ConfirmSubmit variant="gold" message={`¿Confirmas que recibiste ${clp(p.amount)} con la referencia ${p.reference}?`}>Confirmar pago</ConfirmSubmit>
                    </form>
                    <details className="more inline-more">
                      <summary>Rechazar</summary>
                      <form action={reviewPaymentAction} className="mini-form">
                        <input type="hidden" name="payment_id" value={p.id} />
                        <input type="hidden" name="decision" value="rechazar" />
                        <textarea name="note" className="input" rows={2} required minLength={10} maxLength={1000} placeholder="Motivo que verá el cliente (mínimo 10 caracteres)" aria-label="Motivo" />
                        <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Rechazar pago</SubmitButton>
                      </form>
                    </details>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="panel-lead">No hay transferencias informadas pendientes.</p>
      ),
    },
    {
      id: "abiertos",
      title: "Cobros abiertos",
      description: open.length ? `${clp(open.reduce((n, c) => n + c.amount, 0))} en total` : "Todo al día",
      emblem: <Emblem name="cobros" size="sm" />,
      tone: overdue.length ? "risk" : "default",
      status: open.length ? <span className={`status status-${overdue.length ? "risk" : "gold"}`}>{open.length}{overdue.length ? ` · ${overdue.length} vencidos` : ""}</span> : undefined,
      content: open.length ? (
        <ul className="charge-list" role="list">
          {open.map((c) => (
            <li key={c.id} className={`charge st-${c.status}`}>
              <div className="charge-head">
                <span className="charge-title">
                  <span className="mono">{c.folio}</span>
                  <b>{companyName.get(c.company_id) ?? "Empresa"}</b>
                  <small className="muted-line">{c.description}</small>
                </span>
                <span className={`status status-${CHARGE_STATUSES[c.status].tone}`}>{CHARGE_STATUSES[c.status].label}</span>
              </div>
              <div className="charge-amount"><b>{clp(c.amount)}</b><small>Vence el {day(c.due_date)}</small></div>
              {admin ? (
                <div className="panel-actions">
                  <details className="more inline-more">
                    <summary>Registrar pago recibido</summary>
                    <form action={registerPaymentAction} className="mini-form">
                      <input type="hidden" name="charge_id" value={c.id} />
                      <div className="form-grid">
                        <div className="field">
                          <label htmlFor={`m-${c.id}`}>Medio</label>
                          <select id={`m-${c.id}`} name="method" className="input">
                            <option value="transferencia">Transferencia</option>
                            <option value="otro">Otro medio</option>
                          </select>
                        </div>
                        <div className="field"><label htmlFor={`r-${c.id}`}>Referencia</label><input id={`r-${c.id}`} name="reference" className="input" required minLength={3} maxLength={120} /></div>
                        <div className="field"><label htmlFor={`d-${c.id}`}>Fecha</label><input id={`d-${c.id}`} name="paid_on" type="date" className="input" required max={today} defaultValue={today} /></div>
                      </div>
                      <SubmitButton className="btn-inline btn-sm" pendingText="Registrando…">Registrar y confirmar</SubmitButton>
                    </form>
                  </details>
                  <details className="more inline-more">
                    <summary>Anular cobro</summary>
                    <form action={voidChargeAction} className="mini-form">
                      <input type="hidden" name="charge_id" value={c.id} />
                      <textarea name="reason" className="input" rows={2} required minLength={10} maxLength={500} placeholder="Motivo (mínimo 10 caracteres)" aria-label="Motivo" />
                      <ConfirmSubmit message="¿Anular este cobro? El cliente dejará de verlo por pagar.">Anular cobro</ConfirmSubmit>
                    </form>
                  </details>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="panel-lead">No hay cobros abiertos.</p>
      ),
    },
    {
      id: "pagados",
      title: "Pagos confirmados",
      description: `${clp(collectedMonth)} este mes`,
      emblem: <Emblem name="actividad" size="sm" />,
      status: duplicates.length ? <span className="status status-warn">{duplicates.length} por devolver</span> : undefined,
      tone: duplicates.length ? "gold" : "default",
      content: confirmed.length ? (
        <ul className="pay-list" role="list">
          {confirmed.slice(0, 60).map((p) => (
            <li key={p.id}>
              <span className="pay-main">
                <b>{companyName.get(p.company_id) ?? "Empresa"} · {clp(p.amount)}</b>
                <small>
                  <span className="mono">{chargeOf.get(p.charge_id)?.folio}</span> · {PAYMENT_METHODS[p.method]}{p.media ? ` · ${p.media}` : ""}
                  {p.provider_order ? ` · orden ${p.provider_order}` : ""}{p.reference ? ` · ${p.reference}` : ""} · {moment(p.confirmed_at)}
                </small>
                {p.duplicate ? <small className="status status-warn">Pago adicional sobre un cobro ya pagado: corresponde devolverlo.</small> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="panel-lead">Aún no hay pagos confirmados.</p>
      ),
    },
    {
      id: "suscripciones",
      title: "Suscripciones",
      description: `${subs.filter((s) => s.status === "activa").length} activas · ${subs.filter((s) => s.status === "vencida").length} vencidas`,
      emblem: <Emblem name="planes" size="sm" />,
      content: subs.length ? (
        <ul className="pay-list" role="list">
          {subs.map((s) => (
            <li key={s.id}>
              <span className="pay-main">
                <b>{companyName.get(s.company_id) ?? "Empresa"} · {s.plan_name}</b>
                <small>{clp(s.monthly_price)} / mes · pagado hasta {day(s.paid_until)}{s.cancel_at_period_end ? " · no se renovará" : ""}</small>
              </span>
              <span className={`status status-${SUBSCRIPTION_STATUSES[s.status].tone}`}>{SUBSCRIPTION_STATUSES[s.status].label}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="panel-lead">Aún no hay suscripciones.</p>
      ),
    },
    {
      id: "configuracion",
      title: "Configuración de pagos",
      description: `${gateway ? "Pago en línea habilitado" : "Pago en línea sin configurar"} · ${bank.bank_name ? "transferencia lista" : "faltan datos de transferencia"}`,
      emblem: <Emblem name="configuracion" size="sm" />,
      tone: !gateway || !bank.bank_name || !st.clave_configurada ? "gold" : "default",
      content: (
        <div className="catalog-body">
          <section>
            <h4 className="sub-title">Pago en línea (Flow)</h4>
            <dl className="data-grid">
              <div><dt>Estado</dt><dd><span className={`status status-${gateway ? "ok" : "gold"}`}>{gateway ? (flowIsSandbox() ? "Habilitado · modo pruebas" : "Habilitado · producción") : "Sin configurar"}</span></dd></div>
              <div><dt>Clave de servicio</dt><dd><span className={`status status-${st.clave_configurada ? "ok" : "gold"}`}>{st.clave_configurada ? "Configurada" : "Pendiente"}</span></dd></div>
            </dl>
            <p className="muted-line">
              En Vercel → Settings → Environment Variables: <span className="mono">FLOW_API_KEY</span>, <span className="mono">FLOW_SECRET_KEY</span>,{" "}
              <span className="mono">FLOW_API_URL</span> (pruebas: https://sandbox.flow.cl/api · producción: https://www.flow.cl/api),{" "}
              <span className="mono">ENQORA_SERVICE_TOKEN</span> y <span className="mono">CRON_SECRET</span>. Nunca se escriben en el repositorio ni en un chat.
            </p>
            {admin ? <ServiceToken configured={!!st.clave_configurada} rotatedAt={st.rotada ?? null} /> : null}
          </section>
          <section>
            <h4 className="sub-title">Datos de transferencia</h4>
            {admin ? (
              <form action={saveBillingSettingsAction} className="catalog-form">
                <div className="form-grid">
                  <div className="field"><label htmlFor="b-bank">Banco</label><input id="b-bank" name="bank_name" className="input" maxLength={80} defaultValue={bank.bank_name ?? ""} /></div>
                  <div className="field"><label htmlFor="b-type">Tipo de cuenta</label><input id="b-type" name="account_type" className="input" maxLength={40} defaultValue={bank.account_type ?? ""} placeholder="Cuenta corriente" /></div>
                  <div className="field"><label htmlFor="b-num">Número</label><input id="b-num" name="account_number" className="input mono" maxLength={40} defaultValue={bank.account_number ?? ""} /></div>
                  <div className="field"><label htmlFor="b-holder">Titular</label><input id="b-holder" name="holder_name" className="input" maxLength={120} defaultValue={bank.holder_name ?? ""} /></div>
                  <div className="field"><label htmlFor="b-rut">RUT del titular</label><input id="b-rut" name="holder_rut" className="input mono" maxLength={12} defaultValue={bank.holder_rut ?? ""} /></div>
                  <div className="field"><label htmlFor="b-mail">Correo para avisos</label><input id="b-mail" name="notify_email" type="email" className="input" maxLength={160} defaultValue={bank.notify_email ?? ""} /></div>
                </div>
                <div className="field"><label htmlFor="b-note">Indicaciones al cliente</label><textarea id="b-note" name="transfer_note" className="input" rows={2} maxLength={500} defaultValue={bank.transfer_note ?? ""} /></div>
                <div className="panel-actions"><SubmitButton className="btn-inline" pendingText="Guardando…">Guardar datos</SubmitButton></div>
              </form>
            ) : (
              <p className="muted-line">{bank.bank_name ? `${bank.bank_name} · ${bank.holder_name ?? ""}` : "Sin datos de transferencia."}</p>
            )}
          </section>
          <section>
            <h4 className="sub-title">Facturación diaria</h4>
            <p className="muted-line">
              Todos los días a las 8:00 se marcan los cobros vencidos, se generan los cobros del próximo período (5 días antes) y se
              terminan las suscripciones que no se renuevan. Puedes ejecutarla ahora; es segura de repetir.
            </p>
            {admin ? (
              <form action={runBillingAction}>
                <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="Ejecutando…">Ejecutar ahora</SubmitButton>
              </form>
            ) : null}
          </section>
        </div>
      ),
    },
  ];

  return (
    <div className="page">
      <Link href="/mando" className="back-link"><span aria-hidden="true">←</span> Centro de Mando</Link>
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Centro de Mando · Cobros</span>
          <h1>Cobros y pagos</h1>
          <p className="hero-lead">Cobros de cotizaciones aceptadas y de planes mensuales, transferencias por confirmar y configuración de pagos.</p>
        </div>
        <Emblem name="cobros" size="xl" />
      </header>

      {sp.aviso && AVISOS[sp.aviso] ? <Notice kind="ok">{AVISOS[sp.aviso]}</Notice> : null}
      {messageForCode(sp.error) ? <Notice kind="error">{messageForCode(sp.error)}</Notice> : null}

      <div className="kpis kpis-mando">
        <div className={`kpi${toReview.length ? " kpi-gold" : ""}`}><span>Por confirmar</span><b>{toReview.length}</b></div>
        <div className="kpi"><span>Cobros abiertos</span><b>{open.length}</b></div>
        <div className={`kpi${overdue.length ? " kpi-gold" : ""}`}><span>Vencidos</span><b>{overdue.length}</b></div>
        <div className="kpi"><span>Recaudado este mes</span><b>{clp(collectedMonth)}</b></div>
      </div>

      {admin && (!gateway || !st.clave_configurada || !bank.bank_name) ? (
        <Callout kind="info" title="Configura los pagos" action={<a href="#configuracion" className="btn btn-ghost btn-inline btn-sm">Configurar</a>}>
          {!bank.bank_name ? "Publica los datos de transferencia. " : ""}
          {!st.clave_configurada ? "Genera la clave de servicio. " : ""}
          {!gateway ? "Carga las claves de Flow en Vercel para habilitar el pago en línea." : ""}
        </Callout>
      ) : null}

      <Accordion label="Cobros y pagos" items={items} defaultOpen={toReview.length ? "por-confirmar" : null} />
    </div>
  );
}
