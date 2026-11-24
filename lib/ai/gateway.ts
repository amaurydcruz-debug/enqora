import "server-only";
import { anonimizar, restaurar, resumenAnonimizado, type Mapa } from "@/lib/ai/anonimizar";
import { registrarUsoIA, type ModuloIA } from "@/lib/ai/uso";

// ENQORA AI Gateway: un solo punto para hablar con los modelos de IA, sin depender de un proveedor.
// Cada módulo pide «responde llamando a esta herramienta» y el gateway elige el proveedor, traduce el formato,
// valida la salida y, si un proveedor falla o responde algo inválido, prueba con el siguiente.
//
// Variables (solo en Vercel, nunca en el repositorio):
//   ANTHROPIC_API_KEY / ANTHROPIC_MODEL   Claude (proveedor actual)
//   HF_TOKEN / HF_MODEL                   Hugging Face Inference Providers (modelos abiertos, p. ej. Qwen/Qwen3-…)
//   HF_MODEL_2                            segundo cerebro abierto, de otra familia (p. ej. openai/gpt-oss-20b): proveedor «hf2»
//   HF_MODEL_VISION                       modelo abierto que lee imágenes (p. ej. Qwen/Qwen3-VL-…): fotos de boletas por «hf»
//   OPENAI_API_KEY / OPENAI_CHAT_MODEL    OpenAI (opcional)
//   ENQORA_IA_ORDEN                       orden de proveedores, p. ej. "anthropic,hf" (por defecto: "anthropic,hf,openai")
//   ENQORA_IA_PRIVADOS                    proveedores autorizados para datos privados de clientes (por defecto: "anthropic")
//   ENQORA_IA_ANONIMIZADOS                proveedores que pueden recibir datos privados SOLO anonimizados (por defecto: ninguno)
//   ENQORA_IA_PRECIOS                     precio USD por millón de tokens, p. ej. "anthropic:3:15" (opcional; sin él, el costo se ve en tokens)
//
// Regla de datos: lo que no es público (documentos, contabilidad de un cliente) solo va a los proveedores
// autorizados en ENQORA_IA_PRIVADOS. Los datos públicos o ficticios pueden ir a cualquiera. Si el módulo lo pide
// (anonimizar), los proveedores de ENQORA_IA_ANONIMIZADOS reciben el texto con los datos personales reemplazados
// por marcas, y la respuesta se restaura aquí (Ley 21.719). Las imágenes y PDF no se anonimizan: nunca van a ellos.

export type Proveedor = "anthropic" | "hf" | "hf2" | "openai";
export type Herramienta = { name: string; description: string; input_schema: unknown };
export type Datos = "publicos" | "privados";

export type Pedido = {
  system: string;
  prompt: string;
  tool: Herramienta;
  datos: Datos;
  maxTokens?: number;
  timeoutMs?: number;
  // Si devuelve false, la salida se descarta y se prueba con el siguiente proveedor.
  validar?: (input: unknown) => boolean;
  // Fuerza un proveedor (laboratorio de evaluación).
  solo?: Proveedor;
  // Módulo que llama: queda en el registro de uso de IA (0049). Sin él, la llamada no se registra.
  modulo?: ModuloIA;
  // Imágenes o PDF para leer (p. ej., la foto de una boleta). Solo los procesa Claude (proveedor de datos privados).
  // Claude los lee todos; un modelo abierto de visión (HF_MODEL_VISION) solo imágenes, y solo si «hf» está autorizado.
  adjuntos?: { media_type: "image/jpeg" | "image/png" | "image/webp" | "application/pdf"; base64: string }[];
  // Datos privados que pueden ir anonimizados a los proveedores de ENQORA_IA_ANONIMIZADOS. «nombres»: personas
  // que el módulo conoce (trabajador, representante) y que deben ocultarse además de RUT, correos, teléfonos, etc.
  anonimizar?: { nombres?: string[] };
};

