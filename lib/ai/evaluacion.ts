import "server-only";
import { llamarHerramienta, modeloDe, type Proveedor } from "@/lib/ai/gateway";
import { RULES } from "@/lib/knowledge";
import { runCalculator } from "@/lib/tax-calc";

// Laboratorio ENQORA BRAIN: mide si un modelo responde bien preguntas contables y tributarias chilenas.
// Las preguntas son ficticias y la respuesta correcta NO la escribe nadie a mano: la calcula el motor contable
// determinista de ENQORA (lib/tax-calc.ts), con sus fuentes verificadas. Así la prueba no puede «inventar» la verdad.
// Dos modos: «solo modelo» (lo que el modelo sabe por sí mismo) y «con conocimiento ENQORA» (le entregamos las
// reglas verificadas de lib/knowledge.ts, como haría la búsqueda documental). La diferencia muestra el valor de
// nuestra capa de conocimiento.

type Caso = {
  id: string;
  pregunta: string;
  reglas: (keyof typeof RULES)[];
  // Respuesta esperada: un número calculado por el motor, o «abstenerse» si falta un dato indispensable.
  esperado: { tipo: "numero"; herramienta: string; entradas: Record<string, number>; campo: string } | { tipo: "abstenerse" };
};

const CASOS: Caso[] = [
  { id: "iva-1", pregunta: "Una compra afecta a IVA tiene un valor neto de $100.000. ¿Cuánto es el IVA en pesos?", reglas: ["iva_tasa"],
    esperado: { tipo: "numero", herramienta: "calcular_iva", entradas: { neto: 100000 }, campo: "iva" } },
  { id: "iva-2", pregunta: "Una venta afecta a IVA tiene un neto de $1.234.567. ¿Cuánto es el IVA, redondeado al peso?", reglas: ["iva_tasa"],
    esperado: { tipo: "numero", herramienta: "calcular_iva", entradas: { neto: 1234567 }, campo: "iva" } },
  { id: "iva-3", pregunta: "Una factura afecta a IVA tiene un total de $595.000 (IVA incluido). ¿Cuál es el monto neto?", reglas: ["iva_tasa"],
    esperado: { tipo: "numero", herramienta: "calcular_iva", entradas: { total: 595000 }, campo: "neto" } },
  { id: "iva-4", pregunta: "Un producto afecto a IVA cuesta $119.990 con IVA incluido. ¿Cuál es su valor neto, redondeado al peso?", reglas: ["iva_tasa"],
    esperado: { tipo: "numero", herramienta: "calcular_iva", entradas: { total: 119990 }, campo: "neto" } },
  { id: "hon-1", pregunta: "Una boleta de honorarios emitida en 2026 tiene un monto bruto de $500.000. ¿Cuánto es la retención?", reglas: ["retencion_honorarios"],
    esperado: { tipo: "numero", herramienta: "calcular_retencion_honorarios", entradas: { bruto: 500000, anio: 2026 }, campo: "retencion" } },
  { id: "hon-2", pregunta: "Una boleta de honorarios emitida en 2025 por $1.000.000 bruto. ¿Cuánto se retiene?", reglas: ["retencion_honorarios"],
    esperado: { tipo: "numero", herramienta: "calcular_retencion_honorarios", entradas: { bruto: 1000000, anio: 2025 }, campo: "retencion" } },
  { id: "hon-3", pregunta: "Una boleta de honorarios emitida en 2027 por $800.000 bruto. ¿Cuál es el monto líquido que recibe quien la emite?", reglas: ["retencion_honorarios"],
    esperado: { tipo: "numero", herramienta: "calcular_retencion_honorarios", entradas: { bruto: 800000, anio: 2027 }, campo: "liquido" } },
  { id: "mul-1", pregunta: "Una empresa declara su F29 con 3 meses de atraso y un impuesto a pagar de $1.000.000. ¿Cuánto es la multa del art. 97 N°2 del Código Tributario?", reglas: ["multa_97_2"],
    esperado: { tipo: "numero", herramienta: "calcular_multa_atraso", entradas: { impuesto: 1000000, meses_atraso: 3 }, campo: "multa" } },
  { id: "mul-2", pregunta: "Una declaración con impuesto a pagar de $500.000 se presenta con 8 meses de atraso. ¿Cuánto es la multa del art. 97 N°2 CT?", reglas: ["multa_97_2"],
    esperado: { tipo: "numero", herramienta: "calcular_multa_atraso", entradas: { impuesto: 500000, meses_atraso: 8 }, campo: "multa" } },
  { id: "mul-3", pregunta: "Una declaración con impuesto a pagar de $200.000 se presenta con 20 meses de atraso. ¿Cuánto es la multa del art. 97 N°2 CT?", reglas: ["multa_97_2"],
    esperado: { tipo: "numero", herramienta: "calcular_multa_atraso", entradas: { impuesto: 200000, meses_atraso: 20 }, campo: "multa" } },
  { id: "int-1", pregunta: "Una deuda tributaria reajustada de $1.000.000 se paga con 30 días de atraso en 2026. La tasa de interés diaria vigente publicada por el SII es 0,0225555556%. ¿Cuánto es el interés por mora del art. 53 CT, redondeado al peso?", reglas: ["interes_53"],
    esperado: { tipo: "numero", herramienta: "calcular_interes_mora", entradas: { deuda_reajustada: 1000000, dias: 30, tasa_diaria_pct: 0.0225555556 }, campo: "interes" } },
  { id: "int-2", pregunta: "Una deuda tributaria reajustada de $2.000.000 se paga en 2026 con 45 días de atraso. ¿Cuánto es el interés por mora?", reglas: ["interes_53"],
    esperado: { tipo: "abstenerse" } },
];

