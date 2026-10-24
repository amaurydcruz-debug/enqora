import "server-only";
import { after } from "next/server";
import type { createClient } from "@/lib/supabase/server";
import { deviceToken, requestInfo } from "@/lib/request-info";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type SecurityEvent = "mfa_activado" | "clave_cambiada" | "clave_restablecida" | "sesiones_cerradas";

// Registra un ingreso completo y, si viene de un dispositivo nuevo, envía una alerta por correo.
// Nunca bloquea el ingreso: si el registro falla, solo queda en los logs del servidor.
export async function recordLogin(supabase: Supabase, email?: string | null) {
  try {
    const info = await requestInfo();
    const token = await deviceToken();
    const { data, error } = await supabase.rpc("register_login", {
      p_device_token: token,
      p_ip: info.ip,
      p_user_agent: info.userAgent,
      p_label: info.label,
    });
    if (error) {
      console.error("[ENQORA seguridad] register_login", error.message);
      return;
    }
    if (data === true && email) {
      after(() => sendNewDeviceEmail(email, info.label, info.ip));
    }
  } catch (e) {
    console.error("[ENQORA seguridad] recordLogin", e);
  }
}

export async function logSecurityEvent(supabase: Supabase, event: SecurityEvent, metadata: Record<string, unknown> = {}) {
  try {
    const info = await requestInfo();
    const { error } = await supabase.rpc("log_security_event", {
      p_event: event,
      p_ip: info.ip,
      p_user_agent: info.userAgent,
      p_metadata: metadata,
    });
    if (error) console.error("[ENQORA seguridad] log_security_event", error.message);
  } catch (e) {
    console.error("[ENQORA seguridad] logSecurityEvent", e);
  }
}

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c);

// Alerta por correo vía Resend (opcional: solo si RESEND_API_KEY está configurada en Vercel).
async function sendNewDeviceEmail(to: string, label: string, ip: string | null) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
  const when = new Intl.DateTimeFormat("es-CL", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Santiago",
  }).format(new Date());

  const html = `<div style="background:#0A1220;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:480px;margin:0 auto;background:#101B2D;border:1px solid #24354F;border-top:2px solid #C6A66B;border-radius:12px;padding:32px 28px;color:#D9E0EA;">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:4px;color:#C6A66B;">ENQORA</p>
<h1 style="margin:0 0 16px;font-size:20px;color:#F4F0E8;">Nuevo ingreso a tu cuenta</h1>
<p style="margin:0 0 16px;line-height:1.6;">Detectamos un ingreso desde un dispositivo que no habías usado antes:</p>
<p style="margin:0 0 20px;line-height:1.8;"><b style="color:#F4F0E8;">${esc(label)}</b><br>${esc(when)}${ip ? `<br>IP ${esc(ip)}` : ""}</p>
<p style="margin:0 0 24px;line-height:1.6;">Si fuiste tú, no necesitas hacer nada. Si no lo reconoces, cambia tu contraseña y cierra las demás sesiones de inmediato.</p>
${site ? `<p style="margin:0 0 24px;"><a href="${esc(site)}/seguridad" style="display:inline-block;background:#C6A66B;color:#0A1220;text-decoration:none;font-weight:bold;padding:13px 22px;border-radius:8px;">Revisar mi seguridad</a></p>` : ""}
<p style="margin:0;font-size:13px;color:#9AA6B8;">ENQORA nunca te pedirá tu ClaveÚnica ni tu clave del SII.</p>
</div></div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.ALERT_EMAIL_FROM || "ENQORA <onboarding@resend.dev>",
        to: [to],
        subject: "Nuevo ingreso a tu cuenta ENQORA",
        html,
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) console.error("[ENQORA seguridad] Resend", res.status, await res.text());
  } catch (e) {
    console.error("[ENQORA seguridad] sendNewDeviceEmail", e);
  }
}
