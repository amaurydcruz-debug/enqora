import Link from "next/link";
import type { Metadata } from "next";
import { Notice } from "@/components/auth-card";
import { SubmitButton } from "@/components/submit-button";
import { Callout, Disclosure, FactTag, NextAction } from "@/components/disclosure";
import { ModuleIcon } from "@/components/module-icons";
import { Emblem } from "@/components/emblems";
import { clp, todayCL } from "@/lib/pricing";
import { IconArrowRight, IconBuilding, IconPlus } from "@/components/icons";
import { acknowledgeAlertsAction } from "@/app/actions/security";
import { activeCompany } from "@/lib/companies";
import { REGIMES, ROLES } from "@/lib/company-constants";
import {
  CLOSED,
  MODULES,
  NEEDS_CLIENT,
  NEXT_STEP,
  statusLabel,
  statusTone,
  type CaseRow,
  type ModuleKey,
} from "@/lib/cases";
import { formatRut } from "@/lib/rut";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Centro de control" };

const AVISOS: Record<string, string> = {
  mfa: "Segundo factor activado. Tu cuenta quedó protegida con verificación en dos pasos.",
  clave: "Contraseña actualizada. Cerramos las demás sesiones abiertas de tu cuenta.",
};

const TZ = "America/Santiago";
const fmt = (iso: string) => new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", timeZone: TZ }).format(new Date(iso));
const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TZ }).format(new Date(iso));
const fmtLong = (d: string) => new Intl.DateTimeFormat("es-CL", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

function greeting() {
  const h = Number(new Intl.DateTimeFormat("es-CL", { hour: "numeric", hourCycle: "h23", timeZone: TZ }).format(new Date()));
  return h < 12 ? "Buenos días" : h < 20 ? "Buenas tardes" : "Buenas noches";
}

const EVENT_TEXT: Record<string, string> = {
  creado: "Solicitud creada",
  comentario: "Nuevo mensaje",
  documento: "Documento agregado",
  asignacion: "Equipo asignado",
  tarea: "Tarea actualizada",
};
const AUTH_TEXT: Record<string, string> = {
  solicitada: "Autorización solicitada",
  autorizada: "Autorización otorgada",
  rechazada: "Autorización rechazada",
  revocada: "Autorización revocada",
  anulada: "Solicitud de autorización anulada",
};

// Módulos que se ofrecen siempre primero (si la empresa no tiene casos en otros).
const FEATURED: ModuleKey[] = ["contabilidad", "formaliza", "create", "brand", "legal", "gestion", "crece", "idea"];

type Task = { id: string; case_id: string; title: string; status: string; due_date: string | null };
type Auth = { id: string; case_id: string; title: string; scope: string; institution: string | null; valid_until: string | null };
type PendingQuote = { id: string; case_id: string; service_name: string; final_price: number; external_costs: number; valid_until: string };
type Ev = { id: number; case_id: string; kind: string; metadata: Record<string, string>; created_at: string };

// Centro de control: limpio por defecto. Lo importante a la vista; el detalle, cuando el cliente lo pide.
export default async function PanelPage({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const { aviso } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { active } = await activeCompany();

  const [{ count: pendingAlerts }, { data: me }] = await Promise.all([
    supabase.from("security_events").select("id", { count: "exact", head: true }).eq("event", "nuevo_dispositivo").is("acknowledged_at", null),
    supabase.from("profiles").select("full_name").eq("id", user?.id ?? "").maybeSingle(),
  ]);
  const firstName = ((me as { full_name: string | null } | null)?.full_name ?? "").split(" ")[0];

  // Datos reales de la empresa activa (RLS: solo lo que el usuario puede ver).
  const { data: caseRows } = active
    ? await supabase
        .from("cases")
        .select("id, folio, module, title, status, updated_at, created_at")
        .eq("company_id", active.id)
        .order("updated_at", { ascending: false })
        .limit(60)
    : { data: [] };
  const cases = (caseRows ?? []) as CaseRow[];
  const caseIds = cases.map((c) => c.id);
  const caseById = new Map(cases.map((c) => [c.id, c]));

  const [authRes, taskRes, evRes, quoteRes] =
    active && caseIds.length
      ? await Promise.all([
          supabase
            .from("client_authorizations")
            .select("id, case_id, title, scope, institution, valid_until")
            .eq("company_id", active.id)
            .eq("status", "pendiente")
            .order("requested_at"),
          supabase
            .from("case_tasks")
            .select("id, case_id, title, status, due_date")
            .eq("assignee_id", user?.id ?? "")
            .in("status", ["pendiente", "en_curso", "bloqueada"])
            .in("case_id", caseIds)
            .order("due_date", { ascending: true, nullsFirst: false })
            .limit(8),
          supabase
            .from("case_events")
            .select("id, case_id, kind, metadata, created_at")
            .in("case_id", caseIds)
            .eq("visibility", "cliente")
            .neq("kind", "estado")
            .order("created_at", { ascending: false })
            .limit(6),
          // Cotizaciones enviadas que esperan decisión (RLS: el cliente solo recibe las enviadas).
          supabase
            .from("quotes")
            .select("id, case_id, service_name, final_price, external_costs, valid_until")
            .eq("company_id", active.id)
            .eq("status", "enviada")
            .gte("valid_until", todayCL())
            .order("sent_at"),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const pendingAuth = (authRes.data ?? []) as Auth[];
  const myTasks = (taskRes.data ?? []) as Task[];
  const events = (evRes.data ?? []) as Ev[];
  const pendingQuotes = (quoteRes.data ?? []) as PendingQuote[];

  const open = cases.filter((c) => !CLOSED.includes(c.status));
  const finished = cases.filter((c) => c.status === "cerrado");
  // Casos que esperan antecedentes del cliente (los de autorización ya aparecen como autorización).
  const waitingInfo = open.filter((c) => c.status === "esperando_cliente");
  const attention = pendingAuth.length + pendingQuotes.length + myTasks.length + waitingInfo.length;
  const canAuthorize = !!active && ["owner", "admin"].includes(active.role);
  const canCreate = !!active && active.role !== "viewer";

  // Servicios: primero los que la empresa ya usa; el resto queda plegado.
  const activeByModule = new Map<ModuleKey, number>();
  open.forEach((c) => activeByModule.set(c.module, (activeByModule.get(c.module) ?? 0) + 1));
  const moduleOrder = [
    ...FEATURED.filter((m) => activeByModule.has(m)),
    ...FEATURED.filter((m) => !activeByModule.has(m)),
  ];
  const shownModules = moduleOrder.slice(0, 4);
  const moreModules = moduleOrder.slice(4);

  const statusLine = !active
    ? "Registra tu empresa para activar tu centro de control."
    : attention
      ? attention === 1
        ? "Hay un asunto que requiere tu atención."
        : `Hay ${attention} asuntos que requieren tu atención.`
      : open.length
        ? "Tus casos avanzan. No hay nada pendiente de tu parte."
        : "No tienes casos en curso. Cuando necesites algo, ENQORA está lista.";

  const ModuleTile = ({ m }: { m: ModuleKey }) => {
    const n = activeByModule.get(m) ?? 0;
    return (
      <li className={`module${n ? " is-live" : ""}`}>
        <ModuleIcon module={m} size="lg" />
        <span className="module-name">{MODULES[m].name.replace("ENQORA ", "")}</span>
        <span className="module-state">{n ? (n === 1 ? "1 caso activo" : `${n} casos activos`) : "Disponible"}</span>
        <span className="module-help">{MODULES[m].help}</span>
        {n ? (
          <Link href="/casos" className="module-cta">Ver casos <IconArrowRight size={14} /></Link>
        ) : canCreate ? (
          <Link href={`/casos/nuevo?modulo=${m}`} className="module-cta">Solicitar <IconArrowRight size={14} /></Link>
        ) : null}
      </li>
    );
  };

  return (
    <div className="page">
      {aviso && AVISOS[aviso] ? <Notice kind="ok">{AVISOS[aviso]}</Notice> : null}

      {/* Bienvenida y estado general */}
      <header className="welcome-hero">
        <div className="welcome-glow" aria-hidden="true" />
        <span className="eyebrow">{active ? active.trade_name || active.legal_name : "Centro de control"}</span>
        <h1>
          {greeting()}
          {firstName ? `, ${firstName}` : ""}.
        </h1>
        <p className="welcome-status">{statusLine}</p>
        {active ? (
          <p className="welcome-meta">
            RUT <span className="mono">{formatRut(active.rut)}</span> · {REGIMES[active.tax_regime] ?? "Régimen por definir"} · {ROLES[active.role]}
            {active.rut_verified ? "" : " · RUT por verificar"}
          </p>
        ) : null}
        <div className="hero-actions">
          {active ? (
            <>
              {canCreate ? <Link href="/casos/nuevo" className="btn btn-gold btn-inline"><IconPlus size={16} /> Nueva solicitud</Link> : null}
              <Link href="/casos" className="btn btn-ghost btn-inline">Mis casos</Link>
            </>
          ) : (
            <Link href="/empresas/nueva" className="btn btn-gold btn-inline"><IconPlus size={16} /> Registrar empresa</Link>
          )}
        </div>
      </header>

      {active ? (
        <div className="kpis kpis-3" role="list" aria-label="Indicadores">
          <div className="kpi" role="listitem"><span>Casos en curso</span><b>{open.length}</b></div>
          <div className={`kpi${attention ? " kpi-gold" : ""}`} role="listitem"><span>Requieren tu atención</span><b>{attention}</b></div>
          <div className="kpi" role="listitem"><span>Resueltos</span><b>{finished.length}</b></div>
        </div>
      ) : null}

      {/* Advertencias importantes: siempre visibles */}
      {pendingAlerts ? (
        <Callout
          kind="warn"
          title="Detectamos un ingreso desde un dispositivo nuevo"
          action={
            <div className="actions-inline">
              <Link href="/seguridad" className="btn btn-gold btn-inline btn-sm">Revisar</Link>
              <form action={acknowledgeAlertsAction}>
                <input type="hidden" name="next" value="/panel" />
                <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Fui yo</SubmitButton>
              </form>
            </div>
          }
        >
          Si no fuiste tú, cambia tu contraseña y cierra las demás sesiones.
        </Callout>
      ) : null}

      {active ? (
        <>
          {/* Asuntos que requieren atención: resumen visible, detalle bajo demanda */}
          {attention ? (
            <section className="zone" id="atencion">
              <h2 className="zone-title">Requiere tu atención</h2>
              <div className="disclosures">
                {pendingAuth.map((a) => (
                  <Disclosure
                    key={a.id}
                    tone="gold"
                    group="atencion"
                    emblem={<Emblem name="autorizaciones" size="sm" />}
                    title={a.title}
                    summary={`Autorización · ${caseById.get(a.case_id)?.folio ?? ""}`}
                    meta={<span className="status status-warn">Espera tu decisión</span>}
                    cta="Explorar"
                  >
                    <FactTag kind="autorizacion" />
                    <p className="disc-lead">{a.scope}</p>
                    <dl className="mini-facts">
                      {a.institution ? <div><dt>Institución</dt><dd>{a.institution}</dd></div> : null}
                      <div><dt>Vigencia</dt><dd>{a.valid_until ? `Hasta el ${fmtLong(a.valid_until)}` : "Mientras dure el caso"}</dd></div>
                      <div><dt>Caso</dt><dd>{caseById.get(a.case_id)?.title ?? "—"}</dd></div>
                    </dl>
                    <NextAction
                      title={canAuthorize ? "Revisa el alcance y decide" : "Debe decidirla el Propietario o un Administrador"}
                      action={<Link href={`/casos/${a.case_id}#autorizaciones`} className="btn btn-gold btn-inline btn-sm">Revisar y decidir</Link>}
                    >
                      ENQORA solo actuará dentro de lo que autorices, y podrás revocarlo cuando quieras.
                    </NextAction>
                  </Disclosure>
                ))}
                {pendingQuotes.map((q) => (
                  <Disclosure
                    key={q.id}
                    tone="gold"
                    group="atencion"
                    emblem={<Emblem name="contabilidad" size="sm" />}
                    title={q.service_name}
                    summary={`Cotización · ${caseById.get(q.case_id)?.folio ?? ""}`}
                    meta={<span className="status status-warn">{clp(q.final_price)}</span>}
                  >
                    <p className="disc-lead">
                      ENQORA te envió una cotización por {clp(q.final_price)}
                      {q.external_costs ? `, más ${clp(q.external_costs)} de gastos externos estimados` : ""}. Es válida hasta el {fmtLong(q.valid_until)}.
                    </p>
                    <NextAction
                      title={canAuthorize ? "Revisa el alcance y decide" : "Debe decidirla el Propietario o un Administrador"}
                      action={<Link href={`/casos/${q.case_id}#cotizacion`} className="btn btn-gold btn-inline btn-sm">Ver cotización</Link>}
                    >
                      Verás el precio estándar, el descuento si lo hay, lo que incluye y lo que no.
                    </NextAction>
                  </Disclosure>
                ))}
                {waitingInfo.map((c) => (
                  <Disclosure
                    key={c.id}
                    tone="gold"
                    group="atencion"
                    emblem={<Emblem name="expediente" size="sm" />}
                    title={c.title}
                    summary={`Antecedentes · ${c.folio}`}
                    meta={<span className="status status-warn">Esperando tus antecedentes</span>}
                  >
                    <p className="disc-lead">El equipo necesita información o documentos tuyos para continuar con este caso.</p>
                    <NextAction
                      title={NEXT_STEP[c.status]}
                      action={<Link href={`/casos/${c.id}#historial`} className="btn btn-gold btn-inline btn-sm">Ver lo que se pide</Link>}
                    />
                  </Disclosure>
                ))}
                {myTasks.map((t) => (
                  <Disclosure
                    key={t.id}
                    group="atencion"
                    emblem={<Emblem name="tareas" size="sm" />}
                    title={t.title}
                    summary={`Tarea · ${caseById.get(t.case_id)?.folio ?? ""}`}
                    meta={t.due_date ? <span className="status status-gold">Vence {fmt(`${t.due_date}T12:00:00Z`)}</span> : null}
                  >
                    <p className="disc-lead">Tarea asignada a ti en el caso «{caseById.get(t.case_id)?.title ?? ""}».</p>
                    <NextAction
                      title="Complétala desde la ficha del caso"
                      action={<Link href={`/casos/${t.case_id}#tareas`} className="btn btn-ghost btn-inline btn-sm">Abrir caso</Link>}
                    />
                  </Disclosure>
                ))}
              </div>
            </section>
          ) : null}

          {/* Casos en curso: lo esencial */}
          <section className="zone">
            <div className="zone-head">
              <h2 className="zone-title">Tus casos</h2>
              <Link href="/casos" className="link-arrow">Ver todos <IconArrowRight size={15} /></Link>
            </div>
            {open.length ? (
              <ul className="case-rows panel">
                {open.slice(0, 3).map((c) => (
                  <li key={c.id}>
                    <Link href={`/casos/${c.id}`} className={`case-row${NEEDS_CLIENT.includes(c.status) ? " needs-you" : ""}`}>
                      <ModuleIcon module={c.module} size="sm" />
                      <span className="case-row-main">
                        <span className="case-row-top">
                          <span className="mono case-folio">{c.folio}</span>
                        </span>
                        <b>{c.title}</b>
                        <span className="case-next">{NEXT_STEP[c.status] ?? ""}</span>
                      </span>
                      <span className="case-row-side">
                        <span className={`status status-${statusTone(c.status)}`}>{statusLabel(c.status)}</span>
                        <span className="muted-line">{fmt(c.updated_at)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
                {open.length > 3 ? (
                  <li className="case-rows-more"><Link href="/casos" className="link-arrow">Y {open.length - 3} más <IconArrowRight size={14} /></Link></li>
                ) : null}
              </ul>
            ) : (
              <p className="empty-inline">No tienes casos en curso.</p>
            )}
          </section>

          {/* Servicios ENQORA: cuatro a la vista; el resto, si el cliente quiere verlos */}
          <section className="zone">
            <h2 className="zone-title">Servicios ENQORA</h2>
            <ul className="modules">
              {shownModules.map((m) => <ModuleTile key={m} m={m} />)}
            </ul>
            {moreModules.length ? (
              <details className="more" {...({ name: "panel-mas" } as object)}>
                <summary>Ver todos los servicios</summary>
                <ul className="modules">
                  {moreModules.map((m) => <ModuleTile key={m} m={m} />)}
                </ul>
              </details>
            ) : null}
          </section>

          {/* Detalle secundario: plegado */}
          {events.length ? (
            <details className="more" {...({ name: "panel-mas" } as object)}>
              <summary>Actividad reciente</summary>
              <ol className="feed">
                {events.map((e) => (
                  <li key={e.id}>
                    <span className="feed-dot" aria-hidden="true" />
                    <span className="feed-text">
                      <b>{e.kind === "autorizacion" ? AUTH_TEXT[e.metadata?.accion ?? ""] ?? "Autorización" : EVENT_TEXT[e.kind] ?? "Actualización"}</b>
                      <small>
                        <Link href={`/casos/${e.case_id}`}>{caseById.get(e.case_id)?.folio ?? "Caso"}</Link> · {fmtTime(e.created_at)}
                      </small>
                    </span>
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
        </>
      ) : (
        <section className="panel welcome">
          <IconBuilding size={30} />
          <h2>Tu centro de control empieza con tu empresa</h2>
          <p>Registra tu empresa o pide a su propietario que te invite. Cada empresa tiene su propia información, miembros y permisos.</p>
          <Link href="/empresas/nueva" className="btn btn-gold btn-inline"><IconPlus size={16} /> Registrar empresa</Link>
        </section>
      )}
    </div>
  );
}
