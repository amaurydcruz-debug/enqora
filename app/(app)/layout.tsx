import Link from "next/link";
import type { Metadata } from "next";
import { Notice } from "@/components/auth-card";
import { SubmitButton } from "@/components/submit-button";
import { IconArrowRight, IconBuilding, IconPlus } from "@/components/icons";
import { selectCompanyAction } from "@/app/actions/companies";
import { activeCompany } from "@/lib/companies";
import { REGIMES, ROLES } from "@/lib/company-constants";
import { messageForCode } from "@/lib/db-errors";
import { formatRut } from "@/lib/rut";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Empresas" };

const AVISOS: Record<string, string> = {
  saliste: "Saliste de la empresa. Ya no tienes acceso a su información.",
};

const initials = (name: string) =>
  name
    .replace(/\b(SpA|Ltda\.?|S\.A\.|EIRL|Limitada)\b/gi, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "E";

type Member = { company_id: string; user_id: string; role: string };
type Profile = { id: string; email: string; full_name: string | null };

// Empresas: una ficha empresarial por cada empresa a la que pertenece el usuario.
export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const { companies, active } = await activeCompany();

  // Propietarios de cada empresa (RLS: los miembros ven a los miembros de su empresa).
  const supabase = await createClient();
  const ids = companies.map((c) => c.id);
  const { data: memberRows } = ids.length
    ? await supabase.from("company_members").select("company_id, user_id, role").in("company_id", ids).eq("role", "owner")
    : { data: [] };
  const owners = (memberRows ?? []) as Member[];
  const ownerIds = [...new Set(owners.map((m) => m.user_id))];
  const { data: profileRows } = ownerIds.length
    ? await supabase.from("profiles").select("id, email, full_name").in("id", ownerIds)
    : { data: [] };
  const names = new Map(((profileRows ?? []) as Profile[]).map((p) => [p.id, p.full_name || p.email]));
  const ownerOf = (companyId: string) =>
    owners
      .filter((m) => m.company_id === companyId)
      .map((m) => names.get(m.user_id) ?? "Propietario")
      .join(", ") || "—";

  // La empresa activa primero.
  const ordered = [...companies].sort((a, b) => (a.id === active?.id ? -1 : b.id === active?.id ? 1 : 0));

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Empresas</span>
          <h1>Tus empresas</h1>
          <p className="hero-lead">Cada empresa tiene su propia información, miembros y permisos. Nadie ve datos de otra empresa.</p>
        </div>
        <div className="hero-actions">
          <Link href="/empresas/nueva" className="btn btn-gold btn-inline"><IconPlus size={16} /> Registrar empresa</Link>
        </div>
      </header>

      {sp.aviso && AVISOS[sp.aviso] ? <Notice kind="ok">{AVISOS[sp.aviso]}</Notice> : null}
      {messageForCode(sp.error) ? <Notice kind="error">{messageForCode(sp.error)}</Notice> : null}

      {companies.length === 0 ? (
        <section className="panel welcome">
          <IconBuilding size={30} />
          <h2>Aún no tienes empresas</h2>
          <p>Registra tu primera empresa o pide a su propietario que te invite.</p>
          <Link href="/empresas/nueva" className="btn btn-gold btn-inline"><IconPlus size={16} /> Registrar mi primera empresa</Link>
        </section>
      ) : (
        <ul className="company-sheets" role="list">
          {ordered.map((c) => {
            const isActive = active?.id === c.id;
            const name = c.trade_name || c.legal_name;
            return (
              <li key={c.id} className={`company-sheet${isActive ? " is-active" : ""}`}>
                <div className="sheet-id">
                  <span className="monogram monogram-lg" aria-hidden="true">{initials(name)}</span>
                  <div className="sheet-name">
                    <span className="sheet-tags">
                      {isActive ? <span className="status status-ok">Empresa activa</span> : null}
                      <span className="tag">{ROLES[c.role]}</span>
                    </span>
                    <h2>{name}</h2>
                    {c.trade_name ? <span className="muted-line">{c.legal_name}</span> : null}
                  </div>
                </div>

                <dl className="sheet-facts">
                  <div><dt>RUT</dt><dd className="mono">{formatRut(c.rut)}</dd></div>
                  <div><dt>Régimen tributario</dt><dd>{REGIMES[c.tax_regime] ?? "Por definir"}</dd></div>
                  <div>
                    <dt>Estado</dt>
                    <dd className={c.rut_verified ? "text-ok" : "text-warn"}>{c.rut_verified ? "RUT verificado" : "RUT por verificar"}</dd>
                  </div>
                  <div><dt>Propietario</dt><dd>{ownerOf(c.id)}</dd></div>
                </dl>

                <div className="sheet-actions">
                  <Link href={`/empresas/${c.id}`} className="btn btn-ghost btn-inline btn-sm">Ver ficha <IconArrowRight size={15} /></Link>
                  {!isActive ? (
                    <form action={selectCompanyAction}>
                      <input type="hidden" name="company_id" value={c.id} />
                      <input type="hidden" name="next" value="/panel" />
                      <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="Cambiando…">Usar esta empresa</SubmitButton>
                    </form>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
