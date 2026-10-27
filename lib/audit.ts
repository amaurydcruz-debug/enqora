import "server-only";
import { OFFICIAL_DOMAINS } from "@/lib/agents";
import { KNOWLEDGE_VERSION, RULES } from "@/lib/knowledge";
import { verifyCalcs, type DeclaredCalc } from "@/lib/tax-calc";

// Auditoría independiente de las propuestas de los agentes (M15).
// 1) Verificaciones deterministas en código: cálculos, dominios de las fuentes, reglas de ENQORA.
// 2) Auditor independiente (OpenAI, Responses API con salida estructurada estricta).
// 3) Reglas de aprobación de ENQORA combinan ambos: el veredicto final nunca es más benévolo que
//    las verificaciones deterministas, y dos modelos de acuerdo no bastan para aprobar un error.
//
// Variables en Vercel (nunca en el repositorio ni en el chat):
//   OPENAI_API_KEY      clave de la API de OpenAI (sin ella no hay auditoría automática)
//   OPENAI_MODEL        modelo auditor (por defecto gpt-6-astra)
//   OPENAI_WEB_SEARCH   "off" desactiva la verificación web en fuentes oficiales

export const auditEnabled = () => !!process.env.OPENAI_API_KEY;
const MODEL = () => process.env.OPENAI_MODEL?.trim() || "gpt-6-astra";
const WEB = () => process.env.OPENAI_WEB_SEARCH?.trim() !== "off";

export type Verdict = "aprobada" | "corregir" | "investigar" | "falta_dato" | "escalar";
export type Decision = "aprobar" | "corregir" | "investigar" | "falta_dato" | "escalar";
export type Severity = "ninguna" | "baja" | "media" | "alta" | "critica";
export type Observation = { tipo: string; detalle: string; correccion_sugerida: string };
export type ProposalVerdict = { id: string; veredicto: Verdict; gravedad: Severity; observaciones: Observation[] };
export type Check = { propuesta: string; tipo: string; ok: boolean; detalle: string };

type AuditProposal = { id: string; tipo: string; contenido: Record<string, unknown> };
export type AuditInput = { agente: string; indicacion: string | null; resumen: string | null; ronda_correccion: number; propuestas: AuditProposal[]; contexto: unknown };

const RANK: Record<Verdict, number> = { aprobada: 0, falta_dato: 1, investigar: 2, corregir: 3, escalar: 4 };
const SEV: Severity[] = ["ninguna", "baja", "media", "alta", "critica"];
const worst = (a: Verdict, b: Verdict) => (RANK[a] >= RANK[b] ? a : b);
const maxSev = (a: Severity, b: Severity) => (SEV.indexOf(a) >= SEV.indexOf(b) ? a : b);

// ---------------------------------------------------------------------
// 1. Verificaciones deterministas
// ---------------------------------------------------------------------

const FORBIDDEN = /(clave\s*[úu]nica|clave\s*(tributaria|del\s*sii|sii)|contrase[ñn]a|clave\s*(bancaria|del\s*banco)|coordenadas\s*bancarias)/i;
const ASKS = /(env[íi]a|comparte|ind[íi]ca|entrega|necesitamos|facilita|dame|danos)/i;
const PRICE = /\$\s?\d|honorarios?\s+de\s+\$|cuesta\s+\$|precio\s+de\s+\$/i;
const OUTDATED_INTEREST = /1[,.]5\s?%\s*(mensual|por\s+(cada\s+)?mes)/i;

const isOfficial = (url: string) => {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return OFFICIAL_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
};

