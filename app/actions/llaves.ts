"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { dbCode, messageForCode } from "@/lib/db-errors";
import { TEXTO_ACEPTACION_VERSION } from "@/lib/firma";
import { createClient } from "@/lib/supabase/server";
import { ALGS, b64u, crearDesafio, desafioDe, sitio, tomarDesafio, verificarAsercion, verificarRegistro, type Asercion, type Registro } from "@/lib/webauthn";

// Llaves de acceso para firmar con huella o Face ID (0061). La base solo acepta lo que este servidor verificó.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type Resultado = { ok?: true; error?: string; reauth?: string };
const msg = (code: string | null | undefined, fallback: string) => messageForCode(code ?? undefined) ?? fallback;

async function usuario() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export type OpcionesRegistro = { challenge: string; rpId: string; userId: string; userName: string; exclude: string[] } | { error: string };

export async function opcionesRegistroAction(): Promise<OpcionesRegistro> {
  const { supabase, user } = await usuario();
  if (!user) return { error: "Tu sesión terminó. Vuelve a ingresar." };
  try {
    const { rpId } = await sitio();
    const { data } = await supabase.from("signing_passkeys").select("credential_id").is("revoked_at", null);
    const challenge = await crearDesafio({ p: "registro", u: user.id });
    return { challenge, rpId, userId: b64u(Buffer.from(user.id.replace(/-/g, ""), "hex")), userName: user.email ?? "ENQORA",
      exclude: ((data ?? []) as { credential_id: string }[]).map((k) => k.credential_id) };
  } catch {
    return { error: msg("ENQ_CLAVE_SERVICIO", "Falta configurar la clave de servicio de ENQORA.") };
  }
}

export async function registrarLlaveAction(r: Registro & { nombre: string }): Promise<Resultado> {
  const { supabase, user } = await usuario();
  if (!user) return { error: "Tu sesión terminó. Vuelve a ingresar." };
  const d = await tomarDesafio("registro", user.id);
  if (!d) return { error: "El registro tardó demasiado. Inténtalo de nuevo." };
  const { rpId, origin } = await sitio();
  try {
    verificarRegistro(r, desafioDe(d), rpId, origin);
  } catch {
    return { error: "No pudimos verificar la llave de tu dispositivo. Inténtalo de nuevo." };
  }
  const { error } = await supabase.rpc("passkey_registrar", { p_token: process.env.ENQORA_SERVICE_TOKEN ?? null, p_credential: r.credentialId,
    p_public_key: r.publicKey, p_alg: r.alg, p_rp_id: rpId, p_nombre: String(r.nombre ?? "").slice(0, 80) });
  if (dbCode(error) === "ENQ_REAUTH") return { reauth: "/mfa/reautenticar?next=" + encodeURIComponent("/seguridad#llaves") };
  if (error) return { error: msg(dbCode(error), "No pudimos guardar la llave. Inténtalo de nuevo.") };
  revalidatePath("/seguridad");
  return { ok: true };
}

export async function revocarLlaveAction(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  if (!UUID_RE.test(id)) redirect("/seguridad");
  const supabase = await createClient();
  const { error } = await supabase.rpc("passkey_revocar", { p_id: id });
  if (dbCode(error) === "ENQ_REAUTH") redirect("/mfa/reautenticar?next=" + encodeURIComponent("/seguridad#llaves"));
  revalidatePath("/seguridad");
  redirect(`/seguridad?${error ? `error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}` : "aviso=llave_revocada"}#llaves`);
}

export type OpcionesFirma = { challenge: string; rpId: string; allow: string[] } | { error: string };

// El desafío de firma incluye la huella del documento: lo que firma el dispositivo es ese documento.
export async function opcionesFirmaAction(signer: string, sha: string): Promise<OpcionesFirma> {
  if (!UUID_RE.test(signer) || !/^[0-9a-f]{64}$/.test(sha)) return { error: msg("ENQ_DATOS_INVALIDOS", "Datos inválidos.") };
  const { supabase, user } = await usuario();
  if (!user) return { error: "Tu sesión terminó. Vuelve a ingresar." };
  const { rpId } = await sitio();
  const { data } = await supabase.from("signing_passkeys").select("credential_id").is("revoked_at", null).eq("rp_id", rpId);
  const allow = ((data ?? []) as { credential_id: string }[]).map((k) => k.credential_id);
  if (!allow.length) return { error: "Aún no registras la huella o Face ID de este dispositivo. Hazlo en Seguridad, o firma con tu código." };
  try {
    return { challenge: await crearDesafio({ p: "firma", u: user.id, s: signer, h: sha }), rpId, allow };
  } catch {
    return { error: msg("ENQ_CLAVE_SERVICIO", "Falta configurar la clave de servicio de ENQORA.") };
  }
}

export async function firmarConLlaveAction(signer: string, sha: string, a: Asercion): Promise<Resultado> {
  const { supabase, user } = await usuario();
  if (!user) return { error: "Tu sesión terminó. Vuelve a ingresar." };
  const d = await tomarDesafio("firma", user.id);
  if (!d || d.s !== signer || d.h !== sha) return { error: "La firma tardó demasiado o cambió el documento. Inténtalo de nuevo." };
  const { rpId, origin } = await sitio();
  const { data: k } = await supabase.from("signing_passkeys").select("public_key, alg").eq("credential_id", a.credentialId).is("revoked_at", null).maybeSingle();
  const llave = k as { public_key: string; alg: number } | null;
  if (!llave || !(ALGS as readonly number[]).includes(llave.alg)) return { error: msg("ENQ_LLAVE_NO_VALIDA", "Esa llave no está registrada en tu cuenta.") };
  let contador = 0;
  let desafio = "";
  try {
    desafio = desafioDe(d);
    contador = verificarAsercion(a, llave, desafio, rpId, origin).contador;
  } catch {
    return { error: "No pudimos verificar la huella o Face ID. Inténtalo de nuevo o firma con tu código." };
  }
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "";
  const { error } = await supabase.rpc("sign_firmar_llave", { p_token: process.env.ENQORA_SERVICE_TOKEN ?? null, p_signer: signer, p_sha: sha,
    p_credential: a.credentialId, p_count: contador, p_desafio: desafio, p_evidencia: {
      ip, dispositivo: (h.get("user-agent") ?? "").slice(0, 300), idioma: (h.get("accept-language") ?? "").slice(0, 40), texto_aceptado: TEXTO_ACEPTACION_VERSION,
    } });
  if (error) return { error: msg(dbCode(error), "No pudimos registrar tu firma. Inténtalo de nuevo.") };
  revalidatePath("/firmas");
  return { ok: true };
}
