import type { Metadata } from "next";
import { AuthCard } from "@/components/auth-card";
import { SignOutLink } from "@/components/sign-out-link";
import { safeNext } from "@/lib/safe-next";
import { VerifyMfaForm } from "./form";

export const metadata: Metadata = { title: "Verificación en dos pasos" };

export default async function VerifyMfaPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <AuthCard
      title="Verificación en dos pasos"
      subtitle="Ingresa el código de 6 dígitos de tu aplicación autenticadora."
      footer={
        <>
          <p>¿Perdiste acceso a tu autenticador? Contacta al soporte de ENQORA para verificar tu identidad.</p>
          <SignOutLink label="Usar otra cuenta" />
        </>
      }
    >
      <VerifyMfaForm next={safeNext(next)} />
    </AuthCard>
  );
}
