"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/supabase/env";
import { passwordProblems } from "@/lib/password";
import { isPasswordPwned } from "@/lib/pwned";
import { authMessage } from "@/lib/auth-errors";
import { safeNext } from "@/lib/safe-next";
import { clearRecovery, hasRecovery } from "@/lib/recovery";

export type FormState = { error?: string; ok?: string } | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const raw = (fd: FormData, k: string) => String(fd.get(k) ?? "");

async function checkNewPassword(password: string, confirm: string, email?: string) {
  if (password !== confirm) return "Las contraseñas no coinciden.";
  const problem = passwordProblems(password, email);
  if (problem) return problem;
  if ((await isPasswordPwned(password)) === true)
    return "Esta contraseña aparece en filtraciones públicas de datos. Elige otra distinta.";
  return null;
}

// ---------- Registro ----------
export async function signUpAction(_: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, "email").toLowerCase();
  const password = raw(fd, "password");
  const confirm = raw(fd, "confirm");

  if (!EMAIL_RE.test(email)) return { error: "Ingresa un correo electrónico válido." };
  if (fd.get("terms") !== "on") return { error: "Debes aceptar los términos y la política de privacidad." };
  const problem = await checkNewPassword(password, confirm, email);
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${siteUrl()}/auth/confirm` },
  });
  if (error) return { error: authMessage(error) };

  // Mismo resultado exista o no la cuenta: no revelamos qué correos están registrados.
  redirect(`/verificar-correo?email=${encodeURIComponent(email)}`);
}

// ---------- Ingreso ----------
export async function signInAction(_: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, "email").toLowerCase();
  const password = raw(fd, "password");
  const next = safeNext(fd.get("next"));

  if (!EMAIL_RE.test(email) || !password) return { error: "Ingresa tu correo y contraseña." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: authMessage(error, "Correo o contraseña incorrectos.") };

  // El middleware exigirá el segundo factor (o su configuración) antes de entrar.
  redirect(next);
}

// ---------- Recuperación: solicitar enlace ----------
export async function requestResetAction(_: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, "email").toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "Ingresa un correo electrónico válido." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl()}/auth/confirm?type=recovery`,
  });
  if (error && (error.status === 429 || error.code?.startsWith("over_"))) {
    return { error: authMessage(error) };
  }
  return {
    ok: "Si existe una cuenta con ese correo, te enviamos un enlace para restablecer la contraseña. Revisa tu bandeja de entrada.",
  };
}

// ---------- Recuperación: nueva contraseña ----------
export async function resetPasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await hasRecovery())) redirect("/ingresar?error=enlace");

  const password = raw(fd, "password");
  const problem = await checkNewPassword(password, raw(fd, "confirm"), user.email);
  if (problem) return { error: problem };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: authMessage(error) };

  // Cierra cualquier otra sesión abierta con la contraseña anterior.
  await supabase.auth.signOut({ scope: "others" });
  await clearRecovery();
  redirect("/panel?aviso=clave");
}

// ---------- Cerrar sesión ----------
export async function signOutAction(fd: FormData) {
  const scope = fd.get("scope") === "global" ? "global" : "local";
  const supabase = await createClient();
  await supabase.auth.signOut({ scope });
  redirect(scope === "global" ? "/ingresar?aviso=global" : "/ingresar?aviso=salida");
}
