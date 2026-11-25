import "server-only";
import { AGENTS, STAGES, type AgentKey } from "@/lib/mirror";
import { knowledgeFor } from "@/lib/knowledge";
import { CALCULATOR_TOOLS, runCalculator } from "@/lib/tax-calc";
import { archivosCreados } from "@/lib/archivos-creados";
import { bitacoraDeBloques, type EntradaBitacora } from "@/lib/bitacora-computador";

// Agentes IA de ENQORA (M13): llaman a la API de Claude con los antecedentes reales del caso y
// devuelven PROPUESTAS que una persona del equipo acepta o descarta. Nunca actúan por sí solos,
// nunca fijan precios ni ejecutan trámites, y nunca piden claves.
//
// Variables de entorno (se configuran en Vercel, nunca en el repositorio ni en el chat):
//   ANTHROPIC_API_KEY      clave de la API de Claude (obligatoria para usar agentes)
//   ANTHROPIC_MODEL        modelo (por defecto claude-sonnet-5-5)
//   ANTHROPIC_WEB_SEARCH   "off" desactiva la búsqueda web; otro valor = versión de la herramienta
//                          (por defecto web_search_20260209 con computador; web_search_20250305 sin él)
//   ENQORA_COMPUTADOR      "off" apaga el computador del enjambre (0096): contenedor Linux con Python y archivos,
//                          lectura de páginas oficiales y habilidades. Encendido por defecto.

export const agentsEnabled = () => !!process.env.ANTHROPIC_API_KEY;

const API_URL = "https://api.anthropic.com/v1/messages";
export const MODEL = () => process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5-5";
const COMPUTADOR = () => process.env.ENQORA_COMPUTADOR?.trim() !== "off";
const WEB_SEARCH = (computador: boolean) => {
  const v = process.env.ANTHROPIC_WEB_SEARCH?.trim();
  return v === "off" ? null : v || (computador ? "web_search_20260209" : "web_search_20250305");
};
// Herramientas del computador: ejecución de código (contenedor sin internet) y lectura de páginas oficiales.
const CODE_EXECUTION = { type: "code_execution_20260120", name: "code_execution" };
const WEB_FETCH = (dominios: string[]) => ({ type: "web_fetch_20260209", name: "web_fetch", max_uses: 4, allowed_domains: dominios });

// Fuentes oficiales chilenas a las que se limita la búsqueda web.
import { OFFICIAL_DOMAINS } from "@/lib/dominios-oficiales";
export { OFFICIAL_DOMAINS };

const FOCUS: Record<AgentKey, string> = {
  tributario: "Eres el Agente Tributario. Analizas obligaciones tributarias chilenas: inicio de actividades, regímenes (Pro Pyme general, Pro Pyme transparente, semi integrado), IVA, F29, F22, PPM, retenciones, boletas de honorarios, multas e intereses del Código Tributario y beneficios aplicables.",
  contable: "Eres el Agente Contable. Analizas registros contables: Registro de Compras y Ventas, libros, conciliación bancaria, respaldo documental, cuadratura de IVA, cierre mensual y anual.",
  legal: "Eres el Agente Legal. Analizas aspectos societarios y regulatorios chilenos: constitución y modificación de sociedades (Ley 20.659, Código de Comercio, Código Civil), poderes y representación, contratos, patentes municipales, permisos sectoriales, marcas (Ley 19.039) y protección de datos personales (Ley 19.628 y Ley 21.719).",
  financiero: "Eres el Agente Financiero. Estimas escenarios: flujo de caja, costos de cumplimiento, efectos de cada alternativa y opciones de financiamiento. Nunca inventas cifras: si faltan datos, lo dices y pides el antecedente.",
  investigador: "Eres el Agente Investigador. Buscas y verificas normativa, circulares, oficios y trámites vigentes en fuentes oficiales chilenas, indicando artículo, fecha o vigencia y enlace.",
  estrategico: "Eres el Agente Estratégico. Ordenas las alternativas posibles, sus riesgos y beneficios, y propones la ruta de trabajo más conveniente para la empresa, por etapas.",
};

export function systemPrompt(agent: AgentKey, webSearch: boolean, computador?: { habilidades: string[]; archivos: number }) {
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
    ...(computador ? [
      "- Tienes un COMPUTADOR propio para este caso: Linux con Python 3 (pandas, openpyxl, pypdf, pdfplumber, matplotlib, python-docx…), terminal y archivos, SIN acceso a internet. Lo que dejes en él se conserva para tus próximas ejecuciones en este mismo caso.",
      computador.archivos
        ? `- En tu directorio de trabajo están ${computador.archivos} documento(s) nuevos del expediente. Revísalos antes de concluir.`
        : "- Si el expediente tiene documentos, ya están en tu directorio de trabajo desde ejecuciones anteriores (o no hay ninguno).",
      `- Habilidades cargadas: ${computador.habilidades.join(", ")}. Empieza por «enqora-metodo-caso» si está disponible.`,
      "- Puedes leer páginas de sitios oficiales con la lectura web (mismos dominios que la búsqueda).",
      "- Los archivos que crees (máximo cinco) quedan en el expediente como borradores internos para el equipo; nómbralos y descríbelos en tu resumen.",
    ] : []),
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
  container?: { id?: string; expires_at?: string } | null;
};

export type OpcionesComputador = { contenedor?: string | null; habilidades: { type: string; skill_id: string; version: string }[]; nombresHabilidades: string[]; archivos: string[] };

