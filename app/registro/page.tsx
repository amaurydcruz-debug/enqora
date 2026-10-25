import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AuthCard } from "@/components/auth-card";
import { Emblem } from "@/components/emblems";
import { categoryByKey, INTENT_COOKIE } from "@/lib/discovery";
import { SignUpForm } from "./form";

export const metadata: Metadata = { title: "Crear cuenta" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ servicio?: string }> }) {
  const sp = await searchParams;
  const store = await cookies();
  // Servicio elegido en la puerta de entrada: se conserva durante todo el registro.
  const chosen = categoryByKey(sp.servicio ?? store.get(INTENT_COOKIE)?.value);

  return (
    <AuthCard
      title="Crea tu cuenta ENQORA"
      subtitle="Confirmarás tu correo y activarás un segundo factor de seguridad."
      footer={
        <>
          <p>¿Ya tienes cuenta? <Link href="/ingresar">Ingresar</Link></p>
          <p><Link href="/#servicios">Ver los servicios ENQORA</Link></p>
        </>
      }
    >
      {chosen ? (
        <div className="chosen-service">
          <Emblem name={chosen.emblem} size="sm" />
          <span>
            <small>Servicio elegido</small>
            <b>{chosen.title}</b>
          </span>
          <Link href="/#servicios" className="chosen-change">Cambiar</Link>
        </div>
      ) : null}
      <SignUpForm />
    </AuthCard>
  );
}
