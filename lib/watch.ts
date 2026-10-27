import "server-only";
import { OFFICIAL_DOMAINS } from "@/lib/agents";
import { KNOWLEDGE_VERSION } from "@/lib/knowledge";

// Agente de vigilancia normativa (M16). Revisa fuentes oficiales chilenas y propone novedades
// (leyes, circulares, plazos, trámites y beneficios). Solo PROPONE: la supervisión verifica cada
// novedad antes de que llegue a los agentes o a los clientes, y la base normativa (lib/knowledge.ts)
// se actualiza a mano con la novedad verificada.
//
// Se ejecuta cada semana (vercel.json → /api/cron/vigilancia) o desde Centro de Mando → Vigilancia.
// Cada ejecución revisa dos grupos de temas, rotando, para caber en el límite de tiempo.

export const WATCH_GROUPS = [
  { key: "tributario", titulo: "Tributario", consulta: "Circulares, resoluciones y leyes tributarias nuevas del SII (IVA, F29, renta, Pro Pyme, boletas de honorarios, intereses y multas, factura electrónica)." },
  { key: "laboral", titulo: "Laboral y previsional", consulta: "Dictámenes y cambios de la Dirección del Trabajo, cotizaciones previsionales, sueldo mínimo, jornada laboral, Ley Karin." },
  { key: "beneficios", titulo: "Beneficios y fondos", consulta: "Convocatorias abiertas o próximas de Sercotec, CORFO, FOSIS, SENCE y ProChile para emprendedores y pymes, con plazos." },
  { key: "empresas", titulo: "Empresas, marcas y datos", consulta: "Cambios en el Registro de Empresas y Sociedades, INAPI (marcas y aranceles), protección de datos personales (Ley 21.719, Agencia) y protección al consumidor (SERNAC)." },
  { key: "permisos", titulo: "Permisos y municipal", consulta: "Cambios en patentes municipales, autorizaciones sanitarias de la SEREMI de Salud, permisos sectoriales (SERNATUR, transporte, SAG)." },
] as const;

export function groupsForThisRun(date = new Date()) {
  const week = Math.floor(date.getTime() / (7 * 24 * 3600 * 1000));
  const a = WATCH_GROUPS[(week * 2) % WATCH_GROUPS.length];
  const b = WATCH_GROUPS[(week * 2 + 1) % WATCH_GROUPS.length];
  return [a, b];
}

const TOOL = {
  name: "registrar_novedades",
  description: "Registra las novedades oficiales encontradas. Lista vacía si no hay novedades verificables.",
  input_schema: {
    type: "object",
    properties: {
      novedades: {
        type: "array",
        maxItems: 12,
        items: {
          type: "object",
          properties: {
            titulo: { type: "string", maxLength: 200 },
            resumen: { type: "string", maxLength: 1500, description: "Qué cambia, para quién y desde cuándo, en lenguaje claro." },
            institucion: { type: "string", maxLength: 120 },
            tipo: { type: "string", enum: ["ley", "reglamento", "circular", "resolucion", "beneficio", "tramite", "plazo", "otro"] },
            url: { type: "string", description: "Enlace https de la fuente oficial que verificaste." },
            publicado: { type: "string", description: "Fecha de publicación AAAA-MM-DD, si se conoce." },
            impacto: { type: "string", maxLength: 800, description: "Cómo afecta a los clientes de ENQORA o a sus servicios." },
            modulos: { type: "array", items: { type: "string", enum: ["idea", "create", "brand", "formaliza", "contabilidad", "gestion", "crece", "legal", "general"] } },
            rubros: { type: "array", items: { type: "string", enum: ["gastronomia", "comercio", "servicios", "produccion", "construccion", "tecnologia", "transporte", "turismo"] } },
          },
          required: ["titulo", "resumen", "tipo", "url"],
        },
      },
    },
    required: ["novedades"],
  },
} as const;

type Block = { type: string; name?: string; input?: unknown };
type ApiResponse = { content?: Block[]; stop_reason?: string; error?: { type?: string } };

export type WatchResult = { ok: boolean; items: Record<string, unknown>[]; groups: string[]; error?: string };

export async function runWatch(signal: AbortSignal, date = new Date()): Promise<WatchResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  const groups = groupsForThisRun(date);
  const names = groups.map((g) => g.titulo);
  if (!key) return { ok: false, items: [], groups: names, error: "Falta configurar ANTHROPIC_API_KEY" };
  const since = new Date(date.getTime() - 45 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const system = [
    "Eres el agente de vigilancia normativa de ENQORA, plataforma chilena de contabilidad, impuestos y servicios para empresas.",
    `Busca SOLO en fuentes oficiales chilenas novedades publicadas desde el ${since} (hoy es ${date.toISOString().slice(0, 10)}).`,
    "Reporta solo lo que verificaste en la fuente: nunca inventes normas, fechas, montos ni enlaces. Si no encuentras novedades, entrega una lista vacía.",
    `La base normativa de ENQORA fue verificada al ${KNOWLEDGE_VERSION}; prioriza lo que la cambie o la complemente y los beneficios que los clientes puedan usar.`,
    "Termina llamando UNA vez a registrar_novedades.",
  ].join("\n");
  const messages: { role: "user" | "assistant"; content: unknown }[] = [
    { role: "user", content: groups.map((g, i) => `${i + 1}. ${g.titulo}: ${g.consulta}`).join("\n") },
  ];
  const tools = [TOOL, { type: process.env.ANTHROPIC_WEB_SEARCH?.trim() || "web_search_20250305", name: "web_search", max_uses: 8, allowed_domains: OFFICIAL_DOMAINS }];
  const call = async (toolChoice: unknown) => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5-5", max_tokens: 6000, system, tools, tool_choice: toolChoice, messages }),
    });
    const data = (await res.json().catch(() => ({}))) as ApiResponse;
    if (!res.ok) throw new Error(`API ${res.status}: ${data.error?.type ?? "error"}`);
    return data;
  };
  const find = (d: ApiResponse) => d.content?.find((b) => b.type === "tool_use" && b.name === TOOL.name);
  try {
    let data = await call({ type: "auto" });
    for (let i = 0; i < 3 && data.stop_reason === "pause_turn"; i++) {
      messages.push({ role: "assistant", content: data.content ?? [] });
      data = await call({ type: "auto" });
    }
    let use = find(data);
    if (!use) {
      messages.push({ role: "assistant", content: data.content?.length ? data.content : [{ type: "text", text: "(sin respuesta)" }] });
      messages.push({ role: "user", content: "Registra ahora lo verificado con registrar_novedades." });
      data = await call({ type: "tool", name: TOOL.name });
      use = find(data);
    }
    const raw = (use?.input as { novedades?: unknown })?.novedades;
    const items = Array.isArray(raw) ? (raw.filter((x) => x && typeof x === "object") as Record<string, unknown>[]) : [];
    // Solo enlaces de dominios oficiales (la base de datos vuelve a validar el formato).
    const official = items.filter((x) => {
      try {
        const h = new URL(String(x.url)).hostname.toLowerCase();
        return OFFICIAL_DOMAINS.some((d) => h === d || h.endsWith(`.${d}`));
      } catch {
        return false;
      }
    });
    return { ok: true, items: official.slice(0, 12), groups: names };
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    return { ok: false, items: [], groups: names, error: name === "TimeoutError" || name === "AbortError" ? "Tiempo de espera agotado" : e instanceof Error ? e.message.slice(0, 200) : "Error" };
  }
}
