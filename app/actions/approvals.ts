"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dbCode } from "@/lib/db-errors";

// Aprobaciones internas y autorizaciones del cliente (Etapa 5).
// Todas las reglas viven en la base de datos (funciones con RLS); aquí solo se validan formatos.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const text = (fd: FormData, k: string, max = 4000) => String(fd.get(k) ?? "").trim().slice(0, max);
const uuid = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" && UUID_RE.test(v) ? v : null;
};
const dateOf = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "");
  return DATE_RE.test(v) ? v : null;
};

// Vuelve a la ficha del caso con aviso o error; si la base pide reautenticación, la solicita.
function back(caseId: string, error: { message?: string } | null, ok: string, anchor: string) {
  const code = dbCode(error);
  const target = `/casos/${caseId}#${anchor}`;
  if (code === "ENQ_REAUTH") redirect(`/mfa/reautenticar?next=${encodeURIComponent(target)}`);
  revalidatePath(`/casos/${caseId}`);
  revalidatePath("/mando");
  redirect(`/casos/${caseId}?${error ? `error=${code ?? "ENQ_DATOS_INVALIDOS"}` : `aviso=${ok}`}#${anchor}`);
}

// ---------- Aprobaciones internas ----------
export async function requestApprovalAction(fd: FormData) {
  const caseId = uuid(fd, "case_id");
  if (!caseId) redirect("/mando");
  const amount = Number(text(fd, "amount", 20).replace(/[^\d]/g, ""));
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_approval", {
    p_case: caseId,
    p_kind: text(fd, "kind", 30),
    p_title: text(fd, "title", 160),
    p_detail: text(fd, "detail"),
    p_approver_role: text(fd, "approver_role", 30) || "responsable",
    p_on_approve_status: text(fd, "on_approve_status", 40) || null,
    p_payload: amount > 0 ? { monto: amount } : {},
  });
  back(caseId, error, "aprobacion_solicitada", "aprobaciones");
}

export async function decideApprovalAction(fd: FormData) {
  const caseId = uuid(fd, "case_id");
  const approval = uuid(fd, "approval_id");
  if (!caseId || !approval) redirect("/mando");
  const decision = text(fd, "decision", 20);
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_approval", {
    p_approval: approval,
    p_decision: decision,
    p_note: text(fd, "note"),
  });
  back(caseId, error, `aprobacion_${decision}`, "aprobaciones");
}

export async function cancelApprovalAction(fd: FormData) {
  const caseId = uuid(fd, "case_id");
  const approval = uuid(fd, "approval_id");
  if (!caseId || !approval) redirect("/mando");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_approval", { p_approval: approval });
  back(caseId, error, "aprobacion_anulada", "aprobaciones");
}

// ---------- Autorizaciones del cliente ----------
export async function requestAuthorizationAction(fd: FormData) {
  const caseId = uuid(fd, "case_id");
  if (!caseId) redirect("/casos");
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_client_authorization", {
    p_case: caseId,
    p_title: text(fd, "title", 160),
    p_scope: text(fd, "scope", 2000),
    p_institution: text(fd, "institution", 160) || null,
    p_valid_until: dateOf(fd, "valid_until"),
  });
  back(caseId, error, "autorizacion_solicitada", "autorizaciones");
}

export async function decideAuthorizationAction(fd: FormData) {
  const caseId = uuid(fd, "case_id");
  const auth = uuid(fd, "authorization_id");
  if (!caseId || !auth) redirect("/casos");
  const decision = text(fd, "decision", 20);
  // Autorizar exige la confirmación expresa del cliente.
  if (decision === "autorizar" && fd.get("confirm") !== "on") {
    redirect(`/casos/${caseId}?error=ENQ_FALTA_CONFIRMACION#autorizaciones`);
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_client_authorization", {
    p_auth: auth,
    p_decision: decision,
    p_note: text(fd, "note", 2000),
  });
  back(caseId, error, decision === "autorizar" ? "autorizada" : "autorizacion_rechazada", "autorizaciones");
}

export async function revokeAuthorizationAction(fd: FormData) {
  const caseId = uuid(fd, "case_id");
  const auth = uuid(fd, "authorization_id");
  if (!caseId || !auth) redirect("/casos");
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_client_authorization", { p_auth: auth, p_note: text(fd, "note", 2000) });
  back(caseId, error, "autorizacion_revocada", "autorizaciones");
}

export async function cancelAuthorizationAction(fd: FormData) {
  const caseId = uuid(fd, "case_id");
  const auth = uuid(fd, "authorization_id");
  if (!caseId || !auth) redirect("/casos");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_client_authorization", { p_auth: auth });
  back(caseId, error, "autorizacion_anulada", "autorizaciones");
}
