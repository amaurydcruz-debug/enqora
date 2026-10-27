/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient, currentUser } from "@/lib/supabase/server";
import { activeCompany } from "@/lib/companies";
import { ROLES } from "@/lib/company-constants";
import { formatRut } from "@/lib/rut";
import { AppNav, type NavItem } from "@/components/app-nav";
import { SignOutLink } from "@/components/sign-out-link";
import { UserMenu } from "@/components/user-menu";
import { IconAlert, IconBuilding, IconShield } from "@/components/icons";
import { STAFF_ROLES } from "@/lib/cases";
import { myStaffRole } from "@/lib/staff";
import { flushDeliveries } from "@/lib/notify-delivery";

// Área privada. El middleware ya exige sesión con segundo factor (aal2);
// aquí se comprueba de nuevo en el servidor como segunda barrera.
// Escritorio: navegación lateral + encabezado compacto (seguridad, avisos y perfil).
// Teléfono: barra superior compacta + barra inferior.
const initials = (name: string) =>
  name
    .replace(/\b(SpA|Ltda\.?|S\.A\.|EIRL|Limitada)\b/gi, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "E";

const Bell = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" />
    <path d="M10 20.5a2 2 0 0 0 4 0" />
  </svg>
);

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const user = await currentUser();
  if (!user) redirect("/ingresar");

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") redirect(aal?.nextLevel === "aal2" ? "/mfa/verificar" : "/mfa/configurar");

  const [{ active }, { count: alerts }, staffRole, { data: me }, { count: unread }] = await Promise.all([
    activeCompany(),
    supabase
      .from("security_events")
      .select("id", { count: "exact", head: true })
      .eq("event", "nuevo_dispositivo")
      .is("acknowledged_at", null),
    myStaffRole(),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    // Avisos reales: notificaciones sin leer (autorizaciones, cotizaciones, cobros, aprobaciones…).
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
  ]);
  const notices = unread ?? 0;
  const noticesHref = "/notificaciones";

  // Después de responder: envía los avisos pendientes por correo o WhatsApp (si están configurados).
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? ""}`;
  after(() => flushDeliveries(origin));

  const companyName = active ? active.trade_name || active.legal_name : null;
  const roleLabel = staffRole ? STAFF_ROLES[staffRole] : active ? ROLES[active.role] : "Sin empresa";
  const displayName = (me as { full_name: string | null } | null)?.full_name || user.email || "";
  const initial = (displayName || "?")[0].toUpperCase();

  const items: NavItem[] = [
    { href: "/panel", label: "Centro de control", short: "Control", icon: "control", group: "empresa" },
    { href: "/casos", label: "Casos", short: "Casos", icon: "casos", group: "empresa" },
    { href: "/contabilidad", label: "Contabilidad", short: "Contable", icon: "contabilidad", group: "empresa" },
    { href: "/empresas", label: "Empresas", short: "Empresas", icon: "empresas", group: "empresa", bottom: false },
    { href: "/facturacion", label: "Planes y pagos", short: "Pagos", icon: "pagos", group: "empresa" },
    {
      href: "/seguridad",
      label: "Seguridad",
      short: "Seguridad",
      icon: "seguridad",
      group: "empresa",
      alert: alerts ? `${alerts} alertas de seguridad` : undefined,
    },
  ];

  const securityChip = alerts ? (
    <Link href="/seguridad" className="chip chip-warn"><IconAlert size={15} /> {alerts === 1 ? "1 alerta" : `${alerts} alertas`}</Link>
  ) : (
    <Link href="/seguridad" className="chip chip-ok"><IconShield size={15} /> Cuenta protegida</Link>
  );
  const bell = (
    <Link href={noticesHref} className="bell" aria-label={notices ? `${notices} avisos pendientes` : "Sin avisos pendientes"}>
      <Bell />
      {notices ? <span className="bell-count">{notices > 9 ? "9+" : notices}</span> : null}
    </Link>
  );
  const menu = (
    <UserMenu initial={initial}>
      <div className="menu-who">
        <b>{displayName}</b>
        <small>{user.email}</small>
        <small className="menu-role">{roleLabel}</small>
      </div>
      {companyName ? (
        <Link href="/empresas" className="menu-link"><IconBuilding size={16} /> {companyName} · cambiar</Link>
      ) : null}
      <Link href="/seguridad" className="menu-link"><IconShield size={16} /> Seguridad de la cuenta</Link>
      <SignOutLink label="Cerrar sesión" className="menu-link menu-signout" icon />
    </UserMenu>
  );

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

        <p className="side-motto">La complejidad es nuestra.<br />La claridad, tuya.</p>
      </aside>

      <div className="frame">
        <header className="topbar">
          <Link href="/panel" className="brand-mark topbar-brand">
            <img src="/brand/enqora-icon.png" alt="" width={30} height={30} />
            <b>ENQ<em>ORA</em></b>
          </Link>
          <div className="topbar-right">
            <span className="topbar-security">{securityChip}</span>
            {bell}
            {menu}
          </div>
        </header>

        <main className="app-main">{children}</main>
      </div>

      <AppNav items={items} variant="bottom" />
    </div>
  );
}
