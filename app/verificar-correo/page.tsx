import Link from "next/link";
import type { Metadata } from "next";
import { AuthCard, Notice } from "@/components/auth-card";

export const metadata: Metadata = { title: "Confirma tu correo" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  const shown = email && email.length < 120 ? email : "tu correo";

  return (
    <AuthCard
      title="Confirma tu correo"
      subtitle="Un paso más para activar tu cuenta."
      footer={<p><Link href="/ingresar">Volver a ingresar</Link></p>}
    >
      <Notice kind="info">
        Enviamos un enlace de confirmación a <b>{shown}</b>. Ábrelo para activar la cuenta; después podrás
        ingresar y configurar tu segundo factor de seguridad.
      </Notice>
      <ul className="steps">
        <li>El enlace funciona una sola vez y expira.</li>
        <li>Revisa la carpeta de spam si no lo ves en unos minutos.</li>
        <li>ENQORA nunca te pedirá tu ClaveÚnica ni tu clave del SII por correo.</li>
      </ul>
    </AuthCard>
  );
}
