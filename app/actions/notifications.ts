"use server";

import { createHash, randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbCode, dbMessage } from "@/lib/db-errors";
import { sendWhatsAppTemplate, whatsappEnabled } from "@/lib/notify-delivery";
import { createClient } from "@/lib/supabase/server";

// Notificaciones (M11): leer, preferencias y verificación del teléfono para WhatsApp.

const CATS = ["casos", "cotizaciones", "pagos", "mandatos", "equipo"];

function back(error: { message?: string } | null, ok: string, anchor = "") {
  const code = dbCode(error);
  revalidatePath("/notificaciones");
  redirect(`/notificaciones?${error ? `error=${code ?? "ENQ_DATOS_INVALIDOS"}` : `aviso=${ok}`}${anchor ? `#${anchor}` : ""}`);
}

export async function markAllReadAction() {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_notifications_read", { p_ids: null });
  revalidatePath("/", "layout");
  back(error, "leidas");
}

export async function savePreferencesAction(fd: FormData) {
  // Las categorías marcadas son las que se reciben fuera de la aplicación; el resto queda silenciado.
  const on = new Set(fd.getAll("cat").map(String));
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_notification_preferences", {
    p_email: fd.get("email") === "on",
    p_whatsapp: fd.get("whatsapp") === "on",
    p_muted: CATS.filter((c) => !on.has(c)),
  });
  back(error, "preferencias", "preferencias");
}

export type PhoneState = { step?: "code"; phone?: string; error?: string; ok?: string } | undefined;

const normalizePhone = (raw: string) => {
  const digits = raw.replace(/[^\d]/g, "");
  if (/^569\d{8}$/.test(digits)) return `+${digits}`;
  if (/^9\d{8}$/.test(digits)) return `+56${digits}`;
  return null;
};

export async function sendPhoneCodeAction(_: PhoneState, fd: FormData): Promise<PhoneState> {
  if (!whatsappEnabled()) return { error: "El envío por WhatsApp aún no está habilitado en ENQORA." };
  const phone = normalizePhone(String(fd.get("phone") ?? ""));
  if (!phone) return { error: "Ingresa un celular chileno: +56 9 1234 5678." };
  if (fd.get("consent") !== "on") return { error: "Para recibir avisos por WhatsApp debes aceptarlo expresamente." };

  const code = String(randomInt(0, 1000000)).padStart(6, "0");
  const hash = createHash("sha256").update(code).digest("hex");
  const supabase = await createClient();
  const { error } = await supabase.rpc("start_phone_verification", { p_phone: phone, p_code_hash: hash });
  if (error) return { error: dbMessage(error) };
  const problem = await sendWhatsAppTemplate(phone, process.env.WHATSAPP_OTP_TEMPLATE || "enqora_codigo", [code]);
  if (problem) return { error: "No pudimos enviar el código por WhatsApp. Revisa el número e intenta en un minuto." };
  return { step: "code", phone, ok: `Enviamos un código de 6 dígitos por WhatsApp al ${phone}. Vence en 10 minutos.` };
}

export async function confirmPhoneAction(_: PhoneState, fd: FormData): Promise<PhoneState> {
  const code = String(fd.get("code") ?? "").replace(/\D/g, "");
  const phone = String(fd.get("phone") ?? "");
  if (code.length !== 6) return { step: "code", phone, error: "El código tiene 6 dígitos." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_phone_verification", { p_code: code });
  if (error) return { step: "code", phone, error: dbMessage(error) };
  revalidatePath("/notificaciones");
  redirect("/notificaciones?aviso=telefono#preferencias");
}

export async function removePhoneAction() {
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_phone");
  back(error, "telefono_eliminado", "preferencias");
}
