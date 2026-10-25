import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EnqoraClock } from "@/components/brand/enqora-clock";
import type { CaseRow } from "@/lib/cases";
import type { Diagnosis, Finding } from "@/lib/diagnosis";
import { formatRut } from "@/lib/rut";
import { createClient } from "@/lib/supabase/server";
import { DiagnosisReport, type ServiceRef } from "../diagnosis-report";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Diagnóstico" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Versión completa e imprimible del diagnóstico entregado (para guardarlo en PDF o llevarlo
// a un contador o abogado independiente). Solo existe si hay una versión publicada.
export default async function DiagnosisPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const supabase = await createClient();

  const { data: caseRow } = await supabase.from("cases").select("*").eq("id", id).maybeSingle();
  if (!caseRow) notFound();
  const c = caseRow as CaseRow;

  const { data: diag } = await supabase.from("diagnoses").select("*").eq("case_id", id).eq("status", "publicado").maybeSingle();
  if (!diag) notFound();
  const d = diag as Diagnosis;

  const [{ data: fRows }, { data: company }, { data: approver }] = await Promise.all([
    supabase.from("diagnosis_findings").select("*").eq("diagnosis_id", d.id).order("position"),
    supabase.from("companies").select("legal_name, trade_name, rut").eq("id", c.company_id).maybeSingle(),
    d.published_by ? supabase.from("profiles").select("full_name, email").eq("id", d.published_by).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const findings = (fRows ?? []) as Finding[];
  const ids = [...new Set(findings.map((f) => f.service_id).filter(Boolean))] as string[];
  const { data: svc } = ids.length ? await supabase.from("services").select("id, code, name").in("id", ids) : { data: [] };
  const services = new Map(((svc ?? []) as ServiceRef[]).map((s) => [s.id, s]));
  const co = company as { legal_name: string; trade_name: string | null; rut: string } | null;
  const ap = approver as { full_name: string | null; email: string } | null;

  return (
    <div className="page narrow print-page">
      <div className="print-tools">
        <Link href={`/casos/${c.id}#diagnostico`} className="back-link"><span aria-hidden="true">←</span> Volver al caso</Link>
        <PrintButton />
      </div>
      <header className="print-head">
        <span className="print-brand"><EnqoraClock size={30} /> ENQ<em>ORA</em></span>
        <dl>
          <div><dt>Empresa</dt><dd>{co ? `${co.trade_name || co.legal_name} · ${formatRut(co.rut)}` : "—"}</dd></div>
          <div><dt>Caso</dt><dd><span className="mono">{c.folio}</span> · {c.title}</dd></div>
        </dl>
      </header>
      <DiagnosisReport
        caseId={c.id}
        diagnosis={d}
        findings={findings}
        services={services}
        approverName={ap ? ap.full_name || ap.email : null}
        expanded
      />
    </div>
  );
}
