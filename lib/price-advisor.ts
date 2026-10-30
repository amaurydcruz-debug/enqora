import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Asesor de precios ENQORA (M20). Busca en fuentes públicas chilenas los precios que otros
// proveedores PUBLICAN por un trámite o servicio comparable. Solo transcribe lo que ve: cada
// referencia lleva enlace y el texto exacto del precio, y queda «por verificar» para el equipo.
// Nunca fija ni publica precios: eso lo hace el Administrador desde el Centro de Mando.

export type ServiceToResearch = { id: string; code: string; name: string; scope: string; unit: string };
export type FoundPrice = {
  provider: string; url: string; amount_min: number; amount_max: number | null; unit: string; scope_note: string | null; evidence: string;
};

const UNITS = ["caso", "mes", "trabajador", "documento", "hora"];

const TOOL = {
  name: "registrar_precios",
  description: "Registra los precios publicados encontrados para el servicio.",
  input_schema: {
    type: "object",
    properties: {
      precios: {
        type: "array", maxItems: 12,
        items: {
          type: "object",
          properties: {
            proveedor: { type: "string", description: "Nombre del proveedor que publica el precio" },
            url: { type: "string", description: "Página exacta donde aparece el precio (https)" },
            monto_desde: { type: "integer", description: "Precio en pesos chilenos (CLP), sin puntos, tal como se publica" },
            monto_hasta: { type: ["integer", "null"], description: "Tope del rango si la página publica un rango" },
            unidad: { type: "string", enum: UNITS },
            alcance: { type: "string", description: "Qué incluye la oferta publicada, en una frase" },
            evidencia: { type: "string", description: "Texto literal de la página donde aparece el precio" },
          },
          required: ["proveedor", "url", "monto_desde", "unidad", "evidencia"],
        },
      },
    },
    required: ["precios"],
  },
};

type ApiResponse = { content?: { type: string; name?: string; input?: unknown }[]; stop_reason?: string; error?: { type?: string } };

export async function researchPrices(s: ServiceToResearch, signal: AbortSignal): Promise<FoundPrice[]> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Falta configurar ANTHROPIC_API_KEY en Vercel.");
  const system = [
    "Eres el asesor de precios de ENQORA, plataforma chilena de servicios contables, tributarios, legales y de formalización para empresas.",
    "Busca en internet precios PUBLICADOS en Chile por otros proveedores (contadores, estudios jurídicos, gestores, plataformas) para un servicio comparable.",
    "Reglas estrictas:",
    "- Registra solo precios que aparecen escritos en la página, en pesos chilenos (CLP). Si un precio está en UF u otra moneda, omítelo.",
    "- Copia en 'evidencia' el texto literal donde aparece el precio. No estimes, no promedies, no inventes montos ni enlaces.",
    "- No incluyas aranceles o tasas del Estado (SII, INAPI, notarías, conservadores) como si fueran honorarios: solo el precio del servicio del proveedor.",
    "- Excluye a ENQORA. Prefiere precios vigentes; omite páginas claramente antiguas.",
    "- Si no encuentras precios publicados confiables, entrega una lista vacía.",
    "Termina llamando una vez a registrar_precios.",
  ].join("\n");
  const messages: { role: "user" | "assistant"; content: unknown }[] = [{
    role: "user",
    content: `Servicio ENQORA: ${s.name} (${s.code}).\nAlcance: ${s.scope}\nUnidad de cobro: ${s.unit}.\nBusca entre 4 y 10 precios publicados comparables en Chile.`,
  }];
  const tools = [TOOL, { type: process.env.ANTHROPIC_WEB_SEARCH?.trim() || "web_search_20250305", name: "web_search", max_uses: 6, user_location: { type: "approximate", country: "CL" } }];
  const call = async (toolChoice: unknown) => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal,
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5-5", max_tokens: 6000, system, tools, tool_choice: toolChoice, messages }),
    });
    const data = (await res.json().catch(() => ({}))) as ApiResponse;
    if (!res.ok) throw new Error(`No se pudo consultar el asesor (${res.status}${data.error?.type ? `: ${data.error.type}` : ""}).`);
    return data;
  };
  const find = (d: ApiResponse) => d.content?.find((b) => b.type === "tool_use" && b.name === TOOL.name);
  let data = await call({ type: "auto" });
  for (let i = 0; i < 3 && data.stop_reason === "pause_turn"; i++) {
    messages.push({ role: "assistant", content: data.content ?? [] });
    data = await call({ type: "auto" });
  }
  let use = find(data);
  if (!use) {
    messages.push({ role: "assistant", content: data.content?.length ? data.content : [{ type: "text", text: "(sin respuesta)" }] });
    messages.push({ role: "user", content: "Registra ahora solo los precios verificados con registrar_precios." });
    data = await call({ type: "tool", name: TOOL.name });
    use = find(data);
  }
  const raw = (use?.input as { precios?: unknown })?.precios;
  const items = Array.isArray(raw) ? raw : [];
  const out: FoundPrice[] = [];
  for (const it of items as Record<string, unknown>[]) {
    const url = typeof it.url === "string" ? it.url.trim() : "";
    let host = "";
    try { host = new URL(url).hostname.toLowerCase(); } catch { continue; }
    if (!url.startsWith("https://") || host.includes("enqora")) continue;
    const min = Number(it.monto_desde);
    const max = it.monto_hasta == null ? null : Number(it.monto_hasta);
    const unit = String(it.unidad ?? "");
    const evidence = typeof it.evidencia === "string" ? it.evidencia.trim().slice(0, 500) : "";
    if (!Number.isInteger(min) || min < 1000 || min > 100_000_000 || !UNITS.includes(unit) || !evidence) continue;
    out.push({
      provider: String(it.proveedor ?? host).trim().slice(0, 120),
      url: url.slice(0, 500),
      amount_min: min,
      amount_max: max != null && Number.isInteger(max) && max >= min ? max : null,
      unit,
      scope_note: typeof it.alcance === "string" ? it.alcance.trim().slice(0, 500) : null,
      evidence,
    });
  }
  return out;
}

export async function saveFoundPrices(supabase: SupabaseClient, token: string, serviceId: string, found: FoundPrice[]) {
  const { data, error } = await supabase.rpc("svc_add_market_references", { p_token: token, p_service: serviceId, p_items: found });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}
