/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppNav, type NavItem } from "@/components/app-nav";
import { IconLogout, IconShield } from "@/components/icons";
import { SignOutLink } from "@/components/sign-out-link";
import { UserMenu } from "@/components/user-menu";
import { STAFF_ROLES } from "@/lib/cases";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";
import { createClient, currentUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: { default: "Centro de Mando", template: "%s · Centro de Mando ENQORA" }, robots: { index: false, follow: false } };

// Centro de Mando: entrada y estructura propias, separadas de la app de clientes.
// Solo para el equipo ENQORA, con sesión y segundo factor (el middleware lo exige y aquí se comprueba de nuevo).
export default async function MandoLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const user = await currentUser();
  if (!user) redirect("/mando/acceso");
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") redirect(aal?.nextLevel === "aal2" ? "/mfa/verificar?next=/mando" : "/mfa/configurar");

  const [role, { data: me }] = await Promise.all([
    myStaffRole(),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);
  // Cuentas de clientes: el Centro de Mando no existe para ellas.
  if (!role) redirect("/panel");
  const supervisor = isSupervisorRole(role);
  const displayName = (me as { full_name: string | null } | null)?.full_name || user.email || "";

  const items: NavItem[] = [
    { href: "/mando", label: "Resumen y bandeja", short: "Resumen", icon: "control", group: "operacion" },
    { href: "/mando/mandatos", label: "Mandatos", short: "Mandatos", icon: "documento", group: "operacion", bottom: false },
    { href: "/mando/aprendizajes", label: "Aprendizajes y rutas", short: "Rutas", icon: "casos", group: "operacion", bottom: false },
    { href: "/mando/vigilancia", label: "Vigilancia normativa", short: "Normas", icon: "novedades", group: "operacion" },
    { href: "/mando/datos-publicos", label: "Datos públicos (SII)", short: "Datos", icon: "empresas", group: "operacion" },
    { href: "/mando/catalogo", label: "Catálogo y precios", short: "Catálogo", icon: "contabilidad", group: "configuracion", bottom: false },
    { href: "/mando/planes", label: "Planes", short: "Planes", icon: "pagos", group: "configuracion", bottom: false },
    ...(supervisor
      ? ([
          { href: "/mando/cobros", label: "Cobros y clave de servicio", short: "Cobros", icon: "clave", group: "configuracion" },
          { href: "/mando/estado", label: "Estado del sistema", short: "Estado", icon: "estado", group: "configuracion", bottom: false },
        ] as NavItem[])
      : []),
    ...(role === "enqora_admin" ? [{ href: "/mando/equipo", label: "Equipo ENQORA", short: "Equipo", icon: "mando", group: "configuracion", bottom: false } as NavItem] : []),
  ];

  const menu = (
    <UserMenu initial={(displayName || "?")[0].toUpperCase()}>
      <div className="menu-who">
        <b>{displayName}</b>
        <small>{user.email}</small>
        <small className="menu-role">{STAFF_ROLES[role] ?? role}</small>
      </div>
      <Link href="/seguridad" className="menu-link"><IconShield size={16} /> Seguridad de la cuenta</Link>
      <Link href="/panel" className="menu-link"><IconLogout size={16} /> Ir a la app de clientes</Link>
      <SignOutLink label="Cerrar sesión" className="menu-link menu-signout" icon />
    </UserMenu>
  );

  return (
    <div className="shell shell-mando">
      <aside className="side">
        <Link href="/mando" className="brand-mark">
          <img src="/brand/enqora-icon.png" alt="" width={34} height={34} />
          <b>ENQ<em>ORA</em></b>
        </Link>
        <div className="mando-badge">
          <span className="side-label">Centro de Mando</span>
          <b>Equipo ENQORA</b>
          <small>{STAFF_ROLES[role] ?? role}</small>
        </div>
        <AppNav items={items} variant="side" />
        <p className="side-motto">Acceso exclusivo del equipo.<br />Cada acción queda registrada.</p>
      </aside>

      <div className="frame">
        <header className="topbar">
          <Link href="/mando" className="brand-mark topbar-brand">
            <img src="/brand/enqora-icon.png" alt="" width={30} height={30} />
            <b>ENQ<em>ORA</em></b>
          </Link>
          <span className="mando-chip">Centro de Mando</span>
          <div className="topbar-right">{menu}</div>
        </header>
        <main className="app-main">{children}</main>
      </div>

      <AppNav items={items} variant="bottom" />
    </div>
  );
}
