"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dbCode, dbMessage } from "@/lib/db-errors";
import { isModule, isStaffRole, UPLOAD_MAX_BYTES, UPLOAD_TYPES } from "@/lib/cases";

export type CaseFormState = { error?: string; ok?: string } | undefined;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const text = (fd: FormData, k: string, max = 4000) => String(fd.get(k) ?? "").trim().slice(0, max);
const uuidOf = (v: unknown) => (typeof v === "string" && UUID_RE.test(v) ? v : null);
const uuid = (fd: FormData, k: string) => uuidOf(fd.get(k));
const dateOf = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "");
  return DATE_RE.test(v) ? v : null;
};

// Vuelve a la ficha del caso con un aviso o un error; si la base pide reautenticación, la solicita.
function back(caseId: string, error: { message?: string } | null, ok: string, anchor = "") {
  const code = dbCode(error);
  const target = `/casos/${caseId}${anchor ? `#${anchor}` : ""}`;
  if (code === "ENQ_REAUTH") redirect(`/mfa/reautenticar?next=${encodeURIComponent(target)}`);
  revalidatePath(`/casos/${caseId}`);
  redirect(`/casos/${caseId}?${error ? `error=${code ?? "ENQ_DATOS_INVALIDOS"}` : `aviso=${ok}`}${anchor ? `#${anchor}` : ""}`);
}

// ---------- Nueva solicitud ----------
export async function createCaseAction(_: CaseFormState, fd: FormData): Promise<CaseFormState> {
  const company = uuid(fd, "company_id");
  const module = text(fd, "module", 40);
  const title = text(fd, "title", 160);
  if (!company) return { error: "Selecciona una empresa activa." };
  if (!isModule(module)) return { error: "Selecciona el área de tu solicitud." };
  if (title.length < 3) return { error: "Describe tu solicitud en una frase." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_case", {
    p_company: company,
    p_module: module,
    p_title: title,
    p_description: text(fd, "description"),
  });
  if (error || !data) return { error: dbMessage(error) };
  redirect(`/casos/${data}?aviso=creado`);
}

// ---------- Comentario o nota interna ----------
export async function commentAction(_: CaseFormState, fd: FormData): Promise<CaseFormState> {
  const caseId = uuid(fd, "case_id");
  const body = text(fd, "body");
  if (!caseId) return { error: "Caso no válido." };
  if (!body) return { error: "Escribe un mensaje." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_case_comment", {
    p_case: caseId,
    p_body: body,
    p_internal: fd.get("internal") === "on",
  });
  if (error) return { error: dbMessage(error) };
  revalidatePath(`/casos/${caseId}`);
  return { ok: "Mensaje agregado." };
}

// ---------- Estado ----------
export async function changeStatusAction(fd: FormData) {
  const caseId = uuid(fd, "case_id");
  if (!caseId) redirect("/casos");
  const supabase = await createClient();
  const { error } = await supabase.rpc("change_case_status", {
    p_case: caseId,
    p_status: text(fd, "status", 40),
    p_note: text(fd, "note"),
  });
  back(caseId, error, "estado", "estado");
}

export async function setPriorityAction(fd: FormData) {
  const caseId = uuid(fd, "case_id");
  if (!caseId) redirect("/casos");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_case_priority", {
    p_case: caseId,
    p_priority: text(fd, "priority", 20),
    p_due: dateOf(fd, "due_date"),
  });
  back(caseId, error, "prioridad", "estado");
}

// ---------- Equipo del caso ----------
export async function assignAction(fd: FormData) {
  const caseId = uuid(fd, "case_id");
  const user = uuid(fd, "user_id");
  if (!caseId || !user) redirect("/mando");
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_case", {
    p_case: caseId,
    p_user: user,
    p_role_in_case: text(fd, "role_in_case", 20),
  });
  back(caseId, error, "asignado", "equipo");
}

