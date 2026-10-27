import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { decideLearningAction } from "@/app/actions/learning";
import { Notice } from "@/components/auth-card";
import { SubmitButton } from "@/components/submit-button";
import { MODULES } from "@/lib/cases";
import { messageForCode } from "@/lib/db-errors";
import { rubroByKey } from "@/lib/rubros";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";
import { createClient, currentUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Aprendizajes y rutas" };

type Learning = {
  id: string; case_id: string | null; module: string; rubro: string | null; problem: string; route: string; outcome: string;
  worked: string | null; improve: string | null; benefits: string | null; days_to_resolve: number | null; status: string;
  created_by: string | null; approved_at: string | null; review_note: string | null; created_at: string;
};
type Metric = { servicio: string; abiertos: number; resueltos_180d: number; dias_promedio: number | null; aprendizajes: number; por_revisar: number };

const AVISOS: Record<string, string> = {
  aprendizaje_aprobado: "Aprendizaje aprobado: los agentes lo usarán en los próximos casos del servicio.",
  aprendizaje_descartado: "Aprendizaje descartado.",
};
const modName = (k: string) => (MODULES as Record<string, { name: string }>)[k]?.name.replace("ENQORA ", "") ?? k;

// Centro de Mando → Aprendizajes y rutas: cada caso resuelto mejora al siguiente.
export default async function LearningsPage({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const role = await myStaffRole();
  if (!role) notFound();
  const supervisor = isSupervisorRole(role);
  const sp = await searchParams;
  const supabase = await createClient();
  const user = await currentUser();
  const [{ data: rows }, { data: metrics }] = await Promise.all([
    supabase.from("case_learnings").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.rpc("route_metrics"),
  ]);
  const learnings = (rows ?? []) as Learning[];
  const m = ((metrics ?? []) as Metric[]).filter((x) => x.abiertos || x.resueltos_180d || x.aprendizajes || x.por_revisar);

  const item = (l: Learning) => (
    <li key={l.id} className="watch-item">
      <div className="watch-head">
        <span className={`badge ${l.status === "aprobado" ? "badge-ok" : l.status === "borrador" ? "badge-gold" : "badge-muted"}`}>
          {l.status === "aprobado" ? "Aprobado" : l.status === "borrador" ? "Por revisar" : "Descartado"}
        </span>
        <span className="badge badge-muted">{modName(l.module)}</span>
        {l.rubro ? <span className="badge badge-muted">{rubroByKey(l.rubro)?.nombre ?? l.rubro}</span> : null}
        <small>{l.days_to_resolve != null ? `Resuelto en ${l.days_to_resolve} días` : ""}{l.case_id ? <> · <Link href={`/casos/${l.case_id}#expediente`}>Ver caso</Link></> : null}</small>
      </div>
      <dl className="learning-grid">
        <div><dt>Problema</dt><dd>{l.problem}</dd></div>
        <div><dt>Ruta seguida</dt><dd>{l.route}</dd></div>
        <div><dt>Resultado</dt><dd>{l.outcome}</dd></div>
        {l.worked ? <div><dt>Qué funcionó</dt><dd>{l.worked}</dd></div> : null}
        {l.improve ? <div><dt>Qué mejorar</dt><dd>{l.improve}</dd></div> : null}
        {l.benefits ? <div><dt>Beneficios aplicados</dt><dd>{l.benefits}</dd></div> : null}
      </dl>
      {l.review_note ? <p className="muted-line">Revisión: {l.review_note}</p> : null}
      {supervisor && l.status === "borrador" ? (
        l.created_by === user?.id ? (
          <p className="muted-line">Lo escribiste tú: debe aprobarlo otra persona de la supervisión.</p>
        ) : (
          <form action={decideLearningAction} className="inline-form">
            <input type="hidden" name="learning_id" value={l.id} />
            <input name="note" className="input input-sm" maxLength={1000} placeholder="Nota (opcional)" aria-label="Nota" />
            <button name="decision" value="aprobar" className="btn btn-gold btn-inline btn-sm">Aprobar</button>
            <button name="decision" value="descartar" className="btn btn-ghost btn-inline btn-sm">Descartar</button>
          </form>
        )
      ) : null}
    </li>
  );

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Centro de Mando</span>
          <h1>Aprendizajes y rutas</h1>
          <p className="hero-lead">Cada caso resuelto deja una lección anónima. Al aprobarla, los agentes la usan en los casos siguientes del mismo servicio y rubro.</p>
        </div>
        <div className="hero-actions">
          <Link href="/mando" className="btn btn-ghost btn-inline">Volver al Centro de Mando</Link>
        </div>
      </header>
      {sp.aviso && AVISOS[sp.aviso] ? <Notice kind="ok">{AVISOS[sp.aviso]}</Notice> : null}
      {messageForCode(sp.error) ? <Notice kind="error">{messageForCode(sp.error)}</Notice> : null}

      <section className="card">
        <h2>Rendimiento de las rutas (últimos 180 días)</h2>
        {m.length ? (
          <div className="table-scroll">
            <table className="ledger-table">
              <thead><tr><th>Servicio</th><th className="num">Abiertos</th><th className="num">Resueltos</th><th className="num">Días promedio</th><th className="num">Aprendizajes</th><th className="num">Por revisar</th></tr></thead>
              <tbody>
                {m.map((x) => (
                  <tr key={x.servicio}>
                    <td>{modName(x.servicio)}</td><td className="num">{x.abiertos}</td><td className="num">{x.resueltos_180d}</td>
                    <td className="num">{x.dias_promedio ?? "—"}</td><td className="num">{x.aprendizajes}</td><td className="num">{x.por_revisar}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted-line">Aún no hay casos suficientes para medir.</p>}
      </section>

      <section className="card">
        <h2>Aprendizajes ({learnings.length})</h2>
        {learnings.length ? <ul className="watch-list">{learnings.map(item)}</ul> : (
          <p className="muted-line">Se registran desde el expediente de cada caso en verificación o cerrado.</p>
        )}
      </section>
    </div>
  );
}
