import "server-only";
import { createHash } from "node:crypto";
import { configurado, costoUsd, llamarHerramienta, modeloDe, type Proveedor, type Uso } from "@/lib/ai/gateway";
import { RULES } from "@/lib/knowledge";
import { HONORARIOS_RATE, IVA_RATE, runCalculator } from "@/lib/tax-calc";

// ENQORA University · Escuela Tributaria (piloto).
// La escuela no es un producto: es un mecanismo interno para mejorar la respuesta que recibe el cliente.
// Solo se usa en el Laboratorio, con misiones ficticias. Nada de aquí llega a producción sin aprobación humana.
//
// Roles y gobernanza:
//   Profesor   código determinista (no es una IA): clasifica la misión, elige cuántos alumnos trabajan y vigila el
//              presupuesto. No evalúa a nadie.
//   Alumnos    hasta 5 enfoques distintos. Trabajan cada uno por su cuenta (sin ver a los demás). Sus cálculos los
//              ejecuta el motor contable de ENQORA, no el modelo.
//   Tribunal   llamada independiente: recibe las propuestas anónimas y en orden aleatorio, decide la respuesta final y
//              califica. Usa otro proveedor si se configura ENQORA_ESCUELA_TRIBUNAL; si no, el mismo con contexto separado.
//   Examen     la respuesta correcta la calcula el motor contable. Se compara siempre con el agente individual.
//   Memoria    el tribunal propone lecciones; quedan «propuestas» hasta que una persona autorizada las aprueba.
//
// Variables opcionales (Vercel): ENQORA_ESCUELA_TRIBUNAL (p. ej., "openai"), ENQORA_ESCUELA_MAX_LLAMADAS (7),
// ENQORA_ESCUELA_MAX_TOKENS (80000 por misión), ENQORA_IA_PRECIOS (para mostrar el costo en USD).

export type Perspectiva = "normativa" | "calculo" | "critico" | "alternativas" | "investigacion";
export type Complejidad = "simple" | "media" | "compleja";

export const PERSPECTIVAS: Record<Perspectiva, { nombre: string; enfoque: string }> = {
  normativa: {
    nombre: "Normativa y legislación tributaria",
    enfoque: "Fundamentas cada paso en la norma: identificas qué artículo, tasa y requisito aplican, y si la pregunta trae todos los datos que la norma exige.",
  },
  calculo: {
    nombre: "Cálculo y motor contable",
    enfoque: "Resuelves con el motor contable: declaras cada cálculo como herramienta y entradas, en el orden correcto, y compones el resultado final a partir de ellos.",
  },
  critico: {
    nombre: "Pensamiento crítico y auditoría",
    enfoque: "Buscas errores antes de responder: premisas falsas, datos faltantes o ambiguos, bases mal elegidas (neto o total) y redondeos. Si falta un dato indispensable, no lo supones.",
  },
  alternativas: {
    nombre: "Soluciones alternativas y optimización",
    enfoque: "Resuelves por un camino distinto al más obvio (por ejemplo, desde el total en vez del neto, o al revés) para contrastar el resultado.",
  },
  investigacion: {
    nombre: "Investigación e innovación",
    enfoque: "Revisas qué información cambiaría la respuesta: tasas que varían por año, reformas recientes (como la Ley 21.713) y datos que deben consultarse en una fuente oficial vigente.",
  },
};

// El profesor asigna alumnos según la dificultad. Más alumnos solo donde la dificultad lo justifica.
// Versión 2 (tras el examen del 09-11-2026: empate 9/9 con 7,5 veces más tokens). El crítico fue el mejor alumno
// (8/8) y en 7 de 10 misiones todos coincidieron: se reducen los alumnos y se conserva el crítico en toda misión no simple.
// «alternativas» e «investigacion» quedan definidos para futuras pruebas, sin asignación por defecto.
export const VERSION_ESCUELA = "v2";
const ASIGNACION: Record<Complejidad, Perspectiva[]> = {
  simple: ["calculo"],
  media: ["calculo", "critico"],
  compleja: ["normativa", "calculo", "critico"],
};

