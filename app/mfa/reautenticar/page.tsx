import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { safeNext } from "@/lib/safe-next";
import { VerifyMfaForm } from "../verificar/form";

export const metadata: Metadata = { title: "Confirmar identidad" };

// Reautenticación: se pide un código nuevo antes de operaciones sensibles
// (invitar personas, cambiar permisos, quitar miembros).
export default async function ReauthPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const back = safeNext(next, "/panel");

  return (
    <AuthCard
      title="Confirma que eres tú"
      subtitle="Esta operación cambia permisos de acceso. Ingresa el código actual de tu aplicación autenticadora."
      footer={<p><Link href={back}>Cancelar y volver</Link></p>}
    >
      <VerifyMfaForm next={back} />
    </AuthCard>
  );
}
