// Remuneraciones (0073). Motor puro: calcula una liquidación con los PARÁMETROS DEL MES aprobados por una persona
// del equipo (Previred y SII los publican cada mes). Nada de valores escondidos en el código: si falta un
// parámetro, no se calcula. Lo único fijo es la estructura legal (tramos del impuesto único en UTM, art. 43 LIR;
// gratificación del art. 50 del Código del Trabajo).

export type Parametros = {
  uf: number;                 // UF del último día del mes (Previred)
  utm: number;                // UTM del mes
  imm: number;                // ingreso mínimo mensual vigente
  tope_afp_uf: number;        // tope imponible AFP, salud y accidentes (UF)
  tope_afc_uf: number;        // tope imponible seguro de cesantía (UF)
  afp: Record<string, number>;// tasa de cargo del trabajador por AFP (10% + comisión), en %
  sis: number;                // % de cargo del empleador (revisar si ya está incluido en el aporte)
  aporte_empleador: number;   // % total del aporte del empleador (Ley 21.735) del período
  afc_indefinido_trab: number; afc_indefinido_emp: number; afc_plazo_emp: number; // %
  salud_legal: number;        // % (7)
};
export type Trabajador = {
  id: string; nombre: string; tipo_contrato: "indefinido" | "plazo_fijo" | "obra";
  sueldo_base: number; jornada_horas: number; afp: string; salud: "fonasa" | "isapre"; plan_isapre_uf: number | null;
  colacion: number; movilizacion: number; gratificacion: "art50" | "ninguna";
};
export type Novedades = { dias_trabajados: number; horas_extra: number; bonos_imponibles: number; anticipos: number; otros_descuentos: number };
export type Linea = { concepto: string; monto: number; nota?: string };
export type Liquidacion = {
  haberes_imponibles: Linea[]; haberes_no_imponibles: Linea[]; descuentos: Linea[]; aportes_empleador: Linea[];
  total_imponible: number; base_tributable: number; total_haberes: number; total_descuentos: number; liquido: number; costo_empresa: number;
  advertencias: string[];
};

// Tramos mensuales del impuesto único en UTM (art. 43 LIR). La cantidad a rebajar se deduce de la continuidad de la tabla.
const TRAMOS: [number, number][] = [[13.5, 0], [30, 0.04], [50, 0.08], [70, 0.135], [90, 0.23], [120, 0.304], [310, 0.35], [Infinity, 0.4]];
export function impuestoUnico(base: number, utm: number): number {
  if (base <= 0 || utm <= 0) return 0;
  const b = base / utm;
  let rebaja = 0;
  let desde = 0;
  let prevFactor = 0;
  for (const [hasta, factor] of TRAMOS) {
    rebaja += desde * (factor - prevFactor);
    if (b <= hasta) return Math.max(0, Math.round((b * factor - rebaja) * utm));
    desde = hasta;
    prevFactor = factor;
  }
  return 0;
}

const r = Math.round;
const pct = (v: number, p: number) => r((v * p) / 100);

export function faltantes(p: Partial<Parametros> | null, t?: Trabajador): string[] {
  if (!p) return ["parámetros del mes"];
  const out: string[] = [];
  for (const k of ["uf", "utm", "imm", "tope_afp_uf", "tope_afc_uf", "sis", "aporte_empleador", "afc_indefinido_trab", "afc_indefinido_emp", "afc_plazo_emp", "salud_legal"] as const) {
    if (!(typeof p[k] === "number" && (p[k] as number) >= 0)) out.push(k);
  }
  if (t && !(p.afp && typeof p.afp[t.afp] === "number")) out.push(`tasa de la AFP ${t.afp}`);
  return out;
}

