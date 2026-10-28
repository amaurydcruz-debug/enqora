import Link from "next/link";
import type { Metadata } from "next";
import { acceptTeamPassAction } from "@/app/actions/team";
import { AuthCard, Notice } from "@/components/auth-card";
import { SignOutLink } from "@/components/sign-out-link";
import { SubmitButton } from "@/components/submit-button";
import { STAFF_ROLES, type StaffRole } from "@/lib/cases";
import { messageForCode } from "@/lib/db-errors";
import { createClient, currentUser } from "@/lib/supabase/server";
import { TeamSignUpForm } from "./form";

export const metadata: Metadata = { title: "Acceso del equipo", robots: { index: false, follow: false } };

type Preview = { status: string; email: string | null; role: StaffRole | null; valid_from: string | null; valid_until: string | null; has_account: boolean | null };

const hour = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" }).format(new Date(iso)) : "";
const day = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Santiago" }).format(new Date(iso)) : "";

// Enlace de jornada que el Administrador envía a cada integrante del equipo:
// personal, de un solo uso y válido solo en el horario del día.
export default async function TeamPassPage({ params, searchParams }: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ aviso?: string; error?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  let p: Preview = { status: "invalido", email: null, role: null, valid_from: null, valid_until: null, has_account: null };
  if (/^[0-9a-f]{48}$/.test(token)) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("team_pass_preview", { p_token: token });
    const row = (Array.isArray(data) ? data[0] : data) as Preview | undefined;
    if (row) p = row;
  }
  const user = await currentUser();
  const sameAccount = !!user?.email && !!p.email && user.email.toLowerCase() === p.email;
  const here = `/equipo/pase/${token}`;
  const when = p.valid_from ? `${day(p.valid_from)}, de ${hour(p.valid_from)} a ${hour(p.valid_until)}` : "";

  let body: React.ReactNode;
  if (p.status === "invalido") {
    body = <Notice kind="error">Este enlace no es válido o fue anulado. Pide uno nuevo al Administrador ENQORA.</Notice>;
  } else if (p.status === "usado") {
    body = (
      <>
        <Notice kind="info">Este enlace ya se usó. Cada enlace sirve una sola vez.</Notice>
        <p><Link href="/mando" className="btn btn-gold btn-inline">Ir al Centro de Mando</Link></p>
      </>
    );
  } else if (p.status === "vencido") {
    body = <Notice kind="error">La jornada de este enlace terminó ({when}). Pide un enlace nuevo al Administrador.</Notice>;
  } else if (!user) {
    body = sp.aviso === "correo" ? (
      <Notice kind="info">
        Te enviamos un correo a <b>{p.email}</b>. Ábrelo para confirmar tu cuenta: te traerá de vuelta aquí para activar tu
        segundo factor y entrar.
      </Notice>
    ) : p.has_account ? (
      <>
        <p>Ingresa con tu cuenta <b>{p.email}</b> para activar tu acceso de hoy.</p>
        <Link href={`/mando/acceso?next=${encodeURIComponent(here)}`} className="btn btn-gold">Ingresar</Link>
      </>
    ) : (
      <>
        <p>Es tu primer acceso al equipo ENQORA. Crea tu contraseña; luego confirmarás tu correo y activarás tu segundo factor.</p>
        <TeamSignUpForm token={token} email={p.email ?? ""} />
      </>
    );
  } else if (!sameAccount) {
    body = (
      <>
        <Notice kind="error">
          Este enlace es para <b>{p.email}</b> y ahora estás conectado como <b>{user.email}</b>. Cierra sesión y vuelve a abrir
          el enlace para ingresar con la cuenta correcta.
        </Notice>
        <SignOutLink label="Cerrar sesión" />
      </>
    );
  } else if (p.status === "aun_no") {
    body = <Notice kind="info">Tu enlace se habilita el {when}. Vuelve a abrirlo a esa hora.</Notice>;
  } else {
    body = (
      <form action={acceptTeamPassAction}>
        <input type="hidden" name="token" value={token} />
        <p>Tu acceso como <b>{p.role ? STAFF_ROLES[p.role] : "equipo"}</b> quedará activo hasta las <b>{hour(p.valid_until)}</b> de hoy.</p>
        <SubmitButton pendingText="Activando…">Activar mi acceso de hoy</SubmitButton>
      </form>
    );
  }

  return (
    <AuthCard
      title="Acceso del equipo ENQORA"
      subtitle={p.email && p.status !== "invalido" ? `Enlace personal para ${p.email}${when ? ` · ${when}` : ""}` : "Enlace personal de jornada"}
      footer={<p>Cada enlace es personal, sirve una sola vez y solo dentro del horario de la jornada.</p>}
    >
      {messageForCode(sp.error) ? <Notice kind="error">{messageForCode(sp.error)}</Notice> : null}
      {body}
    </AuthCard>
  );
}