type Esperado = { tipo: "numero"; valor: () => number } | { tipo: "abstenerse"; motivo: string };
type Mision = { id: string; problema: string; complejidad: Complejidad; reglas: (keyof typeof RULES)[]; esperado: Esperado };

function motor(herramienta: string, entradas: Record<string, number>, campo: string): number {
  const r = runCalculator(herramienta, entradas);
  if (!r.ok) throw new Error(`${herramienta}: ${r.error}`);
  return Number(r.resultado[campo]);
}

// Banco de misiones ficticias. Ninguna respuesta se escribe a mano: todas se componen con el motor contable.
const MISIONES: Mision[] = [
  { id: "m01", complejidad: "simple", reglas: ["iva_tasa"],
    problema: "Una pyme vende mercadería afecta a IVA por un neto de $847.300. ¿Cuál es el total de la factura?",
    esperado: { tipo: "numero", valor: () => motor("calcular_iva", { neto: 847300 }, "total") } },
  { id: "m02", complejidad: "simple", reglas: ["retencion_honorarios"],
    problema: "Una boleta de honorarios emitida en 2026 tiene un monto bruto de $350.000. ¿Cuál es el monto líquido que recibe quien la emite?",
    esperado: { tipo: "numero", valor: () => motor("calcular_retencion_honorarios", { bruto: 350000, anio: 2026 }, "liquido") } },
  { id: "m03", complejidad: "media", reglas: ["iva_tasa", "retencion_honorarios"],
    problema: "En marzo de 2026 una empresa emite una factura afecta por un total de $1.190.000 (IVA incluido) y recibe una boleta de honorarios por $400.000 bruto, cuyo impuesto debe retener. ¿Cuánto suman el IVA débito de esa factura y la retención que debe declarar?",
    esperado: { tipo: "numero", valor: () => motor("calcular_iva", { total: 1190000 }, "iva") + motor("calcular_retencion_honorarios", { bruto: 400000, anio: 2026 }, "retencion") } },
  { id: "m04", complejidad: "media", reglas: ["retencion_honorarios"],
    problema: "Una persona quiere recibir un líquido de $840.000 por una boleta de honorarios emitida en 2027. ¿Por qué monto bruto debe emitirla?",
    esperado: { tipo: "numero", valor: () => {
      const bruto = Math.round(840000 / (1 - HONORARIOS_RATE[2027]));
      if (motor("calcular_retencion_honorarios", { bruto, anio: 2027 }, "liquido") !== 840000) throw new Error("m04: el bruto no reproduce el líquido");
      return bruto;
    } } },
  { id: "m05", complejidad: "media", reglas: ["multa_97_2"],
    problema: "Una declaración con impuesto a pagar de $750.000 se presenta con 20 meses de atraso. Sin considerar reajustes ni intereses, ¿cuánto suman el impuesto y la multa del art. 97 N°2 del Código Tributario?",
    esperado: { tipo: "numero", valor: () => 750000 + motor("calcular_multa_atraso", { impuesto: 750000, meses_atraso: 20 }, "multa") } },
  { id: "m06", complejidad: "media", reglas: ["iva_tasa"],
    problema: "Se venden 3 unidades a $59.990 cada una, IVA incluido, en una sola factura afecta. ¿Cuál es el monto neto total de la factura?",
    esperado: { tipo: "numero", valor: () => motor("calcular_iva", { total: 3 * 59990 }, "neto") } },
  { id: "m07", complejidad: "compleja", reglas: ["iva_tasa", "iva_credito_24", "multa_97_2"],
    problema: "En un período, una empresa tuvo ventas afectas por un neto de $3.000.000 y compras afectas con factura por un total de $1.190.000 (IVA incluido), todas con derecho a crédito fiscal. No tiene remanente de períodos anteriores. Declara el F29 con 7 meses de atraso. ¿Cuánto es la multa del art. 97 N°2 del Código Tributario sobre el IVA a pagar?",
    esperado: { tipo: "numero", valor: () => {
      const pagar = motor("calcular_iva", { neto: 3000000 }, "iva") - motor("calcular_iva", { total: 1190000 }, "iva");
      return motor("calcular_multa_atraso", { impuesto: pagar, meses_atraso: 7 }, "multa");
    } } },
  { id: "m08", complejidad: "compleja", reglas: ["interes_53"],
    problema: "Un cliente pagará en 2026 una deuda tributaria reajustada de $1.500.000 con 60 días de atraso. Su contador anterior le dijo que el interés es de 1,5% mensual. ¿Cuánto es el interés por mora del art. 53 del Código Tributario?",
    esperado: { tipo: "abstenerse", motivo: "Desde 2025 el interés es diario (Ley 21.713): se necesita la tasa diaria vigente publicada por el SII; el 1,5% mensual ya no corresponde." } },
  { id: "m09", complejidad: "compleja", reglas: ["interes_53", "multa_97_2"],
    problema: "Un impuesto de $3.500.000 (ya reajustado) se declaró con 1 mes de atraso y se paga en 2026 con 15 días de atraso. La tasa de interés diaria publicada por el SII para el semestre es 0,0225555556%. ¿Cuánto suman el interés del art. 53 y la multa del art. 97 N°2 del Código Tributario?",
    esperado: { tipo: "numero", valor: () =>
      motor("calcular_interes_mora", { deuda_reajustada: 3500000, dias: 15, tasa_diaria_pct: 0.0225555556 }, "interes") +
      motor("calcular_multa_atraso", { impuesto: 3500000, meses_atraso: 1 }, "multa") } },
  { id: "m10", complejidad: "compleja", reglas: ["iva_tasa", "iva_credito_24"],
    problema: "Una empresa tuvo en el mes ventas afectas por un neto de $2.000.000 y compras por $1.000.000. ¿Cuánto IVA debe pagar en el F29?",
    esperado: { tipo: "abstenerse", motivo: "No se sabe si las compras son afectas, si tienen factura con derecho a crédito ni si el monto es neto o total." } },
];

