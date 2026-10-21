import Link from "next/link";
import type { Metadata } from "next";
import { AuthCard } from "@/components/auth-card";
import { RequestResetForm } from "./form";

export const metadata: Metadata = { title: "Recuperar acceso" };

export default function RecoverPage() {
  return (
    <AuthCard
      title="Recupera tu acceso"
      subtitle="Te enviaremos un enlace seguro para crear una nueva contraseña."
      footer={<p><Link href="/ingresar">Volver a ingresar</Link></p>}
    >
      <RequestResetForm />
    </AuthCard>
  );
}
