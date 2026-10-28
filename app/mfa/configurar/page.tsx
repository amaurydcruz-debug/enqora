import type { Metadata } from "next";
import { AuthCard } from "@/components/auth-card";
import { safeNext } from "@/lib/safe-next";
import { SignOutLink } from "@/components/sign-out-link";
import { EnrollTotp } from "./enroll";

export const metadata: Metadata = { title: "Activar segundo factor" };

export default async function EnrollPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthCard
      title="Activa tu segundo factor"
      subtitle="Obligatorio para proteger la información contable de tu empresa."
      footer={<SignOutLink />}
    >
      <ol className="steps">
        <li>Instala una aplicación autenticadora (Google Authenticator, Microsoft Authenticator, 1Password o Authy).</li>
        <li>Genera el código QR y escanéalo con la aplicación.</li>
        <li>Escribe el código de 6 dígitos que aparece para confirmar.</li>
      </ol>
      <EnrollTotp next={safeNext(next, "/panel?aviso=mfa")} />
    </AuthCard>
  );
}