export const TOTAL_MISIONES = MISIONES.length;

// Versión del conocimiento: si cambian las reglas o las tasas, las certificaciones deben renovarse.
export function versionConocimiento(): string {
  const base = JSON.stringify({ reglas: Object.entries(RULES).map(([k, r]) => [k, r.regla]), IVA_RATE, HONORARIOS_RATE });
  return createHash("sha256").update(base).digest("hex").slice(0, 12);
}

// ---------- Herramientas ----------
const CALCULOS_SCHEMA = {
  type: "array",
  description: "Cálculos que debe ejecutar el motor contable de ENQORA. Herramientas: calcular_iva {neto|total}, calcular_retencion_honorarios {bruto, anio}, calcular_multa_atraso {impuesto, meses_atraso}, calcular_interes_mora {deuda_reajustada, dias, tasa_diaria_pct}.",
  items: { type: "object", properties: { herramienta: { type: "string" }, entradas: { type: "object" } }, required: ["herramienta", "entradas"] },
};

const TOOL_ALUMNO = {
  name: "proponer_solucion",
  description: "Entrega tu propuesta de solución a la misión.",
  input_schema: {
    type: "object",
    properties: {
      valor: { type: "number", description: "Respuesta final en pesos, entero sin puntos. Omítelo si falta un dato indispensable." },
      falta_dato: { type: "boolean", description: "true si no se puede responder con certeza porque falta un dato indispensable o la premisa es incorrecta." },
      dato_faltante: { type: "string", description: "Qué dato falta o qué premisa es incorrecta (si corresponde)." },
      calculos: CALCULOS_SCHEMA,
      fundamento: { type: "string", description: "Razonamiento y norma aplicada, en dos a cuatro frases." },
    },
    required: ["falta_dato", "fundamento"],
  },
};