export function liquidar(t: Trabajador, n: Novedades, p: Parametros, tasaMutual: number): Liquidacion {
  const adv: string[] = [];
  const dias = Math.min(30, Math.max(0, n.dias_trabajados));
  const sueldo = r((t.sueldo_base * dias) / 30);
  if (t.sueldo_base < p.imm && t.jornada_horas >= 42) adv.push("El sueldo base es menor al ingreso mínimo para jornada completa.");
  // Hora extra: (sueldo base / 30 × 28) / (4 × jornada semanal) × 1,5 — fórmula usual de la Dirección del Trabajo.
  const valorHora = t.jornada_horas > 0 ? (t.sueldo_base / 30) * 28 / (4 * t.jornada_horas) : 0;
  const extra = r(valorHora * 1.5 * Math.max(0, n.horas_extra));
  const baseGrat = sueldo + extra + Math.max(0, n.bonos_imponibles);
  const topeGrat = r((4.75 * p.imm) / 12);
  const grat = t.gratificacion === "art50" ? Math.min(r(baseGrat * 0.25), topeGrat) : 0;
  const imponibles: Linea[] = [{ concepto: `Sueldo base (${dias} días)`, monto: sueldo }];
  if (extra) imponibles.push({ concepto: `Horas extra (${n.horas_extra} h)`, monto: extra });
  if (n.bonos_imponibles > 0) imponibles.push({ concepto: "Bonos imponibles", monto: r(n.bonos_imponibles) });
  if (grat) imponibles.push({ concepto: "Gratificación legal (art. 50, 25% con tope 4,75 IMM/12)", monto: grat });
  const totalImp = imponibles.reduce((s, l) => s + l.monto, 0);
  const noImp: Linea[] = [];
  if (t.colacion > 0) noImp.push({ concepto: "Colación", monto: r((t.colacion * dias) / 30) });
  if (t.movilizacion > 0) noImp.push({ concepto: "Movilización", monto: r((t.movilizacion * dias) / 30) });

  const topeAfp = r(p.tope_afp_uf * p.uf);
  const topeAfc = r(p.tope_afc_uf * p.uf);
  const baseAfp = Math.min(totalImp, topeAfp);
  const baseAfc = Math.min(totalImp, topeAfc);
  if (totalImp > topeAfp) adv.push("La remuneración supera el tope imponible: se cotiza sobre el tope.");

  const afp = pct(baseAfp, p.afp[t.afp]);
  const saludLegal = pct(baseAfp, p.salud_legal);
  const salud = t.salud === "isapre" && t.plan_isapre_uf ? Math.max(saludLegal, r(t.plan_isapre_uf * p.uf)) : saludLegal;
  const afcTrab = t.tipo_contrato === "indefinido" ? pct(baseAfc, p.afc_indefinido_trab) : 0;
  // Base del impuesto: imponible menos cotizaciones obligatorias (la salud rebaja hasta el 7% legal).
  const baseTrib = Math.max(0, totalImp - afp - saludLegal - afcTrab);
  const impuesto = impuestoUnico(baseTrib, p.utm);
  const descuentos: Linea[] = [
    { concepto: `AFP ${t.afp} (${p.afp[t.afp]}%)`, monto: afp },
    { concepto: t.salud === "isapre" ? "Isapre (plan pactado, mínimo 7%)" : `Fonasa (${p.salud_legal}%)`, monto: salud },
  ];
  if (afcTrab) descuentos.push({ concepto: `Seguro de cesantía (${p.afc_indefinido_trab}%)`, monto: afcTrab });
  if (impuesto) descuentos.push({ concepto: "Impuesto único de segunda categoría", monto: impuesto });
  if (n.anticipos > 0) descuentos.push({ concepto: "Anticipos", monto: r(n.anticipos) });
  if (n.otros_descuentos > 0) descuentos.push({ concepto: "Otros descuentos", monto: r(n.otros_descuentos) });

  const afcEmp = pct(baseAfc, t.tipo_contrato === "indefinido" ? p.afc_indefinido_emp : p.afc_plazo_emp);
  const aportes: Linea[] = [
    { concepto: `Seguro de cesantía empleador (${t.tipo_contrato === "indefinido" ? p.afc_indefinido_emp : p.afc_plazo_emp}%)`, monto: afcEmp },
    { concepto: `SIS (${p.sis}%)`, monto: pct(baseAfp, p.sis) },
    { concepto: `Aporte del empleador a pensiones, Ley 21.735 (${p.aporte_empleador}%)`, monto: pct(baseAfp, p.aporte_empleador) },
    { concepto: `Mutual, Ley 16.744 (${tasaMutual}%)`, monto: pct(baseAfp, tasaMutual) },
  ];
  const totalHab = totalImp + noImp.reduce((s, l) => s + l.monto, 0);
  const totalDesc = descuentos.reduce((s, l) => s + l.monto, 0);
  if (totalHab - totalDesc < 0) adv.push("Los descuentos superan los haberes: revisa anticipos y otros descuentos.");
  return {
    haberes_imponibles: imponibles, haberes_no_imponibles: noImp, descuentos, aportes_empleador: aportes,
    total_imponible: totalImp, base_tributable: baseTrib, total_haberes: totalHab, total_descuentos: totalDesc,
    liquido: totalHab - totalDesc, costo_empresa: totalHab + aportes.reduce((s, l) => s + l.monto, 0), advertencias: adv,
  };
}

