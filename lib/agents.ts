import "server-only";
import { AGENTS, STAGES, type AgentKey } from "@/lib/mirror";
import { knowledgeFor } from "@/lib/knowledge";
import { CALCULATOR_TOOLS, runCalculator } from "@/lib/tax-calc";

// Agentes IA de ENQORA (M13): llaman a la API de Claude con los antecedentes reales del caso y
// devuelven PROPUESTAS que una persona del equipo acepta o descarta. Nunca actúan por sí solos,
// nunca fijan precios ni ejecutan trámites, y nunca piden claves.
//
// Variables de entorno (se configuran en Vercel, nunca en el repositorio ni en el chat):
//   ANTHROPIC_API_KEY      clave de la API de Claude (obligatoria para usar agentes)
//   ANTHROPIC_MODEL        modelo (por defecto claude-sonnet-5-5)
//   ANTHROPIC_WEB_SEARCH   "off" desactiva la búsqueda web; otro valor = versión de la herramienta
//                          (por defecto web_search_20250305)

export const agentsEnabled = () => !!process.env.ANTHROPIC_API_KEY;

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = () => process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5-5";
const WEB_SEARCH = () => {
  const v = process.env.ANTHROPIC_WEB_SEARCH?.trim();
  return v === "off" ? null : v || "web_search_20250305";
};

// Fuentes oficiales chilenas a las que se limita la búsqueda web.
export const OFFICIAL_DOMAINS = [
  "sii.cl", "bcn.cl", "leychile.cl", "tgr.cl", "dt.gob.cl", "inapi.cl", "chileatiende.gob.cl", "diariooficial.interior.gob.cl",
  "registrodeempresasysociedades.cl", "cmfchile.cl", "corfo.cl", "sercotec.cl", "previred.com", "suseso.cl", "spensiones.cl",
  "aduana.cl", "minsal.cl", "sag.gob.cl", "conservador.cl", "economia.gob.cl", "pjud.cl",
  // M16: todo el dominio gob.cl (solo organismos del Estado) y servicios con dominio propio.
  "gob.cl", "sernac.cl", "sernatur.cl", "mercadopublico.cl", "chilecompra.cl", "ispch.cl", "sec.cl", "nic.cl", "prochile.gob.cl",
];

const FOCUS: Record<AgentKey, string> = {
  tributario: "Eres el Agente Tributario. Analizas obligaciones tributarias chilenas: inicio de actividades, regímenes (Pro Pyme general, Pro Pyme transparente, semi integrado), IVA, F29, F22, PPM, retenciones, boletas de honorarios, multas e intereses del Código Tributario y beneficios aplicables.",
  contable: "Eres el Agente Contable. Analizas registros contables: Registro de Compras y Ventas, libros, conciliación bancaria, respaldo documental, cuadratura de IVA, cierre mensual y anual.",
  legal: "Eres el Agente Legal. Analizas aspectos societarios y regulatorios chilenos: constitución y modificación de sociedades (Ley 20.659, Código de Comercio, Código Civil), poderes y representación, contratos, patentes municipales, permisos sectoriales, marcas (Ley 19.039) y protección de datos personales (Ley 19.628 y Ley 21.719).",
  financiero: "Eres el Agente Financiero. Estimas escenarios: flujo de caja, costos de cumplimiento, efectos de cada alternativa y opciones de financiamiento. Nunca inventas cifras: si faltan datos, lo dices y pides el antecedente.",
  investigador: "Eres el Agente Investigador. Buscas y verificas normativa, circulares, oficios y trámites vigentes en fuentes oficiales chilenas, indicando artículo, fecha o vigencia y enlace.",
  estrategico: "Eres el Agente Estratégico. Ordenas las alternativas posibles, sus riesgos y beneficios, y propones la ruta de trabajo más conveniente para la empresa, por etapas.",
};