export function deterministicChecks(p: AuditProposal): { checks: Check[]; floor: Verdict; severity: Severity; notes: Observation[] } {
  const checks: Check[] = [];
  const notes: Observation[] = [];
  let floor: Verdict = "aprobada";
  let severity: Severity = "ninguna";
  const add = (tipo: string, ok: boolean, detalle: string, verdict: Verdict = "corregir", sev: Severity = "media", fix = "") => {
    checks.push({ propuesta: p.id, tipo, ok, detalle });
    if (!ok) {
      floor = worst(floor, verdict);
      severity = maxSev(severity, sev);
      notes.push({ tipo, detalle, correccion_sugerida: fix });
    }
  };
  const text = JSON.stringify(p.contenido);

  // Reglas de ENQORA: nunca pedir claves; nunca fijar precios.
  if (FORBIDDEN.test(text) && ASKS.test(text)) {
    add("reglas", false, "La propuesta podría pedir claves o credenciales del cliente.", "escalar", "critica", "Eliminar toda solicitud de claves; ENQORA actúa solo con mandato verificado.");
  }
  if (PRICE.test(text)) add("reglas", false, "La propuesta menciona montos que parecen precios u honorarios.", "corregir", "media", "Los precios salen solo de cotizaciones aprobadas.");
  if (OUTDATED_INTEREST.test(text)) {
    add("norma", false, "Usa interés de 1,5% mensual: desde el 1-1-2025 el art. 53 CT aplica un interés diario variable.", "corregir", "alta", `Aplicar ${RULES.interes_53.fuente.titulo}.`);
  }

  if (p.tipo === "hallazgo") {
    const c = p.contenido;
    const fuentes = Array.isArray(c.fuentes) ? (c.fuentes as Record<string, unknown>[]) : [];
    const urls = fuentes.map((f) => (typeof f.url === "string" ? f.url : "")).filter(Boolean);
    const bad = urls.filter((u) => !isOfficial(u));
    add("fuente", bad.length === 0, bad.length ? `Enlaces no oficiales: ${bad.join(", ")}` : "Enlaces en dominios oficiales.", "corregir", "media", "Citar solo fuentes oficiales (BCN, SII, DT, INAPI, ChileAtiende…).");
    if (!fuentes.length && c.certeza !== "baja") {
      add("fuente", false, "Situación sin fuente con certeza media o alta.", "investigar", "media", "Agregar norma y artículo, o bajar la certeza.");
    }
    if (c.nivel_riesgo === "alto" && !String(c.falta ?? "").trim() && c.certeza !== "alta") {
      add("riesgo", false, "Riesgo alto sin indicar qué falta para confirmarlo.", "falta_dato", "baja", "Indicar los antecedentes que faltan.");
    }
    const calcs = Array.isArray(c.calculos) ? (c.calculos as DeclaredCalc[]) : [];
    for (const r of verifyCalcs(calcs)) add("calculo", r.ok, r.detalle, "corregir", "alta", "Recalcular con la herramienta y corregir la cifra.");
    if (!calcs.length && /\d{1,3}(\.\d{3})+|\d+\s?%/.test(String(c.situacion ?? "") + String(c.riesgo ?? ""))) {
      checks.push({ propuesta: p.id, tipo: "calculo", ok: true, detalle: "Menciona cifras sin cálculo declarado: el auditor debe revisarlas." });
    }
  }
  if (!checks.length) checks.push({ propuesta: p.id, tipo: "reglas", ok: true, detalle: "Sin hallazgos en las verificaciones automáticas." });
  return { checks, floor, severity, notes };
}

// ---------------------------------------------------------------------
// 2. Auditor independiente (OpenAI)
// ---------------------------------------------------------------------

const obs = {
  type: "object",
  additionalProperties: false,
  properties: {
    tipo: { type: "string", enum: ["norma", "fuente", "calculo", "hechos", "riesgo", "reglas", "redaccion"] },
    detalle: { type: "string" },
    correccion_sugerida: { type: "string" },
  },
  required: ["tipo", "detalle", "correccion_sugerida"],
};
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    decision: { type: "string", enum: ["aprobar", "corregir", "investigar", "falta_dato", "escalar"] },
    resumen: { type: "string" },
    discrepancia_importante: { type: "boolean" },
    propuestas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          veredicto: { type: "string", enum: ["aprobada", "corregir", "investigar", "falta_dato", "escalar"] },
          gravedad: { type: "string", enum: SEV },
          observaciones: { type: "array", items: obs },
        },
        required: ["id", "veredicto", "gravedad", "observaciones"],
      },
    },
  },
  required: ["decision", "resumen", "discrepancia_importante", "propuestas"],
};

const SYSTEM = [
  "Eres el auditor independiente de ENQORA, plataforma chilena de contabilidad, impuestos y servicios legales para empresas.",
  "Revisas propuestas hechas por otro sistema de IA antes de que lleguen a un cliente. Tu trabajo es encontrar errores, no aprobar por buena redacción.",
  "Para cada propuesta revisa: (1) norma chilena correcta y vigente a la fecha de los hechos; (2) fuentes oficiales que respalden la conclusión;",
  "(3) cálculos (te entregamos las verificaciones deterministas: no las contradigas); (4) coherencia con los hechos del caso, sin hechos inventados;",
  "(5) riesgo y certeza calibrados, sin exagerar ni minimizar; (6) reglas ENQORA: nunca pedir ClaveÚnica, clave del SII ni contraseñas, nunca fijar precios,",
  "nunca prometer resultados; (7) claridad para un cliente no experto.",
  "Veredictos: aprobada (sin observaciones importantes y con respaldo), corregir (error corregible), investigar (falta verificar norma o fuente),",
  "falta_dato (se necesita información del cliente), escalar (riesgo legal, tributario o financiero alto, o desacuerdo importante que no se resuelve corrigiendo).",
  "No inventes fuentes. Si no puedes verificar algo, usa 'investigar' y dilo. Si verificas en la web, usa solo sitios oficiales chilenos.",
  `Base normativa de referencia de ENQORA (verificada al ${KNOWLEDGE_VERSION}): ` +
    Object.values(RULES).map((r) => `${r.tema}: ${r.regla}`).join(" | "),
  "Responde solo con el JSON pedido. 'id' debe ser exactamente el id de cada propuesta.",
].join("\n");

type OpenAIResponse = {
  output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string; type?: string };
};

