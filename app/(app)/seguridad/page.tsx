import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "@/app/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { ChangePasswordForm } from "./change-password";

export const metadata: Metadata = { title: "Seguridad" };

const fmt = (iso?: string | null) =>
  iso
    ? new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(iso))
    : "—";

export default async function SecurityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totp = factors?.totp ?? [];

  return (
    <div className="stack">
      <div className="page-head">
        <span className="eyebrow">ENQORA Identity</span>
        <h1>Seguridad de la cuenta</h1>
        <p>Controla cómo accedes a ENQORA y protege la información de tus empresas.</p>
      </div>

      <div className="grid">
        <section className="card">
          <h2>Tu identidad</h2>
          <div className="row"><span>Correo</span><span>{user?.email}</span></div>
          <div className="row">
            <span>Correo confirmado</span>
            <span className={`badge ${user?.email_confirmed_at ? "badge-ok" : "badge-warn"}`}>
              {user?.email_confirmed_at ? "Sí" : "Pendiente"}
            </span>
          </div>
          <div className="row"><span>Último ingreso</span><span>{fmt(user?.last_sign_in_at)}</span></div>
        </section>

        <section className="card">
          <h2>Verificación en dos pasos</h2>
          {totp.map((f) => (
            <div className="row" key={f.id}>
              <span>{f.friendly_name ?? "Aplicación autenticadora"}</span>
              <span className="badge badge-ok">Activo</span>
            </div>
          ))}
          <p style={{ marginTop: 12 }}>
            Las passkeys (huella o Face ID) se añadirán como método adicional en una próxima etapa.
          </p>
        </section>

        <section className="card">
          <h2>Sesiones</h2>
          <p>Si perdiste un dispositivo o sospechas de un acceso indebido, cierra todas las sesiones de inmediato.</p>
          <form action={signOutAction}>
            <input type="hidden" name="scope" value="global" />
            <SubmitButton variant="danger" pendingText="Cerrando…">Cerrar sesión en todos los dispositivos</SubmitButton>
          </form>
        </section>
      </div>

      <section className="card" style={{ maxWidth: 520 }}>
        <h2>Cambiar contraseña</h2>
        <p>Por seguridad te pediremos un código nuevo de tu aplicación autenticadora.</p>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
