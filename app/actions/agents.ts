"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dbCode } from "@/lib/db-errors";
import { isModule } from "@/lib/cases";
import { MODULE_ROUTES } from "@/lib/module-routes";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "");
  return UUID_RE.test(v) ? v : null;
};

function back(caseId: string, error: { message?: string } | null, ok: string, anchor: string) {
  const code = dbCode(error);
  revalidatePath(`/casos/${caseId}`);
  revalidatePath(`/casos/${caseId}/mirror`);
  redirect(`/casos/${caseId}?${error ? `error=${code ?? "ENQ_DATOS_INVALIDOS"}` : `aviso=${ok}`}#${anchor}`);
}

// Aceptar o descartar una propuesta de un agente IA (persona del equipo del caso).
export async function decideAgentProposalAction(fd: FormData) {
  const caseId = uuid(fd, "case_id");
  const proposal = uuid(fd, "proposal_id");
  if (!caseId) redirect("/mando");
  const decision = String(fd.get("decision") ?? "");
  if (!proposal || !["aceptar", "descartar"].includes(decision)) redirect(`/casos/${caseId}?error=ENQ_DATOS_INVALIDOS#agentes`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_agent_proposal", {
    p_proposal: proposal,
    p_decision: decision,
    p_visibility: fd.get("internal") === "on" ? "interno" : "cliente",
  });
  back(caseId, error, decision === "aceptar" ? "propuesta_aceptada" : "propuesta_descartada", "agentes");
}

// Crea las tareas de la ruta estándar del módulo que aún no existan en el caso.
export async function applyRouteAction(fd: FormData) {
  const caseId = uuid(fd, "case_id");
  if (!caseId) redirect("/mando");
  const supabase = await createClient();
  const [{ data: c }, { data: existing }] = await Promise.all([
    supabase.from("cases").select("module").eq("id", caseId).maybeSingle(),
    supabase.from("case_tasks").select("title").eq("case_id", caseId),
  ]);
  const module = (c as { module?: string } | null)?.module;
  if (!isModule(module)) back(caseId, { message: "ENQ_SIN_PERMISO" }, "", "tareas");
  const have = new Set(((existing ?? []) as { title: string }[]).map((t) => t.title.trim().toLowerCase()));
  let error: { message?: string } | null = null;
  for (const t of MODULE_ROUTES[module as keyof typeof MODULE_ROUTES].tasks) {
    if (have.has(t.title.toLowerCase())) continue;
    const res = await supabase.rpc("create_task", {
      p_case: caseId,
      p_title: t.title,
      p_visibility: t.for === "cliente" ? "cliente" : "interno",
    });
    if (res.error) { error = res.error; break; }
  }
  back(caseId, error, "ruta_aplicada", "tareas");
}
