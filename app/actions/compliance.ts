"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dbCode } from "@/lib/db-errors";
import { rubroByKey } from "@/lib/rubros";
import { institution } from "@/lib/institutions";

// Acciones del expediente de cumplimiento y del calendario de obligaciones (M17).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const uuid = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "");
  return UUID_RE.test(v) ? v : null;
};
const text = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max);
const date = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "");
  return DATE_RE.test(v) ? v : "";
};

function back(company: string, error: { message?: string } | null, ok: string, anchor: string) {
  revalidatePath(`/empresas/${company}/cumplimiento`);
  redirect(`/empresas/${company}/cumplimiento?${error ? `error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}` : `aviso=${ok}`}#${anchor}`);
}

// Genera la matriz desde el mapa de requisitos del rubro de la empresa (onboarding → actividad).
export async function seedFromRubroAction(fd: FormData) {
  const company = uuid(fd, "company_id");
  if (!company) redirect("/empresas");
  const supabase = await createClient();
  const { data: onb } = await supabase.from("company_onboarding").select("answers").eq("company_id", company).maybeSingle();
  const answers = ((onb as { answers?: Record<string, unknown> } | null)?.answers ?? {}) as Record<string, unknown>;
  const rubro = rubroByKey(text(fd, "rubro", 40) || (typeof answers.actividad === "string" ? answers.actividad : ""));
  if (!rubro) back(company, { message: "ENQ_SIN_RUBRO" }, "", "matriz");
  const workers = typeof answers.trabajadores === "string" && answers.trabajadores !== "ninguno";
  const items = rubro!.requisitos
    .filter((q) => workers || !["dt", "previred"].includes(q.institucion))
    .map((q) => ({
      etapa: q.etapa, institucion: q.institucion, tramite: q.tramite, cuando: q.cuando, url: q.url ?? "",
      fundamento: institution(q.institucion)?.nombre ?? "",
      responsable: ["res", "inapi"].includes(q.institucion) ? "cliente" : "enqora",
    }));
  const { error } = await supabase.rpc("seed_compliance_items", { p_company: company, p_items: items });
  back(company, error, "matriz_generada", "matriz");
}

export async function addItemAction(fd: FormData) {
  const company = uuid(fd, "company_id");
  if (!company) redirect("/empresas");
  const supabase = await createClient();
  const { error } = await supabase.rpc("seed_compliance_items", {
    p_company: company,
    p_items: [{
      etapa: text(fd, "etapa", 20), institucion: text(fd, "institucion", 40), tramite: text(fd, "tramite", 200),
      cuando: text(fd, "cuando", 400), url: text(fd, "url", 400), documentos: text(fd, "documentos", 1000),
      costo_publico: text(fd, "costo_publico", 300), responsable: text(fd, "responsable", 20),
    }],
  });
  back(company, error, "item_agregado", "matriz");
}

export async function updateItemAction(fd: FormData) {
  const company = uuid(fd, "company_id");
  const item = uuid(fd, "item_id");
  if (!company || !item) redirect("/empresas");
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_compliance_item", {
    p_item: item,
    p_data: {
      status: text(fd, "status", 20), responsible: text(fd, "responsible", 20),
      deadline: date(fd, "deadline"), deadline_kind: text(fd, "deadline_kind", 10),
      observations: text(fd, "observations", 2000), next_review: date(fd, "next_review"), renewal_date: date(fd, "renewal_date"),
      evidence_document_id: uuid(fd, "evidence_document_id") ?? "", public_cost: text(fd, "public_cost", 300),
    },
  });
  back(company, error, "item_actualizado", `item-${item}`);
}

export async function generateObligationsAction(fd: FormData) {
  const company = uuid(fd, "company_id");
  if (!company) redirect("/empresas");
  const supabase = await createClient();
  const { error } = await supabase.rpc("generate_obligations", {
    p_company: company,
    p_months: Math.min(12, Math.max(1, Number(fd.get("months") ?? 3) || 3)),
    p_f29_day: fd.get("f29_day") === "12" ? 12 : 20,
    p_electronic_contrib: fd.get("contrib_manual") !== "on",
  });
  back(company, error, "calendario_generado", "calendario");
}

export async function addObligationAction(fd: FormData) {
  const company = uuid(fd, "company_id");
  if (!company) redirect("/empresas");
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_obligation", {
    p_company: company, p_kind: text(fd, "kind", 20), p_title: text(fd, "title", 200), p_due: date(fd, "due") || null, p_note: text(fd, "note", 1000) || null,
  });
  back(company, error, "obligacion_agregada", "calendario");
}

export async function setObligationAction(fd: FormData) {
  const company = uuid(fd, "company_id");
  const ob = uuid(fd, "obligation_id");
  if (!company || !ob) redirect("/empresas");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_obligation_status", {
    p_obligation: ob, p_status: text(fd, "status", 20), p_reference: text(fd, "reference", 60) || null,
    p_evidence: uuid(fd, "evidence_document_id"), p_note: text(fd, "note", 1000) || null,
  });
  back(company, error, "obligacion_actualizada", `ob-${ob}`);
}
