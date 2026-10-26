"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbCode } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";

// ENQORA CONTABILIDAD (M12): conciliación y F29. La carga de archivos va directo desde el navegador
// a las funciones de la base de datos (por lotes); las reglas viven en 0013_contabilidad.sql.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (fd: FormData, k: string, max = 1000) => String(fd.get(k) ?? "").trim().slice(0, max);
const uuid = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" && UUID_RE.test(v) ? v : null;
};
const money = (fd: FormData, k: string) => {
  const raw = text(fd, k, 20).replace(/[^\d]/g, "");
  return raw ? Number(raw) : 0;
};

function target(fd: FormData) {
  const period = text(fd, "period", 7);
  const company = uuid(fd, "company_id");
  const p = /^\d{4}-\d{2}$/.test(period) ? period : "";
  return { company, path: `/contabilidad/${p}`, query: company ? `empresa=${company}` : "" };
}

function backTo(fd: FormData, anchor: string, error: { message?: string } | null, ok: string) {
  const t = target(fd);
  const code = dbCode(error);
  const dest = `${t.path}?${t.query}${t.query ? "&" : ""}`;
  if (code === "ENQ_REAUTH") redirect(`/mfa/reautenticar?next=${encodeURIComponent(`${t.path}?${t.query}#${anchor}`)}`);
  revalidatePath(t.path);
  redirect(`${dest}${error ? `error=${code ?? "ENQ_DATOS_INVALIDOS"}` : `aviso=${ok}`}#${anchor}`);
}

const periodDate = (fd: FormData) => `${text(fd, "period", 7)}-01`;

export async function clearBookAction(fd: FormData) {
  const { company } = target(fd);
  const book = text(fd, "book", 10);
  const supabase = await createClient();
  const { error } = await supabase.rpc("clear_book", { p_company: company, p_period: periodDate(fd), p_book: book });
  backTo(fd, book === "compra" ? "compras" : "ventas", error, "libro_vaciado");
}

export async function clearBankAction(fd: FormData) {
  const { company } = target(fd);
  const supabase = await createClient();
  const { error } = await supabase.rpc("clear_bank", { p_company: company, p_period: periodDate(fd), p_account: text(fd, "account", 80) });
  backTo(fd, "banco", error, "banco_vaciado");
}

export async function reconcileAction(fd: FormData) {
  const pairs = fd.getAll("pair").map(String).map((p) => p.split(":")).filter((p) => p.length === 2 && UUID_RE.test(p[0]) && UUID_RE.test(p[1]));
  const supabase = await createClient();
  let error: { message?: string } | null = null;
  for (const [m, d] of pairs.slice(0, 300)) {
    const r = await supabase.rpc("reconcile", { p_movement: m, p_document: d });
    if (r.error && !error) error = r.error;
  }
  backTo(fd, "conciliacion", pairs.length ? error : { message: "ENQ_DATOS_INVALIDOS" }, "conciliado");
}

export async function reconcileOtherAction(fd: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reconcile_other", {
    p_movement: uuid(fd, "movement_id"),
    p_category: text(fd, "category", 30),
    p_note: text(fd, "note", 300),
  });
  backTo(fd, "conciliacion", error, "clasificado");
}

export async function unreconcileAction(fd: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("unreconcile", { p_reconciliation: uuid(fd, "reconciliation_id") });
  backTo(fd, "conciliacion", error, "desconciliado");
}

export async function saveVatDraftAction(fd: FormData) {
  const { company } = target(fd);
  const rate = Number.parseFloat(text(fd, "ppm_rate", 8).replace(",", "."));
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_vat_draft", {
    p_company: company,
    p_period: periodDate(fd),
    p_prev_remanente: money(fd, "prev_remanente"),
    p_ppm_rate: Number.isFinite(rate) ? rate : 0,
    p_retenciones: money(fd, "retenciones"),
    p_note: text(fd, "note", 1000),
  });
  backTo(fd, "f29", error, "f29_calculado");
}

export async function submitVatAction(fd: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_vat", { p_return: uuid(fd, "return_id") });
  backTo(fd, "f29", error, "f29_enviado");
}

export async function decideVatAction(fd: FormData) {
  const decision = text(fd, "decision", 10);
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_vat", { p_return: uuid(fd, "return_id"), p_decision: decision, p_note: text(fd, "note", 1000) });
  backTo(fd, "f29", error, decision === "aprobar" ? "f29_aprobado" : "f29_devuelto");
}

export async function presentVatAction(fd: FormData) {
  const date = text(fd, "presented_on", 10);
  const supabase = await createClient();
  const { error } = await supabase.rpc("register_vat_presented", {
    p_return: uuid(fd, "return_id"),
    p_folio: text(fd, "folio", 40),
    p_presented_on: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
  });
  backTo(fd, "f29", error, "f29_presentado");
}

export async function voidVatAction(fd: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_vat", { p_return: uuid(fd, "return_id") });
  backTo(fd, "f29", error, "f29_anulado");
}