export function systemPrompt(agent: AgentKey, webSearch: boolean) {
  return [
    FOCUS[agent],
    "Trabajas para ENQORA, plataforma chilena de contabilidad, impuestos y ciclo de vida empresarial. Recibes los antecedentes reales de un caso en JSON.",
    "Reglas obligatorias:",
    "- Responde en español de Chile, claro y sin tecnicismos innecesarios.",
    "- Todo lo que entregas es una PROPUESTA para el equipo profesional de ENQORA; una persona la revisa antes de que llegue al cliente.",
    "- No inventes hechos, montos, fechas, porcentajes ni normas. Si no tienes certeza, indícalo con la certeza 'baja' y explica qué falta en 'falta'.",
    "- Cita normativa chilena con su cuerpo legal y artículo. Usa enlaces solo de fuentes oficiales y solo si los verificaste.",
    webSearch
      ? "- Puedes usar la búsqueda web (limitada a sitios oficiales) para verificar normativa vigente. Úsala con moderación."
      : "- No tienes búsqueda web: indica en 'vigencia' que la norma debe verificarse y no inventes enlaces.",
    "- Nunca pidas ni sugieras compartir ClaveÚnica, clave tributaria del SII, contraseñas ni claves bancarias. ENQORA actúa ante instituciones solo con mandato verificado.",
    "- No fijes precios ni honorarios; no prometas resultados; no afirmes que algo es ilegal sin fundamento.",
    "- Las preguntas al cliente deben ser concretas y responderse sin conocimientos técnicos.",
    "- Toda cifra (IVA, retenciones, multas, intereses) se obtiene con las herramientas calcular_*; declara cada cálculo en 'calculos' de la situación. Si falta un dato (UF, UTM, tasa diaria del SII), no lo supongas: pídelo.",
    "- Distingue lo verificado de lo que es hipótesis. Una situación sin fuente oficial debe llevar certeza 'baja'.",
    "- Considera la fecha de los hechos: si la norma cambió (por ejemplo, intereses desde 2025), aplica la vigente a esa fecha y dilo.",
    "- Un auditor independiente revisará tu resultado: fuentes, fechas, cálculos y coherencia. Si recibes observaciones de auditoría, corrígelas una por una o explica por qué no corresponden.",
    "- El contexto trae 'aprendizajes' (casos resueltos del mismo servicio, aprobados por la supervisión) y 'novedades_verificadas' (normas y beneficios nuevos verificados). Úsalos: repite lo que funcionó, evita lo que falló y, si una novedad verificada contradice la base normativa, prevalece la novedad (cítala).",
    "- Busca activamente beneficios, ayudas estatales y derechos que podrían corresponder al cliente según su rubro y etapa (fondos, tasas reducidas, franquicias) y propónlos en 'beneficios' con su fuente y requisitos; nunca los prometas.",
    `- Etapas posibles para los pasos: ${STAGES.slice(0, 7).map((s) => `${s.key} (${s.label})`).join(", ")}.`,
    "Cuando termines, llama UNA vez a la herramienta registrar_resultado con todo tu trabajo. Puedes devolver listas vacías si no corresponde proponer algo.",
    "",
    knowledgeFor(agent),
  ].join("\n");
}

const str = (max: number) => ({ type: "string", maxLength: max });

export const RESULT_TOOL = {
  name: "registrar_resultado",
  description: "Registra el resultado del análisis del agente como propuestas para revisión humana.",
  input_schema: {
    type: "object",
    properties: {
      resumen: { ...str(1500), description: "Resumen interno para el equipo: qué revisaste y qué concluyes." },
      pasos: {
        type: "array", maxItems: 6, description: "Trabajo realizado que se mostraría al cliente en MIRROR.",
        items: {
          type: "object",
          properties: {
            etapa: { type: "string", enum: STAGES.slice(0, 7).map((s) => s.key) },
            titulo: { ...str(150), description: "Qué se hizo, en una frase." },
            detalle: { ...str(1500), description: "Fundamento o evidencia: norma, documento o fuente." },
          },
          required: ["etapa", "titulo"],
        },
      },
      hallazgos: {
        type: "array", maxItems: 6, description: "Situaciones para el diagnóstico.",
        items: {
          type: "object",
          properties: {
            titulo: str(150),
            situacion: { ...str(3000), description: "Qué está ocurriendo (mínimo una oración completa)." },
            normativa: { ...str(3000), description: "Qué exige la normativa aplicable." },
            fuentes: {
              type: "array", maxItems: 6,
              items: {
                type: "object",
                properties: { titulo: str(190), articulo: str(110), vigencia: str(75), url: { ...str(390), description: "https:// de un sitio oficial, o vacío" } },
                required: ["titulo"],
              },
            },
            causas: str(1800),
            correcciones: { ...str(3000), description: "Correcciones y alternativas por verificar." },
            beneficios: str(1800),
            nivel_riesgo: { type: "string", enum: ["bajo", "medio", "alto"] },
            riesgo: { ...str(1800), description: "Riesgo de no actuar, sin exagerar." },
            certeza: { type: "string", enum: ["alta", "media", "baja"] },
            falta: { ...str(1800), description: "Qué antecedentes faltan para confirmarlo." },
            calculos: {
              type: "array", maxItems: 8, description: "Cálculos hechos con las herramientas calcular_*, con sus entradas y resultado exactos.",
              items: {
                type: "object",
                properties: {
                  herramienta: { type: "string", enum: CALCULATOR_TOOLS.map((t) => t.name) },
                  entradas: { type: "object" },
                  resultado: { type: "object" },
                },
                required: ["herramienta", "entradas", "resultado"],
              },
            },
          },
          required: ["titulo", "situacion", "nivel_riesgo", "certeza"],
        },
      },
      tareas: {
        type: "array", maxItems: 8,
        items: {
          type: "object",
          properties: { titulo: str(190), para: { type: "string", enum: ["cliente", "equipo"] } },
          required: ["titulo", "para"],
        },
      },
      preguntas: { type: "array", maxItems: 6, items: str(600), description: "Preguntas concretas para el cliente." },
    },
    required: ["resumen", "pasos", "hallazgos", "tareas", "preguntas"],
  },
} as const;

