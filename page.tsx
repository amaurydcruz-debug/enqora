import Link from "next/link";
import type { Metadata } from "next";
import { Notice } from "@/components/auth-card";
import { NewCompanyForm } from "./form";

export const metadata: Metadata = { title: "Registrar empresa" };

export default function NewCompanyPage() {
  return (
    <div className="stack narrow">
      <div className="page-head">
        <span className="eyebrow">Empresas</span>
        <h1>Registrar empresa</h1>
        <p>Quedarás como propietario y podrás invitar a tu contador o a tu equipo.</p>
      </div>

      <Notice kind="info">
        Registrar el RUT no da acceso a la información tributaria de la empresa. La conexión con el SII se
        autorizará más adelante por canales oficiales. ENQORA nunca te pedirá tu ClaveÚnica ni tu clave del SII.
      </Notice>

      <section className="card">
        <NewCompanyForm />
      </section>

      <p><Link href="/empresas">← Volver a empresas</Link></p>
    </div>
  );
}
