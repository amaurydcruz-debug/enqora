"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbCode } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";

// Despacho en terreno (0053). Todas las reglas viven en la base: aquí solo se validan formatos y se redirige.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "");
  return UUID_RE.test(v) ? v : null;
};
const text = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max);

function volver(path: string, error: { message?: string } | null, aviso: string): never {
  revalidatePath("/mando/terreno");
  redirect(`${path}${path.includes("?") ? "&" : "?"}${error ? `error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}` : `aviso=${aviso}`}`);
}

export async function crearEncargoAction(fd: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_field_task", {
    p_folio: text(fd, "folio", 20).toUpperCase(),
    p_type: text(fd, "tipo", 6),
    p_data: {
      oficina: text(fd, "oficina", 160), direccion: text(fd, "direccion", 240), comuna: text(fd, "comuna", 80),
      instrucciones: text(fd, "instrucciones", 2000), vence: /^\d{4}-\d{2}-\d{2}$/.test(text(fd, "vence", 10)) ? text(fd, "vence", 10) : "",
    },
  });
  if (error || typeof data !== "string") volver("/mando/terreno", error ?? { message: "ENQ_DATOS_INVALIDOS" }, "");
  volver(`/mando/terreno/${data}`, null, "creado");
}

export async function revisarEncargoAction(fd: FormData) {
  const t = id(fd, "task_id");
  if (!t) redirect("/mando/terreno");
  const accion = text(fd, "accion", 20);
  const supabase = await createClient();
  const { error } = await supabase.rpc("field_task_review", { p_task: t, p_action: accion, p_note: text(fd, "nota", 1000) || null });
  volver(`/mando/terreno/${t}`, error, `rev_${accion}`);
}

export async function asignarEncargoAction(fd: FormData) {
  const t = id(fd, "task_id");
  const g = id(fd, "gestor_id");
  if (!t || !g) redirect("/mando/terreno?error=ENQ_DATOS_INVALIDOS");
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_field_task", { p_task: t, p_gestor: g });
  volver(`/mando/terreno/${t}`, error, "asignado");
}

// Gestor: aceptar con minutos estimados, actualizar hora, llegar, realizado o no realizado.
export async function gestorEncargoAction(fd: FormData) {
  const t = id(fd, "task_id");
  if (!t) redirect("/mando/terreno");
  const accion = text(fd, "accion", 20);
  const minutos = Number(fd.get("minutos"));
  const eta = Number.isFinite(minutos) && minutos >= 5 && minutos <= 720 ? new Date(Date.now() + minutos * 60_000).toISOString() : null;
  const supabase = await createClient();
  const { error } = await supabase.rpc("field_task_gestor", {
    p_task: t, p_action: accion, p_eta: eta, p_receipt: text(fd, "comprobante", 200) || null, p_note: text(fd, "nota", 2000) || null,
  });
  volver(accion === "rechazar" && !error ? "/mando/terreno" : `/mando/terreno/${t}`, error, `g_${accion}`);
}

export async function custodiaAction(fd: FormData) {
  const d = id(fd, "doc_id");
  const t = id(fd, "task_id");
  if (!d || !t) redirect("/mando/terreno");
  const supabase = await createClient();
  const { error } = await supabase.rpc("field_task_doc", { p_doc: d, p_custody: text(fd, "custodia", 20), p_note: text(fd, "nota", 300) || null });
  volver(`/mando/terreno/${t}`, error, "custodia");
}

export async function verificarEncargoAction(fd: FormData) {
  const t = id(fd, "task_id");
  if (!t) redirect("/mando/terreno");
  const ok = fd.get("decision") === "ok";
  const supabase = await createClient();
  const { error } = await supabase.rpc("verify_field_task", { p_task: t, p_ok: ok, p_note: text(fd, "nota", 1000) || null });
  volver(`/mando/terreno/${t}`, error, ok ? "verificado" : "reprogramado");
}

export async function tarifaTipoAction(fd: FormData) {
  const fee = Number(String(fd.get("tarifa") ?? "").replace(/[^\d]/g, ""));
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_field_task_type", {
    p_code: text(fd, "code", 6), p_fee: fee > 0 ? fee : null, p_active: fd.get("activo") === "on",
  });
  volver("/mando/terreno#tarifas", error, "tarifa");
}

export async function liquidacionAction(fd: FormData) {
  const supabase = await createClient();
  const accion = text(fd, "accion", 20);
  if (accion === "generar") {
    const g = id(fd, "gestor_id");
    const mes = text(fd, "mes", 7);
    if (!g || !/^\d{4}-\d{2}$/.test(mes)) redirect("/mando/terreno?error=ENQ_DATOS_INVALIDOS#liquidaciones");
    const { error } = await supabase.rpc("create_field_payout", { p_gestor: g, p_period: `${mes}-01` });
    volver("/mando/terreno#liquidaciones", error, "liq_generada");
  }
  const p = id(fd, "payout_id");
  if (!p) redirect("/mando/terreno#liquidaciones");
  const { error } = await supabase.rpc("decide_field_payout", { p_payout: p, p_action: accion, p_reference: text(fd, "referencia", 120) || null });
  if (dbCode(error) === "ENQ_REAUTH") redirect(`/mfa/reautenticar?next=${encodeURIComponent("/mando/terreno#liquidaciones")}`);
  volver("/mando/terreno#liquidaciones", error, `liq_${accion}`);
}
