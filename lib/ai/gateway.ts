import "server-only";
import { registrarUsoIA, type ModuloIA } from "@/lib/ai/uso";

// ENQORA AI Gateway: un solo punto para hablar con los modelos de IA, sin depender de un proveedor.
// Cada módulo pide «responde llamando a esta herramienta» y el gateway elige el proveedor, traduce el formato,
// valida la salida y, si un proveedor falla o responde algo inválido, prueba con el siguiente.
//
// Variables (solo en Vercel, nunca en el repositorio):
//   ANTHROPIC_API_KEY / ANTHROPIC_MODEL   Claude (proveedor actual)
//   HF_TOKEN / HF_MODEL                   Hugging Face Inference Providers (modelos abiertos, p. ej. Qwen)
//   OPENAI_API_KEY / OPENAI_CHAT_MODEL    OpenAI (opcional)
//   ENQORA_IA_ORDEN                       orden de proveedores, p. ej. "anthropic,hf" (por defecto: "anthropic,hf,openai")
//   ENQORA_IA_PRIVADOS                    proveedores autorizados para datos privados de clientes (por defecto: "anthropic")
//   ENQORA_IA_PRECIOS                     precio USD por millón de tokens, p. ej. "anthropic:3:15" (opcional; sin él, el costo se ve en tokens)
//
// Regla de datos: lo que no es público (documentos, contabilidad de un cliente) solo va a los proveedores
// autorizados en ENQORA_IA_PRIVADOS. Los datos públicos o ficticios pueden ir a cualquiera.

export type Proveedor = "anthropic" | "hf" | "openai";
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
};

// Uso: tokens consumidos (entrada y salida), sumando reintentos y proveedores probados. Campo adicional y opcional:
// los módulos existentes no lo necesitan; la Escuela lo usa para hacer visible el costo de cada misión.
export type Uso = { entrada: number; salida: number };
export type Intento = { proveedor: Proveedor; modelo: string; ms: number; motivo?: string; uso?: Uso };
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

const TODOS: Proveedor[] = ["anthropic", "hf", "openai"];

export function modeloDe(p: Proveedor): string {
  if (p === "anthropic") return process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5-5";
  if (p === "hf") return process.env.HF_MODEL?.trim() || "";
  return process.env.OPENAI_CHAT_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || "";
}

export function configurado(p: Proveedor): boolean {
  if (p === "anthropic") return !!process.env.ANTHROPIC_API_KEY;
  if (p === "hf") return !!process.env.HF_TOKEN && !!modeloDe("hf");
  return !!process.env.OPENAI_API_KEY && !!modeloDe("openai");
}

const lista = (v: string | undefined, def: string) =>
  (v?.trim() || def).split(",").map((x) => x.trim().toLowerCase()).filter((x): x is Proveedor => (TODOS as string[]).includes(x));

export function orden(datos: Datos): Proveedor[] {
  const privados = lista(process.env.ENQORA_IA_PRIVADOS, "anthropic");
  return [...new Set(lista(process.env.ENQORA_IA_ORDEN, "anthropic,hf,openai"))]
    .filter((p) => configurado(p) && (datos === "publicos" || privados.includes(p)));
}

export function proveedoresDisponibles(): { proveedor: Proveedor; modelo: string; configurado: boolean; privados: boolean }[] {
  const privados = lista(process.env.ENQORA_IA_PRIVADOS, "anthropic");
  return TODOS.map((p) => ({ proveedor: p, modelo: modeloDe(p), configurado: configurado(p), privados: privados.includes(p) }));
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

async function llamar(pedido: Pedido): Promise<Respuesta> {
  const candidatos = pedido.solo ? (configurado(pedido.solo) ? [pedido.solo] : []) : orden(pedido.datos);
  const intentos: Intento[] = [];
  if (!candidatos.length) return { input: null, motivo: "sin_proveedor", intentos };
  let uso: Uso = { entrada: 0, salida: 0 };
  for (const p of candidatos) {
    const t0 = Date.now();
    const r = p === "anthropic" ? await anthropic(pedido) : await compatibleOpenAI(p, pedido);
    uso = sumarUso(uso, r.uso);
    let motivo = r.motivo;
    if (r.input && pedido.validar && !pedido.validar(r.input)) motivo = "validador";
    intentos.push({ proveedor: p, modelo: modeloDe(p), ms: Date.now() - t0, motivo: r.input && !motivo ? undefined : motivo, uso: r.uso });
    if (r.input && !motivo) return { input: r.input, proveedor: p, modelo: modeloDe(p), intentos, uso };
    console.error(`[ENQORA AI] ${p} sin respuesta válida:`, motivo);
  }
  return { input: null, motivo: intentos.map((i) => `${i.proveedor}:${i.motivo}`).join(" · "), intentos, uso };
}

type Salida = { input: unknown | null; motivo?: string; uso?: Uso };
const recordatorio = (name: string) => `Entrega ahora tu respuesta llamando a la herramienta ${name}.`;
const sistema = (p: Pedido) => `${p.system}\n\nResponde ÚNICAMENTE llamando a la herramienta ${p.tool.name}, sin texto adicional.`;
const fallo = (e: unknown): Salida => ({ input: null, motivo: e instanceof Error && e.name === "TimeoutError" ? "tiempo" : "red" });
const httpMotivo = (status: number, err?: { type?: string; message?: string; code?: string }) =>
  `http_${status}${err?.type ?? err?.code ? `_${err?.type ?? err?.code}` : ""}${err?.message ? `: ${String(err.message).slice(0, 160)}` : ""}`;

// Claude: el modelo no admite forzar la herramienta (tool_choice «tool»/«any»): «auto» y un recordatorio.
async function anthropic(p: Pedido): Promise<Salida> {
  const messages: { role: "user" | "assistant"; content: unknown }[] = [{ role: "user", content: p.prompt }];
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
  const url = prov === "hf" ? "https://router.huggingface.co/v1/chat/completions" : "https://api.openai.com/v1/chat/completions";
  const key = prov === "hf" ? process.env.HF_TOKEN : process.env.OPENAI_API_KEY;
  const tools = [{ type: "function", function: { name: p.tool.name, description: p.tool.description, parameters: p.tool.input_schema } }];
  const messages: { role: string; content: string }[] = [{ role: "system", content: sistema(p) }, { role: "user", content: p.prompt }];
  let uso: Uso = { entrada: 0, salida: 0 };
  try {
    for (let intento = 0; intento < 2; intento++) {
      const res = await fetch(url, {
        method: "POST", signal: AbortSignal.timeout(p.timeoutMs ?? 45_000),
        headers: { "content-type": "application/json", authorization: `Bearer ${key ?? ""}` },
        body: JSON.stringify({ model: modeloDe(prov), max_tokens: p.maxTokens ?? 3000, tools, tool_choice: "auto", messages }),
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
