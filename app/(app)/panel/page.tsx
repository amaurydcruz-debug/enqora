import Link from "next/link";
import type { Metadata } from "next";
import { Notice } from "@/components/auth-card";
import { SubmitButton } from "@/components/submit-button";
import { IconAlert, IconArrowRight, IconBuilding, IconCheck, IconPlus, IconShield, IconSpark } from "@/components/icons";
import { acknowledgeAlertsAction } from "@/app/actions/security";
import { activeCompany } from "@/lib/companies";
import { REGIMES, ROLES } from "@/lib/company-constants";
import { CLOSED, MODULES, NEEDS_CLIENT, NEXT_STEP, statusLabel, statusTone, type CaseRow } from "@/lib/cases";
import { formatRut } from "@/lib/rut";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Centro de control" };

const AVISOS: Record<string, string> = {
  mfa: "Segundo factor activado. Tu cuenta quedó protegida con verificación en dos pasos.",
  clave: "Contraseña actualizada. Cerramos las demás sesiones abiertas de tu cuenta.",
};

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", timeZone: "America/Santiago" }).format(new Date(iso));
const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Santiago" }).format(
    new Date(iso),
  );

const EVENT_TEXT: Record<string, string> = {
  creado: "Solicitud creada",
  estado: "Cambio de estado",
  comentario: "Nuevo mensaje",
  documento: "Documento agregado",
  asignacion: "Equipo asignado",
  tarea: "Tarea actualizada",
  autorizacion: "Autorización",
};
const AUTH_TEXT: Record<string, string> = {
  solicitada: "Autorización solicitada",
  autorizada: "Autorización otorgada",
  rechazada: "Autorización rechazada",
  revocada: "Autorización revocada",
  anulada: "Solicitud de autorización anulada",
};

type Task = { id: string; case_id: string; title: string; status: string; due_date: string | null };
type Auth = { id: string; case_id: string; title: string; valid_until: string | null };
type Ev = { id: number; case_id: string; kind: string; body: string | null; metadata: Record<string, string>; created_at: string };

