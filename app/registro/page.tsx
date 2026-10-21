import Link from "next/link";
import type { Metadata } from "next";
import { AuthCard } from "@/components/auth-card";
import { SignUpForm } from "./form";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function SignUpPage() {
  return (
    <AuthCard
      title="Crea tu cuenta ENQORA"
      subtitle="Confirmarás tu correo y activarás un segundo factor de seguridad."
      footer={<p>¿Ya tienes cuenta? <Link href="/ingresar">Ingresar</Link></p>}
    >
      <SignUpForm />
    </AuthCard>
  );
}