// ---------------------------------------------------------------------
// Normalización de la respuesta → propuestas (la base de datos vuelve a validar al aceptar)
// ---------------------------------------------------------------------

export type ProposalKind = "paso" | "hallazgo" | "tarea" | "pregunta";
export type Proposal = { kind: ProposalKind; payload: Record<string, unknown> };

const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const arr = (v: unknown, max: number): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const oneOf = <T extends string>(v: unknown, opts: readonly T[], dflt: T): T => (opts.includes(v as T) ? (v as T) : dflt);
const URL_RE = /^https:\/\/[^\s]+\.[^\s]+$/;
const STAGE_KEYS = STAGES.slice(0, 7).map((x) => x.key);

export function toProposals(input: unknown): { summary: string; proposals: Proposal[] } {
  const r = obj(input);
  const out: Proposal[] = [];
  for (const p of arr(r.pasos, 6).map(obj)) {
    const titulo = s(p.titulo, 160);
    if (titulo.length < 3) continue;
    out.push({ kind: "paso", payload: { etapa: oneOf(p.etapa, STAGE_KEYS, "normativa"), titulo, detalle: s(p.detalle, 2000) } });
  }
  for (const h of arr(r.hallazgos, 6).map(obj)) {
    const titulo = s(h.titulo, 160);
    const situacion = s(h.situacion, 4000);
    if (titulo.length < 3 || situacion.length < 10) continue;
    const fuentes = arr(h.fuentes, 10).map(obj).map((f) => {
      const url = s(f.url, 400);
      return { titulo: s(f.titulo, 200), articulo: s(f.articulo, 120), vigencia: s(f.vigencia, 80), url: URL_RE.test(url) ? url : "" };
    }).filter((f) => f.titulo.length >= 3);
    const calculos = arr(h.calculos, 8).map(obj).filter((c) => typeof c.herramienta === "string")
      .map((c) => ({ herramienta: s(c.herramienta, 60), entradas: obj(c.entradas), resultado: obj(c.resultado) }));
    out.push({
      kind: "hallazgo",
      payload: {
        calculos, titulo, situacion, normativa: s(h.normativa, 4000), fuentes, causas: s(h.causas, 2000), correcciones: s(h.correcciones, 4000),
        beneficios: s(h.beneficios, 2000), nivel_riesgo: oneOf(h.nivel_riesgo, ["bajo", "medio", "alto"] as const, "medio"),
        riesgo: s(h.riesgo, 2000), certeza: oneOf(h.certeza, ["alta", "media", "baja"] as const, "baja"), falta: s(h.falta, 2000),
      },
    });
  }
  for (const t of arr(r.tareas, 8).map(obj)) {
    const titulo = s(t.titulo, 200);
    if (titulo.length < 3) continue;
    out.push({ kind: "tarea", payload: { titulo, para: oneOf(t.para, ["cliente", "equipo"] as const, "equipo") } });
  }
  for (const q of arr(r.preguntas, 6)) {
    const texto = s(q, 1000);
    if (texto.length >= 3) out.push({ kind: "pregunta", payload: { texto } });
  }
  return { summary: s(r.resumen, 4000), proposals: out.slice(0, 30) };
}

// ---------------------------------------------------------------------
// Llamada a la API de Claude
// ---------------------------------------------------------------------

type Block = { type: string; id?: string; name?: string; input?: unknown; [k: string]: unknown };
type ApiResponse = {
  content?: Block[];
  stop_reason?: string;
  model?: string;
  usage?: { input_tokens?: number; output_tokens?: number; server_tool_use?: { web_search_requests?: number } };
  error?: { type?: string; message?: string };
};

