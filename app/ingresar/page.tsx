import Link from "next/link";
import type { Metadata } from "next";
import { AuthCard, Notice } from "@/components/auth-card";
import { safeNext } from "@/lib/safe-next";
import { indexable } from "@/lib/site";
import { SignInForm } from "./form";

export const metadata: Metadata = {
  title: "Ingresar",
  description: "Ingresa a ENQORA con tu correo y segundo factor de seguridad.",
  robots: indexable() ? { index: true, follow: true } : { index: false, follow: false },
};

const AVISOS: Record<string, string> = {
  salida: "Cerraste sesión correctamente.",
  global: "Cerramos tu sesión en todos los dispositivos.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; aviso?: string }>;
}) {
  const sp = await searchParams;
  const next = safeNext(sp.next);

  return (
    <AuthCard
      title="Ingresa a tu cuenta"
      subtitle="Tu información contable, protegida en cada acceso."
      footer={
        <>
          <p><Link href="/recuperar">¿Olvidaste tu contraseña?</Link></p>
          <p>¿Aún no tienes cuenta? <Link href="/registro">Crear cuenta</Link></p>
        </>
      }
    >
      {sp.error === "enlace" ? (
        <Notice kind="error">El enlace no es válido o ya expiró. Solicita uno nuevo.</Notice>
      ) : null}
      {sp.aviso && AVISOS[sp.aviso] ? <Notice kind="ok">{AVISOS[sp.aviso]}</Notice> : null}
      <SignInForm next={next} />
    </AuthCard>
  );
}
