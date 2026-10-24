import Link from "next/link";
import type { Metadata } from "next";
import { IconBuilding } from "@/components/icons";
import { activeCompany } from "@/lib/companies";
import { CLOSED, MODULES, statusClass, statusLabel, type CaseRow } from "@/lib/cases";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mis casos" };

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: "America/Santiago" }).format(new Date(iso));

export default async function CasesPage() {
  const { active } = await activeCompany();

  if (!active) {
    return (
      <div className="stack">
        <div className="page-head">
          <span className="eyebrow">Casos</span>
          <h1>Tus solicitudes</h1>
        </div>
        <section className="card empty">
          <IconBuilding size={28} />
          <h2>Primero registra tu empresa</h2>
          <p>Las solicitudes se asocian a una empresa para que su información quede protegida y ordenada.</p>
          <Link href="/empresas/nueva" className="btn btn-gold btn-inline">Registrar empresa</Link>
        </section>
      </div>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("cases")
    .select("id, folio, module, title, status, priority, updated_at, created_at")
    .eq("company_id", active.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const cases = (data ?? []) as CaseRow[];
  const open = cases.filter((c) => !CLOSED.includes(c.status));
  const done = cases.filter((c) => CLOSED.includes(c.status));
  const canCreate = active.role !== "viewer";

  const List = ({ items }: { items: CaseRow[] }) => (
    <ul className="case-list">
      {items.map((c) => (
        <li key={c.id}>
          <Link href={`/casos/${c.id}`} className="case-item">
            <span className="case-folio mono">{c.folio}</span>
            <span className="case-main">
              <b>{c.title}</b>
              <span className="muted-line">{MODULES[c.module]?.name ?? c.module} · actualizado {fmt(c.updated_at)}</span>
            </span>
            <span className={statusClass(c.status)}>{statusLabel(c.status)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="stack">
      <div className="page-head page-head-row">
        <div>
          <span className="eyebrow">Casos · {active.trade_name || active.legal_name}</span>
          <h1>Tus solicitudes</h1>
          <p>Cada solicitud es un caso con su equipo, documentos y seguimiento hasta verificar el resultado.</p>
        </div>
        {canCreate ? <Link href="/casos/nuevo" className="btn btn-gold btn-inline">Nueva solicitud</Link> : null}
      </div>

      {cases.length === 0 ? (
        <section className="card empty">
          <h2>Aún no tienes solicitudes</h2>
          <p>Cuéntanos qué necesitas: un problema contable, crear una empresa, una patente, tu marca…</p>
          {canCreate ? <Link href="/casos/nuevo" className="btn btn-gold btn-inline">Crear mi primera solicitud</Link> : null}
        </section>
      ) : (
        <>
          <section className="card">
            <h2>En curso ({open.length})</h2>
            {open.length ? <List items={open} /> : <p className="muted-line">No tienes casos en curso.</p>}
          </section>
          {done.length ? (
            <section className="card">
              <h2>Finalizados ({done.length})</h2>
              <List items={done} />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
