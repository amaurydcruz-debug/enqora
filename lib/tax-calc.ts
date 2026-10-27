// Calculadoras tributarias deterministas (M15). Las usan los agentes como herramientas y la
// auditoría para recalcular las cifras que proponen. No contienen valores que cambian
// (UF, UTM, tasa diaria del art. 53): esos datos se reciben como entrada.
// Fuentes: ver lib/knowledge.ts (RULES).

export const IVA_RATE = 0.19;
// Retención de boletas de honorarios por año de emisión (SII, noticia 26-12-2025).
export const HONORARIOS_RATE: Record<number, number> = { 2025: 0.145, 2026: 0.1525, 2027: 0.16, 2028: 0.17 };

const round = (n: number) => Math.round(n);
const pos = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null);

export type CalcResult = { ok: true; resultado: Record<string, number | string>; fuente: string } | { ok: false; error: string };

export function calcIva(input: { neto?: unknown; total?: unknown }): CalcResult {
  const neto = pos(input.neto);
  const total = pos(input.total);
  if (neto !== null) {
    const iva = round(neto * IVA_RATE);
    return { ok: true, resultado: { neto: round(neto), iva, total: round(neto) + iva }, fuente: "Art. 14 DL 825 (19%)" };
  }
  if (total !== null) {
    const n = round(total / (1 + IVA_RATE));
    return { ok: true, resultado: { neto: n, iva: round(total) - n, total: round(total) }, fuente: "Art. 14 DL 825 (19%)" };
  }
  return { ok: false, error: "Indica neto o total (montos en pesos, positivos)." };
}

export function calcRetencionHonorarios(input: { bruto?: unknown; anio?: unknown }): CalcResult {
  const bruto = pos(input.bruto);
  const anio = typeof input.anio === "number" ? Math.trunc(input.anio) : NaN;
  const rate = HONORARIOS_RATE[anio];
  if (bruto === null) return { ok: false, error: "Indica el monto bruto de la boleta." };
  if (!rate) return { ok: false, error: "Año fuera de la tabla verificada (2025-2028). Verifica la tasa en sii.cl." };
  const retencion = round(bruto * rate);
  return { ok: true, resultado: { bruto: round(bruto), tasa: `${(rate * 100).toFixed(2)}%`, retencion, liquido: round(bruto) - retencion }, fuente: "SII · retención de honorarios por año" };
}

// Art. 97 N°2 CT: declaración fuera de plazo con impuesto a pagar.
// meses_atraso = meses o fracción de mes desde el vencimiento hasta la declaración.
export function calcMultaAtraso(input: { impuesto?: unknown; meses_atraso?: unknown }): CalcResult {
  const imp = pos(input.impuesto);
  const meses = typeof input.meses_atraso === "number" ? Math.ceil(input.meses_atraso) : NaN;
  if (imp === null || !Number.isFinite(meses) || meses < 1) return { ok: false, error: "Indica el impuesto adeudado y los meses de atraso (mínimo 1)." };
  const pct = meses <= 5 ? 10 : Math.min(30, 10 + 2 * (meses - 5));
  return { ok: true, resultado: { impuesto: round(imp), meses_atraso: meses, porcentaje: `${pct}%`, multa: round(imp * pct / 100) }, fuente: "Art. 97 N°2 CT" };
}

// Art. 53 CT (desde 2025): interés penal diario sobre la deuda reajustada.
// tasa_diaria_pct: la tasa diaria fijada por el SII para el semestre (p. ej., 0.0225555556).
export function calcInteresMora(input: { deuda_reajustada?: unknown; dias?: unknown; tasa_diaria_pct?: unknown }): CalcResult {
  const deuda = pos(input.deuda_reajustada);
  const dias = typeof input.dias === "number" ? Math.trunc(input.dias) : NaN;
  const tasa = pos(input.tasa_diaria_pct);
  if (deuda === null || !Number.isFinite(dias) || dias < 0 || tasa === null || tasa > 1) {
    return { ok: false, error: "Indica deuda reajustada, días de atraso y la tasa diaria (%) vigente publicada por el SII. No uses 1,5% mensual." };
  }
  return { ok: true, resultado: { deuda_reajustada: round(deuda), dias, tasa_diaria: `${tasa}%`, interes: round(deuda * (tasa / 100) * dias) }, fuente: "Art. 53 CT (Ley 21.713) · Circular SII 1/2025" };
}