const TOOL_TRIBUNAL = {
  name: "dictar_resolucion",
  description: "Dicta la resolución del tribunal sobre la misión.",
  input_schema: {
    type: "object",
    properties: {
      valor: { type: "number", description: "Respuesta final en pesos, entero. Omítelo si corresponde abstenerse." },
      falta_dato: { type: "boolean", description: "true si la respuesta correcta es pedir un dato faltante o corregir una premisa." },
      evaluaciones: {
        type: "array",
        items: {
          type: "object",
          properties: {
            propuesta: { type: "integer", description: "Número de la propuesta evaluada." },
            puntaje: { type: "integer", minimum: 0, maximum: 10 },
            errores: { type: "string", description: "Errores detectados (vacío si no hay)." },
          },
          required: ["propuesta", "puntaje"],
        },
      },
      fundamento: { type: "string", description: "Por qué esta es la respuesta correcta, en dos a cuatro frases." },
      leccion: { type: "string", description: "Una estrategia general y reutilizable que se desprende de esta misión (sin montos ni datos del caso). Vacío si no hay nada nuevo." },
    },
    required: ["falta_dato", "evaluaciones", "fundamento"],
  },
};

const TOOL_AGENTE = {
  name: "responder",
  description: "Entrega la respuesta a la pregunta contable o tributaria.",
  input_schema: {
    type: "object",
    properties: {
      valor: { type: "number", description: "Resultado en pesos chilenos, entero sin puntos. Omítelo si falta un dato indispensable." },
      falta_dato: { type: "boolean", description: "true si no se puede responder con certeza porque falta un dato indispensable." },
      explicacion: { type: "string", description: "Cálculo y fundamento en una o dos frases." },
    },
    required: ["falta_dato", "explicacion"],
  },
};

// ---------- Tipos de resultado ----------
export type CalculoVerificado = { herramienta: string; entradas: unknown; ok: boolean; resultado?: Record<string, number | string>; error?: string };
export type ResultadoAlumno = {
  perspectiva: Perspectiva; proveedor?: Proveedor; modelo?: string; valor: number | null; falta_dato: boolean; dato_faltante: string;
  calculos: CalculoVerificado[]; fundamento: string; correcto: boolean; tokens: number; uso?: Uso; ms: number; error?: string;
  puntaje?: number; errores?: string;
};
export type ResultadoMision = {
  mision: string; problema: string; complejidad: Complejidad; esperado: string;
  alumnos: ResultadoAlumno[];
  tribunal: { proveedor?: Proveedor; modelo?: string; valor: number | null; falta_dato: boolean; fundamento: string; leccion: string; tokens: number; uso?: Uso; ms: number; omitido?: string; error?: string };
  respuesta_escuela: string; correcto_escuela: boolean; tokens_escuela: number; ms_escuela: number; costo_escuela: number | null;
  agente: { valor: number | null; falta_dato: boolean; explicacion: string; correcto: boolean; tokens: number; ms: number; costo: number | null; error?: string };
  errores_detectados: number;
};
export type ResultadoExamen = {
  escuela: "tributaria"; fecha: string; proveedor: Proveedor; modelo: string;
  tribunal_proveedor: Proveedor; tribunal_modelo: string; independencia: string; version_conocimiento: string;
  presupuesto: { llamadas: number; tokens: number };
  total: number; aciertos_escuela: number; aciertos_agente: number;
  tokens_escuela: number; tokens_agente: number; ms_escuela: number; ms_agente: number;
  costo_escuela: number | null; costo_agente: number | null;
  misiones: ResultadoMision[];
};

// ---------- Utilidades ----------
const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^\d.-]/g, "")) : NaN;
  return Number.isFinite(n) ? n : null;
};
const txt = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const tokens = (u?: Uso) => (u ? u.entrada + u.salida : 0);
const sumaCosto = (a: number | null, b: number | null) => (a === null && b === null ? null : (a ?? 0) + (b ?? 0));
const entero = (v: string | undefined, def: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.trunc(n) : def;
};

function calificar(esp: { numero: number | null }, valor: number | null, falta: boolean): boolean {
  if (esp.numero === null) return falta;
  return !falta && valor !== null && Math.abs(valor - esp.numero) <= 1;
}

function contexto(m: Mision, estrategias: string[]): string {
  const reglas = m.reglas.map((k) => `- ${RULES[k].regla} (${RULES[k].fuente.titulo})`).join("\n");
  const memoria = estrategias.length ? `\n\nEstrategias aprobadas por ENQORA (memoria de la escuela):\n${estrategias.map((e) => `- ${e}`).join("\n")}` : "";
  return `Reglas verificadas de ENQORA (úsalas como fuente):\n${reglas}${memoria}`;
}

