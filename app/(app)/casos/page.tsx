import Link from "next/link";
import type { Metadata } from "next";
import { IconArrowRight, IconBuilding, IconPlus } from "@/components/icons";
import { ModuleIcon } from "@/components/module-icons";
import { activeCompany } from "@/lib/companies";
import { CLOSED, MODULES, NEEDS_CLIENT, NEXT_STEP, statusLabel, statusTone, type CaseRow } from "@/lib/cases";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Casos" };

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Santiago" }).format(new Date(iso));

const VIEWS = {
  todos: "Todos",
  accion: "Necesitan tu acción",
  curso: "En curso",
  finalizados: "Finalizados",
} as const;
type View = keyof typeof VIEWS;

type Profile = { id: string; email: string; full_name: string | null };

// Casos: seguimiento de las solicitudes de la empresa activa.
export default async function CasesPage({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const sp = await searchParams;
  const view: View = sp.vista && sp.vista in VIEWS ? (sp.vista as View) : "todos";
  const { active } = await activeCompany();

  if (!active) {
    return (
      <div className="page">
        <header className="hero">
          <div className="hero-main">
            <span className="eyebrow">Casos</span>
            <h1>Tus solicitudes</h1>
          </div>
        </header>
        <section className="panel welcome">
          <IconBuilding size={30} />
          <h2>Primero registra tu empresa</h2>
          <p>Las solicitudes se asocian a una empresa para que su información quede protegida y ordenada.</p>
          <Link href="/empresas/nueva" className="btn btn-gold btn-inline"><IconPlus size={16} /> Registrar empresa</Link>
        </section>
      </div>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("cases")
    .select("id, folio, module, title, status, priority, responsible_id, updated_at, created_at")
    .eq("company_id", active.id)
    .order("updated_at", { ascending: false })
    .limit(200);
  const cases = (data ?? []) as CaseRow[];

  // Profesional responsable (RLS: el cliente ve el perfil de quien trabaja su caso).
  const respIds = [...new Set(cases.map((c) => c.responsible_id).filter((v): v is string => !!v))];
  const { data: profileRows } = respIds.length
    ? await supabase.from("profiles").select("id, email, full_name").in("id", respIds)
    : { data: [] };
  const people = new Map(((profileRows ?? []) as Profile[]).map((p) => [p.id, p.full_name || p.email]));

  const needsYou = cases.filter((c) => NEEDS_CLIENT.includes(c.status));
  const inProgress = cases.filter((c) => !CLOSED.includes(c.status) && !NEEDS_CLIENT.includes(c.status));
  const finished = cases.filter((c) => CLOSED.includes(c.status));
  const canCreate = active.role !== "viewer";
  const counts: Record<View, number> = { todos: cases.length, accion: needsYou.length, curso: inProgress.length, finalizados: finished.length };

  const groups: { key: Exclude<View, "todos">; title: string; items: CaseRow[] }[] = [
    { key: "accion", title: "Necesitan tu acción", items: needsYou },
    { key: "curso", title: "En curso", items: inProgress },
    { key: "finalizados", title: "Finalizados", items: finished },
  ];
  const shown = groups.filter((g) => (view === "todos" ? g.items.length : g.key === view));

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Casos · {active.trade_name || active.legal_name}</span>
          <h1>Tus solicitudes</h1>
          <p className="hero-lead">Cada solicitud es un caso con su equipo, documentos y seguimiento hasta verificar el resultado.</p>
        </div>
        {canCreate ? (
          <div className="hero-actions">
            <Link href="/casos/nuevo" className="btn btn-gold btn-inline"><IconPlus size={16} /> Nueva solicitud</Link>
          </div>
        ) : null}
      </header>

      {cases.length === 0 ? (
        <section className="panel welcome">
          <h2>Aún no tienes solicitudes</h2>
          <p>Cuéntanos qué necesitas: un problema contable, crear una empresa, una patente, tu marca…</p>
          {canCreate ? <Link href="/casos/nuevo" className="btn btn-gold btn-inline"><IconPlus size={16} /> Crear mi primera solicitud</Link> : null}
        </section>
      ) : (
        <>
          <nav className="segments" aria-label="Filtrar casos">
            {(Object.keys(VIEWS) as View[]).map((v) => (
              <Link key={v} href={v === "todos" ? "/casos" : `/casos?vista=${v}`} className={`segment${v === view ? " is-active" : ""}${v === "accion" && counts.accion ? " has-gold" : ""}`} aria-current={v === view ? "page" : undefined}>
                <span>{VIEWS[v]}</span>
                <b>{counts[v]}</b>
              </Link>
            ))}
          </nav>

          {shown.length ? (
            shown.map((g) => (
              // Revelación progresiva: abierto lo que pide acción; lo demás, plegado.
              <details
                key={g.key}
                className="case-group"
                {...({ name: "case-groups" } as object)}
                open={view !== "todos" || g.key === "accion" || (g.key === "curso" && !needsYou.length)}
              >
                <summary className="group-title">{g.title}<span>{g.items.length}</span></summary>
                {g.items.length ? (
                  <ul className="case-table" role="list">
                    {g.items.map((c) => (
                      <li key={c.id}>
                        <Link href={`/casos/${c.id}`} className={`case-line${NEEDS_CLIENT.includes(c.status) ? " needs-you" : ""}`}>
                          <ModuleIcon module={c.module} size="sm" />
                          <span className="cl-id mono">{c.folio}</span>
                          <span className="cl-main">
                            <b>{c.title}</b>
                            <small>{MODULES[c.module]?.name ?? c.module} · {active.trade_name || active.legal_name}</small>
                          </span>
                          <span className="cl-state">
                            <span className={`status status-${statusTone(c.status)}`}>{statusLabel(c.status)}</span>
                            <small className="case-next">{NEXT_STEP[c.status] ?? ""}</small>
                          </span>
                          <span className="cl-meta">
                            <small>Responsable</small>
                            <span>{c.responsible_id ? people.get(c.responsible_id) ?? "Equipo ENQORA" : "Por asignar"}</span>
                          </span>
                          <span className="cl-meta">
                            <small>Actualizado</small>
                            <span>{fmt(c.updated_at)}</span>
                          </span>
                          <IconArrowRight size={16} className="cl-go" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-inline">No hay casos en esta vista.</p>
                )}
              </details>
            ))
          ) : (
            <p className="empty-inline">No hay casos en esta vista.</p>
          )}
        </>
      )}
    </div>
  );
}
