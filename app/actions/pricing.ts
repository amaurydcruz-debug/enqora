"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dbCode } from "@/lib/db-errors";
import { researchPrices, saveFoundPrices } from "@/lib/price-advisor";
import { myStaffRole } from "@/lib/staff";

// Catálogo, tarifas y cotizaciones (M07). Las reglas viven en la base de datos;
// aquí solo se validan formatos y se vuelve a la pantalla con aviso o error.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const text = (fd: FormData, k: string, max = 4000) => String(fd.get(k) ?? "").trim().slice(0, max);
const uuid = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" && UUID_RE.test(v) ? v : null;
};
// Montos en CLP: se aceptan con puntos ("120.000"); vacío = null.
const money = (fd: FormData, k: string) => {
  const raw = text(fd, k, 20).replace(/[^\d]/g, "");
  return raw ? Number(raw) : null;
};
const int = (fd: FormData, k: string, fallback = 0) => {
  const n = Number.parseInt(text(fd, k, 10), 10);
  return Number.isFinite(n) ? n : fallback;
};
const dec = (fd: FormData, k: string, fallback = 1) => {
  const n = Number.parseFloat(text(fd, k, 10).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
};
const on = (fd: FormData, k: string) => fd.get(k) === "on";

function backTo(path: string, anchor: string, error: { message?: string } | null, ok: string) {
  const code = dbCode(error);
  const target = `${path}${anchor ? `#${anchor}` : ""}`;
  if (code === "ENQ_REAUTH") redirect(`/mfa/reautenticar?next=${encodeURIComponent(target)}`);
  revalidatePath(path);
  redirect(`${path}?${error ? `error=${code ?? "ENQ_DATOS_INVALIDOS"}` : `aviso=${ok}`}${anchor ? `#${anchor}` : ""}`);
}

// ---------- Catálogo (Administrador ENQORA) ----------
export async function saveServiceAction(fd: FormData) {
  const id = uuid(fd, "service_id");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_service", {
    p_id: id,
    p_code: text(fd, "code", 12).toUpperCase(),
    p_module: text(fd, "module", 20),
    p_name: text(fd, "name", 120),
    p_summary: text(fd, "summary", 300),
    p_scope: text(fd, "scope", 4000),
    p_exclusions: text(fd, "exclusions", 4000),
    p_unit: text(fd, "unit", 20),
    p_requires_professional: on(fd, "requires_professional"),
    p_active: on(fd, "active"),
  });
  backTo("/mando/catalogo", error ? "" : `s-${data ?? id}`, error, id ? "servicio" : "servicio_creado");
}

export async function draftTariffAction(fd: FormData) {
  const service = uuid(fd, "service_id");
  if (!service) redirect("/mando/catalogo");
  const supabase = await createClient();
  const { error } = await supabase.rpc("draft_tariff", {
    p_service: service,
    p_base_price: money(fd, "base_price"),
    p_factor_media: dec(fd, "factor_media"),
    p_factor_compleja: dec(fd, "factor_compleja"),
    p_factor_especializada: dec(fd, "factor_especializada"),
    p_onsite_fee: money(fd, "onsite_fee") ?? 0,
    p_urgency_pct: int(fd, "urgency_pct"),
    p_max_discount_pct: int(fd, "max_discount_pct"),
    p_min_price: money(fd, "min_price"),
    p_max_price: money(fd, "max_price"),
    p_est_hours: text(fd, "est_hours", 8) ? dec(fd, "est_hours", 0) : null,
    p_specialty: text(fd, "specialty", 80),
    p_notes: text(fd, "notes", 2000),
  });
  backTo("/mando/catalogo", `s-${service}`, error, "borrador");
}

export async function publishTariffAction(fd: FormData) {
  const service = uuid(fd, "service_id");
  const tariff = uuid(fd, "tariff_id");
  if (!service || !tariff) redirect("/mando/catalogo");
  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_tariff", { p_tariff: tariff });
  backTo("/mando/catalogo", `s-${service}`, error, "publicada");
}

export async function retireTariffAction(fd: FormData) {
  const service = uuid(fd, "service_id");
  const tariff = uuid(fd, "tariff_id");
  if (!service || !tariff) redirect("/mando/catalogo");
  const supabase = await createClient();
  const { error } = await supabase.rpc("retire_tariff", { p_tariff: tariff });
  backTo("/mando/catalogo", `s-${service}`, error, "retirada");
}

export async function addReferenceAction(fd: FormData) {
  const service = uuid(fd, "service_id");
  if (!service) redirect("/mando/catalogo");
  const date = text(fd, "consulted_on", 10);
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_market_reference", {
    p_service: service,
    p_provider: text(fd, "provider", 120),
    p_url: text(fd, "url", 500),
    p_consulted_on: DATE_RE.test(date) ? date : null,
    p_scope_note: text(fd, "scope_note", 500),
    p_amount_min: money(fd, "amount_min"),
    p_amount_max: money(fd, "amount_max"),
    p_unit: text(fd, "unit", 20),
  });
  backTo("/mando/catalogo", `s-${service}`, error, "referencia");
}

