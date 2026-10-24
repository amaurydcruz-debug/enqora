/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { activeCompany } from "@/lib/companies";
import { SignOutLink } from "@/components/sign-out-link";

// Área privada. El middleware ya exige sesión con segundo factor (aal2);
// aquí se comprueba de nuevo en el servidor como segunda barrera.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/ingresar");

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") redirect(aal?.nextLevel === "aal2" ? "/mfa/verificar" : "/mfa/configurar");

  const { active } = await activeCompany();

  return (
    <>
      <header className="app-top">
        <div className="app-top-left">
          <Link href="/panel" className="brand-mark">
            <img src="/brand/enqora-icon.png" alt="" width={32} height={32} />
            <b>ENQ<em>ORA</em></b>
          </Link>
          <Link href="/empresas" className="company-chip" title="Cambiar de empresa">
            {active ? active.trade_name || active.legal_name : "Sin empresa"}
          </Link>
        </div>
        <nav className="app-nav">
          <Link href="/panel">Centro de control</Link>
          <Link href="/empresas">Empresas</Link>
          <Link href="/seguridad">Seguridad</Link>
          <SignOutLink label="Salir" />
        </nav>
      </header>
      <main className="app-main">{children}</main>
    </>
  );
}
