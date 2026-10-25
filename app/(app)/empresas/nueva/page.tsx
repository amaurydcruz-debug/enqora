import Link from "next/link";
import type { Metadata } from "next";
import { Callout } from "@/components/disclosure";
import { NewCompanyForm } from "./form";

export const metadata: Metadata = { title: "Registrar empresa" };

export default function NewCompanyPage() {
  return (
    <div className="page narrow">
      <Link href="/empresas" className="back-link"><span aria-hidden="true">←</span> Empresas</Link>
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Empresas</span>
          <h1>Registrar empresa</h1>
          <p className="hero-lead">Quedarás como propietario y podrás invitar a tu contador o a tu equipo.</p>
        </div>
      </header>

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
