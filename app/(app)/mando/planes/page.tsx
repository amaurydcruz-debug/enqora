import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  draftPlanPriceAction,
  publishPlanPriceAction,
  retirePlanPriceAction,
  savePlanAction,
  setPlanActiveAction,
} from "@/app/actions/billing";
import { Accordion, type AccordionItem } from "@/components/accordion";
import { Notice } from "@/components/auth-card";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { Callout } from "@/components/disclosure";
import { Emblem } from "@/components/emblems";
import { SubmitButton } from "@/components/submit-button";
import { LINES, limitText, moment, type Plan, type PlanLine, type PlanPrice, type Subscription } from "@/lib/billing";
import { messageForCode } from "@/lib/db-errors";
import { clp, TARIFF_STATUSES } from "@/lib/pricing";
import { myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Planes" };

const AVISOS: Record<string, string> = {
  plan: "Ficha del plan actualizada.",
  plan_creado: "Plan creado. Queda inactivo hasta que publiques su precio y lo actives.",
  plan_activado: "Plan activo: los clientes ya pueden verlo y contratarlo.",
  plan_desactivado: "Plan desactivado. Las suscripciones existentes no cambian.",
  precio_borrador: "Precio guardado como borrador. Publícalo para que se use.",
  precio_publicado: "Precio publicado. Las nuevas contrataciones usan esta versión; las vigentes conservan su precio.",
  precio_retirado: "Precio retirado. El plan quedó inactivo hasta publicar otro.",
};

// Planes mensuales por línea, con precio versionado. Lo ve todo el equipo ENQORA;
// solo el Administrador ENQORA edita, publica precios y activa planes.
export default async function PlansAdminPage({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const role = await myStaffRole();
  if (!role) notFound();
  const admin = role === "enqora_admin";
  const sp = await searchParams;

  const supabase = await createClient();
  const [{ data: pRows }, { data: prRows }, { data: sRows }] = await Promise.all([
    supabase.from("plans").select("*").order("line").order("position"),
    supabase.from("plan_prices").select("*").order("version", { ascending: false }),
    supabase.from("subscriptions").select("plan_id, status").neq("status", "cancelada"),
  ]);
  const plans = (pRows ?? []) as Plan[];
  const prices = (prRows ?? []) as PlanPrice[];
  const subs = (sRows ?? []) as Pick<Subscription, "plan_id" | "status">[];
  const live = (pid: string) => prices.find((p) => p.plan_id === pid && p.status === "vigente") ?? null;

  const planForm = (p?: Plan) => (
    <form action={savePlanAction} className="catalog-form">
      {p ? <input type="hidden" name="plan_id" value={p.id} /> : null}
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`code-${p?.id ?? "new"}`}>Código</label>
          <input id={`code-${p?.id ?? "new"}`} name="code" className="input mono" required defaultValue={p?.code ?? ""} readOnly={!!p}
            pattern="[A-Za-z]{2,5}-[0-9]{2}" placeholder="PLA-03" maxLength={8} />
        </div>
        <div className="field">
          <label htmlFor={`line-${p?.id ?? "new"}`}>Línea</label>
          <select id={`line-${p?.id ?? "new"}`} name="line" className="input" defaultValue={p?.line ?? "plataforma"} disabled={!!p}>
            {(Object.keys(LINES) as PlanLine[]).map((k) => <option key={k} value={k}>{LINES[k].name}</option>)}
          </select>
          {p ? <input type="hidden" name="line" value={p.line} /> : null}
        </div>
        <div className="field">
          <label htmlFor={`pos-${p?.id ?? "new"}`}>Orden</label>
          <input id={`pos-${p?.id ?? "new"}`} name="position" type="number" min={1} max={99} className="input" defaultValue={p?.position ?? 1} />
        </div>
      </div>
      <div className="field"><label htmlFor={`name-${p?.id ?? "new"}`}>Nombre</label><input id={`name-${p?.id ?? "new"}`} name="name" className="input" required minLength={3} maxLength={120} defaultValue={p?.name ?? ""} /></div>
      <div className="field"><label htmlFor={`sum-${p?.id ?? "new"}`}>Resumen <span className="optional">(una frase)</span></label><input id={`sum-${p?.id ?? "new"}`} name="summary" className="input" maxLength={400} defaultValue={p?.summary ?? ""} /></div>
      <div className="field"><label htmlFor={`scope-${p?.id ?? "new"}`}>Qué incluye</label><textarea id={`scope-${p?.id ?? "new"}`} name="scope" className="input" rows={3} required minLength={10} maxLength={4000} defaultValue={p?.scope ?? ""} /></div>
      <div className="field"><label htmlFor={`excl-${p?.id ?? "new"}`}>Qué no incluye</label><textarea id={`excl-${p?.id ?? "new"}`} name="exclusions" className="input" rows={2} maxLength={2000} defaultValue={p?.exclusions ?? ""} /></div>
      <div className="form-grid">
        <div className="field"><label htmlFor={`ld-${p?.id ?? "new"}`}>Documentos al mes</label><input id={`ld-${p?.id ?? "new"}`} name="limit_documents" inputMode="numeric" className="input mono" defaultValue={p?.limit_documents ?? ""} placeholder="Sin definir" /></div>
        <div className="field"><label htmlFor={`lo-${p?.id ?? "new"}`}>Operaciones al mes</label><input id={`lo-${p?.id ?? "new"}`} name="limit_operations" inputMode="numeric" className="input mono" defaultValue={p?.limit_operations ?? ""} placeholder="Sin definir" /></div>
        <div className="field"><label htmlFor={`lw-${p?.id ?? "new"}`}>Trabajadores</label><input id={`lw-${p?.id ?? "new"}`} name="limit_workers" inputMode="numeric" className="input mono" defaultValue={p?.limit_workers ?? ""} placeholder="Sin definir" /></div>
      </div>
      <div className="field">
        <label htmlFor={`svc-${p?.id ?? "new"}`}>Servicios del catálogo incluidos <span className="optional">(códigos separados por coma)</span></label>
        <input id={`svc-${p?.id ?? "new"}`} name="included_services" className="input mono" maxLength={600} defaultValue={p?.included_services.join(", ") ?? ""} placeholder="CON-01, CON-02" />
      </div>
      <div className="field"><label htmlFor={`ren-${p?.id ?? "new"}`}>Renovación</label><textarea id={`ren-${p?.id ?? "new"}`} name="renewal_terms" className="input" rows={2} maxLength={1000} defaultValue={p?.renewal_terms ?? ""} placeholder="Si se deja vacío se muestra la regla general: renovación mensual con cobro 5 días antes." /></div>
      <div className="field"><label htmlFor={`can-${p?.id ?? "new"}`}>Cancelación</label><textarea id={`can-${p?.id ?? "new"}`} name="cancellation_terms" className="input" rows={2} maxLength={1000} defaultValue={p?.cancellation_terms ?? ""} placeholder="Si se deja vacío: se puede cancelar cuando quiera; sigue vigente hasta el último día pagado." /></div>
      <div className="panel-actions"><SubmitButton className="btn-inline" pendingText="Guardando…">{p ? "Guardar plan" : "Crear plan"}</SubmitButton></div>
    </form>
  );

  const items: AccordionItem[] = plans.map((p) => {
    const cur = live(p.id);
    const versions = prices.filter((x) => x.plan_id === p.id);
    const draft = versions.find((x) => x.status === "borrador") ?? null;
    const subscribers = subs.filter((s) => s.plan_id === p.id).length;
    return {
      id: `p-${p.id}`,
      title: `${p.code} · ${p.name}`,
      description: `${LINES[p.line].name}${subscribers ? ` · ${subscribers} suscripción${subscribers === 1 ? "" : "es"}` : ""}`,
      emblem: <Emblem name={LINES[p.line].emblem} size="sm" />,
      tone: !cur ? "gold" : "default",
      status: (
        <span className="catalog-status">
          {cur ? <b>{clp(cur.monthly_price)} <small>/ mes</small></b> : <span className="status status-gold">Sin precio vigente</span>}
          <span className={`tag${p.active ? " tag-ok" : ""}`}>{p.active ? "Activo" : "Inactivo"}</span>
        </span>
      ),
      content: (
        <div className="catalog-body">
          <section>
            <h4 className="sub-title">Ficha del plan</h4>
            <p className="pre"><b>Incluye:</b> {p.scope}</p>
            {p.exclusions ? <p className="pre"><b>No incluye:</b> {p.exclusions}</p> : null}
            <dl className="data-grid">
              <div><dt>Documentos</dt><dd>{limitText(p.limit_documents, "al mes")}</dd></div>
              <div><dt>Operaciones</dt><dd>{limitText(p.limit_operations, "al mes")}</dd></div>
              <div><dt>Trabajadores</dt><dd>{limitText(p.limit_workers, "")}</dd></div>
              <div><dt>Servicios incluidos</dt><dd className="mono">{p.included_services.join(", ") || "—"}</dd></div>
            </dl>
            {admin ? (
              <div className="panel-actions">
                <details className="more inline-more">
                  <summary>Editar ficha</summary>
                  {planForm(p)}
                </details>
                <form action={setPlanActiveAction}>
                  <input type="hidden" name="plan_id" value={p.id} />
                  <input type="hidden" name="active" value={p.active ? "0" : "1"} />
                  <ConfirmSubmit variant={p.active ? "ghost" : "gold"}
                    message={p.active ? "¿Desactivar el plan? Dejará de ofrecerse; las suscripciones existentes no cambian." : "¿Activar el plan? Los clientes podrán verlo y contratarlo con el precio vigente."}>
                    {p.active ? "Desactivar" : "Activar plan"}
                  </ConfirmSubmit>
                </form>
              </div>
            ) : null}
          </section>
          <section>
            <h4 className="sub-title">Precio mensual</h4>
            {versions.length ? (
              <ul className="tariff-list" role="list">
                {versions.map((v) => (
                  <li key={v.id} className={`tariff st-${v.status}`}>
                    <div className="tariff-head">
                      <b>Versión {v.version}</b>
                      <span className={`status status-${TARIFF_STATUSES[v.status]?.tone}`}>{TARIFF_STATUSES[v.status]?.label}</span>
                      <span className="tariff-price">{clp(v.monthly_price)} <small>/ mes</small></span>
                    </div>
                    <p className="muted-line">
                      Creada {moment(v.created_at)}{v.published_at ? ` · publicada ${moment(v.published_at)}` : ""}{v.notes ? ` · ${v.notes}` : ""}
                    </p>
                    {admin && v.status === "borrador" ? (
                      <form action={publishPlanPriceAction}>
                        <input type="hidden" name="plan_id" value={p.id} />
                        <input type="hidden" name="price_id" value={v.id} />
                        <ConfirmSubmit variant="gold" message={`¿Publicar ${clp(v.monthly_price)} al mes? Las nuevas contrataciones usarán este precio; las suscripciones vigentes conservan el suyo.`}>
                          Publicar versión {v.version}
                        </ConfirmSubmit>
                      </form>
                    ) : null}
                    {admin && v.status === "vigente" ? (
                      <form action={retirePlanPriceAction}>
                        <input type="hidden" name="plan_id" value={p.id} />
                        <input type="hidden" name="price_id" value={v.id} />
                        <ConfirmSubmit message="¿Retirar el precio vigente? El plan quedará inactivo hasta publicar otro.">Retirar</ConfirmSubmit>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted-line">Sin precio. ENQORA lo fija tras medir el costo real del servicio; no hay precios precargados.</p>
            )}
            {admin ? (
              <details className="more inline-more">
                <summary>{draft ? "Reemplazar el borrador" : versions.length ? "Nueva versión de precio" : "Definir el primer precio"}</summary>
                <form action={draftPlanPriceAction} className="catalog-form">
                  <input type="hidden" name="plan_id" value={p.id} />
                  <div className="form-grid">
                    <div className="field"><label htmlFor={`mp-${p.id}`}>Precio mensual (CLP)</label><input id={`mp-${p.id}`} name="monthly_price" className="input mono" inputMode="numeric" required defaultValue={cur?.monthly_price ?? ""} /></div>
                  </div>
                  <div className="field"><label htmlFor={`mn-${p.id}`}>Notas de la versión</label><input id={`mn-${p.id}`} name="notes" className="input" maxLength={1000} placeholder="Costo por cliente, margen, IVA incluido…" /></div>
                  <div className="panel-actions"><SubmitButton className="btn-inline" pendingText="Guardando…">Guardar borrador</SubmitButton></div>
                </form>
              </details>
            ) : null}
          </section>
        </div>
      ),
    };
  });

  if (admin) {
    items.unshift({
      id: "nuevo-plan",
      title: "Nuevo plan",
      description: "Queda inactivo hasta publicar su precio y activarlo",
      emblem: <Emblem name="create" size="sm" />,
      content: planForm(),
    });
  }

  return (
    <div className="page">
      <Link href="/mando" className="back-link"><span aria-hidden="true">←</span> Centro de Mando</Link>
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Centro de Mando · Planes</span>
          <h1>Planes mensuales</h1>
          <p className="hero-lead">
            ENQORA Plataforma y ENQORA Contabilidad Profesional. Cada plan define qué incluye, qué no, sus límites y su precio mensual
            versionado. Las suscripciones vigentes conservan el precio con que se contrataron.
          </p>
        </div>
        <Emblem name="planes" size="xl" />
      </header>

      {sp.aviso && AVISOS[sp.aviso] ? <Notice kind="ok">{AVISOS[sp.aviso]}</Notice> : null}
      {messageForCode(sp.error) ? <Notice kind="error">{messageForCode(sp.error)}</Notice> : null}

      <div className="kpis kpis-mando">
        <div className="kpi"><span>Planes activos</span><b>{plans.filter((p) => p.active).length}</b></div>
        <div className={`kpi${plans.some((p) => !live(p.id)) ? " kpi-gold" : ""}`}><span>Sin precio vigente</span><b>{plans.filter((p) => !live(p.id)).length}</b></div>
        <div className="kpi"><span>Suscripciones activas</span><b>{subs.filter((s) => s.status === "activa").length}</b></div>
        <div className="kpi"><span>Pendientes de pago</span><b>{subs.filter((s) => s.status === "pendiente_pago").length}</b></div>
      </div>

      {!prices.some((p) => p.status === "vigente") ? (
        <Callout kind="info" title="Aún no hay precios de planes publicados">
          Los planes iniciales vienen sin precio y desactivados a propósito. Define el precio de cada uno, publícalo y actívalo
          cuando esté listo para ofrecerse.
        </Callout>
      ) : null}
      {!admin ? <p className="muted-line">Solo el Administrador ENQORA edita planes, publica precios y los activa.</p> : null}

      <Accordion label="Planes" items={items} />
    </div>
  );
}
