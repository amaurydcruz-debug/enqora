import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IconUsers } from "@/components/icons";
import { CLOSED, MODULES, PRIORITIES, STAFF_ROLES, statusClass, statusLabel, type CaseRow } from "@/lib/cases";
import { APPROVAL_KINDS, APPROVER_ROLES, type InboxItem } from "@/lib/approvals";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Centro de Mando" };

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: "America/Santiago" }).format(new Date(iso));

// Bandejas del Centro de Mando. Cada perfil ve las que le corresponden.
const VIEWS = {
  aprobaciones: "Por aprobar",
  mios: "Mis casos",
  revision: "En revisión profesional",
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
    <div className="stack">
      <div className="page-head page-head-row">
        <div>
          <span className="eyebrow">Centro de Mando · {STAFF_ROLES[role]}</span>
          <h1>Casos ENQORA</h1>
          <p>{supervisor ? "Supervisión de todos los casos, asignaciones y plazos." : "Tus casos asignados."}</p>
        </div>
        {role === "enqora_admin" ? (
          <Link href="/mando/equipo" className="btn btn-ghost btn-inline"><IconUsers size={18} /> Equipo ENQORA</Link>
        ) : null}
      </div>

      <div className="stat-row">
        {canApprove ? (
          <div className={`stat${inbox.length ? " stat-warn" : ""}`}><span>Por aprobar</span><b>{inbox.length}</b></div>
        ) : null}
        <div className="stat"><span>Activos</span><b>{stats.activos}</b></div>
        {supervisor ? <div className="stat"><span>Sin responsable</span><b>{stats.sinAsignar}</b></div> : null}
        <div className="stat"><span>Esperando al cliente</span><b>{stats.cliente}</b></div>
        <div className={`stat${stats.vencidos ? " stat-warn" : ""}`}><span>Vencidos</span><b>{stats.vencidos}</b></div>
      </div>

      <nav className="tabs" aria-label="Vistas">
        {available.map((v) => (
          <Link key={v} href={`/mando?vista=${v}`} className={`tab${v === view ? " is-active" : ""}`} aria-current={v === view ? "page" : undefined}>
            {VIEWS[v]}
            {v === "aprobaciones" && inbox.length ? <span className="tab-count">{inbox.length}</span> : null}
          </Link>
        ))}
      </nav>

      {view === "aprobaciones" ? (
        <section className="card">
          {inbox.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Folio</th>
                    <th>Solicitud</th>
                    <th>Empresa</th>
                    <th>Decide</th>
                    <th>Solicitada</th>
                    <th aria-label="Acción" />
                  </tr>
                </thead>
                <tbody>
                  {inbox.map((a) => (
                    <tr key={a.id}>
                      <td className="mono"><Link href={`/casos/${a.case_id}#aprobaciones`}>{a.folio}</Link></td>
                      <td>
                        <Link href={`/casos/${a.case_id}#aprobaciones`}>{a.title}</Link>
                        <span className="muted-line block">
                          {APPROVAL_KINDS[a.kind]?.label ?? a.kind} · {a.case_title}
                          {a.own_request ? " · tu propia solicitud (supervisión)" : ""}
                        </span>
                      </td>
                      <td>{companies.get(a.company_id) ?? "—"}</td>
                      <td>{APPROVER_ROLES[a.approver_role] ?? a.approver_role}</td>
                      <td>{fmt(a.requested_at)}</td>
                      <td><Link href={`/casos/${a.case_id}#aprobaciones`} className="btn btn-gold btn-inline btn-sm">Revisar</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted-line">No tienes aprobaciones pendientes.</p>
          )}
        </section>
      ) : (
      <section className="card">
        {filtered.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Caso</th>
                  <th>Empresa</th>
                  <th>Estado</th>
                  <th>Prioridad</th>
                  <th>Vence</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id}>
                    <td className="mono"><Link href={`/casos/${c.id}`}>{c.folio}</Link></td>
                    <td>
                      <Link href={`/casos/${c.id}`}>{c.title}</Link>
                      <span className="muted-line block">{MODULES[c.module]?.name ?? c.module} · {fmt(c.updated_at)}</span>
                    </td>
                    <td>{companies.get(c.company_id) ?? "—"}</td>
                    <td><span className={statusClass(c.status)}>{statusLabel(c.status)}</span></td>
                    <td>
                      <span className={`badge ${c.priority === "urgente" ? "badge-risk" : c.priority === "alta" ? "badge-warn" : "badge-muted"}`}>
                        {PRIORITIES[c.priority]}
                      </span>
                    </td>
                    <td className={c.due_date && c.due_date < today && !CLOSED.includes(c.status) ? "text-warn" : undefined}>
                      {c.due_date ? fmt(`${c.due_date}T12:00:00Z`) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted-line">No hay casos en esta vista.</p>
        )}
      </section>
      )}
    </div>
  );
}
