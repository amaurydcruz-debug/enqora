"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { acuseSolicitud, flushDeliveries } from "@/lib/notify-delivery";
import { contextoAviso } from "@/lib/cora/avisos-sii";
import { llamarHerramienta } from "@/lib/ai/gateway";
import { analizarReglas, CATEGORIAS_CASO, DOCUMENTOS, validarAnalisis, type AnalisisCaso } from "@/lib/cora/caso";
import { dbCode } from "@/lib/db-errors";
import { isValidRut, normalizeRut } from "@/lib/rut";
import { createClient } from "@/lib/supabase/server";

// «Cuéntanos tu caso»: CORA ordena el relato (resumen, servicios y documentos de una lista cerrada) y la
// solicitud queda en la bandeja del equipo, que responde con una cotización por el canal elegido.
// El relato es información privada del cliente: solo va a los proveedores de IA autorizados para datos privados.

export type CasoState = { ok: true; analisis: AnalisisCaso; canal: "correo" | "whatsapp"; codigo: string | null } | { ok: false; error: string } | null;

const TOOL = {
  name: "ordenar_caso",
  description: "Ordena el caso que relata un dueño de empresa en Chile para que un profesional ENQORA lo cotice.",
  input_schema: {
    type: "object",
    properties: {
      resumen: { type: "string", description: "2 a 3 frases en segunda persona: qué entendiste del caso y qué hará ENQORA. Sin montos, plazos legales ni promesas de resultado." },
      categorias: { type: "array", items: { type: "string", enum: CATEGORIAS_CASO }, description: "1 o 2 áreas de servicio." },
      documentos: { type: "array", items: { type: "string", enum: Object.keys(DOCUMENTOS) }, description: "Hasta 5 documentos que un profesional necesitará." },
    },
    required: ["resumen", "categorias", "documentos"],
  },
};