function verificar(calculos: unknown): CalculoVerificado[] {
  if (!Array.isArray(calculos)) return [];
  return calculos.slice(0, 6).map((c) => {
    const o = (c ?? {}) as { herramienta?: unknown; entradas?: unknown };
    const herramienta = txt(o.herramienta, 60);
    const r = runCalculator(herramienta, o.entradas ?? {});
    return r.ok ? { herramienta, entradas: o.entradas, ok: true, resultado: r.resultado } : { herramienta, entradas: o.entradas, ok: false, error: r.error };
  });
}

function mezclar<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Roles ----------
async function alumno(m: Mision, p: Perspectiva, proveedor: Proveedor, estrategias: string[], esp: { numero: number | null }): Promise<ResultadoAlumno> {
  const system = `Eres un alumno de la Escuela Tributaria de ENQORA, especialista en Chile. Tu enfoque: ${PERSPECTIVAS[p].nombre}. ${PERSPECTIVAS[p].enfoque}
Trabajas solo: no conoces las propuestas de otros alumnos. Declara tus cálculos para que los ejecute el motor contable. Si falta un dato indispensable o la premisa es incorrecta, indica falta_dato = true y explica qué falta; no inventes tasas ni montos.`;
  const t0 = Date.now();
  const r = await llamarHerramienta({ system, prompt: `${contexto(m, estrategias)}\n\nMisión: ${m.problema}`, tool: TOOL_ALUMNO, datos: "publicos", solo: proveedor, maxTokens: 1200, timeoutMs: 60_000 });
  const ms = Date.now() - t0;
  const base = { perspectiva: p, proveedor: r.proveedor, modelo: r.modelo, tokens: tokens(r.uso), uso: r.uso, ms };
  if (!r.input) return { ...base, valor: null, falta_dato: false, dato_faltante: "", calculos: [], fundamento: "", correcto: false, error: r.motivo };
  const o = r.input as Record<string, unknown>;
  const valor = num(o.valor);
  const falta = o.falta_dato === true;
  return {
    ...base, valor, falta_dato: falta, dato_faltante: txt(o.dato_faltante, 300), calculos: verificar(o.calculos),
    fundamento: txt(o.fundamento, 700), correcto: calificar(esp, valor, falta),
  };
}

function describir(a: ResultadoAlumno, n: number): string {
  const calc = a.calculos.length
    ? a.calculos.map((c) => c.ok ? `  · ${c.herramienta}(${JSON.stringify(c.entradas)}) → ${JSON.stringify(c.resultado)} [verificado por el motor]` : `  · ${c.herramienta}(${JSON.stringify(c.entradas)}) → ERROR: ${c.error}`).join("\n")
    : "  · (no declaró cálculos)";
  const resp = a.falta_dato ? `Se abstiene: ${a.dato_faltante || "falta un dato"}` : a.valor !== null ? `Responde ${pesos(a.valor)}` : "Sin valor";
  return `Propuesta ${n}\n${resp}\nFundamento: ${a.fundamento || "(vacío)"}\nCálculos:\n${calc}`;
}