export const CALCULATORS = {
  calcular_iva: calcIva,
  calcular_retencion_honorarios: calcRetencionHonorarios,
  calcular_multa_atraso: calcMultaAtraso,
  calcular_interes_mora: calcInteresMora,
} as const;
export type CalculatorName = keyof typeof CALCULATORS;

const num = (description: string) => ({ type: "number", description });

// Definiciones para la API de Claude (herramientas del cliente).
export const CALCULATOR_TOOLS = [
  {
    name: "calcular_iva",
    description: "Calcula IVA 19% desde el neto o desde el total. Úsala para toda cifra de IVA que propongas.",
    input_schema: { type: "object", properties: { neto: num("Monto neto en pesos"), total: num("Monto total con IVA en pesos") } },
  },
  {
    name: "calcular_retencion_honorarios",
    description: "Retención de boleta de honorarios según año (2025-2028).",
    input_schema: { type: "object", properties: { bruto: num("Monto bruto en pesos"), anio: num("Año de emisión") }, required: ["bruto", "anio"] },
  },
  {
    name: "calcular_multa_atraso",
    description: "Multa art. 97 N°2 CT por declarar fuera de plazo con impuesto a pagar.",
    input_schema: { type: "object", properties: { impuesto: num("Impuesto adeudado en pesos"), meses_atraso: num("Meses o fracción de atraso") }, required: ["impuesto", "meses_atraso"] },
  },
  {
    name: "calcular_interes_mora",
    description: "Interés penal art. 53 CT (desde 2025): deuda reajustada × tasa diaria × días. Requiere la tasa diaria vigente del SII; si no la tienes, no calcules y pídela.",
    input_schema: {
      type: "object",
      properties: { deuda_reajustada: num("Deuda reajustada por IPC en pesos"), dias: num("Días de atraso"), tasa_diaria_pct: num("Tasa diaria en %, publicada por el SII") },
      required: ["deuda_reajustada", "dias", "tasa_diaria_pct"],
    },
  },
] as const;

export function runCalculator(name: string, input: unknown): CalcResult {
  const fn = (CALCULATORS as Record<string, (i: Record<string, unknown>) => CalcResult>)[name];
  if (!fn) return { ok: false, error: "Herramienta desconocida." };
  return fn((input && typeof input === "object" ? input : {}) as Record<string, unknown>);
}

// Recalcula las cifras que el agente declara en sus situaciones: [{herramienta, entradas, resultado}].
// Devuelve las diferencias encontradas (tolerancia de 1 peso por redondeo).
export type DeclaredCalc = { herramienta?: unknown; entradas?: unknown; resultado?: unknown };
export function verifyCalcs(calcs: DeclaredCalc[]): { ok: boolean; detalle: string }[] {
  return calcs.slice(0, 10).map((c) => {
    const name = typeof c.herramienta === "string" ? c.herramienta : "";
    const r = runCalculator(name, c.entradas);
    if (!r.ok) return { ok: false, detalle: `${name || "cálculo"}: ${r.error}` };
    const declared = c.resultado && typeof c.resultado === "object" ? (c.resultado as Record<string, unknown>) : {};
    const diffs = Object.entries(r.resultado)
      .filter(([k, v]) => typeof v === "number" && typeof declared[k] === "number" && Math.abs((declared[k] as number) - v) > 1)
      .map(([k, v]) => `${k}: declarado ${declared[k]}, correcto ${v}`);
    return diffs.length ? { ok: false, detalle: `${name}: ${diffs.join("; ")}` } : { ok: true, detalle: `${name}: cuadra` };
  });
}
