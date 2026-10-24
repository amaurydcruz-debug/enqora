import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { activeCompany } from "@/lib/companies";
import { NewCaseForm } from "./form";

export const metadata: Metadata = { title: "Nueva solicitud" };

export default async function NewCasePage() {
  const { active } = await activeCompany();
  if (!active) redirect("/casos");
  if (active.role === "viewer") redirect("/casos");

  return (
    <div className="stack narrow">
      <div className="page-head">
        <span className="eyebrow">Casos · {active.trade_name || active.legal_name}</span>
        <h1>Nueva solicitud</h1>
        <p>Explícalo con tus palabras. El equipo ENQORA investigará, te pedirá solo lo necesario y te mantendrá informado.</p>
      </div>
      <section className="card">
        <NewCaseForm companyId={active.id} />
      </section>
      <p><Link href="/casos">← Volver a tus solicitudes</Link></p>
    </div>
  );
}