export type AgentResult = {
  ok: boolean;
  summary: string;
  proposals: Proposal[];
  model: string;
  inputTokens: number;
  outputTokens: number;
  webSearches: number;
  error?: string;
  contenedor?: { id: string; expira: string | null } | null;
  archivos?: string[];
  computador?: boolean;
  bitacora?: EntradaBitacora[];
};

export async function runAgent(
  agent: AgentKey, context: unknown, instruction: string | null, signal: AbortSignal, correction?: string | null,
  // Fragmentos del buscador legal (0090) para esta consulta, ya con su cita (o el aviso de que no hay respaldo).
  fuentes?: string | null,
  // Computador del enjambre (0096): contenedor, habilidades y documentos del expediente ya subidos (file_id).
  pc?: OpcionesComputador | null,
): Promise<AgentResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  const model = MODEL();
  let conPc = !!pc && COMPUTADOR();
  let searchVersion = WEB_SEARCH(conPc);
  let contenedor: { id: string; expira: string | null } | null = pc?.contenedor ? { id: pc.contenedor, expira: null } : null;
  const creados: string[] = [];
  const bloques: unknown[] = [];
  const usage = { input: 0, output: 0, searches: 0 };
  const fail = (error: string): AgentResult => ({
    ok: false, summary: "", proposals: [], model, inputTokens: usage.input, outputTokens: usage.output, webSearches: usage.searches, error,
  });
  if (!key) return fail("Falta configurar ANTHROPIC_API_KEY");

  const herramientas = () => {
    const t: unknown[] = [RESULT_TOOL, ...CALCULATOR_TOOLS];
    if (searchVersion) t.push({ type: searchVersion, name: "web_search", max_uses: 4, allowed_domains: OFFICIAL_DOMAINS });
    if (conPc) t.push(CODE_EXECUTION, WEB_FETCH(OFFICIAL_DOMAINS));
    return t;
  };

  const userText = [
    `Fecha de hoy: ${new Date().toISOString().slice(0, 10)}.`,
    `Antecedentes del caso (JSON):\n${JSON.stringify(context)}`,
    instruction ? `Indicación del profesional a cargo: ${instruction}` : "Analiza el caso desde tu especialidad y propone lo que corresponda.",
    fuentes ?? "",
    correction ? `OBSERVACIONES DE LA AUDITORÍA A TU PROPUESTA ANTERIOR (corrígelas una por una):\n${correction}` : "",
  ].filter(Boolean).join("\n\n");
  const primerMensaje = () => (conPc && pc?.archivos.length
    ? [{ type: "text", text: userText }, ...pc.archivos.map((id) => ({ type: "container_upload", file_id: id }))]
    : userText);
  const messages: { role: "user" | "assistant"; content: unknown }[] = [{ role: "user", content: primerMensaje() }];

  const call = async (toolChoice: unknown): Promise<ApiResponse> => {
    const body: Record<string, unknown> = {
      model, max_tokens: 8000, tools: herramientas(), tool_choice: toolChoice, messages,
      system: systemPrompt(agent, !!searchVersion, conPc && pc ? { habilidades: pc.nombresHabilidades, archivos: pc.archivos.length } : undefined),
    };
    if (conPc && pc) body.container = { ...(contenedor ? { id: contenedor.id } : {}), skills: pc.habilidades };
    const res = await fetch(API_URL, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as ApiResponse;
    if (!res.ok) {
      // Antifrágil: si la API rechaza el computador (contenedor vencido, habilidad o herramienta no disponible),
      // se repite UNA vez la primera llamada sin computador, como funcionaban los agentes antes.
      if (conPc && res.status === 400 && messages.length === 1) {
        console.error("[ENQORA agentes] computador rechazado, se sigue sin él:", data.error?.message?.slice(0, 200));
        conPc = false;
        contenedor = null;
        searchVersion = WEB_SEARCH(false);
        messages[0] = { role: "user", content: userText };
        return call(toolChoice);
      }
      throw new Error(`API ${res.status}: ${data.error?.type ?? "error"}`);
    }
    usage.input += data.usage?.input_tokens ?? 0;
    usage.output += data.usage?.output_tokens ?? 0;
    usage.searches += data.usage?.server_tool_use?.web_search_requests ?? 0;
    if (data.container?.id) contenedor = { id: data.container.id, expira: data.container.expires_at ?? null };
    creados.push(...archivosCreados(data.content ?? []));
    bloques.push(...(data.content ?? []));
    return data;
  };
  const findResult = (d: ApiResponse) => d.content?.find((b) => b.type === "tool_use" && b.name === RESULT_TOOL.name);

  try {
    let data = await call({ type: "auto" });
    // Ciclo de trabajo: búsqueda web (pause_turn) y calculadoras deterministas (tool_use).
    for (let i = 0; i < (conPc ? 16 : 8) && !findResult(data); i++) {
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
      data = await call({ type: "auto" }); // el modelo no admite forzar la herramienta
      use = findResult(data);
    }
    if (!use) return fail("El agente no entregó un resultado");
    const { summary, proposals } = toProposals(use.input);
    return {
      ok: true, summary, proposals, model: data.model ?? model,
      inputTokens: usage.input, outputTokens: usage.output, webSearches: usage.searches,
      contenedor, archivos: [...new Set(creados)], computador: conPc, bitacora: bitacoraDeBloques(bloques),
    };
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    return fail(name === "TimeoutError" || name === "AbortError" ? "Tiempo de espera agotado" : e instanceof Error ? e.message.slice(0, 300) : "Error");
  }
}

export const agentName = (k: string) => (AGENTS as Record<string, { name: string }>)[k]?.name ?? k;
