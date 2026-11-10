import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Notice } from "@/components/auth-card";
import { EnqoraClock } from "@/components/brand/enqora-clock";
import { PrintButton } from "@/components/print-button";
import type { LegalSignature } from "@/lib/legal";
import { formatRut } from "@/lib/rut";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Documento firmado" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const moment = (iso: string) =>
  new Intl.DateTimeFormat("es-CL", { dateStyle: "long", timeStyle: "medium", timeZone: "America/Santiago" }).format(new Date(iso));

// Copia del documento firmado, con su evidencia, lista para imprimir o guardar en PDF.
export default async function SignedLegalPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID_RE.test(id)) notFound();
  const supabase = await createClient();
  const { data: row } = await supabase.from("legal_signatures").select("*").eq("id", id).maybeSingle();
  if (!row) notFound();
  const s = row as LegalSignature;
  const ev = s.evidence as Record<string, string | number | null>;
  const back = s.case_id ? `/casos/${s.case_id}#legal` : `/empresas/${s.company_id}`;

  return (
    <div className="page narrow print-page">
      <div className="print-tools">
        <Link href={back} className="back-link"><span aria-hidden="true">←</span> Volver</Link>
        <PrintButton />
      </div>
      {sp.aviso === "firmado" ? <Notice kind="ok">Documento firmado. Te enviamos el aviso con el enlace a esta copia.</Notice> : null}
      <article className="receipt mandate-doc" aria-labelledby="sig-title">
        <header className="print-head">
          <span className="print-brand"><EnqoraClock size={30} /> ENQ<em>ORA</em></span>
          <dl>
            <div><dt>Documento</dt><dd className="mono">{s.code} · v{s.version}</dd></div>
            <div><dt>Estado</dt><dd>{s.status === "vigente" ? "Firmado" : "Revocado"}</dd></div>
          </dl>
        </header>
        <h1 id="sig-title" className="receipt-title">Documento firmado electrónicamente</h1>
        <section className="mandate-text">
          <p className="pre">{s.signed_text}</p>
        </section>
        <h2 className="sub-title">Registro de la firma</h2>
        <dl className="receipt-lines">
          <div><dt>Firmó</dt><dd>{s.signer_name} · RUN {formatRut(s.signer_rut)} · {s.signer_role}</dd></div>
          <div><dt>Fecha y hora</dt><dd>{moment(s.created_at)}</dd></div>
          <div><dt>Tipo de firma</dt><dd>Firma electrónica simple con segundo factor (Ley 19.799)</dd></div>
          {ev.correo ? <div><dt>Cuenta</dt><dd>{String(ev.correo)}</dd></div> : null}
          {ev.revisado_por ? <div><dt>Texto revisado por</dt><dd>{String(ev.revisado_por)}</dd></div> : null}
          <div><dt>Huella del texto firmado (SHA-256)</dt><dd className="mono" style={{ wordBreak: "break-all" }}>{s.signed_hash}</dd></div>
        </dl>
        <p className="diag-note">
          La huella permite comprobar que este texto no cambió después de la firma. ENQORA conserva el registro de la sesión,
          la IP y el navegador desde los que se firmó.
        </p>
      </article>
    </div>
  );
}
