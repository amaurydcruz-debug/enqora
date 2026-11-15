"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authMessage } from "@/lib/auth-errors";
import { dbCode, messageForCode } from "@/lib/db-errors";
import { TEXTO_ACEPTACION_VERSION, type Calidad } from "@/lib/firma";
import { createClient } from "@/lib/supabase/server";

// ENQORA SIGN (0060). Las reglas viven en la base; aquí se arma cada paso.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CALIDADES: Calidad[] = ["cliente", "representante_legal", "profesional_enqora", "contraparte", "trabajador", "empleador"];

function volverMando(doc: string, error: { message?: string } | null, ok: string): never {
  revalidatePath(`/mando/boveda/${doc}`);
  if (dbCode(error) === "ENQ_REAUTH") redirect(`/mfa/reautenticar?next=${encodeURIComponent(`/mando/boveda/${doc}#firma`)}`);
  redirect(`/mando/boveda/${doc}?${error ? `error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}` : `aviso=${ok}`}#firma`);
}

// Equipo: enviar un documento autorizado a firma. Firmantes en orden (hasta 6 filas en el formulario).
export async function solicitarFirmaAction(fd: FormData) {
  const doc = String(fd.get("id") ?? "");
  if (!UUID_RE.test(doc)) redirect("/mando/boveda");
  const firmantes: { correo: string; calidad: Calidad }[] = [];
  for (let i = 0; i < 6; i++) {
    const correo = String(fd.get(`correo_${i}`) ?? "").trim().toLowerCase().slice(0, 254);
    const calidad = String(fd.get(`calidad_${i}`) ?? "cliente") as Calidad;
    if (!correo) continue;
    if (!CALIDADES.includes(calidad)) volverMando(doc, { message: "ENQ_DATOS_INVALIDOS" }, "");
    firmantes.push({ correo, calidad });
  }
  if (!firmantes.length) volverMando(doc, { message: "ENQ_DATOS_INVALIDOS" }, "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("sign_solicitar", { p_doc: doc, p: {
    firmantes, secuencial: fd.get("secuencial") === "on", vence_dias: Number(fd.get("vence_dias") ?? 15) || 15,
    mensaje: String(fd.get("mensaje") ?? "").trim().slice(0, 500) || null,
  } });
  volverMando(doc, error, "firma_solicitada");
}

export async function anularFirmaAction(fd: FormData) {
  const doc = String(fd.get("doc") ?? "");
  const req = String(fd.get("id") ?? "");
  if (!UUID_RE.test(doc) || !UUID_RE.test(req)) redirect("/mando/boveda");
  const supabase = await createClient();
  const { error } = await supabase.rpc("sign_anular", { p_req: req, p_motivo: String(fd.get("motivo") ?? "").trim().slice(0, 500) });
  volverMando(doc, error, "firma_anulada");
}

// Firmante: llegó al final del documento (lo registra la pantalla de firma).
export async function registrarLecturaAction(signer: string): Promise<{ ok: boolean }> {
  if (!UUID_RE.test(signer)) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc("sign_registrar_lectura", { p_signer: signer });
  return { ok: !error };
}

export type FirmaState = { error?: string } | undefined;

// Firmante: confirma con el código de 6 dígitos de su autenticador, que se verifica en ese mismo momento.
export async function firmarAction(_: FirmaState, fd: FormData): Promise<FirmaState> {
  const signer = String(fd.get("id") ?? "");
  const sha = String(fd.get("sha") ?? "").toLowerCase();
  const code = String(fd.get("code") ?? "").replace(/\s+/g, "");
  if (!UUID_RE.test(signer) || !/^[0-9a-f]{64}$/.test(sha)) return { error: messageForCode("ENQ_DATOS_INVALIDOS") ?? "Datos inválidos." };
  if (fd.get("acepto") !== "on") return { error: "Para firmar, marca que leíste y aceptas el documento." };
  if (!/^\d{6}$/.test(code)) return { error: "Ingresa el código de 6 dígitos de tu autenticador." };

  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factorId = factors?.totp?.[0]?.id;
  if (!factorId) redirect(`/mfa/configurar?next=${encodeURIComponent(`/firmas/${signer}`)}`);
  const { error: mfaError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (mfaError) return { error: authMessage(mfaError, "El código no es válido o ya venció. Revisa tu autenticador e inténtalo de nuevo.") };

  // Evidencia que informa el servidor (no el navegador).
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "";
  const { error } = await supabase.rpc("sign_firmar", { p_signer: signer, p_sha: sha, p_evidencia: {
    ip, dispositivo: (h.get("user-agent") ?? "").slice(0, 300), idioma: (h.get("accept-language") ?? "").slice(0, 40), texto_aceptado: TEXTO_ACEPTACION_VERSION,
  } });
  if (error) return { error: messageForCode(dbCode(error)) ?? "No pudimos registrar tu firma. Inténtalo de nuevo." };
  revalidatePath("/firmas");
  redirect(`/firmas/${signer}?aviso=firmado`);
}

export async function rechazarFirmaAction(fd: FormData) {
  const signer = String(fd.get("id") ?? "");
  if (!UUID_RE.test(signer)) redirect("/firmas");
  const supabase = await createClient();
  const { error } = await supabase.rpc("sign_rechazar", { p_signer: signer, p_motivo: String(fd.get("motivo") ?? "").trim().slice(0, 500) });
  revalidatePath("/firmas");
  redirect(`/firmas/${signer}?${error ? `error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}` : "aviso=rechazado"}`);
}