// Centro de control: el centro de operaciones de la empresa del cliente.
export default async function PanelPage({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string }>;
}) {
  const { aviso } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { companies, active } = await activeCompany();

  const { count: pendingAlerts } = await supabase
    .from("security_events")
    .select("id", { count: "exact", head: true })
    .eq("event", "nuevo_dispositivo")
    .is("acknowledged_at", null);

  // Datos reales de la empresa activa (RLS: solo lo que el usuario puede ver).
  const { data: caseRows } = active
    ? await supabase
        .from("cases")
        .select("id, folio, module, title, status, updated_at, created_at")
        .eq("company_id", active.id)
        .order("updated_at", { ascending: false })
        .limit(50)
    : { data: [] };
  const cases = (caseRows ?? []) as CaseRow[];
  const caseIds = cases.map((c) => c.id);
  const caseById = new Map(cases.map((c) => [c.id, c]));

  const [authRes, taskRes, evRes] = active && caseIds.length
    ? await Promise.all([
        supabase
          .from("client_authorizations")
          .select("id, case_id, title, valid_until")
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
          .select("id, case_id, kind, body, metadata, created_at")
          .in("case_id", caseIds)
          .eq("visibility", "cliente")
          .order("created_at", { ascending: false })
          .limit(6),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  const pendingAuth = (authRes.data ?? []) as Auth[];
  const myTasks = (taskRes.data ?? []) as Task[];
  const events = (evRes.data ?? []) as Ev[];

  const open = cases.filter((c) => !CLOSED.includes(c.status));
  const waitingYou = open.filter((c) => NEEDS_CLIENT.includes(c.status));
  const finished = cases.filter((c) => c.status === "cerrado");
  const canAuthorize = !!active && ["owner", "admin"].includes(active.role);
  const canCreate = !!active && active.role !== "viewer";
  const pendingCount = pendingAuth.length + myTasks.length;

  return (
    <div className="page">
      {aviso && AVISOS[aviso] ? <Notice kind="ok">{AVISOS[aviso]}</Notice> : null}

      {/* 1 · Estado general de la empresa */}
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Centro de control</span>
          <h1>{active ? active.trade_name || active.legal_name : "Bienvenido a ENQORA"}</h1>
          {active ? (
            <dl className="hero-facts">
              <div><dt>RUT</dt><dd className="mono">{formatRut(active.rut)}</dd></div>
              <div><dt>Régimen</dt><dd>{REGIMES[active.tax_regime] ?? "Por definir"}</dd></div>
              <div><dt>Tu rol</dt><dd>{ROLES[active.role]}</dd></div>
              <div><dt>Estado</dt><dd className={active.rut_verified ? "text-ok" : "text-warn"}>{active.rut_verified ? "RUT verificado" : "RUT por verificar"}</dd></div>
            </dl>
          ) : (
            <p className="hero-lead">{user?.email} · Registra tu empresa para activar tu centro de control.</p>
          )}
        </div>
        <div className="hero-actions">
          {active ? (
            <>
              {canCreate ? <Link href="/casos/nuevo" className="btn btn-gold btn-inline"><IconPlus size={16} /> Nueva solicitud</Link> : null}
              <Link href="/casos" className="btn btn-ghost btn-inline">Ver casos</Link>
            </>
          ) : (
            <Link href="/empresas/nueva" className="btn btn-gold btn-inline"><IconPlus size={16} /> Registrar empresa</Link>
          )}
        </div>
      </header>

      {active ? (
        <div className="kpis" role="list" aria-label="Resumen">
          <div className="kpi" role="listitem"><span>Casos en curso</span><b>{open.length}</b></div>
          <div className={`kpi${waitingYou.length ? " kpi-gold" : ""}`} role="listitem"><span>Esperan tu acción</span><b>{waitingYou.length}</b></div>
          <div className={`kpi${pendingAuth.length ? " kpi-gold" : ""}`} role="listitem"><span>Autorizaciones pendientes</span><b>{pendingAuth.length}</b></div>
          <div className="kpi" role="listitem"><span>Finalizados</span><b>{finished.length}</b></div>
        </div>
      ) : null}

      {/* 4 · Alertas importantes */}
      {pendingAlerts ? (
        <div className="alert alert-warn alert-row" role="alert">
          <IconAlert size={22} />
          <div>
            <b>Detectamos un ingreso desde un dispositivo nuevo</b>
            <p>Si no fuiste tú, revisa tu seguridad ahora: cambia tu contraseña y cierra las demás sesiones.</p>
          </div>
          <div className="actions-inline">
            <Link href="/seguridad" className="btn btn-gold btn-inline btn-sm">Revisar</Link>
            <form action={acknowledgeAlertsAction}>
              <input type="hidden" name="next" value="/panel" />
              <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Fui yo</SubmitButton>
            </form>
          </div>
        </div>
      ) : null}

      {active ? (
        <div className="control-grid">
          <div className="control-main">
            {/* 2 · Casos activos */}
            <section className="panel">
              <div className="panel-head">
                <h2>Casos activos</h2>
                <Link href="/casos" className="link-arrow">Todos los casos <IconArrowRight size={15} /></Link>
              </div>
              {open.length ? (
                <ul className="case-rows">
                  {open.slice(0, 5).map((c) => (
                    <li key={c.id}>
                      <Link href={`/casos/${c.id}`} className={`case-row${NEEDS_CLIENT.includes(c.status) ? " needs-you" : ""}`}>
                        <span className="case-row-main">
                          <span className="case-row-top">
                            <span className="mono case-folio">{c.folio}</span>
                            <span className="muted-line">{MODULES[c.module]?.name ?? c.module}</span>
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
                </ul>
              ) : (
                <div className="empty-inline">
                  <p>No tienes casos en curso.</p>
                  {canCreate ? <Link href="/casos/nuevo" className="link-arrow">Crear una solicitud <IconArrowRight size={15} /></Link> : null}
                </div>
              )}
            </section>

            {/* 3 · Acciones pendientes */}
            <section className="panel">
              <div className="panel-head">
                <h2>Acciones pendientes {pendingCount ? <span className="count">{pendingCount}</span> : null}</h2>
              </div>
              {pendingCount ? (
                <ul className="action-list">
                  {pendingAuth.map((a) => (
                    <li key={a.id}>
                      <span className="action-mark action-gold"><IconShield size={16} /></span>
                      <span className="action-text">
                        <b>Autorización: {a.title}</b>
                        <small>
                          {caseById.get(a.case_id)?.folio ?? ""} ·{" "}
                          {canAuthorize ? "Decide tú o un Administrador de la empresa" : "La decide el Propietario o un Administrador"}
                        </small>
                      </span>
                      <Link href={`/casos/${a.case_id}#autorizaciones`} className="btn btn-ghost btn-inline btn-sm">Revisar</Link>
                    </li>
                  ))}
                  {myTasks.map((t) => (
                    <li key={t.id}>
                      <span className="action-mark"><IconCheck size={16} /></span>
                      <span className="action-text">
                        <b>{t.title}</b>
                        <small>
                          {caseById.get(t.case_id)?.folio ?? ""}
                          {t.due_date ? ` · vence ${fmt(`${t.due_date}T12:00:00Z`)}` : ""}
                        </small>
                      </span>
                      <Link href={`/casos/${t.case_id}#tareas`} className="btn btn-ghost btn-inline btn-sm">Abrir</Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-inline">Nada pendiente de tu parte. Te avisaremos aquí cuando ENQORA necesite algo.</p>
              )}
            </section>
          </div>

          <aside className="control-side">
            {/* Protección de la cuenta */}
            <section className="panel panel-quiet">
              <h2 className="panel-title"><IconShield size={18} /> Protección de la cuenta</h2>
              <ul className="check-list">
                <li className="is-ok"><span>Correo verificado</span><IconCheck size={16} /></li>
                <li className="is-ok"><span>Verificación en dos pasos</span><IconCheck size={16} /></li>
                <li className={pendingAlerts ? "is-warn" : "is-ok"}>
                  <span>{pendingAlerts ? `${pendingAlerts} alerta(s) por revisar` : "Sin alertas pendientes"}</span>
                  {pendingAlerts ? <IconAlert size={16} /> : <IconCheck size={16} />}
                </li>
              </ul>
              <Link href="/seguridad" className="link-arrow">Centro de seguridad <IconArrowRight size={15} /></Link>
            </section>

            {/* 5 · Actividad reciente */}
            <section className="panel panel-quiet">
              <h2 className="panel-title">Actividad reciente</h2>
              {events.length ? (
                <ol className="feed">
                  {events.map((e) => (
                    <li key={e.id}>
                      <span className="feed-dot" aria-hidden="true" />
                      <span className="feed-text">
                        <b>
                          {e.kind === "estado"
                            ? statusLabel(e.metadata?.a ?? "")
                            : e.kind === "autorizacion"
                              ? AUTH_TEXT[e.metadata?.accion ?? ""] ?? "Autorización"
                              : EVENT_TEXT[e.kind] ?? "Actualización"}
                        </b>
                        <small>
                          <Link href={`/casos/${e.case_id}`}>{caseById.get(e.case_id)?.folio ?? "Caso"}</Link> · {fmtTime(e.created_at)}
                        </small>
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="empty-inline">Sin actividad todavía.</p>
              )}
            </section>

            {/* 6 · Accesos rápidos */}
            <section className="panel panel-quiet">
              <h2 className="panel-title">Accesos rápidos</h2>
              <nav className="quick-links" aria-label="Accesos rápidos">
                {canCreate ? <Link href="/casos/nuevo"><IconPlus size={16} /> Nueva solicitud</Link> : null}
                <Link href={`/empresas/${active.id}`}><IconBuilding size={16} /> Administrar empresa</Link>
                {companies.length > 1 ? <Link href="/empresas"><IconBuilding size={16} /> Cambiar de empresa ({companies.length})</Link> : null}
                <Link href="/seguridad#clave"><IconShield size={16} /> Cambiar contraseña</Link>
              </nav>
              <p className="soon"><IconSpark size={15} /> Asistente contable ENQORA: próximamente.</p>
            </section>
          </aside>
        </div>
      ) : (
        <section className="panel welcome">
          <IconBuilding size={30} />
          <h2>Tu centro de operaciones empieza con tu empresa</h2>
          <p>Registra tu empresa o pide a su propietario que te invite. Cada empresa tiene su propia información, miembros y permisos.</p>
          <Link href="/empresas/nueva" className="btn btn-gold btn-inline"><IconPlus size={16} /> Registrar empresa</Link>
        </section>
      )}
    </div>
  );
}