// Uso: tokens consumidos (entrada y salida), sumando reintentos y proveedores probados. Campo adicional y opcional:
// los módulos existentes no lo necesitan; la Escuela lo usa para hacer visible el costo de cada misión.
export type Uso = { entrada: number; salida: number };
export type Intento = { proveedor: Proveedor; modelo: string; ms: number; motivo?: string; uso?: Uso; anonimizado?: string };
export type Respuesta = { input: unknown | null; proveedor?: Proveedor; modelo?: string; motivo?: string; intentos: Intento[]; uso?: Uso };

const sumarUso = (a: Uso, b?: Uso): Uso => ({ entrada: a.entrada + (b?.entrada ?? 0), salida: a.salida + (b?.salida ?? 0) });

// Precio por millón de tokens (USD), solo si se configura en Vercel: ENQORA_IA_PRECIOS="anthropic:3:15,openai:2.5:10".
// ENQORA no inventa precios: sin esta variable, el costo se muestra en tokens.
export function precioDe(p: Proveedor): { entrada: number; salida: number } | null {
  for (const parte of (process.env.ENQORA_IA_PRECIOS ?? "").split(",")) {
    const [prov, ent, sal] = parte.split(":").map((x) => x.trim());
    if (prov?.toLowerCase() === p && Number.isFinite(Number(ent)) && Number.isFinite(Number(sal)) && ent && sal) return { entrada: Number(ent), salida: Number(sal) };
  }
  return null;
}
export function costoUsd(p: Proveedor, uso: Uso): number | null {
  const pr = precioDe(p);
  return pr ? (uso.entrada * pr.entrada + uso.salida * pr.salida) / 1_000_000 : null;
}

export const PROVEEDORES: Proveedor[] = ["anthropic", "hf", "hf2", "openai"];
const TODOS = PROVEEDORES;
export const NOMBRE_PROVEEDOR: Record<Proveedor, string> = {
  anthropic: "Claude (Anthropic)", hf: "Hugging Face · modelo abierto principal", hf2: "Hugging Face · segundo cerebro abierto", openai: "OpenAI",
};
export const VARIABLES_PROVEEDOR: Record<Proveedor, string> = {
  anthropic: "ANTHROPIC_API_KEY y ANTHROPIC_MODEL",
  hf: "HF_TOKEN y HF_MODEL (p. ej., un modelo Qwen3 del catálogo de Inference Providers)",
  hf2: "HF_TOKEN y HF_MODEL_2 (un modelo de otra familia, p. ej. openai/gpt-oss-20b)",
  openai: "OPENAI_API_KEY y OPENAI_CHAT_MODEL",
};

export function modeloDe(p: Proveedor): string {
  if (p === "anthropic") return process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5-5";
  if (p === "hf") return process.env.HF_MODEL?.trim() || "";
  if (p === "hf2") return process.env.HF_MODEL_2?.trim() || "";
  return process.env.OPENAI_CHAT_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || "";
}

export const modeloVision = () => process.env.HF_MODEL_VISION?.trim() || "";
const soloImagenes = (p: Pedido) => !!p.adjuntos?.length && p.adjuntos.every((a) => a.media_type !== "application/pdf");
// Modelo que atiende ESTE pedido: con imágenes, «hf» usa su modelo de visión.
function modeloPara(prov: Proveedor, p: Pedido): string {
  return prov === "hf" && p.adjuntos?.length ? modeloVision() : modeloDe(prov);
}

export function configurado(p: Proveedor): boolean {
  if (p === "anthropic") return !!process.env.ANTHROPIC_API_KEY;
  if (p === "hf" || p === "hf2") return !!process.env.HF_TOKEN && !!modeloDe(p);
  return !!process.env.OPENAI_API_KEY && !!modeloDe("openai");
}

const lista = (v: string | undefined, def: string) =>
  (v?.trim() || def).split(",").map((x) => x.trim().toLowerCase()).filter((x): x is Proveedor => (TODOS as string[]).includes(x));

export function orden(datos: Datos): Proveedor[] {
  const privados = lista(process.env.ENQORA_IA_PRIVADOS, "anthropic");
  return [...new Set(lista(process.env.ENQORA_IA_ORDEN, "anthropic,hf,openai"))]
    .filter((p) => configurado(p) && (datos === "publicos" || privados.includes(p)));
}

