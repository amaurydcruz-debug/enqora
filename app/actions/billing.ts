"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { dbCode } from "@/lib/db-errors";
import { flowCreatePayment, flowEnabled } from "@/lib/flow";
import { createClient } from "@/lib/supabase/server";

// Planes, suscripciones, cobros y pagos (M10). Las reglas viven en la base de datos
// (0011_planes_pagos.sql); aquí se validan formatos y se vuelve a la pantalla con aviso o error.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const text = (fd: FormData, k: string, max = 4000) => String(fd.get(k) ?? "").trim().slice(0, max);
const uuid = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" && UUID_RE.test(v) ? v : null;
};
const money = (fd: FormData, k: string) => {
  const raw = text(fd, k, 20).replace(/[^\d]/g, "");
  return raw ? Number(raw) : null;
};
const optInt = (fd: FormData, k: string) => {
  const raw = text(fd, k, 10).replace(/[^\d]/g, "");
  return raw ? raw : "";
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

// ---------- Cliente: contratar, cancelar y reanudar ----------
export async function subscribePlanAction(fd: FormData) {
  const company = uuid(fd, "company_id");
  const plan = uuid(fd, "plan_id");
  if (!company || !plan) redirect("/planes");
  if (fd.get("confirm") !== "on") redirect("/planes?error=ENQ_FALTA_CONFIRMACION");
  const supabase = await createClient();
  const { error } = await supabase.rpc("subscribe_plan", { p_company: company, p_plan: plan });
  if (error) backTo("/planes", "", error, "");
  revalidatePath("/planes");
  redirect("/facturacion?aviso=suscripcion_creada#cobros");
}

export async function cancelSubscriptionAction(fd: FormData) {
  const sub = uuid(fd, "subscription_id");
  if (!sub) redirect("/facturacion");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_subscription", { p_subscription: sub, p_reason: text(fd, "reason", 500) });
  backTo("/facturacion", "suscripciones", error, data === "cancelada" ? "suscripcion_cancelada" : "no_renovar");
}

export async function resumeSubscriptionAction(fd: FormData) {
  const sub = uuid(fd, "subscription_id");
  if (!sub) redirect("/facturacion");
  const supabase = await createClient();
  const { error } = await supabase.rpc("resume_subscription", { p_subscription: sub });
  backTo("/facturacion", "suscripciones", error, "suscripcion_reanudada");
}

// ---------- Cliente: pagar ----------
export async function reportTransferAction(fd: FormData) {
  const charge = uuid(fd, "charge_id");
  if (!charge) redirect("/facturacion");
  const supabase = await createClient();
  const { error } = await supabase.rpc("report_transfer", {
    p_charge: charge,
    p_reference: text(fd, "reference", 120),
    p_paid_on: date(fd, "paid_on"),
  });
  backTo("/facturacion", "cobros", error, "transferencia_informada");
}

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export async function startGatewayPaymentAction(fd: FormData) {
  const charge = uuid(fd, "charge_id");
  if (!charge) redirect("/facturacion");
  if (!flowEnabled()) redirect("/facturacion?error=ENQ_PASARELA_NO_CONFIGURADA#cobros");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_gateway_payment", { p_charge: charge });
  if (error || !data) backTo("/facturacion", "cobros", error, "");
  const info = data as { pago: string; monto: number; asunto: string; correo: string };

  const base = await origin();
  let order: Awaited<ReturnType<typeof flowCreatePayment>>;
  try {
    order = await flowCreatePayment({
      commerceOrder: info.pago,
      subject: info.asunto,
      amount: info.monto,
      email: info.correo,
      urlConfirmation: `${base}/api/pagos/flow/confirmacion`,
      urlReturn: `${base}/api/pagos/flow/retorno`,
    });
  } catch (e) {
    console.error("[ENQORA pagos] No se pudo crear la orden en Flow:", e instanceof Error ? e.message : e);
    redirect("/facturacion?error=ENQ_PASARELA_ERROR#cobros");
  }
  const { error: e2 } = await supabase.rpc("gateway_attach", { p_payment: info.pago, p_token: order.token, p_order: String(order.flowOrder || "") });
  if (e2) redirect("/facturacion?error=ENQ_PASARELA_ERROR#cobros");
  redirect(`${order.url}?token=${encodeURIComponent(order.token)}`);
}

// ---------- Propuesta mensual (caso) ----------
export async function createProposalAction(fd: FormData) {
  const caseId = uuid(fd, "case_id");
  const plan = uuid(fd, "plan_id");
  if (!caseId) redirect("/mando");
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_plan_proposal", {
    p_case: caseId,
    p_plan: plan,
    p_data: {
      resolved: text(fd, "resolved"),
      ongoing: text(fd, "ongoing"),
      next_month: text(fd, "next_month", 2000),
      risks: text(fd, "risks", 2000),
      benefit: text(fd, "benefit", 2000),
    },
    p_valid_days: Number.parseInt(text(fd, "valid_days", 3), 10) || 15,
  });
  backTo(`/casos/${caseId}`, "plan", error, "propuesta_creada");
}