async function tribunal(m: Mision, propuestas: ResultadoAlumno[], proveedor: Proveedor, estrategias: string[]) {
  const orden = mezclar(propuestas.map((a, i) => ({ a, i })));
  const system = `Eres el tribunal independiente de la Escuela Tributaria de ENQORA. No resolviste esta misión ni conoces a sus autores: recibes propuestas anónimas en orden aleatorio.
Decide la respuesta correcta según la evidencia: un cálculo verificado por el motor pesa más que una afirmación, y la mayoría no es prueba. Si falta un dato indispensable o la premisa es incorrecta, la resolución correcta es abstenerse (falta_dato = true), aunque otros hayan calculado.
Regla de ENQORA: no se suponen datos. Si una propuesta señala que el enunciado no dice algo que cambia el resultado (por ejemplo, si un monto es neto o total, si una compra es afecta o tiene derecho a crédito, o una tasa vigente), debes abstenerte, salvo que puedas citar la parte del propio enunciado que entrega ese dato. Elegir «la lectura más natural» para completar un dato que el enunciado no da es un error.
Califica cada propuesta de 0 a 10 y anota sus errores. No puedes cambiar las reglas de ENQORA: solo puedes proponer una lección, que una persona revisará.`;
  const prompt = `${contexto(m, estrategias)}\n\nMisión: ${m.problema}\n\n${orden.map((x, k) => describir(x.a, k + 1)).join("\n\n")}`;
  const t0 = Date.now();
  const r = await llamarHerramienta({ system, prompt, tool: TOOL_TRIBUNAL, datos: "publicos", solo: proveedor, maxTokens: 1500, timeoutMs: 60_000 });
  const ms = Date.now() - t0;
  if (!r.input) return { proveedor: r.proveedor, modelo: r.modelo, valor: null, falta_dato: false, fundamento: "", leccion: "", tokens: tokens(r.uso), uso: r.uso, ms, error: r.motivo, notas: [] as { idx: number; puntaje: number; errores: string }[] };
  const o = r.input as Record<string, unknown>;
  const notas = (Array.isArray(o.evaluaciones) ? o.evaluaciones : []).flatMap((e) => {
    const x = (e ?? {}) as { propuesta?: unknown; puntaje?: unknown; errores?: unknown };
    const k = num(x.propuesta);
    const ref = k !== null ? orden[k - 1] : undefined;
    return ref ? [{ idx: ref.i, puntaje: Math.max(0, Math.min(10, Math.round(num(x.puntaje) ?? 0))), errores: txt(x.errores, 400) }] : [];
  });
  return {
    proveedor: r.proveedor, modelo: r.modelo, valor: num(o.valor), falta_dato: o.falta_dato === true,
    fundamento: txt(o.fundamento, 800), leccion: txt(o.leccion, 300), tokens: tokens(r.uso), uso: r.uso, ms, notas,
  };
}

async function agenteIndividual(m: Mision, proveedor: Proveedor, esp: { numero: number | null }) {
  const system = "Eres un asistente contable y tributario experto en Chile. Respondes con precisión. Si falta un dato indispensable para calcular con certeza (por ejemplo, una tasa vigente que no te entregaron), no lo supongas: indica falta_dato = true.";
  const t0 = Date.now();
  const r = await llamarHerramienta({ system, prompt: `${contexto(m, [])}\n\nPregunta: ${m.problema}`, tool: TOOL_AGENTE, datos: "publicos", solo: proveedor, maxTokens: 800, timeoutMs: 60_000 });
  const ms = Date.now() - t0;
  const costo = r.uso ? costoUsd(proveedor, r.uso) : null;
  if (!r.input) return { valor: null, falta_dato: false, explicacion: "", correcto: false, tokens: tokens(r.uso), ms, costo, error: r.motivo };
  const o = r.input as Record<string, unknown>;
  const valor = num(o.valor);
  const falta = o.falta_dato === true;
  return { valor, falta_dato: falta, explicacion: txt(o.explicacion, 500), correcto: calificar(esp, valor, falta), tokens: tokens(r.uso), ms, costo };
}

// Sin tribunal (presupuesto agotado o falla): consenso simple entre los alumnos, marcado como tal.
function consenso(alumnos: ResultadoAlumno[]): { valor: number | null; falta: boolean } {
  const validos = alumnos.filter((a) => !a.error);
  const abst = validos.filter((a) => a.falta_dato).length;
  const votos = new Map<number, number>();
  for (const a of validos) if (!a.falta_dato && a.valor !== null) votos.set(Math.round(a.valor), (votos.get(Math.round(a.valor)) ?? 0) + 1);
  const [mejor, n] = [...votos.entries()].sort((x, y) => y[1] - x[1])[0] ?? [null, 0];
  return abst >= n ? { valor: null, falta: abst > 0 } : { valor: mejor, falta: false };
}

