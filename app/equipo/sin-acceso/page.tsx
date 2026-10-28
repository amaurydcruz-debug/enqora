import Link from "next/link";
import type { Metadata } from "next";
import { AuthCard, Notice } from "@/components/auth-card";
import { SignOutLink } from "@/components/sign-out-link";

export const metadata: Metadata = { title: "Sin acceso al Centro de Mando", robots: { index: false, follow: false } };

// Cuentas sin rol de equipo o con el pase de jornada vencido.
export default function NoTeamAccessPage() {
  return (
    <AuthCard title="Sin acceso al Centro de Mando" subtitle="El acceso del equipo se habilita cada día con un enlace del Administrador.">
      <Notice kind="info">
        Si trabajas hoy en ENQORA, pide al Administrador tu enlace de jornada y ábrelo dentro del horario de trabajo. Si eres cliente,
        tu espacio está en la app de clientes.
      </Notice>
      <p><Link href="/panel" className="btn btn-ghost btn-inline">Ir a la app de clientes</Link></p>
      <p><SignOutLink label="Cerrar sesión" /></p>
    </AuthCard>
  );
}