// ---------- Utilidades compartidas (página, acciones y pruebas) ----------
export const MOTOR_REM = "rem-2026-11";
export const AFPS = ["Capital", "Cuprum", "Habitat", "Modelo", "PlanVital", "Provida", "Uno"] as const;
export const MUTUALES = ["ACHS", "IST", "Mutual de Seguridad", "ISL"] as const;
export const CONTRATOS: Record<Trabajador["tipo_contrato"], string> = { indefinido: "Indefinido", plazo_fijo: "Plazo fijo", obra: "Obra o faena" };
export const CLAVES_PARAMETROS: { k: Exclude<keyof Parametros, "afp">; etiqueta: string; unidad: "$" | "UF" | "%" }[] = [
  { k: "uf", etiqueta: "UF del último día del mes", unidad: "$" },
  { k: "utm", etiqueta: "UTM del mes", unidad: "$" },
  { k: "imm", etiqueta: "Ingreso mínimo mensual", unidad: "$" },
  { k: "tope_afp_uf", etiqueta: "Tope imponible AFP, salud y accidentes", unidad: "UF" },
  { k: "tope_afc_uf", etiqueta: "Tope imponible seguro de cesantía", unidad: "UF" },
  { k: "salud_legal", etiqueta: "Cotización legal de salud", unidad: "%" },
  { k: "sis", etiqueta: "SIS de cargo del empleador (0 si ya va dentro del aporte)", unidad: "%" },
  { k: "aporte_empleador", etiqueta: "Aporte del empleador Ley 21.735 (sin SIS si este se informa aparte)", unidad: "%" },
  { k: "afc_indefinido_trab", etiqueta: "Seguro de cesantía · trabajador (indefinido)", unidad: "%" },
  { k: "afc_indefinido_emp", etiqueta: "Seguro de cesantía · empleador (indefinido)", unidad: "%" },
  { k: "afc_plazo_emp", etiqueta: "Seguro de cesantía · empleador (plazo fijo u obra)", unidad: "%" },
];

export const periodoValido = (p: string) => /^20\d{2}-(0[1-9]|1[0-2])$/.test(p);

// RUT chileno con dígito verificador (módulo 11). Devuelve el formato 12345678-K o null.
export function normalizarRut(raw: string): string | null {
  const s = String(raw ?? "").replace(/[.\s]/g, "").toUpperCase();
  const m = /^(\d{7,8})-?([\dK])$/.exec(s);
  if (!m) return null;
  let suma = 0;
  let mult = 2;
  for (let i = m[1].length - 1; i >= 0; i--) {
    suma += Number(m[1][i]) * mult;
    mult = mult === 7 ? 2 : mult + 1;
  }
  const dv = 11 - (suma % 11);
  const esperado = dv === 11 ? "0" : dv === 10 ? "K" : String(dv);
  return esperado === m[2] ? `${m[1]}-${m[2]}` : null;
}

// Lee los parámetros guardados (jsonb). Si falta algo, devuelve null: no se calcula con datos incompletos.
export function leerParametros(v: unknown): Parametros | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const out: Partial<Parametros> = {};
  for (const { k } of CLAVES_PARAMETROS) {
    const n = o[k];
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
    (out as Record<string, number>)[k] = n;
  }
  const afp = o.afp;
  if (!afp || typeof afp !== "object") return null;
  const tasas: Record<string, number> = {};
  for (const [nombre, t] of Object.entries(afp as Record<string, unknown>)) {
    if (typeof t !== "number" || t < 10 || t > 15) return null;
    tasas[nombre] = t;
  }
  if (!Object.keys(tasas).length) return null;
  return { ...(out as Omit<Parametros, "afp">), afp: tasas };
}

export function leerNovedades(o: Partial<Record<keyof Novedades, unknown>>): Novedades | null {
  const num = (x: unknown, max: number) => { const n = Number(x ?? 0); return Number.isFinite(n) && n >= 0 && n <= max ? n : NaN; };
  const n: Novedades = {
    dias_trabajados: num(o.dias_trabajados ?? 30, 30), horas_extra: num(o.horas_extra, 200), bonos_imponibles: num(o.bonos_imponibles, 50_000_000),
    anticipos: num(o.anticipos, 50_000_000), otros_descuentos: num(o.otros_descuentos, 50_000_000),
  };
  return Object.values(n).some((x) => Number.isNaN(x)) ? null : n;
}