export async function decideProposalAction(fd: FormData) {
  const caseId = uuid(fd, "case_id");
  const proposal = uuid(fd, "proposal_id");
  if (!caseId || !proposal) redirect("/casos");
  const decision = text(fd, "decision", 20);
  if (decision === "aceptar" && fd.get("confirm") !== "on") redirect(`/casos/${caseId}?error=ENQ_FALTA_CONFIRMACION#plan`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_plan_proposal", { p_proposal: proposal, p_decision: decision, p_note: text(fd, "note", 1000) });
  if (!error && decision === "aceptar") {
    revalidatePath(`/casos/${caseId}`);
    redirect("/facturacion?aviso=suscripcion_creada#cobros");
  }
  backTo(`/casos/${caseId}`, "plan", error, "propuesta_rechazada");
}

export async function cancelProposalAction(fd: FormData) {
  const caseId = uuid(fd, "case_id");
  const proposal = uuid(fd, "proposal_id");
  if (!caseId || !proposal) redirect("/casos");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_plan_proposal", { p_proposal: proposal });
  backTo(`/casos/${caseId}`, "plan", error, "propuesta_anulada");
}

// ---------- Centro de Mando: planes ----------
export async function savePlanAction(fd: FormData) {
  const id = uuid(fd, "plan_id");
  const services = text(fd, "included_services", 600)
    .split(/[\s,;]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 30);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_plan", {
    p_plan: id,
    p_data: {
      code: text(fd, "code", 8).toUpperCase(),
      line: text(fd, "line", 30),
      name: text(fd, "name", 120),
      summary: text(fd, "summary", 400),
      scope: text(fd, "scope"),
      exclusions: text(fd, "exclusions", 2000),
      limit_documents: optInt(fd, "limit_documents"),
      limit_operations: optInt(fd, "limit_operations"),
      limit_workers: optInt(fd, "limit_workers"),
      included_services: services,
      renewal_terms: text(fd, "renewal_terms", 1000),
      cancellation_terms: text(fd, "cancellation_terms", 1000),
      position: optInt(fd, "position"),
    },
  });
  backTo("/mando/planes", error ? "" : `p-${data ?? id}`, error, id ? "plan" : "plan_creado");
}

export async function setPlanActiveAction(fd: FormData) {
  const plan = uuid(fd, "plan_id");
  if (!plan) redirect("/mando/planes");
  const active = fd.get("active") === "1";
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_plan_active", { p_plan: plan, p_active: active });
  backTo("/mando/planes", `p-${plan}`, error, active ? "plan_activado" : "plan_desactivado");
}