const anonimizados = () => lista(process.env.ENQORA_IA_ANONIMIZADOS, "").filter((p) => configurado(p));

// ¿Puede Hugging Face recibir texto privado? Tal cual (ENQORA_IA_PRIVADOS) o solo anonimizado (ENQORA_IA_ANONIMIZADOS).
// Lo usa el buscador legal para decidir si la pregunta de un caso puede vectorizarse.
export function hfRecibePrivados(): "tal_cual" | "anonimizado" | "no" {
  const privados = lista(process.env.ENQORA_IA_PRIVADOS, "anthropic");
  if (privados.includes("hf") || privados.includes("hf2")) return "tal_cual";
  const anon = lista(process.env.ENQORA_IA_ANONIMIZADOS, "");
  return anon.includes("hf") || anon.includes("hf2") ? "anonimizado" : "no";
}

export function proveedoresDisponibles(): { proveedor: Proveedor; modelo: string; configurado: boolean; privados: boolean; anonimizados: boolean; vision: string }[] {
  const privados = lista(process.env.ENQORA_IA_PRIVADOS, "anthropic");
  const anon = lista(process.env.ENQORA_IA_ANONIMIZADOS, "");
  return TODOS.map((p) => ({
    proveedor: p, modelo: modeloDe(p), configurado: configurado(p), privados: privados.includes(p),
    anonimizados: !privados.includes(p) && anon.includes(p), vision: p === "hf" ? modeloVision() : p === "anthropic" ? modeloDe(p) : "",
  }));
}

// Proveedores que pueden atender un pedido, en orden, y si cada uno debe recibir el texto anonimizado.
export function candidatosPara(pedido: Pedido): { proveedor: Proveedor; anonimizar: boolean }[] {
  if (pedido.solo) return configurado(pedido.solo) ? [{ proveedor: pedido.solo, anonimizar: false }] : [];
  const base = orden(pedido.datos).map((p) => ({ proveedor: p, anonimizar: false }));
  const extra = pedido.datos === "privados" && pedido.anonimizar && !pedido.adjuntos?.length
    ? anonimizados().filter((p) => !base.some((b) => b.proveedor === p)).map((p) => ({ proveedor: p, anonimizar: true }))
    : [];
  const todos = [...base, ...extra];
  if (!pedido.adjuntos?.length) return todos;
  // Adjuntos: Claude siempre; «hf» solo con modelo de visión configurado y si todo son imágenes (los PDF solo Claude).
  return todos.filter((c) => c.proveedor === "anthropic" || (c.proveedor === "hf" && !!modeloVision() && soloImagenes(pedido)));
}

export async function llamarHerramienta(pedido: Pedido): Promise<Respuesta> {
  const t0 = Date.now();
  const r = await llamar(pedido);
  if (pedido.modulo) {
    await registrarUsoIA({
      modulo: pedido.modulo, proveedor: r.proveedor ?? r.intentos.at(-1)?.proveedor, modelo: r.modelo ?? r.intentos.at(-1)?.modelo,
      entrada: r.uso?.entrada, salida: r.uso?.salida, ms: Date.now() - t0, ok: !!r.input, motivo: r.input ? undefined : r.motivo,
    });
  }
  return r;
}

