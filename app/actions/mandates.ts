"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbCode, dbMessage } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";

// Mandatos y actuaciones (M11). Las reglas viven en la base de datos (0012); aquí se validan formatos.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const text = (fd: FormData, k: string, max = 4000) => String(fd.get(k) ?? "").trim().slice(0, max);
const uuid = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" && UUID_RE.test(v) ? v : null;
};
const date = (fd: FormData, k: string) => {
  const v = text(fd, k, 10);
  return DATE_RE.test(v) ? v : null;
};

function backTo(path: string, anchor: string, error: { message?: string } | null, ok: string) {
  const code = dbCode(error);
  const target = `${path}${anchor ? `#${anchor}` : ""}`;
  if (code === "ENQ_REAUTH") redirect(`/mfa/reautenticar?next=${encodeURIComponent(target)}`);
  revalidatePath(path);
  redirect(`${path}?${error ? `error=${code ?? "ENQ_DATOS_INVALIDOS"}` : `aviso=${ok}`}${anchor ? `#${anchor}` : ""}`);
}

// ---------- Equipo: preparar, enviar, anular y verificar ----------
export async function saveMandateAction(fd: FormData) {
  const id = uuid(fd, "mandate_id");
  const company = uuid(fd, "company_id");
  if (!company) redirect("/mando/mandatos?error=ENQ_DATOS_INVALIDOS");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_mandate", {
    p_mandate: id,
    p_company: company,
    p_data: {
      kind: text(fd, "kind", 20),
      representative_name: text(fd, "representative_name", 160),
      representative_rut: text(fd, "representative_rut", 12),
      institutions: fd.getAll("institutions").map(String).slice(0, 10),
      procedures: text(fd, "procedures", 2000),
      scope: text(fd, "scope", 8000),
      valid_from: date(fd, "valid_from"),
      valid_until: date(fd, "valid_until"),
      case_id: uuid(fd, "case_id") ?? "",
    },
  });
  backTo("/mando/mandatos", error ? "" : String(data ?? id ?? ""), error, id ? "mandato_guardado" : "mandato_creado");
}

export async function sendMandateAction(fd: FormData) {
  const id = uuid(fd, "mandate_id");
  if (!id) redirect("/mando/mandatos");
  const supabase = await createClient();
  const { error } = await supabase.rpc("send_mandate", { p_mandate: id });
  backTo("/mando/mandatos", id, error, "mandato_enviado");
}

export async function cancelMandateAction(fd: FormData) {
  const id = uuid(fd, "mandate_id");
  if (!id) redirect("/mando/mandatos");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_mandate", { p_mandate: id });
  backTo("/mando/mandatos", id, error, "mandato_anulado");
}

export async function verifyMandateAction(fd: FormData) {
  const id = uuid(fd, "mandate_id");
  if (!id) redirect("/mando/mandatos");
  const checks = Object.fromEntries(
    ["identidad_firmante", "representacion_legal", "documento_coincide", "requisitos_institucion"].map((k) => [k, fd.get(k) === "on"]),
  );
  const decision = text(fd, "decision", 10);
  const supabase = await createClient();
  const { error } = await supabase.rpc("verify_mandate", { p_mandate: id, p_decision: decision, p_checks: checks, p_note: text(fd, "note", 1000) });
  backTo("/mando/mandatos", id, error, decision === "aprobar" ? "mandato_vigente" : "mandato_observado");
}

// ---------- Cliente: aceptar, subir el firmado y revocar ----------
export async function acceptMandateAction(fd: FormData) {
  const id = uuid(fd, "mandate_id");
  const company = uuid(fd, "company_id");
  if (!id || !company) redirect("/empresas");
  if (fd.get("confirm") !== "on") redirect(`/empresas/${company}?error=ENQ_FALTA_CONFIRMACION#mandatos`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_mandate", {
    p_mandate: id,
    p_signer_name: text(fd, "signer_name", 160),
    p_signer_rut: text(fd, "signer_rut", 12),
    p_signer_role: text(fd, "signer_role", 80),
  });
  backTo(`/empresas/${company}`, "mandatos", error, "mandato_aceptado");
}