async function resolverMision(m: Mision, proveedor: Proveedor, tribunalProv: Proveedor, estrategias: string[], presupuesto: { llamadas: number; tokens: number }): Promise<ResultadoMision> {
  const numero = m.esperado.tipo === "numero" ? m.esperado.valor() : null;
  const esp = { numero };
  const esperado = numero !== null ? pesos(numero) : `Abstenerse: ${(m.esperado as { motivo: string }).motivo}`;

  // Profesor: asigna alumnos según dificultad, dejando una llamada para el tribunal.
  const asignados = ASIGNACION[m.complejidad].slice(0, Math.max(1, presupuesto.llamadas - 1));
  const t0 = Date.now();
  const [alumnos, agente] = await Promise.all([
    Promise.all(asignados.map((p) => alumno(m, p, proveedor, estrategias, esp))),
    agenteIndividual(m, proveedor, esp),
  ]);
  const tokAlumnos = alumnos.reduce((s, a) => s + a.tokens, 0);

  let trib: ResultadoMision["tribunal"];
  let valor: number | null, falta: boolean;
  // Acuerdo verificado: si dos o más alumnos coinciden (mismo valor con un cálculo del motor sin errores, o todos se
  // abstienen), el tribunal no se llama. Ahorra tokens donde no hay nada que decidir.
  const validos = alumnos.filter((a) => !a.error);
  const todosAbstienen = validos.length >= 2 && validos.every((a) => a.falta_dato);
  const primero = validos[0]?.valor;
  const mismoValor = validos.length >= 2 && primero !== null && primero !== undefined
    && validos.every((a) => !a.falta_dato && a.valor !== null && Math.abs(a.valor - primero) <= 1)
    && validos.some((a) => a.calculos.length > 0 && a.calculos.every((c) => c.ok));
  if (validos.length === alumnos.length && (todosAbstienen || mismoValor)) {
    valor = todosAbstienen ? null : (primero as number);
    falta = todosAbstienen;
    trib = { valor: null, falta_dato: false, fundamento: "", leccion: "", tokens: 0, ms: 0, omitido: "Acuerdo de todos los alumnos verificado por el motor: no fue necesario llamar al tribunal." };
  } else if (tokAlumnos >= presupuesto.tokens) {
    const c = consenso(alumnos);
    valor = c.valor; falta = c.falta;
    trib = { valor: null, falta_dato: false, fundamento: "", leccion: "", tokens: 0, ms: 0, omitido: "Presupuesto de tokens agotado: se usó el consenso de los alumnos." };
  } else {
    const t = await tribunal(m, alumnos, tribunalProv, estrategias);
    for (const n of t.notas) Object.assign(alumnos[n.idx], { puntaje: n.puntaje, errores: n.errores });
    if (t.error) {
      const c = consenso(alumnos);
      valor = c.valor; falta = c.falta;
    } else {
      valor = t.valor; falta = t.falta_dato;
    }
    trib = { proveedor: t.proveedor, modelo: t.modelo, valor: t.valor, falta_dato: t.falta_dato, fundamento: t.fundamento, leccion: t.leccion, tokens: t.tokens, uso: t.uso, ms: t.ms, error: t.error,
      omitido: t.error ? "El tribunal no respondió: se usó el consenso de los alumnos." : undefined };
  }
  const ms_escuela = Date.now() - t0;
  const tokens_escuela = tokAlumnos + trib.tokens;
  // Costo exacto con el desglose de tokens de cada llamada y el precio configurado de cada proveedor (null si no hay precio).
  const costo_escuela = [...alumnos.map((a) => (a.uso ? costoUsd(proveedor, a.uso) : null)), trib.uso ? costoUsd(tribunalProv, trib.uso) : null]
    .reduce<number | null>((s, c) => sumaCosto(s, c), null);

  return {
    mision: m.id, problema: m.problema, complejidad: m.complejidad, esperado, alumnos, tribunal: trib,
    respuesta_escuela: falta ? "Se abstiene y pide el dato" : valor !== null ? pesos(valor) : "Sin respuesta",
    correcto_escuela: calificar(esp, valor, falta), tokens_escuela, ms_escuela, costo_escuela,
    agente, errores_detectados: alumnos.filter((a) => (a.errores ?? "").length > 3).length,
  };
}