export async function draftPlanPriceAction(fd: FormData) {
  const plan = uuid(fd, "plan_id");
  if (!plan) redirect("/mando/planes");
  const supabase = await createClient();
  const { error } = await supabase.rpc("draft_plan_price", { p_plan: plan, p_monthly_price: money(fd, "monthly_price"), p_notes: text(fd, "notes", 1000) });
  backTo("/mando/planes", `p-${plan}`, error, "precio_borrador");
}

export async function publishPlanPriceAction(fd: FormData) {
  const plan = uuid(fd, "plan_id");
  const price = uuid(fd, "price_id");
  if (!plan || !price) redirect("/mando/planes");
  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_plan_price", { p_price: price });
  backTo("/mando/planes", `p-${plan}`, error, "precio_publicado");
}

export async function retirePlanPriceAction(fd: FormData) {
  const plan = uuid(fd, "plan_id");
  const price = uuid(fd, "price_id");
  if (!plan || !price) redirect("/mando/planes");
  const supabase = await createClient();
  const { error } = await supabase.rpc("retire_plan_price", { p_price: price });
  backTo("/mando/planes", `p-${plan}`, error, "precio_retirado");
}

// ---------- Centro de Mando: cobros y pagos ----------
export async function reviewPaymentAction(fd: FormData) {
  const payment = uuid(fd, "payment_id");
  if (!payment) redirect("/mando/cobros");
  const decision = text(fd, "decision", 20);
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_payment", { p_payment: payment, p_decision: decision, p_note: text(fd, "note", 1000) });
  backTo("/mando/cobros", "por-confirmar", error, decision === "confirmar" ? "pago_confirmado" : "pago_rechazado");
}

export async function registerPaymentAction(fd: FormData) {
  const charge = uuid(fd, "charge_id");
  if (!charge) redirect("/mando/cobros");
  const supabase = await createClient();
  const { error } = await supabase.rpc("register_payment", {
    p_charge: charge,
    p_method: text(fd, "method", 20),
    p_reference: text(fd, "reference", 120),
    p_paid_on: date(fd, "paid_on"),
  });
  backTo("/mando/cobros", "abiertos", error, "pago_registrado");
}

export async function voidChargeAction(fd: FormData) {
  const charge = uuid(fd, "charge_id");
  if (!charge) redirect("/mando/cobros");
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_charge", { p_charge: charge, p_reason: text(fd, "reason", 500) });
  backTo("/mando/cobros", "abiertos", error, "cobro_anulado");
}

export async function saveBillingSettingsAction(fd: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_billing_settings", {
    p_data: {
      bank_name: text(fd, "bank_name", 80),
      account_type: text(fd, "account_type", 40),
      account_number: text(fd, "account_number", 40),
      holder_name: text(fd, "holder_name", 120),
      holder_rut: text(fd, "holder_rut", 12),
      notify_email: text(fd, "notify_email", 160),
      transfer_note: text(fd, "transfer_note", 500),
    },
  });
  backTo("/mando/cobros", "configuracion", error, "datos_guardados");
}

export async function runBillingAction() {
  const supabase = await createClient();
  const { error } = await supabase.rpc("billing_run", { p_token: null });
  backTo("/mando/cobros", "configuracion", error, "facturacion_ejecutada");
}

export type TokenState = { token?: string; error?: string } | undefined;

// La clave se muestra una sola vez en pantalla para copiarla en Vercel; la base guarda solo su hash.
export async function rotateServiceTokenAction(_: TokenState, fd: FormData): Promise<TokenState> {
  if (fd.get("confirm") !== "on") return { error: "Confirma que entiendes que la clave anterior dejará de funcionar." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rotate_service_token");
  if (dbCode(error) === "ENQ_REAUTH") redirect(`/mfa/reautenticar?next=${encodeURIComponent("/mando/cobros#configuracion")}`);
  if (error || typeof data !== "string") return { error: "No pudimos generar la clave. Intenta nuevamente." };
  return { token: data };
}