async function llamar(pedido: Pedido, excluir: Proveedor[] = []): Promise<Respuesta> {
  const candidatos = candidatosPara(pedido).filter((c) => !excluir.includes(c.proveedor));
  const intentos: Intento[] = [];
  if (!candidatos.length) return { input: null, motivo: "sin_proveedor", intentos };
  let uso: Uso = { entrada: 0, salida: 0 };
  for (const { proveedor: p, anonimizar: anon } of candidatos) {
    const t0 = Date.now();
    let mapa: Mapa = [];
    let enviado = pedido;
    if (anon) {
      // El system es texto fijo del módulo; los datos del cliente vienen en el prompt.
      const a = anonimizar(pedido.prompt, { nombres: pedido.anonimizar?.nombres });
      mapa = a.mapa;
      enviado = { ...pedido, prompt: a.texto };
    }
    const r = p === "anthropic" ? await anthropic(enviado) : await compatibleOpenAI(p, enviado);
    const input = r.input && mapa.length ? restaurar(r.input, mapa) : r.input;
    uso = sumarUso(uso, r.uso);
    let motivo = r.motivo;
    if (input && pedido.validar && !pedido.validar(input)) motivo = "validador";
    const modelo = modeloPara(p, pedido);
    intentos.push({ proveedor: p, modelo, ms: Date.now() - t0, motivo: input && !motivo ? undefined : motivo, uso: r.uso, anonimizado: anon ? resumenAnonimizado(mapa) : undefined });
    if (input && !motivo) return { input, proveedor: p, modelo, intentos, uso };
    console.error(`[ENQORA AI] ${p} sin respuesta válida:`, motivo);
  }
  return { input: null, motivo: intentos.map((i) => `${i.proveedor}:${i.motivo}`).join(" · "), intentos, uso };
}

// Segunda opinión (antifragilidad): el mismo pedido a un proveedor DISTINTO del que respondió, para cruzar
// resultados. Prefiere el segundo cerebro abierto («hf2»). Respeta las mismas reglas de datos: si ningún otro
// proveedor puede recibir esos datos, devuelve null y el módulo sigue con una sola lectura.
export async function segundaOpinion(pedido: Pedido, primera: Respuesta): Promise<Respuesta | null> {
  if (!primera.proveedor || pedido.solo) return null;
  const otros = candidatosPara(pedido).filter((c) => c.proveedor !== primera.proveedor);
  if (!otros.length) return null;
  const preferido = otros.find((c) => c.proveedor === "hf2") ?? otros[0];
  const t0 = Date.now();
  const r = await llamar(pedido, PROVEEDORES.filter((p) => p !== preferido.proveedor));
  if (pedido.modulo) {
    await registrarUsoIA({
      modulo: pedido.modulo, proveedor: r.proveedor ?? preferido.proveedor, modelo: r.modelo ?? modeloPara(preferido.proveedor, pedido),
      entrada: r.uso?.entrada, salida: r.uso?.salida, ms: Date.now() - t0, ok: !!r.input, motivo: r.input ? "segunda_opinion" : `segunda_opinion: ${r.motivo ?? ""}`,
    });
  }
  return r;
}

type Salida = { input: unknown | null; motivo?: string; uso?: Uso };
const recordatorio = (name: string) => `Entrega ahora tu respuesta llamando a la herramienta ${name}.`;
const sistema = (p: Pedido) => `${p.system}\n\nResponde ÚNICAMENTE llamando a la herramienta ${p.tool.name}, sin texto adicional.`;
const fallo = (e: unknown): Salida => ({ input: null, motivo: e instanceof Error && e.name === "TimeoutError" ? "tiempo" : "red" });
const httpMotivo = (status: number, err?: { type?: string; message?: string; code?: string }) =>
  `http_${status}${err?.type ?? err?.code ? `_${err?.type ?? err?.code}` : ""}${err?.message ? `: ${String(err.message).slice(0, 160)}` : ""}`;

