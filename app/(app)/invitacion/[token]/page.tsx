import Link from "next/link";
import { Emblem } from "@/components/emblems";
import type { Metadata } from "next";
import { Notice } from "@/components/auth-card";
import { SubmitButton } from "@/components/submit-button";
import { acceptInvitationAction } from "@/app/actions/companies";
import { ROLE_HELP, ROLES, type Role } from "@/lib/company-constants";
import { messageForCode } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Invitación" };

type Preview = { status: string; company_name: string | null; role: Role | null; invited_email: string | null };

export default async function InvitationPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  const valid = /^[0-9a-f]{48}$/.test(token);

  let preview: Preview = { status: "invalida", company_name: null, role: null, invited_email: null };
  if (valid) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("invitation_preview", { p_token: token });
    const row = (Array.isArray(data) ? data[0] : data) as Preview | undefined;
    if (row) preview = row;
  }

  return (
    <div className="page narrow">
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Invitación</span>
          <h1>Unirte a una empresa</h1>
        </div>
      </header>

      {messageForCode(error) ? <Notice kind="error">{messageForCode(error)}</Notice> : null}

      <section className="card form-card invite-card">
        <Emblem name={preview.status === "valida" ? "invitar" : "seguridad"} size="lg" />
        {preview.status === "valida" && preview.role ? (
          <>
            <h2>{preview.company_name}</h2>
            <p>
              Te invitaron como <b>{ROLES[preview.role]}</b>: {ROLE_HELP[preview.role]}
            </p>
            <p>Al aceptar podrás ver la información de esta empresa según tu rol. Puedes salir cuando quieras.</p>
            <form action={acceptInvitationAction}>
              <input type="hidden" name="token" value={token} />
              <SubmitButton pendingText="Uniéndote…" className="btn-inline">Aceptar invitación</SubmitButton>
            </form>
          </>
        ) : preview.status === "otro_correo" ? (
          <>
            <h2>Esta invitación es para otra cuenta</h2>
            <p>
              Fue enviada a <b>{preview.invited_email}</b>. Cierra sesión e ingresa (o crea tu cuenta) con ese correo,
              y luego abre nuevamente el enlace.
            </p>
          </>
        ) : preview.status === "expirada" ? (
          <>
            <h2>La invitación expiró</h2>
            <p>Pide a la empresa que te envíe una nueva.</p>
          </>
        ) : preview.status === "usada" ? (
          <>
            <h2>La invitación ya fue usada</h2>
            <p>Si ya eres miembro, encontrarás la empresa en tu lista.</p>
          </>
        ) : (
          <>
            <h2>Invitación no válida</h2>
            <p>El enlace está incompleto o fue revocado. Pide a la empresa que te envíe uno nuevo.</p>
          </>
        )}
      </section>

      <Link href="/empresas" className="back-link">Ir a mis empresas <span aria-hidden="true">→</span></Link>
    </div>
  );
}
