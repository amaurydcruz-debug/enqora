"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { passwordProblems } from "@/lib/password";
import { isPasswordPwned } from "@/lib/pwned";
import { authMessage } from "@/lib/auth-errors";
import { dbCode, dbMessage } from "@/lib/db-errors";
import { siteUrl } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

// Acceso del equipo ENQORA por pase de jornada (0022). El Administrador genera un enlace personal,
// de un solo uso y válido solo en el horario del día; el equipo no se registra en la página pública.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[0-9a-f]{48}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type PassState = { error?: string; link?: string; email?: string; day?: string } | undefined;

export async function createTeamPassAction(_: PassState, fd: FormData): Promise<PassState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const role = String(fd.get("role") ?? "");
  const day = String(fd.get("day") ?? "");
  if (!EMAIL_RE.test(email)) return { error: "Ingresa el correo de la persona." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_team_pass", {
    p_email: email, p_role: role, p_day: DATE_RE.test(day) ? day : null, p_note: String(fd.get("note") ?? "").slice(0, 200) || null,
  });
  if (error) {
    if (dbCode(error) === "ENQ_YA_MIEMBRO") return { error: "Esa persona es Administrador: no necesita pase de jornada." };
    return { error: dbMessage(error) };
  }
  revalidatePath("/mando/equipo");
  return { link: `${siteUrl()}/equipo/pase/${data as string}`, email, day };
}

export async function revokeTeamPassAction(fd: FormData) {
  const id = String(fd.get("pass_id") ?? "");
  if (!UUID_RE.test(id)) redirect("/mando/equipo");
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_team_pass", { p_pass: id });
  revalidatePath("/mando/equipo");
  redirect(`/mando/equipo?${error ? `error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}` : "aviso=pase_anulado"}#pases`);
}

export async function endStaffAccessAction(fd: FormData) {
  const user = String(fd.get("user_id") ?? "");
  if (!UUID_RE.test(user)) redirect("/mando/equipo");
  const supabase = await createClient();
  const { error } = await supabase.rpc("end_staff_access", { p_user: user });
  revalidatePath("/mando/equipo");
  redirect(`/mando/equipo?${error ? `error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}` : "aviso=acceso_cortado"}#integrantes`);
}

export async function designateCoadminAction(fd: FormData) {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) redirect("/mando/equipo?error=ENQ_DATOS_INVALIDOS#coadmin");
  const supabase = await createClient();
  const { error } = await supabase.rpc("designate_coadmin", { p_email: email });
  if (dbCode(error) === "ENQ_REAUTH") redirect(`/mfa/reautenticar?next=${encodeURIComponent("/mando/equipo#coadmin")}`);
  revalidatePath("/mando/equipo");
  redirect(`/mando/equipo?${error ? `error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}` : "aviso=coadmin"}#coadmin`);
}

// ---------- Desde el enlace (persona del equipo) ----------
export type TeamSignUpState = { error?: string } | undefined;

// Primera vez: crea la cuenta del correo invitado desde el propio enlace (no desde el registro público).
export async function teamSignUpAction(_: TeamSignUpState, fd: FormData): Promise<TeamSignUpState> {
  const token = String(fd.get("token") ?? "");
  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  if (!TOKEN_RE.test(token)) return { error: "El enlace no es válido." };
  const supabase = await createClient();
  const { data } = await supabase.rpc("team_pass_preview", { p_token: token });
  const pass = (Array.isArray(data) ? data[0] : data) as { status: string; email: string | null } | undefined;
  if (!pass?.email || pass.status === "invalido" || pass.status === "usado" || pass.status === "vencido") {
    return { error: "El enlace ya no es válido. Pide uno nuevo al Administrador." };
  }
  if (password !== confirm) return { error: "Las contraseñas no coinciden." };
  const problem = passwordProblems(password, pass.email);
  if (problem) return { error: problem };
  if ((await isPasswordPwned(password)) === true) return { error: "Esta contraseña aparece en filtraciones públicas de datos. Elige otra distinta." };

  const back = `/equipo/pase/${token}`;
  const { error } = await supabase.auth.signUp({
    email: pass.email,
    password,
    options: {
      emailRedirectTo: `${siteUrl()}/auth/confirm?next=${encodeURIComponent(back)}`,
      data: { full_name: String(fd.get("full_name") ?? "").trim().slice(0, 120) || undefined },
    },
  });
  if (error) return { error: authMessage(error) };
  redirect(`${back}?aviso=correo`);
}

export async function acceptTeamPassAction(fd: FormData) {
  const token = String(fd.get("token") ?? "");
  if (!TOKEN_RE.test(token)) redirect("/mando/acceso");
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_team_pass", { p_token: token });
  if (error) redirect(`/equipo/pase/${token}?error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}`);
  redirect("/mando?aviso=jornada");
}
