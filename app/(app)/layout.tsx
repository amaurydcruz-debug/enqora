/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { activeCompany } from "@/lib/companies";
import { SignOutLink } from "@/components/sign-out-link";
import { IconBuilding, IconControl, IconShield } from "@/components/icons";

// Área privada. El middleware ya exige sesión con segundo factor (aal2);
// aquí se comprueba de nuevo en el servidor como segunda barrera.
// Navegación lateral en escritorio; barra desplazable bajo el encabezado en teléfono.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/ingresar");

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") redirect(aal?.nextLevel === "aal2" ? "/mfa/verificar" : "/mfa/configurar");

  const [{ active }, { count: alerts }] = await Promise.all([
    activeCompany(),
    supabase
      .from("security_events")
      .select("id", { count: "exact", head: true })
      .eq("event", "nuevo_dispositivo")
      .is("acknowledged_at", null),
  ]);

  return (
    <div className="shell">
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
        <div className="app-top-right">
          <span className="user-chip" title={user.email ?? ""}>
            {user.email}
          </span>
          <SignOutLink label="Salir" />
        </div>
      </header>

      <nav className="side-nav" aria-label="Principal">
        <span className="side-group">Mi empresa</span>
        <Link href="/panel" className="nav-link"><IconControl size={18} /> Centro de control</Link>
        <Link href="/empresas" className="nav-link"><IconBuilding size={18} /> Empresas</Link>
        <Link href="/seguridad" className="nav-link">
          <IconShield size={18} /> Seguridad
          {alerts ? <span className="nav-dot" aria-label={`${alerts} alertas de seguridad`} /> : null}
        </Link>
      </nav>

      <main className="app-main">{children}</main>
    </div>
  );
}
