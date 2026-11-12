import "server-only";
import { createClient } from "@/lib/supabase/server";

// Envío de notificaciones por correo (Resend) y WhatsApp (API de WhatsApp Business de Meta).
// Lee los envíos pendientes con la clave de servicio; la base decide destinatario y canal.
// Variables en Vercel: ENQORA_SERVICE_TOKEN, RESEND_API_KEY, ALERT_EMAIL_FROM, NEXT_PUBLIC_SITE_URL,
// y para WhatsApp: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_TEMPLATE (plantilla aprobada con 2 variables).

type Delivery = { id: number; channel: "email" | "whatsapp"; recipient: string; title: string; body: string | null; link: string | null };

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c);

export const whatsappEnabled = () => !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
const site = (origin?: string) => (process.env.NEXT_PUBLIC_SITE_URL || origin || "").replace(/\/+$/, "");

function emailHtml(d: Delivery, base: string) {
  const url = d.link && base ? `${base}${d.link}` : base;
  return `<div style="background:#0A1220;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:480px;margin:0 auto;background:#101B2D;border:1px solid #24354F;border-top:2px solid #C6A66B;border-radius:12px;padding:32px 28px;color:#D9E0EA;">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:4px;color:#C6A66B;">ENQORA</p>
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.35;color:#F4F0E8;">${esc(d.title)}</h1>
${d.body ? `<p style="margin:0 0 20px;line-height:1.6;">${esc(d.body)}</p>` : ""}
${url ? `<p style="margin:0 0 24px;"><a href="${esc(url)}" style="display:inline-block;background:#C6A66B;color:#0A1220;text-decoration:none;font-weight:bold;padding:13px 22px;border-radius:8px;">Ver en ENQORA</a></p>` : ""}
<p style="margin:0 0 6px;font-size:13px;color:#9AA6B8;">Recibes este aviso por tu cuenta en ENQORA. Puedes elegir qué avisos recibir en Notificaciones.</p>
<p style="margin:0;font-size:13px;color:#9AA6B8;">ENQORA nunca te pedirá tu ClaveÚnica ni tu clave del SII.</p>
</div></div>`;
}

async function sendEmail(d: Delivery, base: string): Promise<string | null> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return "Correo sin configurar";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.ALERT_EMAIL_FROM || "ENQORA <onboarding@resend.dev>",
      to: [d.recipient],
      subject: d.title,
      html: emailHtml(d, base),
    }),
    signal: AbortSignal.timeout(6000),
  });
  return res.ok ? null : `Resend ${res.status}`;
}

// Mensaje de plantilla de WhatsApp. Plantilla sugerida (categoría «Utilidad», idioma es):
// «ENQORA: {{1}}. Revisa el detalle en {{2}}»
export async function sendWhatsAppTemplate(to: string, template: string, params: string[]): Promise<string | null> {
  if (!whatsappEnabled()) return "WhatsApp sin configurar";
  const res = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: to.replace(/^\+/, ""),
      type: "template",
      template: {
        name: template,
        language: { code: process.env.WHATSAPP_LANG || "es" },
        components: [{ type: "body", parameters: params.map((p) => ({ type: "text", text: p.slice(0, 900) })) }],
      },
    }),
    signal: AbortSignal.timeout(6000),
  });
  return res.ok ? null : `WhatsApp ${res.status}`;
}

let lastRun = 0;

// Canales configurados en Vercel. Un canal sin configurar no se reclama: sus envíos quedan pendientes
// (no se gastan los 5 intentos) hasta que se configure, o vencen a los 3 días como «omitido».
export const canalesActivos = (): ("email" | "whatsapp")[] => [
  ...(process.env.RESEND_API_KEY ? (["email"] as const) : []),
  ...(whatsappEnabled() ? (["whatsapp"] as const) : []),
];

