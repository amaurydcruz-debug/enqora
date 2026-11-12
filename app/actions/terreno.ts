"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authMessage } from "@/lib/auth-errors";
import { dbCode, dbMessage } from "@/lib/db-errors";
import { PRIVACIDAD_VERSION, TERMINOS_VERSION } from "@/lib/legal-versions";
import { passwordProblems } from "@/lib/password";
import { isPasswordPwned } from "@/lib/pwned";
import { siteUrl } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { GESTOR_PRIVACIDAD_VERSION } from "@/lib/terreno";

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
  revalidatePath("/gestor");
  volver(accion === "rechazar" && !error ? "/gestor" : `/gestor/encargo/${t}`, error, `g_${accion}`);
}

export async function custodiaAction(fd: FormData) {
  const d = id(fd, "doc_id");
  const t = id(fd, "task_id");
  if (!d || !t) redirect("/mando/terreno");
  const supabase = await createClient();
  const { error } = await supabase.rpc("field_task_doc", { p_doc: d, p_custody: text(fd, "custodia", 20), p_note: text(fd, "nota", 300) || null });
  volver(fd.get("app") === "gestor" ? `/gestor/encargo/${t}` : `/mando/terreno/${t}`, error, "custodia");
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

// ---------- Registro, invitación y app del gestor (0054) ----------
export type InviteState = { error?: string; link?: string; nombre?: string } | undefined;

const linkDe = (token: string) => `${siteUrl()}/gestor/unirse/${token}`;

export async function registrarGestorAction(_: InviteState, fd: FormData): Promise<InviteState> {
  const supabase = await createClient();
  const cobertura = text(fd, "cobertura", 400).split(",").map((x) => x.trim()).filter(Boolean).slice(0, 15);
  const telefono = text(fd, "telefono", 20).replace(/[^\d+]/g, "");
  const tel = /^\+569\d{8}$/.test(telefono) ? telefono : /^9\d{8}$/.test(telefono) ? `+56${telefono}` : /^569\d{8}$/.test(telefono) ? `+${telefono}` : "";
  const { data: id, error } = await supabase.rpc("register_field_agent", {
    p_data: {
      nombre: text(fd, "nombre", 120), run: text(fd, "run", 12), correo: text(fd, "correo", 160).toLowerCase(), telefono: tel,
      direccion: text(fd, "direccion", 240), comuna: text(fd, "comuna", 80), cobertura, nota: text(fd, "nota", 500),
    },
  });
  if (error || typeof id !== "string") return { error: dbMessage(error ?? { message: "ENQ_DATOS_INVALIDOS" }) };
  const { data: token, error: e2 } = await supabase.rpc("invite_field_agent", { p_agent: id });
  revalidatePath("/mando/terreno");
  if (e2 || typeof token !== "string") return { error: dbMessage(e2 ?? { message: "ENQ_DATOS_INVALIDOS" }) };
  return { link: linkDe(token), nombre: text(fd, "nombre", 120) };
}

export async function invitarGestorAction(_: InviteState, fd: FormData): Promise<InviteState> {
  const g = id(fd, "agent_id");
  if (!g) return { error: "Gestor no válido." };
  const supabase = await createClient();
  const { data: token, error } = await supabase.rpc("invite_field_agent", { p_agent: g });
  if (error || typeof token !== "string") return { error: dbMessage(error ?? { message: "ENQ_DATOS_INVALIDOS" }) };
  return { link: linkDe(token), nombre: text(fd, "nombre", 120) };
}

export async function estadoGestorAction(fd: FormData) {
  const g = id(fd, "agent_id");
  if (!g) redirect("/mando/terreno#gestores");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_field_agent_status", { p_agent: g, p_status: text(fd, "estado", 20) });
  volver("/mando/terreno#gestores", error, "gestor_estado");
}

export async function adjuntarArchivoAction(fd: FormData) {
  const t = id(fd, "task_id");
  const d = id(fd, "document_id");
  if (!t || !d) redirect("/mando/terreno");
  const supabase = await createClient();
  const { error } = await supabase.rpc("field_task_attach", { p_task: t, p_document: d });
  volver(`/mando/terreno/${t}`, error, "archivo");
}

export async function quitarArchivoAction(fd: FormData) {
  const t = id(fd, "task_id");
  const f = id(fd, "file_id");
  if (!t || !f) redirect("/mando/terreno");
  const supabase = await createClient();
  const { error } = await supabase.rpc("field_task_detach", { p_file: f });
  volver(`/mando/terreno/${t}`, error, "archivo_quitado");
}

export async function autorizarDescargaAction(fd: FormData) {
  const t = id(fd, "task_id");
  if (!t) redirect("/mando/terreno");
  const ok = fd.get("ok") === "1";
  const supabase = await createClient();
  const { error } = await supabase.rpc("field_task_docs_ok", { p_task: t, p_ok: ok });
  volver(`/mando/terreno/${t}`, error, ok ? "descarga_ok" : "descarga_retirada");
}

export type GestorSignUpState = { error?: string } | undefined;

// Primera vez: el gestor crea su cuenta con el correo registrado, desde su enlace.
export async function gestorSignUpAction(_: GestorSignUpState, fd: FormData): Promise<GestorSignUpState> {
  const token = text(fd, "token", 64);
  if (!/^[0-9a-f]{48}$/.test(token)) return { error: "El enlace no es válido." };
  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  if (fd.get("terms") !== "on") return { error: "Debes aceptar los términos y el tratamiento de tus datos." };
  const supabase = await createClient();
  const { data } = await supabase.rpc("field_agent_invite_preview", { p_token: token });
  const inv = (Array.isArray(data) ? data[0] : data) as { status: string; email: string | null } | undefined;
  if (!inv?.email || inv.status !== "valido") return { error: "El enlace ya no es válido. Pide uno nuevo a ENQORA." };
  if (password !== confirm) return { error: "Las contraseñas no coinciden." };
  const problem = passwordProblems(password, inv.email);
  if (problem) return { error: problem };
  if ((await isPasswordPwned(password)) === true) return { error: "Esta contraseña aparece en filtraciones públicas de datos. Elige otra distinta." };
  const back = `/gestor/unirse/${token}`;
  const { error } = await supabase.auth.signUp({
    email: inv.email,
    password,
    options: {
      emailRedirectTo: `${siteUrl()}/auth/confirm?next=${encodeURIComponent(back)}`,
      data: { full_name: text(fd, "full_name", 120) || undefined, terminos_version: TERMINOS_VERSION, privacidad_version: PRIVACIDAD_VERSION },
    },
  });
  if (error) return { error: authMessage(error) };
  redirect(`${back}?aviso=correo`);
}

export async function aceptarInvitacionGestorAction(fd: FormData) {
  const token = text(fd, "token", 64);
  if (!/^[0-9a-f]{48}$/.test(token)) redirect("/gestor");
  if (fd.get("consent") !== "on") redirect(`/gestor/unirse/${token}?error=ENQ_FALTA_CONSENTIMIENTO`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_field_agent_invite", { p_token: token, p_consent_version: GESTOR_PRIVACIDAD_VERSION });
  if (error) redirect(`/gestor/unirse/${token}?error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}`);
  redirect("/gestor?aviso=bienvenido");
}
