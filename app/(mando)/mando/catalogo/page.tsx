import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Accordion, type AccordionItem } from "@/components/accordion";
import { Notice } from "@/components/auth-card";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { Callout } from "@/components/disclosure";
import { Emblem } from "@/components/emblems";
import { SubmitButton } from "@/components/submit-button";
import {
  addReferenceAction,
  deleteReferenceAction,
  draftFromAdviceAction,
  draftTariffAction,
  researchPricesAction,
  reviewReferenceAction,
  setPricingPolicyAction,
  publishTariffAction,
  retireTariffAction,
  saveServiceAction,
} from "@/app/actions/pricing";
import { MODULES } from "@/lib/cases";
import { messageForCode } from "@/lib/db-errors";
import { clp, referenceIsFresh, TARIFF_STATUSES, UNITS, type MarketReference, type PriceAdvice, type Service, type Tariff } from "@/lib/pricing";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Catálogo y precios" };
// «Investigar precios de mercado» espera la búsqueda del asesor (hasta ~50 s).
export const maxDuration = 60;

const AVISOS: Record<string, string> = {
  servicio: "Ficha del servicio actualizada.",
  servicio_creado: "Servicio creado. Queda inactivo hasta que lo actives.",
  borrador: "Nueva versión de tarifa guardada como borrador. Publícala para que se use en cotizaciones.",
  publicada: "Tarifa publicada. Desde ahora las cotizaciones usan esta versión.",
  retirada: "Tarifa retirada. El servicio queda sin precio publicado.",
  referencia: "Referencia de mercado registrada.",
  referencia_eliminada: "Referencia de mercado eliminada.",
  referencia_verificada: "Referencia verificada: cuenta para la mediana de mercado.",
  referencia_descartada: "Referencia descartada.",
  politica: "Política comercial actualizada.",
  precios_0: "El asesor no encontró precios publicados confiables nuevos para este servicio.",
};

const fmtDate = (d: string) =>
  new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
const fmt = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(iso)) : "—";