// Envía los avisos pendientes de a 20. Se llama después de responder (after) en la app, el Centro de Mando y
// las solicitudes públicas, y en la tarea diaria (force), que vacía la cola en hasta 10 vueltas.
export async function flushDeliveries(origin?: string, force = false) {
  const token = process.env.ENQORA_SERVICE_TOKEN;
  const canales = canalesActivos();
  if (!token || !canales.length) return;
  const now = Date.now();
  if (!force && now - lastRun < 15000) return;
  lastRun = now;
  try {
    const supabase = await createClient();
    const base = site(origin);
    for (let vuelta = 0; vuelta < (force ? 10 : 1); vuelta++) {
      const { data, error } = await supabase.rpc("claim_deliveries", { p_token: token, p_limit: 20, p_channels: canales });
      if (error || !Array.isArray(data) || !data.length) return;
      for (const d of data as Delivery[]) {
        let problem: string | null;
        try {
          problem =
            d.channel === "email"
              ? await sendEmail(d, base)
              : await sendWhatsAppTemplate(d.recipient, process.env.WHATSAPP_TEMPLATE || "enqora_aviso", [d.title, `${base}${d.link ?? ""}`]);
        } catch (e) {
          problem = e instanceof Error ? e.message.slice(0, 200) : "Error de envío";
        }
        await supabase.rpc("finish_delivery", { p_token: token, p_delivery: d.id, p_ok: !problem, p_error: problem });
      }
      if (data.length < 20) return;
    }
  } catch (e) {
    console.error("[ENQORA avisos]", e instanceof Error ? e.message : e);
  }
}

// Acuse de recibo a quien envió una solicitud pública (sin cuenta). Solo confirma la recepción y el plazo:
// no repite su relato ni datos. Correo: Resend. WhatsApp: plantilla aprobada por Meta con 1 variable (nombre),
// categoría «Utilidad», nombre en WHATSAPP_TEMPLATE_SOLICITUD (por defecto «enqora_solicitud»), p. ej.:
// «Hola {{1}}, recibimos tu solicitud en ENQORA. Un profesional te responde con una propuesta y su cotización
// en un plazo de 24 horas hábiles. ENQORA nunca te pedirá tu ClaveÚnica ni tu clave del SII.»
export async function acuseSolicitud(canal: "correo" | "whatsapp", contacto: string, nombre: string): Promise<string | null> {
  const n = nombre.trim().split(/\s+/)[0]?.slice(0, 40) || "hola";
  if (canal === "whatsapp") {
    return sendWhatsAppTemplate(contacto.replace(/[^\d]/g, ""), process.env.WHATSAPP_TEMPLATE_SOLICITUD || "enqora_solicitud", [n]);
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) return "Correo sin configurar";
  const html = `<div style="background:#0A1220;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:480px;margin:0 auto;background:#101B2D;border:1px solid #24354F;border-top:2px solid #C6A66B;border-radius:12px;padding:32px 28px;color:#D9E0EA;">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:4px;color:#C6A66B;">ENQORA</p>
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.35;color:#F4F0E8;">Hola ${esc(n)}, recibimos tu solicitud</h1>
<p style="margin:0 0 16px;line-height:1.6;">Un profesional ENQORA la revisa y te responde por este correo con una propuesta y su cotización, en un plazo de 24 horas hábiles. No pagas nada hasta aceptarla.</p>
<p style="margin:0 0 6px;font-size:13px;color:#9AA6B8;">Usamos tus datos solo para responder tu solicitud.</p>
<p style="margin:0;font-size:13px;color:#9AA6B8;">ENQORA nunca te pedirá tu ClaveÚnica ni tu clave del SII.</p>
</div></div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.ALERT_EMAIL_FROM || "ENQORA <onboarding@resend.dev>", to: [contacto], subject: "Recibimos tu solicitud · ENQORA", html }),
    signal: AbortSignal.timeout(6000),
  }).catch(() => null);
  return res?.ok ? null : `Resend ${res?.status ?? "sin conexión"}`;
}