export type AgentResult = {
  ok: boolean;
  summary: string;
  proposals: Proposal[];
  model: string;
  inputTokens: number;
  outputTokens: number;
  webSearches: number;
  error?: string;
};

export async function runAgent(
  agent: AgentKey, context: unknown, instruction: string | null, signal: AbortSignal, correction?: string | null,
): Promise<AgentResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  const model = MODEL();
  const searchVersion = WEB_SEARCH();
  const usage = { input: 0, output: 0, searches: 0 };
  const fail = (error: string): AgentResult => ({
    ok: false, summary: "", proposals: [], model, inputTokens: usage.input, outputTokens: usage.output, webSearches: usage.searches, error,
  });
  if (!key) return fail("Falta configurar ANTHROPIC_API_KEY");

  const tools: unknown[] = [RESULT_TOOL, ...CALCULATOR_TOOLS];
  if (searchVersion) tools.push({ type: searchVersion, name: "web_search", max_uses: 4, allowed_domains: OFFICIAL_DOMAINS });

  const userText = [
    `Fecha de hoy: ${new Date().toISOString().slice(0, 10)}.`,
    `Antecedentes del caso (JSON):\n${JSON.stringify(context)}`,
    instruction ? `Indicación del profesional a cargo: ${instruction}` : "Analiza el caso desde tu especialidad y propone lo que corresponda.",
    correction ? `OBSERVACIONES DE LA AUDITORÍA A TU PROPUESTA ANTERIOR (corrígelas una por una):\n${correction}` : "",
  ].filter(Boolean).join("\n\n");
  const messages: { role: "user" | "assistant"; content: unknown }[] = [{ role: "user", content: userText }];

  const call = async (toolChoice: unknown) => {
    const res = await fetch(API_URL, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 8000, system: systemPrompt(agent, !!searchVersion), tools, tool_choice: toolChoice, messages }),
    });
    const data = (await res.json().catch(() => ({}))) as ApiResponse;
    if (!res.ok) throw new Error(`API ${res.status}: ${data.error?.type ?? "error"}`);
    usage.input += data.usage?.input_tokens ?? 0;
    usage.output += data.usage?.output_tokens ?? 0;
    usage.searches += data.usage?.server_tool_use?.web_search_requests ?? 0;
    return data;
  };
  const findResult = (d: ApiResponse) => d.content?.find((b) => b.type === "tool_use" && b.name === RESULT_TOOL.name);

  try {
    let data = await call({ type: "auto" });
    // Ciclo de trabajo: búsqueda web (pause_turn) y calculadoras deterministas (tool_use).
    for (let i = 0; i < 8 && !findResult(data); i++) {
      if (data.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: data.content ?? [] });
        data = await call({ type: "auto" });
        continue;
      }
      const calls = (data.content ?? []).filter((b) => b.type === "tool_use" && b.name !== RESULT_TOOL.name);
      if (data.stop_reason !== "tool_use" || !calls.length) break;
      messages.push({ role: "assistant", content: data.content ?? [] });
      messages.push({
        role: "user",
        content: calls.map((b) => {
          const r = runCalculator(String(b.name), b.input);
          return { type: "tool_result", tool_use_id: b.id, content: JSON.stringify(r), ...(r.ok ? {} : { is_error: true }) };
        }),
      });
      data = await call({ type: "auto" });
    }
    let use = findResult(data);
    if (!use) {
      // Terminó sin registrar: se le pide que registre su resultado.
      messages.push({ role: "assistant", content: data.content?.length ? data.content : [{ type: "text", text: "(sin respuesta)" }] });
      const pending = (data.content ?? []).filter((b) => b.type === "tool_use");
      messages.push({
        role: "user",
        content: [
          ...pending.map((b) => ({ type: "tool_result", tool_use_id: b.id, content: "Sin tiempo para más cálculos: registra tu resultado.", is_error: true })),
          { type: "text", text: "Registra ahora tu resultado con la herramienta registrar_resultado." },
        ],
      });
      data = await call({ type: "tool", name: RESULT_TOOL.name });
      use = findResult(data);
    }
    if (!use) return fail("El agente no entregó un resultado");
    const { summary, proposals } = toProposals(use.input);
    return {
      ok: true, summary, proposals, model: data.model ?? model,
      inputTokens: usage.input, outputTokens: usage.output, webSearches: usage.searches,
    };
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    return fail(name === "TimeoutError" || name === "AbortError" ? "Tiempo de espera agotado" : e instanceof Error ? e.message.slice(0, 300) : "Error");
  }
}

export const agentName = (k: string) => (AGENTS as Record<string, { name: string }>)[k]?.name ?? k;