// Catálogo de servicios y tarifas versionadas. Lo ve todo el equipo ENQORA; solo el
// Administrador ENQORA edita el catálogo y publica tarifas.
export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const role = await myStaffRole();
  if (!role) notFound();
  const admin = role === "enqora_admin";
  const supervisor = isSupervisorRole(role);
  const sp = await searchParams;

  const supabase = await createClient();
  const [{ data: sRows }, { data: tRows }, { data: rRows }] = await Promise.all([
    supabase.from("services").select("*").order("code"),
    supabase.from("service_tariffs").select("*").order("version", { ascending: false }),
    supabase.from("market_references").select("*").order("consulted_on", { ascending: false }),
  ]);
  const services = (sRows ?? []) as Service[];
  const tariffs = (tRows ?? []) as Tariff[];
  const refs = (rRows ?? []) as MarketReference[];
  const adviceList: (readonly [string, PriceAdvice | null])[] = await Promise.all(
    services.map(async (sv) => {
      const { data } = await supabase.rpc("price_advice", { p_service: sv.id });
      return [sv.id, (data ?? null) as PriceAdvice | null] as const;
    }),
  );
  const advice = new Map<string, PriceAdvice | null>(adviceList);
  const policy = adviceList.find(([, a]) => a)?.[1] ?? null;
  const avisoText = sp.aviso?.startsWith("precios_") && sp.aviso !== "precios_0"
    ? `El asesor encontró ${sp.aviso.slice(8)} precio(s) publicado(s). Quedan «por verificar»: revisa cada fuente antes de usarlas.`
    : sp.aviso ? AVISOS[sp.aviso] : null;

  const people = [...new Set(tariffs.flatMap((t) => [t.created_by, t.published_by]).filter((v): v is string => !!v))];
  const { data: pRows } = people.length ? await supabase.from("profiles").select("id, email, full_name").in("id", people) : { data: [] };
  const nameOf = new Map(((pRows ?? []) as { id: string; email: string; full_name: string | null }[]).map((p) => [p.id, p.full_name || p.email]));

  const current = (sid: string) => tariffs.find((t) => t.service_id === sid && t.status === "vigente") ?? null;
  const stats = {
    activos: services.filter((s) => s.active).length,
    conTarifa: services.filter((s) => current(s.id)).length,
    sinTarifa: services.filter((s) => s.active && !current(s.id)).length,
    vencidas: refs.filter((r) => !referenceIsFresh(r)).length,
  };

  const serviceForm = (s?: Service) => (
    <form action={saveServiceAction} className="catalog-form">
      {s ? <input type="hidden" name="service_id" value={s.id} /> : null}
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`code-${s?.id ?? "new"}`}>Código</label>
          <input id={`code-${s?.id ?? "new"}`} name="code" className="input mono" required defaultValue={s?.code ?? ""}
            readOnly={!!s} pattern="[A-Za-z]{2,6}-[0-9]{2,3}" placeholder="CON-06" maxLength={10} />
        </div>
        <div className="field">
          <label htmlFor={`module-${s?.id ?? "new"}`}>Módulo</label>
          <select id={`module-${s?.id ?? "new"}`} name="module" className="input" defaultValue={s?.module ?? "contabilidad"}>
            {Object.entries(MODULES).map(([k, m]) => <option key={k} value={k}>{m.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`unit-${s?.id ?? "new"}`}>Unidad de cobro</label>
          <select id={`unit-${s?.id ?? "new"}`} name="unit" className="input" defaultValue={s?.unit ?? "caso"}>
            {Object.entries(UNITS).map(([k, u]) => <option key={k} value={k}>{u.label}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor={`name-${s?.id ?? "new"}`}>Nombre</label>
        <input id={`name-${s?.id ?? "new"}`} name="name" className="input" required minLength={3} maxLength={120} defaultValue={s?.name ?? ""} />
      </div>
      <div className="field">
        <label htmlFor={`summary-${s?.id ?? "new"}`}>Resumen <span className="optional">(una frase)</span></label>
        <input id={`summary-${s?.id ?? "new"}`} name="summary" className="input" maxLength={300} defaultValue={s?.summary ?? ""} />
      </div>
      <div className="field">
        <label htmlFor={`scope-${s?.id ?? "new"}`}>Alcance: qué incluye</label>
        <textarea id={`scope-${s?.id ?? "new"}`} name="scope" className="input" rows={3} required minLength={10} maxLength={4000} defaultValue={s?.scope ?? ""} />
      </div>
      <div className="field">
        <label htmlFor={`excl-${s?.id ?? "new"}`}>Exclusiones: qué no incluye</label>
        <textarea id={`excl-${s?.id ?? "new"}`} name="exclusions" className="input" rows={2} maxLength={4000} defaultValue={s?.exclusions ?? ""} />
      </div>
      <div className="check-row">
        <label className="check-inline"><input type="checkbox" name="requires_professional" defaultChecked={s?.requires_professional ?? false} /> Exige criterio profesional (toda cotización pasa por revisión)</label>
        <label className="check-inline"><input type="checkbox" name="active" defaultChecked={s?.active ?? false} /> Activo en el catálogo del cliente</label>
      </div>
      <div className="panel-actions">
        <SubmitButton className="btn-inline" pendingText="Guardando…">{s ? "Guardar ficha" : "Crear servicio"}</SubmitButton>
      </div>
    </form>
  );

  const tariffForm = (s: Service, base: Tariff | null) => (
    <form action={draftTariffAction} className="catalog-form">
      <input type="hidden" name="service_id" value={s.id} />
      <p className="panel-lead">
        Montos en pesos chilenos, por {UNITS[s.unit]?.per ?? "unidad"}. Se guarda como borrador: no afecta ninguna cotización hasta que la publiques.
      </p>
      <div className="form-grid">
        <div className="field"><label htmlFor={`f-${s.id}-base_price`}>Tarifa base (CLP)</label><input id={`f-${s.id}-base_price`} name="base_price" className="input mono" inputMode="numeric" required defaultValue={base?.base_price ?? ""} /></div>
        <div className="field"><label htmlFor={`f-${s.id}-min_price`}>Precio mínimo (CLP)</label><input id={`f-${s.id}-min_price`} name="min_price" className="input mono" inputMode="numeric" required defaultValue={base?.min_price ?? ""} /></div>
        <div className="field"><label htmlFor={`f-${s.id}-max_price`}>Precio máximo (CLP)</label><input id={`f-${s.id}-max_price`} name="max_price" className="input mono" inputMode="numeric" required defaultValue={base?.max_price ?? ""} /></div>
        <div className="field"><label htmlFor={`f-${s.id}-factor_media`}>Factor media</label><input id={`f-${s.id}-factor_media`} name="factor_media" className="input mono" inputMode="decimal" defaultValue={base?.factor_media ?? 1} /></div>
        <div className="field"><label htmlFor={`f-${s.id}-factor_compleja`}>Factor compleja</label><input id={`f-${s.id}-factor_compleja`} name="factor_compleja" className="input mono" inputMode="decimal" defaultValue={base?.factor_compleja ?? 1} /></div>
        <div className="field"><label htmlFor={`f-${s.id}-factor_especializada`}>Factor especializada</label><input id={`f-${s.id}-factor_especializada`} name="factor_especializada" className="input mono" inputMode="decimal" defaultValue={base?.factor_especializada ?? 1} /></div>
        <div className="field"><label htmlFor={`f-${s.id}-onsite_fee`}>Gestión presencial (CLP)</label><input id={`f-${s.id}-onsite_fee`} name="onsite_fee" className="input mono" inputMode="numeric" defaultValue={base?.onsite_fee ?? 0} /></div>
        <div className="field"><label htmlFor={`f-${s.id}-urgency_pct`}>Recargo urgencia (%)</label><input id={`f-${s.id}-urgency_pct`} name="urgency_pct" type="number" min={0} max={100} className="input mono" defaultValue={base?.urgency_pct ?? 0} /></div>
        <div className="field"><label htmlFor={`f-${s.id}-max_discount_pct`}>Descuento máximo (%)</label><input id={`f-${s.id}-max_discount_pct`} name="max_discount_pct" type="number" min={0} max={50} className="input mono" defaultValue={base?.max_discount_pct ?? 0} /></div>
        <div className="field"><label htmlFor={`f-${s.id}-est_hours`}>Horas estimadas</label><input id={`f-${s.id}-est_hours`} name="est_hours" className="input mono" inputMode="decimal" defaultValue={base?.est_hours ?? ""} /></div>
        <div className="field"><label htmlFor={`f-${s.id}-specialty`}>Especialidad</label><input id={`f-${s.id}-specialty`} name="specialty" className="input" maxLength={80} defaultValue={base?.specialty ?? ""} placeholder="Contador, abogado…" /></div>
      </div>
      <div className="field"><label htmlFor={`f-${s.id}-notes`}>Notas de la versión</label><input id={`f-${s.id}-notes`} name="notes" className="input" maxLength={2000} placeholder="Qué cambió y por qué (costo por caso, margen…)" /></div>
      <div className="panel-actions"><SubmitButton className="btn-inline" pendingText="Guardando…">Guardar borrador</SubmitButton></div>
    </form>
  );

  const items: AccordionItem[] = services.map((s) => {
    const cur = current(s.id);
    const versions = tariffs.filter((t) => t.service_id === s.id);
    const sRefs = refs.filter((r) => r.service_id === s.id);
    const last = cur ?? versions[0] ?? null;
    return {
      id: `s-${s.id}`,
      title: `${s.code} · ${s.name}`,
      description: s.summary ?? undefined,
      emblem: <Emblem name={s.module} size="sm" />,
      tone: s.active && !cur ? "gold" : "default",
      status: (
        <span className="catalog-status">
          {cur ? <b>{clp(cur.base_price)} <small>/ {UNITS[s.unit]?.per}</small></b> : <span className="status status-gold">Sin tarifa vigente</span>}
          {!s.active ? <span className="tag">Inactivo</span> : null}
        </span>
      ),
      content: (
        <div className="catalog-body">
          <section>
            <h4 className="sub-title">Ficha del servicio</h4>
            <dl className="data-grid">
              <div><dt>Módulo</dt><dd>{MODULES[s.module as keyof typeof MODULES]?.name ?? s.module}</dd></div>
              <div><dt>Unidad</dt><dd>{UNITS[s.unit]?.label ?? s.unit}</dd></div>
              <div><dt>Revisión profesional</dt><dd>{s.requires_professional ? "Siempre" : "Solo fuera de rango"}</dd></div>
              <div><dt>Estado</dt><dd><span className={`status status-${s.active ? "ok" : "muted"}`}>{s.active ? "Activo" : "Inactivo"}</span></dd></div>
            </dl>
            <p className="pre"><b>Incluye:</b> {s.scope}</p>
            {s.exclusions ? <p className="pre"><b>No incluye:</b> {s.exclusions}</p> : null}
            {admin ? (
              <details className="more inline-more">
                <summary>Editar ficha</summary>
                {serviceForm(s)}
              </details>
            ) : null}
          </section>

          <section>
            <h4 className="sub-title">Tarifas</h4>
            {versions.length ? (
              <ul className="tariff-list" role="list">
                {versions.map((t) => (
                  <li key={t.id} className={`tariff st-${t.status}`}>
                    <div className="tariff-head">
                      <b>Versión {t.version}</b>
                      <span className={`status status-${TARIFF_STATUSES[t.status]?.tone}`}>{TARIFF_STATUSES[t.status]?.label}</span>
                      <span className="tariff-price">{clp(t.base_price)} <small>/ {UNITS[s.unit]?.per}</small></span>
                    </div>
                    <dl className="tariff-facts">
                      <div><dt>Rango permitido</dt><dd>{clp(t.min_price)} – {clp(t.max_price)}</dd></div>
                      <div><dt>Complejidad</dt><dd>×1 · ×{Number(t.factor_media)} · ×{Number(t.factor_compleja)} · ×{Number(t.factor_especializada)}</dd></div>
                      <div><dt>Presencial</dt><dd>{clp(t.onsite_fee)}</dd></div>
                      <div><dt>Urgencia</dt><dd>+{t.urgency_pct}%</dd></div>
                      <div><dt>Descuento máximo</dt><dd>{t.max_discount_pct}%</dd></div>
                      {t.est_hours ? <div><dt>Horas estimadas</dt><dd>{Number(t.est_hours)} h{t.specialty ? ` · ${t.specialty}` : ""}</dd></div> : null}
                    </dl>
                    <p className="muted-line">
                      Creada por {t.created_by ? nameOf.get(t.created_by) ?? "equipo ENQORA" : "—"} · {fmt(t.created_at)}
                      {t.published_at ? ` · publicada por ${t.published_by ? nameOf.get(t.published_by) ?? "equipo ENQORA" : "—"} · ${fmt(t.published_at)}` : ""}
                      {t.notes ? ` · ${t.notes}` : ""}
                    </p>
                    {admin && t.status === "borrador" ? (
                      <form action={publishTariffAction}>
                        <input type="hidden" name="service_id" value={s.id} />
                        <input type="hidden" name="tariff_id" value={t.id} />
                        <ConfirmSubmit variant="gold" message={`¿Publicar la versión ${t.version}? Las cotizaciones nuevas usarán esta tarifa${cur ? " y la versión vigente quedará retirada" : ""}.`}>
                          Publicar versión {t.version}
                        </ConfirmSubmit>
                      </form>
                    ) : null}
                    {admin && t.status === "vigente" ? (
                      <form action={retireTariffAction}>
                        <input type="hidden" name="service_id" value={s.id} />
                        <input type="hidden" name="tariff_id" value={t.id} />
                        <ConfirmSubmit message="¿Retirar la tarifa vigente? El servicio quedará sin precio hasta publicar otra versión.">Retirar</ConfirmSubmit>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted-line">Aún no hay tarifas. ENQORA define el precio tras medir el costo por caso y el margen; no hay precios precargados.</p>
            )}
            {admin ? (
              <details className="more inline-more">
                <summary>{versions.length ? "Nueva versión de tarifa" : "Definir la primera tarifa"}</summary>
                {tariffForm(s, last)}
              </details>
            ) : null}
          </section>

          <section>
            <h4 className="sub-title">Referencias de mercado y asesor de precios</h4>
            <p className="panel-lead">Precios publicados por otros proveedores, con su fuente y fecha. Solo las verificadas cuentan para la mediana y se muestran al cliente como referencia; se ocultan después de {180} días.</p>
            {(() => {
              const a = advice.get(s.id);
              return (
                <div className="advisor-box">
                  <dl className="data-grid">
                    <div><dt>Mediana de mercado</dt><dd>{a?.mediana ? `${clp(a.mediana)} / ${UNITS[s.unit]?.per}` : "—"}</dd></div>
                    <div><dt>Referencias verificadas</dt><dd>{a?.referencias ?? 0} de {a?.minimo_referencias ?? 3} mínimas{a?.por_verificar ? ` · ${a.por_verificar} por verificar` : ""}</dd></div>
                    <div><dt>Precio ENQORA normal sugerido</dt><dd>{a?.sugerido && a.suficiente ? <b>{clp(a.sugerido)}{a.descuento ? <small> (−{a.descuento}%)</small> : <small> (= mercado)</small>}</b> : "Faltan referencias verificadas"}</dd></div>
                    {a?.sugerido && a.suficiente && a.bienvenida_pct ? (
                      <div><dt>Primeros {a.bienvenida_meses} meses de cada cliente</dt><dd><b>{clp(a.precio_bienvenida ?? 0)}</b> <small>(bienvenida −{a.bienvenida_pct}%)</small></dd></div>
                    ) : null}
                  </dl>
                  <div className="inline-form">
                    <form action={researchPricesAction}>
                      <input type="hidden" name="service_id" value={s.id} />
                      <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="Investigando precios (hasta 1 minuto)…">Investigar precios de mercado</SubmitButton>
                    </form>
                    {admin && a?.suficiente && a.sugerido ? (
                      <form action={draftFromAdviceAction}>
                        <input type="hidden" name="service_id" value={s.id} />
                        <SubmitButton className="btn-inline btn-sm" pendingText="Creando borrador…">Crear borrador con {clp(a.sugerido)}</SubmitButton>
                      </form>
                    ) : null}
                  </div>
                  <small className="muted-line">El asesor solo propone: el borrador se revisa y se publica en «Tarifas» con tu confirmación.</small>
                </div>
              );
            })()}
            {sRefs.length ? (
              <ul className="ref-list" role="list">
                {sRefs.map((r) => {
                  const fresh = referenceIsFresh(r);
                  return (
                    <li key={r.id} className={fresh ? "" : "is-stale"}>
                      <span className="ref-main">
                        <b>{r.provider}{r.origin === "agente" ? <span className="ref-badge">asesor IA</span> : null}</b>
                        <small>
                          {clp(r.amount_min)}{r.amount_max ? ` – ${clp(r.amount_max)}` : ""} / {UNITS[r.unit]?.per ?? r.unit}
                          {r.scope_note ? ` · ${r.scope_note}` : ""}
                        </small>
                        {r.evidence ? <small className="ref-evidence">«{r.evidence}»</small> : null}
                        <a href={r.url} target="_blank" rel="noopener noreferrer" className="ref-link">{r.url.replace(/^https:\/\//, "").slice(0, 60)}</a>
                      </span>
                      {r.status === "por_verificar" ? (
                        <span className="status status-gold">Por verificar</span>
                      ) : r.status === "descartada" ? (
                        <span className="status status-muted">Descartada</span>
                      ) : (
                        <span className={`status status-${fresh ? "ok" : "muted"}`}>{fresh ? `Consultada ${fmtDate(r.consulted_on)}` : `Desactualizada (${fmtDate(r.consulted_on)})`}</span>
                      )}
                      {supervisor && r.status === "por_verificar" ? (
                        <form action={reviewReferenceAction} className="inline-form">
                          <input type="hidden" name="service_id" value={s.id} />
                          <input type="hidden" name="reference_id" value={r.id} />
                          <button name="decision" value="verificada" className="btn btn-gold btn-inline btn-sm">Verificar</button>
                          <button name="decision" value="descartada" className="btn btn-ghost btn-inline btn-sm">Descartar</button>
                        </form>
                      ) : null}
                      {admin ? (
                        <form action={deleteReferenceAction}>
                          <input type="hidden" name="service_id" value={s.id} />
                          <input type="hidden" name="reference_id" value={r.id} />
                          <ConfirmSubmit variant="ghost" message="¿Eliminar esta referencia?">Eliminar</ConfirmSubmit>
                        </form>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="muted-line">Sin referencias registradas.</p>
            )}
            <details className="more inline-more">
              <summary>Registrar referencia</summary>
              <form action={addReferenceAction} className="catalog-form">
                <input type="hidden" name="service_id" value={s.id} />
                <div className="form-grid">
                  <div className="field"><label htmlFor={`f-${s.id}-provider`}>Proveedor o fuente</label><input id={`f-${s.id}-provider`} name="provider" className="input" required maxLength={120} /></div>
                  <div className="field"><label htmlFor={`f-${s.id}-url`}>Enlace (https)</label><input id={`f-${s.id}-url`} name="url" type="url" className="input" required pattern="https://.*" placeholder="https://…" /></div>
                  <div className="field"><label htmlFor={`f-${s.id}-consulted_on`}>Fecha de consulta</label><input id={`f-${s.id}-consulted_on`} name="consulted_on" type="date" className="input" required /></div>
                  <div className="field"><label htmlFor={`f-${s.id}-amount_min`}>Monto desde (CLP)</label><input id={`f-${s.id}-amount_min`} name="amount_min" className="input mono" inputMode="numeric" required /></div>
                  <div className="field"><label htmlFor={`f-${s.id}-amount_max`}>Monto hasta (CLP)</label><input id={`f-${s.id}-amount_max`} name="amount_max" className="input mono" inputMode="numeric" /></div>
                  <div className="field">
                    <label htmlFor={`f-${s.id}-ref-unit`}>Unidad</label>
                    <select id={`f-${s.id}-ref-unit`} name="unit" className="input" defaultValue={s.unit}>
                      {Object.entries(UNITS).map(([k, u]) => <option key={k} value={k}>{u.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="field"><label htmlFor={`f-${s.id}-scope_note`}>Alcance comparable</label><input id={`f-${s.id}-scope_note`} name="scope_note" className="input" maxLength={500} placeholder="Qué incluye la oferta publicada" /></div>
                <div className="panel-actions"><SubmitButton variant="ghost" className="btn-inline" pendingText="Guardando…">Registrar referencia</SubmitButton></div>
              </form>
            </details>
          </section>
        </div>
      ),
    };
  });

  if (admin) {
    items.unshift({
      id: "nuevo-servicio",
      title: "Nuevo servicio",
      description: "Agrega un servicio al catálogo (queda inactivo hasta que lo actives)",
      emblem: <Emblem name="create" size="sm" />,
      content: serviceForm(),
    });
  }

  return (
    <div className="page">
      <Link href="/mando" className="back-link"><span aria-hidden="true">←</span> Centro de Mando</Link>
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Centro de Mando · Motor de precios</span>
          <h1>Catálogo y precios</h1>
          <p className="hero-lead">
            Servicios, tarifas versionadas y referencias de mercado. Las cotizaciones se calculan con la tarifa vigente;
            lo que sale de los parámetros pasa por aprobación.
          </p>
        </div>
      </header>

      {avisoText ? <Notice kind="ok">{avisoText}</Notice> : null}
      {messageForCode(sp.error) ? <Notice kind="error">{messageForCode(sp.error)}</Notice> : null}

      <div className="kpis kpis-mando">
        <div className="kpi"><span>Servicios activos</span><b>{stats.activos}</b></div>
        <div className="kpi"><span>Con tarifa vigente</span><b>{stats.conTarifa}</b></div>
        <div className={`kpi${stats.sinTarifa ? " kpi-gold" : ""}`}><span>Activos sin tarifa</span><b>{stats.sinTarifa}</b></div>
        <div className="kpi"><span>Referencias desactualizadas</span><b>{stats.vencidas}</b></div>
      </div>

      {!tariffs.some((t) => t.status === "vigente") ? (
        <Callout kind="info" title="Aún no hay precios publicados">
          El catálogo inicial viene sin tarifas a propósito: ENQORA las fija después de medir el costo por caso y el margen.
          Mientras un servicio no tenga tarifa vigente, no se puede cotizar.
        </Callout>
      ) : null}

      {!admin ? <p className="muted-line">Solo el Administrador ENQORA edita el catálogo y publica tarifas. Puedes registrar referencias de mercado.</p> : null}

      <section className="card" id="politica">
        <h2>Asesor de precios · política comercial</h2>
        <p className="panel-lead">
          El asesor busca precios publicados en Chile y, con las referencias verificadas, sugiere el precio ENQORA normal (mediana de mercado menos el
          descuento permanente). Cada cliente nuevo recibe además el descuento de bienvenida en todos sus cobros durante sus primeros meses,
          contados desde su primer cobro; después paga el precio normal.
        </p>
        {admin ? (
          <form action={setPricingPolicyAction} className="inline-form">
            <label className="check-inline">Bienvenida
              <input name="welcome_pct" type="number" min={0} max={80} defaultValue={policy?.bienvenida_pct ?? 40} className="input input-sm" style={{ width: 70 }} /> % por
              <input name="welcome_months" type="number" min={0} max={24} defaultValue={policy?.bienvenida_meses ?? 6} className="input input-sm" style={{ width: 64 }} /> meses
            </label>
            <label className="check-inline">Descuento permanente sobre el mercado
              <input name="discount" type="number" min={0} max={80} defaultValue={policy?.descuento ?? 0} className="input input-sm" style={{ width: 70 }} /> %
            </label>
            <label className="check-inline">Referencias mínimas
              <input name="min_refs" type="number" min={1} max={20} defaultValue={policy?.minimo_referencias ?? 3} className="input input-sm" style={{ width: 70 }} />
            </label>
            <SubmitButton className="btn-inline btn-sm" pendingText="Guardando…">Guardar política</SubmitButton>
          </form>
        ) : <p className="muted-line">Bienvenida: −{policy?.bienvenida_pct ?? 40}% los primeros {policy?.bienvenida_meses ?? 6} meses · descuento permanente {policy?.descuento ?? 0}% · mínimo {policy?.minimo_referencias ?? 3} referencias.</p>}
      </section>

      <Accordion label="Servicios del catálogo" items={items} />
    </div>
  );
}