export async function enviarCasoAction(_prev: CasoState, form: FormData): Promise<CasoState> {
  const objetivos = form.getAll("objetivos").map((o) => String(o).slice(0, 80)).filter(Boolean).slice(0, 6);
  const detalle = String(form.get("relato") ?? "").trim();
  const relato = [objetivos.length ? `Objetivos: ${objetivos.join("; ")}.` : "", detalle].filter(Boolean).join("\n");
  const nombre = String(form.get("nombre") ?? "").trim();
  const canal = String(form.get("canal") ?? "") === "correo" ? "correo" : "whatsapp";
  const contacto = String(form.get("contacto") ?? "").trim();
  const rutRaw = normalizeRut(String(form.get("rut") ?? ""));
  const rut = rutRaw && isValidRut(rutRaw) ? rutRaw : null;
  const razon = String(form.get("razon_social") ?? "").slice(0, 200);
  const elegida = String(form.get("categoria") ?? "");
  const categoriaElegida = CATEGORIAS_CASO.includes(elegida) ? elegida : null;
  if (form.get("consentimiento") !== "on") return { ok: false, error: "Para responderte necesitamos tu autorización para usar estos datos." };
  if (relato.length < 10) return { ok: false, error: "Elige un objetivo o cuéntanos con un poco más de detalle qué quieres conseguir." };
  if (relato.length > 4000) return { ok: false, error: "El relato es muy largo: resúmelo en menos de 4.000 caracteres." };
  if (nombre.length < 2) return { ok: false, error: "Indica tu nombre." };
  if (canal === "correo" ? !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contacto) : !/^\+?[\d\s()-]{8,20}$/.test(contacto))
    return { ok: false, error: canal === "correo" ? "Revisa tu correo electrónico." : "Revisa tu número de WhatsApp (ej.: +56 9 1234 5678)." };

  const ia = await llamarHerramienta({
    system: "Eres CORA, de ENQORA (Chile). Ordenas el caso de un dueño de empresa para que un profesional lo cotice. Tono cercano y seguro, en segunda persona. Nunca pidas claves (ClaveÚnica, clave del SII, bancos). No prometas resultados ni plazos legales.",
    prompt: `Empresa: ${razon || "no indicada"}${rut ? ` (RUT ${rut})` : ""}.\n${categoriaElegida ? `Llegó desde la categoría «${categoriaElegida}» de la portada (pista: confírmala o corrígela según el relato).\n` : ""}Caso relatado por el cliente:\n"""${relato}"""\n${contextoAviso(relato) ? `\n${contextoAviso(relato)}\nUsa esta ruta para el resumen y los documentos (sin montos ni plazos legales).\n` : ""}\nÁreas posibles: ${CATEGORIAS_CASO.join(", ")}.\nDocumentos posibles: ${Object.entries(DOCUMENTOS).map(([k, d]) => `${k} (${d.nombre})`).join("; ")}.`,
    tool: TOOL, datos: "privados", modulo: "caso_publico", maxTokens: 700, timeoutMs: 30_000, validar: (x) => !!validarAnalisis(x),
  });
  const base = (ia.input ? validarAnalisis(ia.input) : null) ?? analizarReglas(relato);
  const analisis = categoriaElegida && !base.categorias.length ? { ...base, categorias: [categoriaElegida] } : base;

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "desconocido";
  const client = createHash("sha256").update(`enqora-lookup:${ip}`).digest("hex").slice(0, 32);
  const supabase = await createClient({ headers: { "x-enqora-client": client } });
  const { data: solId, error } = await supabase.rpc("crear_solicitud_caso", {
    p: { nombre, canal, contacto, relato, rut, razon_social: razon || null, consentimiento: true, analisis },
  });
  if (error) {
    const code = dbCode(error);
    if (code === "ENQ_DEMASIADAS_CONSULTAS") return { ok: false, error: "Recibimos varias solicitudes seguidas. Intenta nuevamente en una hora." };
    if (code === "ENQ_CONTACTO_INVALIDO") return { ok: false, error: "Revisa tu dato de contacto." };
    console.error("[ENQORA Caso]", error.message);
    return { ok: false, error: "No pudimos registrar tu caso. Intenta nuevamente en unos minutos." };
  }
  // Acuse de recibo por el canal elegido (si el correo o WhatsApp están conectados). No bloquea la respuesta.
  const hh = await headers();
  const origen = `${hh.get("x-forwarded-proto") ?? "https"}://${hh.get("x-forwarded-host") ?? hh.get("host") ?? ""}`;
  after(async () => {
    const e = await acuseSolicitud(canal, contacto, nombre).catch((x) => (x instanceof Error ? x.message : "error"));
    if (e) console.warn("[ENQORA Caso] acuse no enviado:", e);
    // El aviso al equipo de la nueva solicitud (0042) sale de inmediato, sin esperar a que alguien entre a la app.
    await flushDeliveries(origen, true);
  });
  // Código de la solicitud (trazabilidad): la persona lo ve y queda unido a su cuenta y su caso.
  const { data: codigo } = solId ? await supabase.rpc("solicitud_codigo", { p_id: solId }) : { data: null };
  return { ok: true, analisis, canal, codigo: typeof codigo === "string" ? codigo : null };
}

// Equipo ENQORA: cambia el estado de una solicitud (en revisión, cotizada, cerrada) con una nota opcional.
// Equipo ENQORA: vincula una solicitud con un caso por su folio (p. ej., llegó por WhatsApp).
export async function vincularSolicitudAction(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const folio = String(form.get("folio") ?? "").trim().slice(0, 30);
  if (!/^[0-9a-f-]{36}$/.test(id) || !folio) redirect("/mando/solicitudes?error=ENQ_DATOS_INVALIDOS");
  const supabase = await createClient();
  const { error } = await supabase.rpc("staff_vincular_solicitud", { p_id: id, p_folio: folio });
  revalidatePath("/mando/solicitudes");
  redirect(`/mando/solicitudes${error ? `?error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}` : "?aviso=vinculada"}`);
}

export async function estadoSolicitudAction(form: FormData): Promise<void> {
  const { revalidatePath } = await import("next/cache");
  const id = String(form.get("id") ?? "");
  const estado = String(form.get("estado") ?? "");
  if (!["nueva", "en_revision", "cotizada", "cerrada"].includes(estado) || !/^[0-9a-f-]{36}$/.test(id)) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("solicitud_caso_estado", { p_id: id, p_estado: estado, p_nota: String(form.get("nota") ?? "") || null });
  if (error) console.error("[ENQORA Caso] estado:", error.message);
  revalidatePath("/mando/solicitudes");
}