export type AuditResult = {
  ok: boolean;
  decision: Decision | null;
  summary: string;
  verdicts: ProposalVerdict[];
  checks: Check[];
  auditor: string;
  inputTokens: number;
  outputTokens: number;
  webSearches: number;
  error?: string;
};

async function callAuditor(input: AuditInput, checks: Check[], signal: AbortSignal, web: boolean) {
  const body = {
    model: MODEL(),
    input: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: [
          `Fecha de hoy: ${new Date().toISOString().slice(0, 10)}. Agente auditado: ${input.agente}. Ronda de corrección: ${input.ronda_correccion}.`,
          input.indicacion ? `Indicación del profesional: ${input.indicacion}` : "",
          `Resumen del agente: ${input.resumen ?? "(sin resumen)"}`,
          `Propuestas (JSON): ${JSON.stringify(input.propuestas)}`,
          `Verificaciones deterministas (JSON): ${JSON.stringify(checks)}`,
          `Antecedentes del caso (JSON): ${JSON.stringify(input.contexto)}`,
        ].filter(Boolean).join("\n\n"),
      },
    ],
    text: { format: { type: "json_schema", name: "auditoria_enqora", schema: SCHEMA, strict: true } },
    ...(web ? { tools: [{ type: "web_search", filters: { allowed_domains: OFFICIAL_DOMAINS } }] } : {}),
  };
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as OpenAIResponse;
  return { res, data };
}

export async function runAudit(input: AuditInput, signal: AbortSignal): Promise<AuditResult> {
  const det = new Map(input.propuestas.map((p) => [p.id, deterministicChecks(p)]));
  const checks = [...det.values()].flatMap((d) => d.checks);
  const base = { checks, auditor: MODEL(), inputTokens: 0, outputTokens: 0, webSearches: 0 };
  const fail = (error: string): AuditResult => ({ ...base, ok: false, decision: null, summary: "", verdicts: [], error });
  if (!auditEnabled()) return fail("Falta configurar OPENAI_API_KEY");

  try {
    let web = WEB();
    let { res, data } = await callAuditor(input, checks, signal, web);
    // Si la búsqueda web no está disponible para el modelo o la cuenta, se audita sin ella.
    if (!res.ok && web && res.status === 400) {
      web = false;
      ({ res, data } = await callAuditor(input, checks, signal, false));
    }
    if (!res.ok) return fail(`OpenAI ${res.status}: ${data.error?.type ?? "error"}`);
    base.inputTokens = data.usage?.input_tokens ?? 0;
    base.outputTokens = data.usage?.output_tokens ?? 0;
    base.webSearches = (data.output ?? []).filter((o) => o.type === "web_search_call").length;

    const message = (data.output ?? []).find((o) => o.type === "message");
    const part = message?.content?.find((c) => c.type === "output_text" || c.type === "refusal");
    if (!part || part.type === "refusal" || !part.text) return fail("El auditor no entregó un resultado");
    const parsed = JSON.parse(part.text) as { decision: Decision; resumen: string; discrepancia_importante: boolean; propuestas: ProposalVerdict[] };

    // 3) Reglas de aprobación de ENQORA
    const byId = new Map(parsed.propuestas.map((v) => [v.id, v]));
    const verdicts: ProposalVerdict[] = input.propuestas.map((p) => {
      const ai = byId.get(p.id);
      const d = det.get(p.id)!;
      let veredicto: Verdict = ai ? worst(ai.veredicto, d.floor) : worst("investigar", d.floor);
      let gravedad: Severity = maxSev(ai?.gravedad ?? "media", d.severity);
      // Desacuerdo que persiste después de corregir, o gravedad crítica: escala a la supervisión.
      if ((input.ronda_correccion >= 1 && veredicto === "corregir" && SEV.indexOf(gravedad) >= 3) || gravedad === "critica") veredicto = "escalar";
      if (input.ronda_correccion >= 2 && veredicto !== "aprobada") veredicto = "escalar";
      if (veredicto === "aprobada" && SEV.indexOf(gravedad) >= 3) veredicto = "corregir";
      if (veredicto === "aprobada") gravedad = gravedad === "media" ? "baja" : gravedad;
      return { id: p.id, veredicto, gravedad, observaciones: [...d.notes, ...(ai?.observaciones ?? [])].slice(0, 12) };
    });
    let decision: Decision = "aprobar";
    for (const v of verdicts) {
      const map: Record<Verdict, Decision> = { aprobada: "aprobar", falta_dato: "falta_dato", investigar: "investigar", corregir: "corregir", escalar: "escalar" };
      const order: Decision[] = ["aprobar", "falta_dato", "investigar", "corregir", "escalar"];
      if (order.indexOf(map[v.veredicto]) > order.indexOf(decision)) decision = map[v.veredicto];
    }
    if (parsed.discrepancia_importante && decision !== "aprobar") decision = "escalar";
    return { ...base, ok: true, decision, summary: String(parsed.resumen ?? "").slice(0, 4000), verdicts };
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    return fail(name === "TimeoutError" || name === "AbortError" ? "Tiempo de espera agotado" : e instanceof Error ? e.message.slice(0, 300) : "Error");
  }
}
