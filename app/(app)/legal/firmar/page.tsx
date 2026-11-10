import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { signLegalDocumentAction } from "@/app/actions/legal";
import { Notice } from "@/components/auth-card";
import { SubmitButton } from "@/components/submit-button";
import { day } from "@/lib/billing";
import { messageForCode } from "@/lib/db-errors";
import { SCOPES, type LegalDocument } from "@/lib/legal";
import { formatRut } from "@/lib/rut";
import { createClient, currentUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Firmar documento" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Lectura y firma electrónica simple de un documento legal aprobado.
// Se firma lo que se ve: la base vuelve a armar el texto y rechaza la firma si la versión cambió.
export default async function SignLegalPage({
  searchParams,
}: {
  searchParams: Promise<{ doc?: string; empresa?: string; caso?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const docId = sp.doc ?? "";
  const companyId = sp.empresa ?? "";
  const caseId = sp.caso && UUID_RE.test(sp.caso) ? sp.caso : null;
  if (!UUID_RE.test(docId) || !UUID_RE.test(companyId)) notFound();

  const supabase = await createClient();
  const user = await currentUser();
  const [{ data: dRow }, { data: coRow }, { data: memRow }, { data: preview }] = await Promise.all([
    supabase.from("legal_documents").select("*").eq("id", docId).maybeSingle(),
    supabase.from("companies").select("legal_name, rut").eq("id", companyId).maybeSingle(),
    supabase.from("company_members").select("role").eq("company_id", companyId).eq("user_id", user?.id ?? "").maybeSingle(),
    supabase.rpc("legal_preview", { p_document: docId, p_company: companyId, p_case: caseId }),
  ]);
  const doc = dRow as LegalDocument | null;
  const company = coRow as { legal_name: string; rut: string } | null;
  if (!doc || !company || typeof preview !== "string") notFound();
  const canSign = ["owner", "admin"].includes((memRow as { role: string } | null)?.role ?? "");
  const backHref = caseId ? `/casos/${caseId}#legal` : `/empresas/${companyId}`;

  const sigQuery = supabase
    .from("legal_signatures")
    .select("id, created_at, signer_name")
    .eq("document_id", doc.id)
    .eq("company_id", companyId)
    .eq("status", "vigente");
  const { data: sigRow } = await (doc.scope === "caso" && caseId ? sigQuery.eq("case_id", caseId) : sigQuery.is("case_id", null))
    .limit(1)
    .maybeSingle();
  const signed = sigRow as { id: string; created_at: string; signer_name: string } | null;

  return (
    <div className="page narrow">
      <Link href={backHref} className="back-link"><span aria-hidden="true">←</span> Volver</Link>
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Documento legal · versión {doc.version}</span>
          <h1>{doc.title}</h1>
          <p className="hero-lead">
            {company.legal_name} · RUT {formatRut(company.rut)} · {SCOPES[doc.scope]}.
            {doc.review_firm ? ` Revisado por ${doc.review_firm}${doc.reviewed_on ? ` el ${day(doc.reviewed_on)}` : ""}.` : ""}
          </p>
        </div>
      </header>

      {messageForCode(sp.error) ? <Notice kind="error">{messageForCode(sp.error)}</Notice> : null}

      <article className="card legal-doc">
        <p className="pre">{preview}</p>
      </article>

      {signed ? (
        <Notice kind="ok">
          Ya firmado por {signed.signer_name}. <Link href={`/legal/firma/${signed.id}`}>Ver la copia firmada</Link>.
        </Notice>
      ) : doc.status !== "aprobado" ? (
        <Notice kind="info">Este documento aún está en revisión jurídica. Podrás firmarlo cuando ENQORA lo apruebe.</Notice>
      ) : !canSign ? (
        <Notice kind="info">Solo el Propietario o un Administrador de la empresa puede firmar este documento.</Notice>
      ) : (
        <section className="card" aria-labelledby="firma-title">
          <h2 id="firma-title" className="card-title">Firmar electrónicamente</h2>
          <p className="panel-lead">
            Firmas con tu cuenta y tu segundo factor (firma electrónica simple, Ley 19.799). Guardamos el texto exacto que firmas,
            su huella digital, la fecha, tu sesión, tu IP y tu navegador, y te enviamos la copia. ENQORA nunca te pedirá tu
            ClaveÚnica ni tu clave tributaria.
          </p>
          <form action={signLegalDocumentAction} className="catalog-form">
            <input type="hidden" name="document_id" value={doc.id} />
            <input type="hidden" name="company_id" value={companyId} />
            {caseId ? <input type="hidden" name="case_id" value={caseId} /> : null}
            <input type="hidden" name="hash" value={doc.body_hash} />
            <div className="form-grid">
              <div className="field">
                <label htmlFor="signer_name">Nombre completo de quien firma</label>
                <input id="signer_name" name="signer_name" className="input" required minLength={3} maxLength={160} autoComplete="name" />
              </div>
              <div className="field">
                <label htmlFor="signer_rut">RUN de quien firma</label>
                <input id="signer_rut" name="signer_rut" className="input" required maxLength={12} placeholder="12.345.678-9" />
              </div>
              <div className="field">
                <label htmlFor="signer_role">Calidad en que firma</label>
                <input id="signer_role" name="signer_role" className="input" required minLength={3} maxLength={80} placeholder="Representante legal" />
              </div>
            </div>
            <label className="check-inline">
              <input type="checkbox" name="confirm" required />
              <span>Leí el documento completo, tengo facultades para representar a {company.legal_name} y lo firmo en su nombre.</span>
            </label>
            <SubmitButton pendingText="Firmando…">Firmar documento</SubmitButton>
          </form>
        </section>
      )}
    </div>
  );
}