export function tribunalConfigurado(proveedorAlumnos: Proveedor): { proveedor: Proveedor; independencia: string } {
  const pedido = (process.env.ENQORA_ESCUELA_TRIBUNAL ?? "").trim().toLowerCase() as Proveedor;
  if (pedido && pedido !== proveedorAlumnos && (["anthropic", "hf", "openai"] as string[]).includes(pedido) && configurado(pedido)) {
    return { proveedor: pedido, independencia: `Escuela ${VERSION_ESCUELA} · proveedor distinto al de los alumnos` };
  }
  return { proveedor: proveedorAlumnos, independencia: `Escuela ${VERSION_ESCUELA} · mismo proveedor, contexto separado y propuestas anónimas` };
}

export function presupuestoMision() {
  return {
    llamadas: entero(process.env.ENQORA_ESCUELA_MAX_LLAMADAS, 7, 2, 12),
    tokens: entero(process.env.ENQORA_ESCUELA_MAX_TOKENS, 80_000, 5_000, 500_000),
  };
}

export async function rendirExamen(proveedor: Proveedor, estrategias: string[]): Promise<ResultadoExamen> {
  const { proveedor: tribunalProv, independencia } = tribunalConfigurado(proveedor);
  const presupuesto = presupuestoMision();
  const misiones: ResultadoMision[] = [];
  // De a 3 misiones en paralelo: termina en pocos minutos sin saturar los límites del proveedor.
  for (let i = 0; i < MISIONES.length; i += 3) {
    misiones.push(...(await Promise.all(MISIONES.slice(i, i + 3).map((m) => resolverMision(m, proveedor, tribunalProv, estrategias, presupuesto)))));
  }
  const suma = (f: (m: ResultadoMision) => number) => misiones.reduce((s, m) => s + f(m), 0);
  const costos = (f: (m: ResultadoMision) => number | null) => misiones.reduce<number | null>((s, m) => sumaCosto(s, f(m)), null);
  return {
    escuela: "tributaria", fecha: new Date().toISOString(), proveedor, modelo: modeloDe(proveedor),
    tribunal_proveedor: tribunalProv, tribunal_modelo: modeloDe(tribunalProv), independencia, version_conocimiento: versionConocimiento(), presupuesto,
    total: misiones.length, aciertos_escuela: misiones.filter((m) => m.correcto_escuela).length, aciertos_agente: misiones.filter((m) => m.agente.correcto).length,
    tokens_escuela: suma((m) => m.tokens_escuela), tokens_agente: suma((m) => m.agente.tokens),
    ms_escuela: suma((m) => m.ms_escuela), ms_agente: suma((m) => m.agente.ms),
    costo_escuela: costos((m) => m.costo_escuela), costo_agente: costos((m) => m.agente.costo),
    misiones,
  };
}

// Lecciones que el tribunal propone para la memoria: solo de misiones donde la escuela acertó y hubo errores que corregir.
export function leccionesPropuestas(r: ResultadoExamen): { texto: string; mision: string }[] {
  const vistas = new Set<string>();
  return r.misiones
    .filter((m) => m.correcto_escuela && m.tribunal.leccion.length >= 20 && (m.alumnos.some((a) => !a.correcto) || !m.agente.correcto))
    .map((m) => ({ texto: m.tribunal.leccion.replace(/\$\s?[\d.]+/g, "").trim(), mision: m.mision }))
    .filter((l) => {
      const k = l.texto.toLowerCase();
      if (vistas.has(k)) return false;
      vistas.add(k);
      return true;
    })
    .slice(0, 5);
}

// Comprobación del banco (pruebas): cada respuesta esperada se puede componer con el motor contable.
export function bancoDeMisiones(): { id: string; complejidad: Complejidad; esperado: string; alumnos: number }[] {
  return MISIONES.map((m) => ({
    id: m.id, complejidad: m.complejidad, alumnos: ASIGNACION[m.complejidad].length,
    esperado: m.esperado.tipo === "numero" ? pesos(m.esperado.valor()) : `Abstenerse: ${m.esperado.motivo}`,
  }));
}
