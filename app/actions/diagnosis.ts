"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isModule } from "@/lib/cases";
import { dbCode, dbMessage } from "@/lib/db-errors";
import { isComplete, sanitizeAnswers } from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";

// Onboarding, diagnóstico gratuito e informe de diagnóstico (M09).
// Las reglas viven en la base de datos (0010_diagnostico.sql); aquí se validan formatos.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (fd: FormData, k: string, max = 4000) => String(fd.get(k) ?? "").trim().slice(0, max);
const uuid = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" && UUID_RE.test(v) ? v : null;
};
const money = (fd: FormData, k: string) => {
  const raw = text(fd, k, 20).replace(/[^\d]/g, "");
  return raw ? raw : "";
};

export type OnboardingState = { error?: string } | undefined;

function backToCase(caseId: string, error: { message?: string } | null, ok: string, anchor = "diagnostico") {
  const code = dbCode(error);
  const target = `/casos/${caseId}#${anchor}`;
  if (code === "ENQ_REAUTH") redirect(`/mfa/reautenticar?next=${encodeURIComponent(target)}`);
  revalidatePath(`/casos/${caseId}`);
  redirect(`/casos/${caseId}?${error ? `error=${code ?? "ENQ_DATOS_INVALIDOS"}` : `aviso=${ok}`}#${anchor}`);
}

// ---------- Onboarding y diagnóstico gratuito (cliente) ----------
export async function saveOnboardingAction(_: OnboardingState, fd: FormData): Promise<OnboardingState> {
  const company = uuid(fd, "company_id");
  if (!company) return { error: "Selecciona una empresa activa." };
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text(fd, "answers", 4000) || "{}");
  } catch {
    parsed = null;
  }
  const answers = sanitizeAnswers(parsed);
  if (!answers) return { error: "Revisa tus respuestas e intenta nuevamente." };

  const wantsDiagnosis = fd.get("intent") === "diagnostico";
  const module = text(fd, "module", 40);
  const title = text(fd, "title", 160);
  if (wantsDiagnosis) {
    if (!isComplete(answers)) return { error: "Responde las preguntas obligatorias para pedir tu diagnóstico." };
    if (!isModule(module)) return { error: "Elige el área de tu diagnóstico." };
    if (title.length < 3) return { error: "Cuéntanos en una frase qué necesitas resolver." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_onboarding", { p_company: company, p_answers: answers });
  if (error) return { error: dbMessage(error) };

  if (!wantsDiagnosis) {
    revalidatePath("/panel");
    redirect("/panel?aviso=onboarding#ruta");
  }

  const { data, error: e2 } = await supabase.rpc("start_free_diagnosis", {
    p_company: company,
    p_module: module,
    p_title: title,
    p_description: text(fd, "description"),
  });
  if (e2 || !data) return { error: dbMessage(e2) };
  revalidatePath("/panel");
  redirect(`/casos/${data}?aviso=diagnostico_solicitado`);
}

// ---------- Informe (equipo ENQORA) ----------
export async function draftDiagnosisAction(fd: FormData) {
  const caseId = uuid(fd, "case_id");
  if (!caseId) redirect("/mando");
  const supabase = await createClient();
  const { error } = await supabase.rpc("draft_diagnosis", { p_case: caseId });
  backToCase(caseId, error, "diagnostico_borrador");
}

export async function saveDiagnosisAction(fd: FormData) {
  const caseId = uuid(fd, "case_id");
  const diag = uuid(fd, "diagnosis_id");
  if (!caseId || !diag) redirect("/mando");
  const certainty = text(fd, "certainty", 10);
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_diagnosis", {
    p_diag: diag,
    p_summary: text(fd, "summary"),
    p_certainty: ["alta", "media", "baja"].includes(certainty) ? certainty : null,
    p_missing: text(fd, "missing", 2000),
  });
  backToCase(caseId, error, "diagnostico_guardado");
}

export async function saveFindingAction(fd: FormData) {
  const caseId = uuid(fd, "case_id");
  const diag = uuid(fd, "diagnosis_id");
  if (!caseId || !diag) redirect("/mando");

  const titles = fd.getAll("src_titulo").map((v) => String(v).trim());
  const arts = fd.getAll("src_articulo").map((v) => String(v).trim());
  const vig = fd.getAll("src_vigencia").map((v) => String(v).trim());
  const urls = fd.getAll("src_url").map((v) => String(v).trim());
  const sources = titles
    .map((titulo, i) => ({
      titulo: titulo.slice(0, 200),
      articulo: (arts[i] ?? "").slice(0, 120),
      vigencia: (vig[i] ?? "").slice(0, 80),
      url: (urls[i] ?? "").slice(0, 400),
    }))
    .filter((s) => s.titulo || s.url || s.articulo)
    .slice(0, 10);

  const data = {
    position: text(fd, "position", 3),
    title: text(fd, "title", 160),
    situation: text(fd, "situation"),
    obligations: text(fd, "obligations"),
    sources,
    causes: text(fd, "causes", 2000),
    corrections: text(fd, "corrections"),
    benefits: text(fd, "benefits", 2000),
    risk_level: text(fd, "risk_level", 10),
    risk: text(fd, "risk", 2000),
    service_id: uuid(fd, "service_id") ?? "",
    cost_min: money(fd, "cost_min"),
    cost_max: money(fd, "cost_max"),
    cost_note: text(fd, "cost_note", 500),
    certainty: text(fd, "certainty", 10),
    missing: text(fd, "missing", 2000),
  };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_finding", { p_diag: diag, p_finding: uuid(fd, "finding_id"), p_data: data });
  backToCase(caseId, error, "situacion_guardada");
}

export async function deleteFindingAction(fd: FormData) {
  const caseId = uuid(fd, "case_id");
  const finding = uuid(fd, "finding_id");
  if (!caseId || !finding) redirect("/mando");
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_finding", { p_finding: finding });
  backToCase(caseId, error, "situacion_eliminada");
}

export async function submitDiagnosisAction(fd: FormData) {
  const caseId = uuid(fd, "case_id");
  const diag = uuid(fd, "diagnosis_id");
  if (!caseId || !diag) redirect("/mando");
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_diagnosis", { p_diag: diag });
  backToCase(caseId, error, "diagnostico_enviado");
}

// ---------- El cliente pide cotizar una situación ----------
export async function requestFindingQuoteAction(fd: FormData) {
  const caseId = uuid(fd, "case_id");
  const finding = uuid(fd, "finding_id");
  if (!caseId || !finding) redirect("/casos");
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_finding_quote", { p_finding: finding });
  backToCase(caseId, error, "cotizacion_pedida");
}