// Claude: el modelo no admite forzar la herramienta (tool_choice «tool»/«any»): «auto» y un recordatorio.
async function anthropic(p: Pedido): Promise<Salida> {
  const adjuntos = (p.adjuntos ?? []).map((a) => a.media_type === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: a.media_type, data: a.base64 } }
    : { type: "image", source: { type: "base64", media_type: a.media_type, data: a.base64 } });
  const messages: { role: "user" | "assistant"; content: unknown }[] = [
    { role: "user", content: adjuntos.length ? [...adjuntos, { type: "text", text: p.prompt }] : p.prompt },
  ];
  let uso: Uso = { entrada: 0, salida: 0 };
  try {
    for (let intento = 0; intento < 2; intento++) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", signal: AbortSignal.timeout(p.timeoutMs ?? 45_000),
        headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: modeloDe("anthropic"), max_tokens: p.maxTokens ?? 3000, system: sistema(p), tools: [p.tool], tool_choice: { type: "auto" }, messages }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        content?: { type: string; name?: string; input?: unknown }[]; error?: { type?: string; message?: string };
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      uso = sumarUso(uso, { entrada: data.usage?.input_tokens ?? 0, salida: data.usage?.output_tokens ?? 0 });
      if (!res.ok) return { input: null, motivo: httpMotivo(res.status, data.error), uso };
      const input = data.content?.find((b) => b.type === "tool_use" && b.name === p.tool.name)?.input ?? null;
      if (input) return { input, uso };
      messages.push({ role: "assistant", content: data.content?.length ? data.content : [{ type: "text", text: "(sin respuesta)" }] });
      messages.push({ role: "user", content: recordatorio(p.tool.name) });
    }
    return { input: null, motivo: "sin_herramienta", uso };
  } catch (e) {
    return { ...fallo(e), uso };
  }
}

// Hugging Face (router de Inference Providers) y OpenAI hablan el formato «chat completions».
async function compatibleOpenAI(prov: Proveedor, p: Pedido): Promise<Salida> {
  const hf = prov === "hf" || prov === "hf2";
  const url = hf ? "https://router.huggingface.co/v1/chat/completions" : "https://api.openai.com/v1/chat/completions";
  const key = hf ? process.env.HF_TOKEN : process.env.OPENAI_API_KEY;
  const tools = [{ type: "function", function: { name: p.tool.name, description: p.tool.description, parameters: p.tool.input_schema } }];
  const imagenes = (p.adjuntos ?? []).filter((a) => a.media_type !== "application/pdf")
    .map((a) => ({ type: "image_url", image_url: { url: `data:${a.media_type};base64,${a.base64}` } }));
  const messages: { role: string; content: unknown }[] = [
    { role: "system", content: sistema(p) },
    { role: "user", content: imagenes.length ? [...imagenes, { type: "text", text: p.prompt }] : p.prompt },
  ];
  let uso: Uso = { entrada: 0, salida: 0 };
  try {
    for (let intento = 0; intento < 2; intento++) {
      const res = await fetch(url, {
        method: "POST", signal: AbortSignal.timeout(p.timeoutMs ?? 45_000),
        headers: { "content-type": "application/json", authorization: `Bearer ${key ?? ""}` },
        body: JSON.stringify({ model: modeloPara(prov, p), max_tokens: p.maxTokens ?? 3000, tools, tool_choice: "auto", messages }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        choices?: { message?: { content?: string | null; tool_calls?: { function?: { name?: string; arguments?: string } }[] } }[];
        error?: { type?: string; message?: string; code?: string } | string;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      uso = sumarUso(uso, { entrada: data.usage?.prompt_tokens ?? 0, salida: data.usage?.completion_tokens ?? 0 });
      if (!res.ok) return { input: null, motivo: httpMotivo(res.status, typeof data.error === "string" ? { message: data.error } : data.error), uso };
      const msg = data.choices?.[0]?.message;
      const call = msg?.tool_calls?.find((c) => c.function?.name === p.tool.name);
      const input = call?.function?.arguments ? parseJson(call.function.arguments) : extraerJson(msg?.content ?? "");
      if (input) return { input, uso };
      messages.push({ role: "assistant", content: msg?.content || "(sin respuesta)" });
      messages.push({ role: "user", content: recordatorio(p.tool.name) });
    }
    return { input: null, motivo: "sin_herramienta", uso };
  } catch (e) {
    return { ...fallo(e), uso };
  }
}

function parseJson(s: string): unknown | null {
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

// Algunos modelos abiertos responden el JSON como texto (a veces dentro de ```json … ```).
function extraerJson(texto: string): unknown | null {
  const m = texto.match(/```(?:json)?\s*([\s\S]*?)```/);
  const cuerpo = (m ? m[1] : texto).trim();
  const i = cuerpo.indexOf("{"), j = cuerpo.lastIndexOf("}");
  return i >= 0 && j > i ? parseJson(cuerpo.slice(i, j + 1)) : null;
}
