import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IconUsers } from "@/components/icons";
import { CLOSED, MODULES, PRIORITIES, STAFF_ROLES, statusClass, statusLabel, type CaseRow } from "@/lib/cases";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Centro de Mando" };

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: "America/Santiago" }).format(new Date(iso));

const VIEWS = {
  mios: "Mis casos",
  activos: "Todos los activos",
  sin_asignar: "Sin responsable",
  cerrados: "Finalizados",
} as const;
type View = keyof typeof VIEWS;

const PRIORITY_ORDER: Record<string, number> = { urgente: 0, alta: 1, normal: 2, baja: 3 };

// Centro de Mando: vista operativa del equipo ENQORA.
export default async function CommandCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string }>;
}) {
  const role = await myStaffRole();
  if (!role) notFound();
  const supervisor = isSupervisorRole(role);
  const sp = await searchParams;
  const view: View = sp.vista && sp.vista in VIEWS ? (sp.vista as View) : supervisor ? "activos" : "mios";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // RLS: el equipo solo recibe los casos asignados; la supervisión, todos.
  const [{ data: caseRows }, { data: myAssign }] = await Promise.all([
    supabase.from("cases").select("*").order("updated_at", { ascending: false }).limit(300),
    supabase.from("case_assignments").select("case_id").eq("user_id", user?.id ?? ""),
  ]);
  const all = (caseRows ?? []) as CaseRow[];
  const mine = new Set(((myAssign ?? []) as { case_id: string }[]).map((a) => a.case_id));

  const companyIds = [...new Set(all.map((c) => c.company_id))];
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
        <div className="stat"><span>Activos</span><b>{stats.activos}</b></div>
        {supervisor ? <div className="stat"><span>Sin responsable</span><b>{stats.sinAsignar}</b></div> : null}
        <div className="stat"><span>Esperando al cliente</span><b>{stats.cliente}</b></div>
        <div className={`stat${stats.vencidos ? " stat-warn" : ""}`}><span>Vencidos</span><b>{stats.vencidos}</b></div>
      </div>

      <nav className="tabs" aria-label="Vistas">
        {(Object.keys(VIEWS) as View[])
          .filter((v) => supervisor || v !== "sin_asignar")
          .map((v) => (
            <Link key={v} href={`/mando?vista=${v}`} className={`tab${v === view ? " is-active" : ""}`} aria-current={v === view ? "page" : undefined}>
              {VIEWS[v]}
            </Link>
          ))}
      </nav>

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
    </div>
  );
}