export async function revokeMandateAction(fd: FormData) {
  const id = uuid(fd, "mandate_id");
  const company = uuid(fd, "company_id");
  if (!id || !company) redirect("/empresas");
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_mandate", { p_mandate: id, p_reason: text(fd, "reason", 500) });
  backTo(`/empresas/${company}`, "mandatos", error, "mandato_revocado");
}

const MANDATE_TYPES = ["application/pdf", "image/jpeg", "image/png"];

export async function prepareMandateUploadAction(mandateRaw: string, fileName: string, size: number, mime: string) {
  if (!UUID_RE.test(mandateRaw)) return { error: "Mandato no válido." };
  if (!size || size > 20 * 1024 * 1024) return { error: "El archivo supera el máximo de 20 MB." };
  if (!MANDATE_TYPES.includes(mime)) return { error: "Sube el mandato firmado en PDF, JPG o PNG." };
  const supabase = await createClient();
  const { data: row } = await supabase.from("mandates").select("company_id, status").eq("id", mandateRaw).maybeSingle();
  const m = row as { company_id: string; status: string } | null;
  if (!m) return { error: "No tienes acceso a este mandato." };
  if (m.status !== "pendiente_firma") return { error: "Este mandato ya no recibe documentos." };
  const safe = fileName.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(-80) || "mandato";
  const path = `${m.company_id}/${mandateRaw}/${randomUUID()}-${safe}`;
  const { data, error } = await supabase.storage.from("mandatos").createSignedUploadUrl(path);
  if (error || !data) return { error: "No tienes permiso para subir el documento de este mandato." };
  return { path, token: data.token as string };
}

export async function registerMandateDocumentAction(mandateRaw: string, path: string, fileName: string) {
  if (!UUID_RE.test(mandateRaw)) return { error: "Mandato no válido." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("attach_mandate_document", { p_mandate: mandateRaw, p_path: path, p_name: fileName.slice(0, 200) });
  if (error) return { error: dbMessage(error) };
  revalidatePath("/empresas", "layout");
  return {};
}

// ---------- Actuaciones ante instituciones (caso) ----------
export async function planActionAction(fd: FormData) {
  const caseId = uuid(fd, "case_id");
  if (!caseId) redirect("/mando");
  const supabase = await createClient();
  const { error } = await supabase.rpc("plan_action", {
    p_case: caseId,
    p_institution: text(fd, "institution", 30),
    p_procedure: text(fd, "procedure", 200),
    p_detail: text(fd, "detail", 2000),
    p_mandate: uuid(fd, "mandate_id"),
    p_authorization: uuid(fd, "authorization_id"),
  });
  backTo(`/casos/${caseId}`, "actuaciones", error, "actuacion_planificada");
}

export async function verifyActionAction(fd: FormData) {
  const caseId = uuid(fd, "case_id");
  const action = uuid(fd, "action_id");
  if (!caseId || !action) redirect("/mando");
  const supabase = await createClient();
  const { error } = await supabase.rpc("verify_action", { p_action: action });
  backTo(`/casos/${caseId}`, "actuaciones", error, "actuacion_habilitada");
}

export async function executeActionAction(fd: FormData) {
  const caseId = uuid(fd, "case_id");
  const action = uuid(fd, "action_id");
  if (!caseId || !action) redirect("/mando");
  const ok = text(fd, "outcome", 10) !== "fallida";
  const supabase = await createClient();
  const { error } = await supabase.rpc("execute_action", { p_action: action, p_success: ok, p_result: text(fd, "result", 2000) });
  backTo(`/casos/${caseId}`, "actuaciones", error, ok ? "actuacion_ejecutada" : "actuacion_fallida");
}

export async function cancelActionAction(fd: FormData) {
  const caseId = uuid(fd, "case_id");
  const action = uuid(fd, "action_id");
  if (!caseId || !action) redirect("/mando");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_action", { p_action: action });
  backTo(`/casos/${caseId}`, "actuaciones", error, "actuacion_cancelada");
}
