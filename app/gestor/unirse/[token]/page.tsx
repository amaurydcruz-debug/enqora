import Link from "next/link";
import type { Metadata } from "next";
import { aceptarInvitacionGestorAction } from "@/app/actions/terreno";
import { AuthCard, Notice } from "@/components/auth-card";
import { InstallApp } from "@/components/install-app";
import { SignOutLink } from "@/components/sign-out-link";
import { SubmitButton } from "@/components/submit-button";
import { messageForCode } from "@/lib/db-errors";
import { createClient, currentUser } from "@/lib/supabase/server";
import { GestorSignUpForm } from "./form";

export const metadata: Metadata = { title: "Únete como gestor", manifest: "/gestor.webmanifest", robots: { index: false, follow: false } };

type Preview = { status: string; first_name: string | null; email: string | null };

// Enlace personal que ENQORA envía a un gestor ya registrado: instala la app, crea su cuenta y se activa.
export default async function UnirsePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  let p: Preview = { status: "invalido", first_name: null, email: null };
  if (/^[0-9a-f]{48}$/.test(token)) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("field_agent_invite_preview", { p_token: token });
    const row = (Array.isArray(data) ? data[0] : data) as Preview | undefined;
    if (row) p = row;
  }
  const user = await currentUser();
  const same = !!user?.email && !!p.email && user.email.toLowerCase() === p.email;
  const here = `/gestor/unirse/${token}`;

  let body: React.ReactNode;
  if (p.status === "invalido") body = <Notice kind="error">Este enlace no es válido. Pide uno nuevo a ENQORA.</Notice>;
  else if (p.status === "vencido") body = <Notice kind="error">Este enlace venció (dura 7 días). Pide uno nuevo a ENQORA.</Notice>;
  else if (p.status === "usado") body = <><Notice kind="info">Ya activaste tu cuenta con este enlace.</Notice><p><Link href="/gestor" className="btn btn-gold">Ir a mis encargos</Link></p></>;
  else if (!user) {
    body = (
      <>
        <InstallApp />
        <p><b>2. Crea tu cuenta</b> con el correo que registró ENQORA. Luego confirmarás tu correo y activarás tu segundo factor (una app de códigos en tu teléfono).</p>
        {sp.aviso === "correo"
          ? <Notice kind="info">Te enviamos un correo a <b>{p.email}</b>. Ábrelo para confirmar tu cuenta: te traerá de vuelta aquí.</Notice>
          : <GestorSignUpForm token={token} email={p.email ?? ""} />}
        <p className="muted-line">¿Ya tienes cuenta? <Link href={`/ingresar?next=${encodeURIComponent(here)}`}>Ingresa aquí</Link>.</p>
      </>
    );
  } else if (!same) {
    body = (
      <>
        <Notice kind="error">Este enlace es para <b>{p.email}</b> y estás conectado como <b>{user.email}</b>. Cierra sesión y vuelve a abrir el enlace.</Notice>
        <SignOutLink label="Cerrar sesión" />
      </>
    );
  } else {
    body = (
      <>
        <InstallApp />
        <form action={aceptarInvitacionGestorAction} className="mini-form">
          <input type="hidden" name="token" value={token} />
          <p><b>3. Actívate como gestor.</b></p>
          <p className="muted-line">
            ENQORA usa tu nombre, RUN, contacto y domicilio solo para asignarte encargos, coordinar tu trabajo y pagarte. Tu ubicación no se
            rastrea: tú informas tu hora de llegada. Puedes ejercer tus derechos sobre tus datos en cualquier momento (Ley 21.719).
          </p>
          <label className="check-inline">
            <input type="checkbox" name="consent" required />
            <span>Acepto el tratamiento de mis datos para trabajar como gestor de ENQORA.</span>
          </label>
          <SubmitButton pendingText="Activando…">Activarme y ver mis encargos</SubmitButton>
        </form>
      </>
    );
  }

  return (
    <AuthCard
      title={p.first_name ? `Hola ${p.first_name}, bienvenido a ENQORA Gestor` : "ENQORA Gestor"}
      subtitle="App para gestores de terreno: recibe encargos, informa tu llegada y registra el comprobante."
      footer={<p>Este enlace es personal y sirve una sola vez. ENQORA nunca te pedirá claves de clientes.</p>}
    >
      {messageForCode(sp.error) ? <Notice kind="error">{messageForCode(sp.error)}</Notice> : null}
      {body}
    </AuthCard>
  );
}
