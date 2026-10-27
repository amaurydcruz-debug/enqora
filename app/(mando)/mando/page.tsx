import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Emblem } from "@/components/emblems";
import { IconArrowRight, IconUsers } from "@/components/icons";
import { ModuleIcon } from "@/components/module-icons";
import { CLOSED, MODULES, PRIORITIES, STAFF_ROLES, statusLabel, statusTone, type CaseRow } from "@/lib/cases";
import { APPROVAL_KINDS, APPROVER_ROLES, type InboxItem } from "@/lib/approvals";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";
import { createClient, currentUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Centro de Mando" };

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: "America/Santiago" }).format(new Date(iso));

// Bandejas del Centro de Mando. Cada perfil ve las que le corresponden.
const VIEWS = {
  aprobaciones: "Por aprobar",
  mios: "Mis casos",
  revision: "En revisión profesional",
  diagnosticos: "Diagnósticos gratuitos",
  cliente: "Esperando al cliente",
  activos: "Todos los activos",
  sin_asignar: "Sin responsable",
  cerrados: "Finalizados",
} as const;
type View = keyof typeof VIEWS;

const PRIORITY_ORDER: Record<string, number> = { urgente: 0, alta: 1, normal: 2, baja: 3 };

// Centro de Mando: vista operativa del equipo ENQORA, con bandejas por perfil.
export default async function CommandCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string }>;
}) {
  const role = await myStaffRole();
  if (!role) notFound();
  const supervisor = isSupervisorRole(role);
  const canApprove = role !== "ai_agent";
  const sp = await searchParams;

  const supabase = await createClient();
  const user = await currentUser();

  // RLS: el equipo solo recibe los casos asignados; la supervisión, todos.
  // La bandeja de aprobaciones la calcula la base según el perfil (cuatro ojos incluidos).
  const [{ data: caseRows }, { data: myAssign }, { data: inboxRows }] = await Promise.all([
    supabase.from("cases").select("*").order("updated_at", { ascending: false }).limit(300),
    supabase.from("case_assignments").select("case_id").eq("user_id", user?.id ?? ""),
    canApprove ? supabase.rpc("approval_inbox") : Promise.resolve({ data: [] }),
  ]);
  const inbox = (inboxRows ?? []) as InboxItem[];

  const available = (Object.keys(VIEWS) as View[]).filter((v) => {
    if (v === "aprobaciones") return canApprove;
    if (v === "activos" || v === "sin_asignar") return supervisor;
    return true;
  });
  const fallback: View = inbox.length && canApprove ? "aprobaciones" : supervisor ? "activos" : "mios";
  const view: View = sp.vista && available.includes(sp.vista as View) ? (sp.vista as View) : fallback;
  const all = (caseRows ?? []) as CaseRow[];
  const mine = new Set(((myAssign ?? []) as { case_id: string }[]).map((a) => a.case_id));

  const companyIds = [...new Set([...all.map((c) => c.company_id), ...inbox.map((a) => a.company_id)])];
  const { data: companyRows } = companyIds.length
    ? await supabase.from("companies").select("id, legal_name, trade_name").in("id", companyIds)
    : { data: [] };
  const companies = new Map(
    ((companyRows ?? []) as { id: string; legal_name: string; trade_name: string | null }[]).map((x) => [
      x.id,
      x.trade_name || x.legal_name,
    ]),
  );

  const filtered = all
    .filter((c) => {
      if (view === "mios") return mine.has(c.id) && !CLOSED.includes(c.status);
      if (view === "revision") return c.status === "revision_profesional";
      if (view === "diagnosticos") return (c as { origin?: string }).origin === "diagnostico_gratuito" && !CLOSED.includes(c.status);
      if (view === "cliente") return ["esperando_cliente", "autorizacion_cliente"].includes(c.status);
      if (view === "sin_asignar") return !c.responsible_id && !CLOSED.includes(c.status);
      if (view === "cerrados") return CLOSED.includes(c.status);
      return !CLOSED.includes(c.status);
    })
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9));

  const today = new Date().toISOString().slice(0, 10);
  const stats = {
    activos: all.filter((c) => !CLOSED.includes(c.status)).length,
    sinAsignar: all.filter((c) => !c.responsible_id && !CLOSED.includes(c.status)).length,
    cliente: all.filter((c) => ["esperando_cliente", "autorizacion_cliente"].includes(c.status)).length,
    vencidos: all.filter((c) => c.due_date && c.due_date < today && !CLOSED.includes(c.status)).length,
  };

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Centro de Mando · {STAFF_ROLES[role]}</span>
          <h1>Casos ENQORA</h1>
          <p className="hero-lead">{supervisor ? "Supervisión de todos los casos, asignaciones y plazos." : "Tus casos asignados."}</p>
        </div>
        <div className="hero-actions">
          <Link href="/mando/catalogo" className="btn btn-ghost btn-inline">Catálogo y precios</Link>
          <Link href="/mando/planes" className="btn btn-ghost btn-inline">Planes</Link>
          <Link href="/mando/mandatos" className="btn btn-ghost btn-inline">Mandatos</Link>
          <Link href="/mando/datos-publicos" className="btn btn-ghost btn-inline">Datos públicos</Link>
          <Link href="/mando/aprendizajes" className="btn btn-ghost btn-inline">Aprendizajes y rutas</Link>
          <Link href="/mando/vigilancia" className="btn btn-ghost btn-inline">Vigilancia normativa</Link>
          {supervisor ? <Link href="/mando/cobros" className="btn btn-ghost btn-inline">Cobros y pagos</Link> : null}
          {supervisor ? <Link href="/mando/estado" className="btn btn-ghost btn-inline">Estado del sistema</Link> : null}
          {role === "enqora_admin" ? (
            <Link href="/mando/equipo" className="btn btn-ghost btn-inline"><IconUsers size={18} /> Equipo ENQORA</Link>
          ) : null}
        </div>
      </header>

      <div className="kpis kpis-mando">
        {canApprove ? (
          <div className={`kpi${inbox.length ? " kpi-gold" : ""}`}><span>Por aprobar</span><b>{inbox.length}</b></div>
        ) : null}
        <div className="kpi"><span>Activos</span><b>{stats.activos}</b></div>
        {supervisor ? <div className={`kpi${stats.sinAsignar ? " kpi-gold" : ""}`}><span>Sin responsable</span><b>{stats.sinAsignar}</b></div> : null}
        <div className="kpi"><span>Esperando al cliente</span><b>{stats.cliente}</b></div>
        <div className={`kpi${stats.vencidos ? " kpi-risk" : ""}`}><span>Vencidos</span><b>{stats.vencidos}</b></div>
      </div>

      <nav className="segments" aria-label="Bandejas">
        {available.map((v) => (
          <Link key={v} href={`/mando?vista=${v}`} className={`segment${v === view ? " is-active" : ""}${v === "aprobaciones" && inbox.length ? " has-gold" : ""}`} aria-current={v === view ? "page" : undefined}>
            <span>{VIEWS[v]}</span>
            {v === "aprobaciones" && inbox.length ? <b>{inbox.length}</b> : null}
          </Link>
        ))}
      </nav>

      {view === "aprobaciones" ? (
        inbox.length ? (
          <ul className="case-table" role="list">
            {inbox.map((a) => (
              <li key={a.id}>
                <Link href={`/casos/${a.case_id}#aprobaciones`} className="case-line inbox-line needs-you">
                  <Emblem name="control" size="sm" />
                  <span className="cl-id mono">{a.folio}</span>
                  <span className="cl-main">
                    <b>{a.title}</b>
                    <small>
                      {APPROVAL_KINDS[a.kind]?.label ?? a.kind} · {a.case_title}
                      {a.own_request ? " · tu propia solicitud (supervisión)" : ""}
                    </small>
                  </span>
                  <span className="cl-meta"><small>Empresa</small><span>{companies.get(a.company_id) ?? "—"}</span></span>
                  <span className="cl-meta"><small>Decide</small><span>{APPROVER_ROLES[a.approver_role] ?? a.approver_role}</span></span>
                  <span className="cl-meta"><small>Solicitada</small><span>{fmt(a.requested_at)}</span></span>
                  <IconArrowRight size={16} className="cl-go" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-inline">No tienes aprobaciones pendientes.</p>
        )
      ) : filtered.length ? (
        <ul className="case-table" role="list">
          {filtered.map((c) => {
            const late = !!c.due_date && c.due_date < today && !CLOSED.includes(c.status);
            return (
              <li key={c.id}>
                <Link href={`/casos/${c.id}`} className={`case-line${c.priority === "urgente" || late ? " needs-you" : ""}`}>
                  <ModuleIcon module={c.module} size="sm" />
                  <span className="cl-id mono">{c.folio}</span>
                  <span className="cl-main">
                    <b>{c.title}</b>
                    <small>
                      {(c as { origin?: string }).origin === "diagnostico_gratuito" ? "Diagnóstico gratuito · " : ""}
                      {MODULES[c.module]?.name ?? c.module} · {companies.get(c.company_id) ?? "—"}
                    </small>
                  </span>
                  <span className="cl-state">
                    <span className={`status status-${statusTone(c.status)}`}>{statusLabel(c.status)}</span>
                    <small className={`case-next prio-${c.priority}`}>Prioridad {PRIORITIES[c.priority]?.toLowerCase()}</small>
                  </span>
                  <span className="cl-meta"><small>Actualizado</small><span>{fmt(c.updated_at)}</span></span>
                  <span className={`cl-meta${late ? " is-late" : ""}`}><small>Vence</small><span>{c.due_date ? fmt(`${c.due_date}T12:00:00Z`) : "—"}</span></span>
                  <IconArrowRight size={16} className="cl-go" />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="empty-inline">No hay casos en esta vista.</p>
      )}
    </div>
  );
}
