"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbCode } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";

// Resultados para el cliente: calificación del servicio y ahorro verificado (0033).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "");
  return UUID_RE.test(v) ? v : null;
};
const text = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max);

function back(caseId: string, error: { message?: string } | null, ok: string) {
  const code = dbCode(error);
  if (code === "ENQ_REAUTH") redirect(`/mfa/reautenticar?next=${encodeURIComponent(`/casos/${caseId}#diagnostico`)}`);
  revalidatePath(`/casos/${caseId}`);
  revalidatePath("/panel");
  redirect(`/casos/${caseId}?${error ? `error=${code ?? "ENQ_DATOS_INVALIDOS"}` : `aviso=${ok}`}#diagnostico`);
}

export async function rateCaseAction(fd: FormData) {
  const caseId = uuid(fd, "case_id");
  if (!caseId) redirect("/casos");
  const resuelto = text(fd, "resuelto", 10);
  const satisfaccion = Number(fd.get("satisfaccion"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("rate_case", {
    p_case: caseId, p_resuelto: resuelto, p_satisfaccion: Number.isInteger(satisfaccion) ? satisfaccion : 0, p_comentario: text(fd, "comentario", 1000) || null,
  });
  back(caseId, error, "calificacion_guardada");
}

export async function recordSavingAction(fd: FormData) {
  const caseId = uuid(fd, "case_id");
  if (!caseId) redirect("/casos");
  const monto = Number(String(fd.get("monto") ?? "").replace(/[^\d]/g, ""));
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_case_saving", {
    p_case: caseId, p_monto: monto, p_concepto: text(fd, "concepto", 300), p_fundamento: text(fd, "fundamento", 1500), p_documento: uuid(fd, "documento"),
  });
  back(caseId, error, "ahorro_registrado");
}

export async function verifySavingAction(fd: FormData) {
  const caseId = uuid(fd, "case_id");
  const savingId = uuid(fd, "saving_id");
  if (!caseId || !savingId) redirect("/casos");
  const aprobar = fd.get("decision") === "verificar";
  const supabase = await createClient();
  const { error } = await supabase.rpc("verify_case_saving", { p_saving: savingId, p_aprobar: aprobar, p_nota: text(fd, "nota", 500) || null });
  back(caseId, error, aprobar ? "ahorro_verificado" : "ahorro_rechazado");
}