export async function deleteReferenceAction(fd: FormData) {
  const service = uuid(fd, "service_id");
  const ref = uuid(fd, "reference_id");
  if (!service || !ref) redirect("/mando/catalogo");
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_market_reference", { p_reference: ref });
  backTo("/mando/catalogo", `s-${service}`, error, "referencia_eliminada");
}

// ---------- Asesor de precios (M20) ----------
export async function researchPricesAction(fd: FormData) {
  const service = uuid(fd, "service_id");
  if (!service) redirect("/mando/catalogo");
  if (!(await myStaffRole())) redirect("/mando");
  const token = process.env.ENQORA_SERVICE_TOKEN;
  const supabase = await createClient();
  const { data: s } = await supabase.from("services").select("id, code, name, scope, unit").eq("id", service).maybeSingle();
  if (!s || !token) backTo("/mando/catalogo", `s-${service}`, { message: token ? "ENQ_DATOS_INVALIDOS" : "ENQ_CLAVE_SERVICIO" }, "");
  let added = 0;
  try {
    const found = await researchPrices(s as { id: string; code: string; name: string; scope: string; unit: string }, AbortSignal.timeout(50_000));
    added = await saveFoundPrices(supabase, token!, service, found);
  } catch (e) {
    console.error("[ENQORA asesor de precios]", e instanceof Error ? e.message : e);
    redirect(`/mando/catalogo?error=ENQ_ASESOR_PRECIOS#s-${service}`);
  }
  revalidatePath("/mando/catalogo");
  redirect(`/mando/catalogo?aviso=${added ? `precios_${added}` : "precios_0"}#s-${service}`);
}

export async function reviewReferenceAction(fd: FormData) {
  const service = uuid(fd, "service_id");
  const ref = uuid(fd, "reference_id");
  const decision = text(fd, "decision", 20);
  if (!service || !ref) redirect("/mando/catalogo");
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_market_reference", { p_reference: ref, p_decision: decision });
  backTo("/mando/catalogo", `s-${service}`, error, decision === "verificada" ? "referencia_verificada" : "referencia_descartada");
}

export async function draftFromAdviceAction(fd: FormData) {
  const service = uuid(fd, "service_id");
  if (!service) redirect("/mando/catalogo");
  const supabase = await createClient();
  const { error } = await supabase.rpc("draft_tariff_from_advice", { p_service: service });
  backTo("/mando/catalogo", `s-${service}`, error, "borrador");
}

export async function setPricingPolicyAction(fd: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_pricing_policy", { p_discount: int(fd, "discount", 40), p_min_references: int(fd, "min_refs", 3) });
  backTo("/mando/catalogo", "politica", error, "politica");
}

// ---------- Cotizaciones ----------
export async function createQuoteAction(fd: FormData) {
  const caseId = uuid(fd, "case_id");
  const service = uuid(fd, "service_id");
  if (!caseId) redirect("/mando");
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_quote", {
    p_case: caseId,
    p_service: service,
    p_complexity: text(fd, "complexity", 20),
    p_quantity: int(fd, "quantity", 1),
    p_onsite: on(fd, "onsite"),
    p_urgent: on(fd, "urgent"),
    p_discount_pct: int(fd, "discount_pct"),
    p_discount_reason: text(fd, "discount_reason", 500),
    p_external_costs: money(fd, "external_costs") ?? 0,
    p_external_detail: text(fd, "external_detail", 500),
    p_payment_terms: text(fd, "payment_terms", 500),
    p_valid_days: int(fd, "valid_days", 15),
  });
  backTo(`/casos/${caseId}`, "cotizacion", error, "cotizacion_creada");
}

export async function decideQuoteAction(fd: FormData) {
  const caseId = uuid(fd, "case_id");
  const quote = uuid(fd, "quote_id");
  if (!caseId || !quote) redirect("/casos");
  const decision = text(fd, "decision", 20);
  // Aceptar exige la confirmación expresa del cliente.
  if (decision === "aceptar" && fd.get("confirm") !== "on") {
    redirect(`/casos/${caseId}?error=ENQ_FALTA_CONFIRMACION#cotizacion`);
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_quote", { p_quote: quote, p_decision: decision, p_note: text(fd, "note", 1000) });
  backTo(`/casos/${caseId}`, "cotizacion", error, decision === "aceptar" ? "cotizacion_aceptada" : "cotizacion_rechazada");
}

export async function cancelQuoteAction(fd: FormData) {
  const caseId = uuid(fd, "case_id");
  const quote = uuid(fd, "quote_id");
  if (!caseId || !quote) redirect("/casos");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_quote", { p_quote: quote });
  backTo(`/casos/${caseId}`, "cotizacion", error, "cotizacion_anulada");
}
