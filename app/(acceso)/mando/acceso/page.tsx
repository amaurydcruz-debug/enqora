import Link from "next/link";
import type { Metadata } from "next";
import { AuthCard } from "@/components/auth-card";
import { SignInForm } from "@/app/ingresar/form";
import { safeNext } from "@/lib/safe-next";

export const metadata: Metadata = {
  title: "Centro de Mando · Acceso del equipo",
  robots: { index: false, follow: false },
};

// Entrada propia del Centro de Mando, separada del ingreso de clientes. Usa la misma
// autenticación (contraseña + segundo factor obligatorio); solo el equipo ENQORA ve el Centro de Mando.
export default async function MandoAccessPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const requested = safeNext(sp.next, "/mando");
  const next = requested === "/mando" || requested.startsWith("/mando/") || requested.startsWith("/equipo/pase/") ? requested : "/mando";

  return (
    <AuthCard
      title="Centro de Mando"
      subtitle="Acceso exclusivo del equipo ENQORA. Ingresa con tu cuenta y tu segundo factor."
      footer={
        <>
          <p><Link href="/recuperar">¿Olvidaste tu contraseña?</Link></p>
          <p>¿Eres cliente? <Link href="/ingresar">Ingresa a la app de clientes</Link></p>
        </>
      }
    >
      <SignInForm next={next} />
    </AuthCard>
  );
}
