import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { activeCompany } from "@/lib/companies";
import { isModule } from "@/lib/cases";
import { NewCaseForm } from "./form";

export const metadata: Metadata = { title: "Nueva solicitud" };

export default async function NewCasePage({ searchParams }: { searchParams: Promise<{ modulo?: string }> }) {
  const { modulo } = await searchParams;
  const { active } = await activeCompany();
  if (!active) redirect("/casos");
  if (active.role === "viewer") redirect("/casos");

  return (
    <div className="page narrow">
      <div className="page-head">
        <span className="eyebrow">Casos · {active.trade_name || active.legal_name}</span>
        <h1>Nueva solicitud</h1>
        <p>Explícalo con tus palabras. El equipo ENQORA investigará, te pedirá solo lo necesario y te mantendrá informado.</p>
      </div>
      <section className="card">
        <NewCaseForm companyId={active.id} defaultModule={isModule(modulo) ? modulo : "contabilidad"} />
      </section>
      <p><Link href="/casos">← Volver a tus solicitudes</Link></p>
    </div>
  );
}
