import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EnqoraClock } from "@/components/brand/enqora-clock";
import { PrintButton } from "@/components/print-button";
import { day } from "@/lib/billing";
import { instList, MANDATE_KINDS, MANDATE_STATUSES, type Mandate } from "@/lib/mandates";
import { formatRut } from "@/lib/rut";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mandato" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Texto completo del mandato, listo para imprimir y firmar.
export default async function MandatePrintPage({ params }: { params: Promise<{ id: string; mid: string }> }) {
  const { id, mid } = await params;
  if (!UUID_RE.test(id) || !UUID_RE.test(mid)) notFound();
  const supabase = await createClient();
  const { data: row } = await supabase.from("mandates").select("*").eq("id", mid).eq("company_id", id).maybeSingle();
  if (!row) notFound();
  const m = row as Mandate;
  const { data: co } = await supabase.from("companies").select("legal_name, rut").eq("id", id).maybeSingle();
  const company = co as { legal_name: string; rut: string } | null;

  return (
    <div className="page narrow print-page">
      <div className="print-tools">
        <Link href={`/empresas/${id}#mandatos`} className="back-link"><span aria-hidden="true">←</span> Mandatos</Link>
        <PrintButton />
      </div>
      <article className="receipt mandate-doc" aria-labelledby="mandate-title">
        <header className="print-head">
          <span className="print-brand"><EnqoraClock size={30} /> ENQ<em>ORA</em></span>
          <dl>
            <div><dt>Folio</dt><dd className="mono">{m.folio}</dd></div>
            <div><dt>Estado</dt><dd>{MANDATE_STATUSES[m.status].label}</dd></div>
          </dl>
        </header>
        <h1 id="mandate-title" className="receipt-title">{MANDATE_KINDS[m.kind].label}</h1>
        <dl className="receipt-lines">
          <div><dt>Mandante</dt><dd>{company ? `${company.legal_name} · RUT ${formatRut(company.rut)}` : "—"}</dd></div>
          <div><dt>Mandatario</dt><dd>{m.representative_name}{m.representative_rut ? ` · RUT ${m.representative_rut}` : ""}</dd></div>
          <div><dt>Instituciones</dt><dd>{instList(m.institutions)}</dd></div>
          <div><dt>Vigencia</dt><dd>Del {day(m.valid_from)} al {day(m.valid_until)}</dd></div>
        </dl>
        <section className="mandate-text">
          <h2 className="sub-title">Texto del mandato</h2>
          <p className="pre">{m.scope}</p>
          <h2 className="sub-title">Trámites permitidos</h2>
          <p className="pre">{m.procedures}</p>
          <p>
            Este mandato no faculta para solicitar ni usar la ClaveÚnica ni la clave tributaria del mandante, y puede revocarse en
            cualquier momento. Fuera de los trámites y del plazo indicados, el mandatario no tiene facultades.
          </p>
        </section>
        <div className="sign-box">
          <div><span /><small>Firma del representante legal</small></div>
          <div>
            <small>Nombre: {m.signer_name ?? "______________________________"}</small>
            <small>RUT: {m.signer_rut ? formatRut(m.signer_rut) : "______________"}</small>
            <small>Calidad: {m.signer_role ?? "______________"}</small>
          </div>
        </div>
        <p className="diag-note">
          {m.kind === "notarial"
            ? "Este texto debe otorgarse ante notario para que la institución lo acepte."
            : "Algunas instituciones exigen mandato notarial o formularios propios: el equipo legal de ENQORA lo verifica antes de actuar."}
        </p>
      </article>
    </div>
  );
}
