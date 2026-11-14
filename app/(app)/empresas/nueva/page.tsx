import Link from "next/link";
import type { Metadata } from "next";
import { Callout } from "@/components/disclosure";
import { cookies } from "next/headers";
import { INTENT_COOKIE } from "@/lib/discovery";
import { NewCompanyForm } from "./form";

export const metadata: Metadata = { title: "Registrar empresa o RUT personal" };

export default async function NewCompanyPage() {
  // Trabajador que llegó desde «Soluciones laborales»: registra su propio RUT como persona natural.
  const trabajador = (await cookies()).get(INTENT_COOKIE)?.value === "trabajador";
  return (
    <div className="page narrow">
      <Link href="/empresas" className="back-link"><span aria-hidden="true">←</span> Empresas</Link>
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Empresas</span>
          <h1>Registrar empresa o RUT personal</h1>
          <p className="hero-lead">
            Registra tu empresa o, si trabajas a tu nombre, tu propio RUT como persona natural. Quedarás como propietario y podrás
            invitar a tu contador o a tu equipo.
          </p>
        </div>
      </header>

      {trabajador ? (
        <Callout kind="info" title="¿Eres trabajador? Registra tu RUT personal">
          No necesitas una empresa: ingresa tu propio RUT y tu nombre, y en régimen elige «Persona natural sin inicio de actividades».
          Tu expediente laboral es confidencial: solo lo ven tú, el abogado asignado y la supervisión de ENQORA.
        </Callout>
      ) : null}

      <Callout kind="info" title="Tu información tributaria sigue protegida">
        Registrar el RUT no da acceso a la información tributaria de la empresa. La conexión con el SII se
        autorizará más adelante por canales oficiales. ENQORA nunca te pedirá tu ClaveÚnica ni tu clave del SII.
      </Callout>

      <section className="card form-card">
        <NewCompanyForm />
      </section>

    </div>
  );
}
