"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dbCode } from "@/lib/db-errors";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";
import { runWatch } from "@/lib/watch";

// Acciones de M16: aprendizajes de casos y vigilancia normativa.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "");
  return UUID_RE.test(v) ? v : null;
};
const text = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max);
const list = (fd: FormData, k: string) => fd.getAll(k).map(String).filter((x) => /^[a-z_]{2,40}$/.test(x));
const go = (path: string, error: { message?: string } | null, ok: string, anchor = "") =>
  redirect(`${path}?${error ? `error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}` : `aviso=${ok}`}${anchor ? `#${anchor}` : ""}`);

// ---------- Aprendizaje de un caso resuelto ----------
export async function saveLearningAction(fd: FormData) {
  const caseId = uuid(fd, "case_id");
  if (!caseId) redirect("/mando");
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_case_learning", {
    p_case: caseId,
    p_data: {
      problema: text(fd, "problema", 1000), ruta: text(fd, "ruta", 3000), resultado: text(fd, "resultado", 1500),
      funciono: text(fd, "funciono", 1500), mejorar: text(fd, "mejorar", 1500), beneficios: text(fd, "beneficios", 1000),
    },
  });
  revalidatePath(`/casos/${caseId}`);
  revalidatePath("/mando/aprendizajes");
  go(`/casos/${caseId}`, error, "aprendizaje_guardado", "expediente");
}

export async function decideLearningAction(fd: FormData) {
  const id = uuid(fd, "learning_id");
  if (!id) redirect("/mando/aprendizajes");
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_case_learning", {
    p_learning: id, p_approve: fd.get("decision") === "aprobar", p_note: text(fd, "note", 1000) || null,
  });
  revalidatePath("/mando/aprendizajes");
  go("/mando/aprendizajes", error, fd.get("decision") === "aprobar" ? "aprendizaje_aprobado" : "aprendizaje_descartado");
}

// ---------- Vigilancia normativa ----------
export async function reviewUpdateAction(fd: FormData) {
  const id = uuid(fd, "update_id");
  if (!id) redirect("/mando/vigilancia");
  const supabase = await createClient();
  const modules = list(fd, "modulos");
  const rubros = list(fd, "rubros");
  const { data, error } = await supabase.rpc("review_regulatory_update", {
    p_update: id,
    p_status: text(fd, "status", 20),
    p_note: text(fd, "note", 1000) || null,
    p_client_visible: fd.get("client_visible") === "on",
    p_modules: modules.length ? modules : null,
    p_rubros: rubros.length ? rubros : null,
  });
  revalidatePath("/mando/vigilancia");
  go("/mando/vigilancia", error, Number(data) > 0 ? `novedad_avisada_${Number(data)}` : "novedad_revisada");
}

export async function addUpdateAction(fd: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_regulatory_update", {
    p_data: {
      titulo: text(fd, "titulo", 200), resumen: text(fd, "resumen", 2000), institucion: text(fd, "institucion", 120),
      tipo: text(fd, "tipo", 20), url: text(fd, "url", 400), publicado: text(fd, "publicado", 10), impacto: text(fd, "impacto", 1000),
      modulos: list(fd, "modulos"), rubros: list(fd, "rubros"),
    },
  });
  revalidatePath("/mando/vigilancia");
  go("/mando/vigilancia", error, "novedad_agregada");
}

// Ejecuta la vigilancia ahora (supervisión). Usa la clave de servicio del servidor para guardar.
export async function runWatchAction() {
  const role = await myStaffRole();
  if (!isSupervisorRole(role)) redirect("/mando");
  const service = process.env.ENQORA_SERVICE_TOKEN;
  if (!service) go("/mando/vigilancia", { message: "ENQ_CLAVE_SERVICIO" }, "");
  const result = await runWatch(AbortSignal.timeout(50_000));
  if (!result.ok) go("/mando/vigilancia", { message: "ENQ_VIGILANCIA_FALLIDA" }, "");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ingest_regulatory_updates", { p_token: service, p_items: result.items });
  revalidatePath("/mando/vigilancia");
  go("/mando/vigilancia", error, `vigilancia_${Number(data ?? 0)}`);
}