export async function unassignAction(fd: FormData) {
  const caseId = uuid(fd, "case_id");
  const user = uuid(fd, "user_id");
  if (!caseId || !user) redirect("/mando");
  const supabase = await createClient();
  const { error } = await supabase.rpc("unassign_case", { p_case: caseId, p_user: user });
  back(caseId, error, "retirado", "equipo");
}

// ---------- Tareas ----------
export async function createTaskAction(fd: FormData) {
  const caseId = uuid(fd, "case_id");
  if (!caseId) redirect("/casos");
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_task", {
    p_case: caseId,
    p_title: text(fd, "title", 200),
    p_assignee: uuid(fd, "assignee_id"),
    p_due: dateOf(fd, "due_date"),
    p_visibility: fd.get("internal") === "on" ? "interno" : "cliente",
  });
  back(caseId, error, "tarea", "tareas");
}

export async function taskStatusAction(fd: FormData) {
  const caseId = uuid(fd, "case_id");
  const task = uuid(fd, "task_id");
  if (!caseId || !task) redirect("/casos");
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_task_status", { p_task: task, p_status: text(fd, "status", 20) });
  back(caseId, error, "tarea", "tareas");
}

// ---------- Documentos ----------
// Paso 1: el servidor valida y genera un enlace firmado de subida (aplica las reglas de la base).
export async function prepareUploadAction(
  caseIdRaw: string,
  fileName: string,
  size: number,
  mime: string,
): Promise<{ error?: string; path?: string; token?: string }> {
  const caseId = uuidOf(caseIdRaw);
  if (!caseId) return { error: "Caso no válido." };
  if (!size || size > UPLOAD_MAX_BYTES) return { error: "El archivo supera el máximo de 20 MB." };
  if (!UPLOAD_TYPES.includes(mime)) return { error: "Tipo de archivo no permitido. Usa PDF, imagen, XML, CSV, Excel o Word." };

  const supabase = await createClient();
  const { data: row } = await supabase.from("cases").select("company_id").eq("id", caseId).maybeSingle();
  const companyId = (row as { company_id: string } | null)?.company_id;
  if (!companyId) return { error: "No tienes acceso a este caso." };

  const safe =
    fileName
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(-80) || "documento";
  const path = `${companyId}/${caseId}/${randomUUID()}-${safe}`;

  const { data, error } = await supabase.storage.from("expedientes").createSignedUploadUrl(path);
  if (error || !data) return { error: "No tienes permiso para subir documentos a este caso." };
  return { path, token: data.token };
}

// Paso 2 (después de subir desde el navegador): registrar el documento en el expediente.
export async function registerDocumentAction(
  caseIdRaw: string,
  path: string,
  fileName: string,
  mime: string,
  size: number,
  internal: boolean,
): Promise<{ error?: string }> {
  const caseId = uuidOf(caseIdRaw);
  if (!caseId) return { error: "Caso no válido." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("register_document", {
    p_case: caseId,
    p_path: path,
    p_name: fileName.slice(0, 200),
    p_mime: mime,
    p_size: size,
    p_visibility: internal ? "interno" : "cliente",
  });
  if (error) return { error: dbMessage(error) };
  revalidatePath(`/casos/${caseId}`);
  return {};
}

// ---------- Equipo ENQORA ----------
export async function setStaffRoleAction(_: CaseFormState, fd: FormData): Promise<CaseFormState> {
  const email = text(fd, "email", 200).toLowerCase();
  const role = text(fd, "role", 30);
  if (!email.includes("@")) return { error: "Ingresa el correo de la persona." };
  if (role && !isStaffRole(role)) return { error: "Selecciona un rol válido." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_staff_role", { p_email: email, p_role: role || null });
  if (dbCode(error) === "ENQ_REAUTH") redirect(`/mfa/reautenticar?next=${encodeURIComponent("/mando/equipo")}`);
  if (error) return { error: dbMessage(error) };
  revalidatePath("/mando/equipo");
  return { ok: role ? `${email} quedó en el equipo ENQORA.` : `${email} fue desactivado del equipo.` };
}
