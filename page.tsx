import Link from "next/link";
import type { Metadata } from "next";
import { Notice } from "@/components/auth-card";
import { SubmitButton } from "@/components/submit-button";
import { selectCompanyAction } from "@/app/actions/companies";
import { activeCompany } from "@/lib/companies";
import { REGIMES, ROLES } from "@/lib/company-constants";
import { messageForCode } from "@/lib/db-errors";
import { formatRut } from "@/lib/rut";

export const metadata: Metadata = { title: "Empresas" };

const AVISOS: Record<string, string> = {
  saliste: "Saliste de la empresa. Ya no tienes acceso a su información.",
};

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const { companies, active } = await activeCompany();

  return (
    <div className="stack">
      <div className="page-head page-head-row">
        <div>
          <span className="eyebrow">Empresas</span>
          <h1>Tus empresas</h1>
          <p>Cada empresa tiene su propia información, miembros y permisos. Nadie ve datos de otra empresa.</p>
        </div>
        <Link href="/empresas/nueva" className="btn btn-gold btn-inline">Registrar empresa</Link>
      </div>

      {sp.aviso && AVISOS[sp.aviso] ? <Notice kind="ok">{AVISOS[sp.aviso]}</Notice> : null}
      {messageForCode(sp.error) ? <Notice kind="error">{messageForCode(sp.error)}</Notice> : null}

      {companies.length === 0 ? (
        <section className="card empty">
          <h2>Aún no tienes empresas</h2>
          <p>Registra tu primera empresa o pide a su propietario que te invite.</p>
          <Link href="/empresas/nueva" className="btn btn-gold btn-inline">Registrar mi primera empresa</Link>
        </section>
      ) : (
        <div className="grid">
          {companies.map((c) => (
            <section key={c.id} className={`card company-card${active?.id === c.id ? " is-active" : ""}`}>
              <div className="company-card-head">
                <span className="badge badge-muted">{ROLES[c.role]}</span>
                {active?.id === c.id ? <span className="badge badge-ok">Activa</span> : null}
              </div>
              <h2>{c.trade_name || c.legal_name}</h2>
              <p className="muted-line">{c.legal_name}</p>
              <div className="row"><span>RUT</span><span className="mono">{formatRut(c.rut)}</span></div>
              <div className="row"><span>Régimen</span><span>{REGIMES[c.tax_regime] ?? "Por definir"}</span></div>
              <div className="actions-row">
                <Link href={`/empresas/${c.id}`} className="btn btn-ghost btn-inline">Ver detalle</Link>
                {active?.id !== c.id ? (
                  <form action={selectCompanyAction}>
                    <input type="hidden" name="company_id" value={c.id} />
                    <input type="hidden" name="next" value="/panel" />
                    <SubmitButton variant="ghost" className="btn-inline" pendingText="Cambiando…">Usar esta empresa</SubmitButton>
                  </form>
                ) : null}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
