"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconActivity, IconBuilding, IconCard, IconControl, IconLedger, IconShield, IconUsers } from "@/components/icons";

// Navegación principal ENQORA. Marca la sección activa según la ruta actual.
// "side": navegación lateral de escritorio · "bottom": barra compacta inferior en teléfono.

const ICONS = {
  control: IconControl,
  casos: IconActivity,
  empresas: IconBuilding,
  seguridad: IconShield,
  pagos: IconCard,
  contabilidad: IconLedger,
  mando: IconUsers,
} as const;

export type NavItem = {
  href: string;
  label: string;
  short: string;
  icon: keyof typeof ICONS;
  group: "empresa" | "equipo";
  alert?: string; // texto accesible cuando hay algo pendiente
  bottom?: boolean; // false: no aparece en la barra inferior del teléfono
};

export function AppNav({ items, variant }: { items: NavItem[]; variant: "side" | "bottom" }) {
  const pathname = usePathname() ?? "";
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  if (variant === "bottom") {
    return (
      <nav className="bottom-nav" aria-label="Principal">
        {items.filter((it) => it.bottom !== false).map((it) => {
          const Icon = ICONS[it.icon];
          const active = isActive(it.href);
          return (
            <Link key={it.href} href={it.href} className={`bottom-link${active ? " is-active" : ""}`} aria-current={active ? "page" : undefined}>
              <span className="bottom-icon">
                <Icon size={20} />
                {it.alert ? <span className="nav-dot" aria-label={it.alert} /> : null}
              </span>
              <span>{it.short}</span>
            </Link>
          );
        })}
      </nav>
    );
  }

  const groups: { key: NavItem["group"]; label: string }[] = [
    { key: "empresa", label: "Mi empresa" },
    { key: "equipo", label: "Equipo ENQORA" },
  ];

  return (
    <nav className="side-nav" aria-label="Principal">
      {groups.map((g) => {
        const list = items.filter((it) => it.group === g.key);
        if (!list.length) return null;
        return (
          <div key={g.key} className="side-section">
            <span className="side-group">{g.label}</span>
            {list.map((it) => {
              const Icon = ICONS[it.icon];
              const active = isActive(it.href);
              return (
                <Link key={it.href} href={it.href} className={`nav-link${active ? " is-active" : ""}`} aria-current={active ? "page" : undefined}>
                  <Icon size={18} />
                  <span>{it.label}</span>
                  {it.alert ? <span className="nav-dot" aria-label={it.alert} /> : null}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
