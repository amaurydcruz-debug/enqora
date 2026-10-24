/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { activeCompany } from "@/lib/companies";
import { ROLES } from "@/lib/company-constants";
import { formatRut } from "@/lib/rut";
import { AppNav, type NavItem } from "@/components/app-nav";
import { SignOutLink } from "@/components/sign-out-link";
import { STAFF_ROLES } from "@/lib/cases";
import { myStaffRole } from "@/lib/staff";

// Área privada. El middleware ya exige sesión con segundo factor (aal2);
// aquí se comprueba de nuevo en el servidor como segunda barrera.
// Escritorio: navegación lateral propia con la empresa activa. Teléfono: barra superior y barra inferior compacta.
const initials = (name: string) =>
  name
    .replace(/\b(SpA|Ltda\.?|S\.A\.|EIRL|Limitada)\b/gi, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "E";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/ingresar");

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") redirect(aal?.nextLevel === "aal2" ? "/mfa/verificar" : "/mfa/configurar");

  const [{ active }, { count: alerts }, staffRole] = await Promise.all([
    activeCompany(),
    supabase
      .from("security_events")
      .select("id", { count: "exact", head: true })
      .eq("event", "nuevo_dispositivo")
      .is("acknowledged_at", null),
    myStaffRole(),
  ]);

  const companyName = active ? active.trade_name || active.legal_name : null;
  const roleLabel = staffRole ? STAFF_ROLES[staffRole] : active ? ROLES[active.role] : "Sin empresa";

  const items: NavItem[] = [
    { href: "/panel", label: "Centro de control", short: "Control", icon: "control", group: "empresa" },
    { href: "/casos", label: "Casos", short: "Casos", icon: "casos", group: "empresa" },
    { href: "/empresas", label: "Empresas", short: "Empresas", icon: "empresas", group: "empresa" },
    {
      href: "/seguridad",
      label: "Seguridad",
      short: "Seguridad",
      icon: "seguridad",
      group: "empresa",
      alert: alerts ? `${alerts} alertas de seguridad` : undefined,
    },
    ...(staffRole ? [{ href: "/mando", label: "Centro de Mando", short: "Mando", icon: "mando", group: "equipo" } as NavItem] : []),
  ];

  return (
    <div className="shell">
      <aside className="side">
        <Link href="/panel" className="brand-mark">
          <img src="/brand/enqora-icon.png" alt="" width={34} height={34} />
          <b>ENQ<em>ORA</em></b>
        </Link>

        <div className="side-company">
          <span className="side-label">Empresa activa</span>
          <Link href="/empresas" className="company-switch" title="Cambiar de empresa">
            <span className="monogram" aria-hidden="true">{companyName ? initials(companyName) : "+"}</span>
            <span className="company-switch-text">
              <b>{companyName ?? "Registrar empresa"}</b>
              <small>{active ? formatRut(active.rut) : "Aún no tienes una empresa"}</small>
            </span>
          </Link>
        </div>

        <AppNav items={items} variant="side" />

        <div className="side-foot">
          <span className="avatar" aria-hidden="true">{(user.email ?? "?")[0].toUpperCase()}</span>
          <span className="side-user">
            <b title={user.email ?? ""}>{user.email}</b>
            <small>{roleLabel}</small>
          </span>
          <SignOutLink label="Salir" className="icon-btn" icon />
        </div>
      </aside>

      <header className="mobile-top">
        <Link href="/panel" className="brand-mark">
          <img src="/brand/enqora-icon.png" alt="" width={30} height={30} />
          <b>ENQ<em>ORA</em></b>
        </Link>
        <Link href="/empresas" className="company-chip" title="Cambiar de empresa">
          {companyName ?? "Sin empresa"}
        </Link>
        <SignOutLink label="Salir" className="icon-btn" icon />
      </header>

      <main className="app-main">{children}</main>

      <AppNav items={items} variant="bottom" />
    </div>
  );
}
