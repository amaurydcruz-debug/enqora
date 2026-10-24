"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { authMessage } from "@/lib/auth-errors";
import { safeNext } from "@/lib/safe-next";
import { passwordProblems } from "@/lib/password";
import { isPasswordPwned } from "@/lib/pwned";
import { logSecurityEvent, recordLogin } from "@/lib/security";
import type { FormState } from "./auth";

const CODE_RE = /^\d{6}$/;
const cleanCode = (v: FormDataEntryValue | null) => String(v ?? "").replace(/\s+/g, "");

export type EnrollState =
  | { error?: string; factorId?: string; qr?: string; secret?: string }
  | undefined;

// Primer factor verificado (TOTP) del usuario actual.
async function verifiedTotpId() {
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.listFactors();
  return { supabase, factorId: data?.totp?.[0]?.id ?? null };
}

// ---------- Configurar: generar QR ----------
export async function startEnrollAction(): Promise<EnrollState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/ingresar");

  // Limpia intentos anteriores no completados para no acumular factores pendientes.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    issuer: "ENQORA",
    friendlyName: `Autenticador ${new Date().toISOString().slice(0, 10)}`,
  });
  if (error || !data) return { error: authMessage(error, "No pudimos generar el código QR. Intenta nuevamente.") };

  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

// ---------- Configurar: confirmar primer código ----------
export async function confirmEnrollAction(prev: EnrollState, fd: FormData): Promise<EnrollState> {
  const factorId = String(fd.get("factorId") ?? "");
  const code = cleanCode(fd.get("code"));
  if (!factorId) return { error: "Primero genera el código QR." };
  if (!CODE_RE.test(code)) return { ...prev, error: "Ingresa el código de 6 dígitos." };

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { ...prev, error: authMessage(error) };

  // Primer ingreso completo: registra este navegador como dispositivo conocido.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await recordLogin(supabase, user?.email);
  await logSecurityEvent(supabase, "mfa_activado");

  redirect("/panel?aviso=mfa");
}

// ---------- Verificar al ingresar (o reautenticar) ----------
export async function verifyMfaAction(_: FormState, fd: FormData): Promise<FormState> {
  const code = cleanCode(fd.get("code"));
  const next = safeNext(fd.get("next"));
  const isReauth = fd.get("purpose") === "reauth";
  if (!CODE_RE.test(code)) return { error: "Ingresa el código de 6 dígitos." };

  const { supabase, factorId } = await verifiedTotpId();
  if (!factorId) redirect("/mfa/configurar");

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { error: authMessage(error) };

  // Ingreso completo: registro de seguridad y detección de dispositivo nuevo.
  if (!isReauth) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await recordLogin(supabase, user?.email);
  }

  redirect(next);
}

// ---------- Cambiar contraseña con reautenticación ----------
export async function changePasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const code = cleanCode(fd.get("code"));
  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");

  const { supabase, factorId } = await verifiedTotpId();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !factorId) redirect("/ingresar");

  if (password !== confirm) return { error: "Las contraseñas no coinciden." };
  const problem = passwordProblems(password, user.email);
  if (problem) return { error: problem };
  if ((await isPasswordPwned(password)) === true)
    return { error: "Esta contraseña aparece en filtraciones públicas de datos. Elige otra distinta." };
  if (!CODE_RE.test(code)) return { error: "Ingresa el código actual de tu aplicación autenticadora." };

  // Reautenticación: un código nuevo del segundo factor justo antes del cambio.
  const { error: mfaError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (mfaError) return { error: authMessage(mfaError) };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: authMessage(error) };

  await logSecurityEvent(supabase, "clave_cambiada");
  await supabase.auth.signOut({ scope: "others" });
  return { ok: "Contraseña actualizada. Cerramos las demás sesiones abiertas de tu cuenta." };
}
