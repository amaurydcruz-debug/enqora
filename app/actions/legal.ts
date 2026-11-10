"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { dbCode } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";

// Documentos legales (0036). Las reglas viven en la base: aquí solo se validan formatos.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const text = (fd: FormData, k: string, max = 4000) => String(fd.get(k) ?? "").trim().slice(0, max);
const uuid = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" && UUID_RE.test(v) ? v : null;
};

function back(path: string, anchor: string, error: { message?: string } | null, ok: string): never {
  const code = dbCode(error);
  const target = `${path}${anchor ? `#${anchor}` : ""}`;
  if (code === "ENQ_REAUTH") redirect(`/mfa/reautenticar?next=${encodeURIComponent(target)}`);
  revalidatePath(path.split("?")[0]);
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${error ? `error=${code ?? "ENQ_DATOS_INVALIDOS"}` : `aviso=${ok}`}${anchor ? `#${anchor}` : ""}`);
}

// ---------- Cliente: firmar ----------
export async function signLegalDocumentAction(fd: FormData) {
  const doc = uuid(fd, "document_id");
  const company = uuid(fd, "company_id");
  const caseId = uuid(fd, "case_id");
  if (!doc || !company) redirect("/panel");
  const page = `/legal/firmar?doc=${doc}&empresa=${company}${caseId ? `&caso=${caseId}` : ""}`;
  if (fd.get("confirm") !== "on") redirect(`${page}&error=ENQ_FALTA_CONFIRMACION`);

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sign_legal_document", {
    p_document: doc,
    p_company: company,
    p_case: caseId,
    p_hash: text(fd, "hash", 64),
    p_name: text(fd, "signer_name", 160),
    p_rut: text(fd, "signer_rut", 12),
    p_role: text(fd, "signer_role", 80),
    p_client: { ip: ip.slice(0, 64), ua: (h.get("user-agent") ?? "").slice(0, 300) },
  });
  if (error) back(page, "", error, "");
  revalidatePath(caseId ? `/casos/${caseId}` : `/empresas/${company}`);
  redirect(`/legal/firma/${data}?aviso=firmado`);
}

// ---------- Equipo: versiones, revisión jurídica y aprobación ----------
export async function saveLegalDocumentAction(fd: FormData) {
  const supabase = await createClient();
  const code = text(fd, "code", 40).toUpperCase();
  const { error } = await supabase.rpc("save_legal_document", {
    p_code: code,
    p_kind: text(fd, "kind", 20),
    p_scope: text(fd, "scope", 20),
    p_institution: text(fd, "institution", 30),
    p_title: text(fd, "title", 160),
    p_body: String(fd.get("body") ?? "").replace(/\r\n/g, "\n").trim().slice(0, 60000),
  });
  back("/mando/legal", code.toLowerCase(), error, "version_guardada");
}

export async function sendLegalReviewAction(fd: FormData) {
  const id = uuid(fd, "document_id");
  if (!id) redirect("/mando/legal");
  const supabase = await createClient();
  const { error } = await supabase.rpc("send_legal_document_review", { p_document: id });
  back("/mando/legal", text(fd, "anchor", 40), error, "enviado_revision");
}

export async function approveLegalDocumentAction(fd: FormData) {
  const id = uuid(fd, "document_id");
  if (!id) redirect("/mando/legal");
  if (fd.get("confirm") !== "on") redirect("/mando/legal?error=ENQ_FALTA_CONFIRMACION");
  const reviewed = text(fd, "reviewed_on", 10);
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_legal_document", {
    p_document: id,
    p_firm: text(fd, "review_firm", 160),
    p_reference: text(fd, "review_reference", 300),
    p_reviewed_on: DATE_RE.test(reviewed) ? reviewed : null,
    p_note: text(fd, "review_note", 2000),
  });
  back("/mando/legal", text(fd, "anchor", 40), error, "aprobado");
}

export async function returnLegalDocumentAction(fd: FormData) {
  const id = uuid(fd, "document_id");
  if (!id) redirect("/mando/legal");
  const retire = fd.get("retire") === "1";
  const supabase = await createClient();
  const { error } = await supabase.rpc("return_legal_document", { p_document: id, p_retire: retire, p_note: text(fd, "note", 2000) });
  back("/mando/legal", text(fd, "anchor", 40), error, retire ? "retirado" : "devuelto");
}

export async function saveLegalProfileAction(fd: FormData) {
  const code = text(fd, "service_code", 12);
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_service_legal_profile", {
    p_code: code,
    p_data: {
      institutions: fd.getAll("institutions").map(String).slice(0, 10),
      represents: fd.get("represents") === "on",
      formalidad: text(fd, "formalidad", 1500),
      base_legal: text(fd, "base_legal", 600),
      verificacion: text(fd, "verificacion", 20),
      fuente_url: text(fd, "fuente_url", 500),
      nota: text(fd, "nota", 1000),
    },
  });
  back("/mando/legal", `ficha-${code.toLowerCase()}`, error, "ficha_guardada");
}
