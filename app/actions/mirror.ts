"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dbCode } from "@/lib/db-errors";
import { AGENTS, STAGES, STEP_STATUSES } from "@/lib/mirror";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "");
  return UUID_RE.test(v) ? v : null;
};
const text = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max);
const progressOf = (fd: FormData) => {
  const raw = String(fd.get("progress") ?? "").trim();
  if (!raw) return null; // sin avance medible: no se inventa un porcentaje
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
};

function back(caseId: string, error: { message?: string } | null) {
  revalidatePath(`/casos/${caseId}`);
  revalidatePath(`/casos/${caseId}/mirror`);
  redirect(`/casos/${caseId}?${error ? `error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}` : "aviso=analisis"}#mirror`);
}

// Registrar un paso real del análisis (equipo ENQORA o, más adelante, agentes IA).
export async function logStepAction(fd: FormData) {
  const caseId = uuid(fd, "case_id");
  if (!caseId) redirect("/mando");
  const agent = text(fd, "agent", 30);
  const stage = text(fd, "stage", 30);
  const status = text(fd, "status", 20) || "trabajando";
  if (!(agent in AGENTS) || !STAGES.some((s) => s.key === stage) || !(status in STEP_STATUSES)) {
    redirect(`/casos/${caseId}?error=ENQ_DATOS_INVALIDOS#mirror`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("log_analysis_step", {
    p_case: caseId,
    p_agent: agent,
    p_stage: stage,
    p_title: text(fd, "title", 160),
    p_detail: text(fd, "detail", 2000),
    p_status: status,
    p_progress: progressOf(fd),
    p_visibility: fd.get("internal") === "on" ? "interno" : "cliente",
  });
  back(caseId, error);
}

export async function updateStepAction(fd: FormData) {
  const caseId = uuid(fd, "case_id");
  const step = uuid(fd, "step_id");
  if (!caseId || !step) redirect("/mando");
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_analysis_step", {
    p_step: step,
    p_status: text(fd, "status", 20),
    p_progress: progressOf(fd),
    p_detail: text(fd, "detail", 2000),
  });
  back(caseId, error);
}
