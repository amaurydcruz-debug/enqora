import Link from "next/link";
import type { Metadata } from "next";
import { subscribePlanAction } from "@/app/actions/billing";
import { Notice } from "@/components/auth-card";
import { Callout } from "@/components/disclosure";
import { Emblem } from "@/components/emblems";
import { SubmitButton } from "@/components/submit-button";
import { day, LINES, limitText, SUBSCRIPTION_STATUSES, type Plan, type PlanLine, type PlanPrice, type Subscription } from "@/lib/billing";
import { activeCompany } from "@/lib/companies";
import { messageForCode } from "@/lib/db-errors";
import { clp } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Planes" };

// Planes mensuales ENQORA por línea. Solo planes activos con precio vigente publicado;
// la empresa contrata uno por línea (Propietario o Administrador, con identidad confirmada).
export default async function PlansPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const { active } = await activeCompany();
  const supabase = await createClient();

  const [{ data: pRows }, { data: prRows }, { data: sRows }] = await Promise.all([
    supabase.from("plans").select("*").eq("active", true).order("line").order("position"),
    supabase.from("plan_prices").select("*").eq("status", "vigente"),
    active
      ? supabase.from("subscriptions").select("*").eq("company_id", active.id).neq("status", "cancelada")
      : Promise.resolve({ data: [] }),
  ]);
  const plans = (pRows ?? []) as Plan[];
  const prices = new Map(((prRows ?? []) as PlanPrice[]).map((p) => [p.plan_id, p]));
  const subs = (sRows ?? []) as Subscription[];
  const codes = [...new Set(plans.flatMap((p) => p.included_services))];
  const { data: svc } = codes.length ? await supabase.from("services").select("code, name").in("code", codes) : { data: [] };
  const serviceName = new Map(((svc ?? []) as { code: string; name: string }[]).map((s) => [s.code, s.name]));
  const canBuy = !!active && ["owner", "admin"].includes(active.role);
  const lines = (Object.keys(LINES) as PlanLine[]).filter((l) => plans.some((p) => p.line === l && prices.has(p.id)));

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Planes ENQORA{active ? ` · ${active.trade_name || active.legal_name}` : ""}</span>
          <h1>Acompañamiento mensual</h1>
          <p className="hero-lead">
            Tener la aplicación no significa que toda gestión profesional esté incluida: cada plan dice qué incluye, qué no y
            cuánto cuesta al mes. Los casos puntuales se cotizan aparte.
          </p>
        </div>
        <Emblem name="planes" size="xl" />
      </header>

      {messageForCode(sp.error) ? <Notice kind="error">{messageForCode(sp.error)}</Notice> : null}

      {!active ? (
        <Callout kind="info" title="Registra tu empresa para contratar" action={<Link href="/empresas/nueva" className="btn btn-gold btn-inline btn-sm">Registrar empresa</Link>}>
          Los planes se contratan para una empresa.
        </Callout>
      ) : null}

      {!lines.length ? (
        <Callout kind="info" title="Los planes se están preparando">
          ENQORA publica el precio de cada plan después de medir el costo real del servicio. Mientras tanto, puedes pedir tu
          diagnóstico gratuito o una cotización por caso.
        </Callout>
      ) : null}

      {lines.map((line) => {
        const current = subs.find((s) => s.line === line) ?? null;
        return (
          <section key={line} className="plan-line" aria-labelledby={`l-${line}`}>
            <header className="plan-line-head">
              <Emblem name={LINES[line].emblem} size="md" />
              <div>
                <h2 id={`l-${line}`}>{LINES[line].name}</h2>
                <p className="muted-line">{LINES[line].help}</p>
              </div>
              {current ? (
                <Link href="/facturacion#suscripciones" className="plan-current">
                  <span className={`status status-${SUBSCRIPTION_STATUSES[current.status].tone}`}>{SUBSCRIPTION_STATUSES[current.status].label}</span>
                  <b>{current.plan_name}</b>
                  {current.paid_until ? <small>Pagado hasta el {day(current.paid_until)}</small> : null}
                </Link>
              ) : null}
            </header>
            <div className="plan-grid">
              {plans
                .filter((p) => p.line === line && prices.has(p.id))
                .map((p) => {
                  const price = prices.get(p.id)!;
                  const mine = current?.plan_id === p.id;
                  return (
                    <article key={p.id} className={`plan-card${mine ? " is-current" : ""}`} id={`plan-${p.code}`}>
                      <div className="plan-card-head">
                        <span className="mono plan-code">{p.code}</span>
                        <h3>{p.name}</h3>
                        {p.summary ? <p className="muted-line">{p.summary}</p> : null}
                      </div>
                      <p className="plan-price">
                        <b>{clp(price.monthly_price)}</b> <small>/ mes</small>
                      </p>
                      <div className="plan-block">
                        <h4>Incluye</h4>
                        <p className="pre">{p.scope}</p>
                        {p.included_services.length ? (
                          <ul className="plan-services">
                            {p.included_services.map((c) => <li key={c}><span className="mono">{c}</span> {serviceName.get(c) ?? ""}</li>)}
                          </ul>
                        ) : null}
                      </div>
                      <dl className="plan-limits">
                        <div><dt>Documentos al mes</dt><dd>{limitText(p.limit_documents, "documentos")}</dd></div>
                        <div><dt>Operaciones al mes</dt><dd>{limitText(p.limit_operations, "operaciones")}</dd></div>
                        <div><dt>Trabajadores</dt><dd>{limitText(p.limit_workers, "trabajadores")}</dd></div>
                      </dl>
                      {p.exclusions ? <div className="plan-block"><h4>No incluye</h4><p className="pre">{p.exclusions}</p></div> : null}
                      <details className="more inline-more">
                        <summary>Renovación y cancelación</summary>
                        <p className="pre muted-line">
                          {p.renewal_terms ?? "Se renueva cada mes. Cinco días antes de terminar el período pagado se genera el cobro del siguiente."}
                        </p>
                        <p className="pre muted-line">
                          {p.cancellation_terms ?? "Puedes cancelar cuando quieras: el plan sigue vigente hasta el último día pagado y no se renueva."}
                        </p>
                      </details>
                      <div className="plan-action">
                        {mine ? (
                          <span className="status status-ok">Tu plan actual</span>
                        ) : current ? (
                          <span className="muted-line">Ya tienes un plan en esta línea. Para cambiarlo, cancélalo en Facturación.</span>
                        ) : canBuy ? (
                          <form action={subscribePlanAction} className="plan-buy">
                            <input type="hidden" name="company_id" value={active!.id} />
                            <input type="hidden" name="plan_id" value={p.id} />
                            <label className="check-inline">
                              <input type="checkbox" name="confirm" required />
                              Contrato {p.name} por {clp(price.monthly_price)} al mes, con el alcance descrito.
                            </label>
                            <SubmitButton className="btn-inline" pendingText="Registrando…">Contratar plan</SubmitButton>
                          </form>
                        ) : active ? (
                          <span className="muted-line">Lo contrata el Propietario o un Administrador de la empresa.</span>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
            </div>
          </section>
        );
      })}

      <p className="muted-line plan-foot">
        Al contratar se genera el cobro del primer mes; el plan se activa cuando se confirma el pago y el período corre desde ese día.
        El comprobante de pago de ENQORA no reemplaza la boleta o factura electrónica.
      </p>
    </div>
  );
}