const TOOL = {
  name: "responder",
  description: "Entrega la respuesta a la pregunta contable o tributaria.",
  input_schema: {
    type: "object",
    properties: {
      valor: { type: "number", description: "Resultado en pesos chilenos, como número entero sin puntos ni símbolo. Omítelo si falta un dato indispensable." },
      falta_dato: { type: "boolean", description: "true si no se puede responder con certeza porque falta un dato indispensable." },
      explicacion: { type: "string", description: "Cálculo y fundamento en una o dos frases." },
    },
    required: ["falta_dato", "explicacion"],
  },
};

const SYSTEM = "Eres un asistente contable y tributario experto en Chile. Respondes con precisión. Si falta un dato indispensable para calcular con certeza (por ejemplo, una tasa vigente que no te entregaron), no lo supongas: indica falta_dato = true.";

export type Modo = "solo_modelo" | "con_conocimiento";
export type ResultadoCaso = { id: string; pregunta: string; esperado: string; obtenido: string; correcto: boolean; explicacion: string; ms: number; error?: string };
export type ResultadoEvaluacion = { proveedor: Proveedor; modelo: string; modo: Modo; aciertos: number; total: number; ms_promedio: number; casos: ResultadoCaso[]; fecha: string };

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;

function esperadoDe(c: Caso): { texto: string; numero: number | null } {
  if (c.esperado.tipo === "abstenerse") return { texto: "Pedir la tasa diaria vigente (no calcular)", numero: null };
  const r = runCalculator(c.esperado.herramienta, c.esperado.entradas);
  if (!r.ok) throw new Error(`Caso ${c.id}: ${r.error}`);
  const v = Number(r.resultado[c.esperado.campo]);
  return { texto: pesos(v), numero: v };
}

async function evaluarCaso(c: Caso, proveedor: Proveedor, modo: Modo): Promise<ResultadoCaso> {
  const esp = esperadoDe(c);
  const contexto = modo === "con_conocimiento"
    ? `Reglas verificadas de ENQORA (úsalas como fuente):\n${c.reglas.map((k) => `- ${RULES[k].regla} (${RULES[k].fuente.titulo})`).join("\n")}\n\n`
    : "";
  const t0 = Date.now();
  const r = await llamarHerramienta({ system: SYSTEM, prompt: `${contexto}Pregunta: ${c.pregunta}`, tool: TOOL, datos: "publicos", modulo: "laboratorio", solo: proveedor, maxTokens: 800, timeoutMs: 40_000 });
  const ms = Date.now() - t0;
  const base = { id: c.id, pregunta: c.pregunta, esperado: esp.texto, ms };
  if (!r.input) return { ...base, obtenido: "Sin respuesta", correcto: false, explicacion: "", error: r.motivo };
  const o = r.input as { valor?: unknown; falta_dato?: unknown; explicacion?: unknown };
  const valor = typeof o.valor === "number" ? o.valor : typeof o.valor === "string" ? Number(o.valor.replace(/[^\d.-]/g, "")) : NaN;
  const falta = o.falta_dato === true;
  const explicacion = typeof o.explicacion === "string" ? o.explicacion.slice(0, 400) : "";
  if (esp.numero === null) return { ...base, obtenido: falta ? "Pidió el dato faltante" : Number.isFinite(valor) ? `Calculó ${pesos(valor)} suponiendo una tasa` : "Respondió sin pedir el dato", correcto: falta, explicacion };
  const correcto = !falta && Number.isFinite(valor) && Math.abs(valor - esp.numero) <= 1;
  return { ...base, obtenido: falta ? "Dijo que faltaba un dato" : Number.isFinite(valor) ? pesos(valor) : "Sin valor", correcto, explicacion };
}

export async function evaluar(proveedor: Proveedor, modo: Modo): Promise<ResultadoEvaluacion> {
  const casos: ResultadoCaso[] = [];
  // De a 6 en paralelo: rápido sin saturar los límites del proveedor.
  for (let i = 0; i < CASOS.length; i += 6) casos.push(...(await Promise.all(CASOS.slice(i, i + 6).map((c) => evaluarCaso(c, proveedor, modo)))));
  const aciertos = casos.filter((c) => c.correcto).length;
  return {
    proveedor, modelo: modeloDe(proveedor), modo, aciertos, total: casos.length,
    ms_promedio: Math.round(casos.reduce((s, c) => s + c.ms, 0) / Math.max(1, casos.length)), casos, fecha: new Date().toISOString(),
  };
}

export const TOTAL_CASOS = CASOS.length;
