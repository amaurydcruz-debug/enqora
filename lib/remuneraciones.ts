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
  // Aporte del empleador, Ley 21.735 (desde agosto de 2026 se declara en cuatro partes en Previred):
  sis: number;                // Seguro de Invalidez y Sobrevivencia (campo 29)
  aporte_ci: number;          // capitalización individual, a la cuenta del trabajador (va junto a la cotización AFP, campo 28)
  aporte_ev: number;          // Seguro Social · compensación por expectativa de vida (campo 94)
  aporte_rp: number;          // Seguro Social · cotización con rentabilidad protegida (campo 95)
  ccaf_salud?: number;        // parte del 7% de Fonasa que se entera en la CCAF (solo si la empresa está en una CCAF)
  // Asignación familiar y maternal (Ley 18.987): monto por carga de los tramos A, B y C. Se reajustan por ley: van como
  // parámetro del mes y no en el código. Solo se exigen si algún trabajador tiene cargas en ese tramo.
  af_a?: number; af_b?: number; af_c?: number;
  afc_indefinido_trab: number; afc_indefinido_emp: number; afc_plazo_emp: number; // %
  salud_legal: number;        // % (7)
};
export type Trabajador = {
  id: string; nombre: string; tipo_contrato: "indefinido" | "plazo_fijo" | "obra";
  sueldo_base: number; jornada_horas: number; afp: string; salud: "fonasa" | "isapre"; plan_isapre_uf: number | null;
  colacion: number; movilizacion: number; gratificacion: "art50" | "ninguna";
  // APV individual descontado por planilla (art. 42 bis LIR): el régimen B rebaja la base del impuesto hasta 50 UF al mes.
  apv_regimen?: "A" | "B" | null; apv_monto?: number | null;
  // Cargas reconocidas por el IPS o la CCAF y tramo de la resolución (según el ingreso promedio del trabajador, no el sueldo del mes).
  tramo_af?: TramoAF | null; cargas_simples?: number | null; cargas_maternales?: number | null; cargas_invalidez?: number | null;
};
export type TramoAF = "A" | "B" | "C" | "D";
export type Licencia = { tipo: "comun" | "laboral"; desde: string; hasta: string };
export type Novedades = {
  dias_trabajados: number; horas_extra: number; bonos_imponibles: number; anticipos: number; otros_descuentos: number;
  // Licencia médica: los días los paga la entidad del subsidio (Fonasa/CCAF, isapre o mutual), no el empleador.
  // RIMA: renta imponible del mes anterior al inicio de la licencia (base del SIS y de la expectativa de vida por esos días).
  dias_licencia?: number; rima?: number; licencia?: Licencia | null;
};
export type Linea = { concepto: string; monto: number; nota?: string };
// Montos estructurados para Previred y el LRE (cada uno en pesos).
export type Montos = {
  sueldo: number; horas_extra: number; bonos: number; gratificacion: number; colacion: number; movilizacion: number;
  base_afp: number; base_afc: number; afp: number; salud_legal: number; salud_adicional: number; afc_trab: number; impuesto: number;
  apv_a: number; apv_b: number;
  // Asignación familiar pagada por el empleador (la recupera al pagar las cotizaciones) y licencias médicas.
  asig_familiar?: number; af_tramo?: TramoAF; af_simples?: number; af_maternales?: number; af_invalidez?: number;
  dias_licencia?: number; rima?: number;
  anticipos: number; otros: number; afc_emp: number; sis: number; aporte_ci: number; aporte_ev: number; aporte_rp: number; mutual: number;
};
export type Liquidacion = {
  montos: Montos;
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
  for (const k of ["uf", "utm", "imm", "tope_afp_uf", "tope_afc_uf", "sis", "aporte_ci", "aporte_ev", "aporte_rp", "afc_indefinido_trab", "afc_indefinido_emp", "afc_plazo_emp", "salud_legal"] as const) {
    if (!(typeof p[k] === "number" && (p[k] as number) >= 0)) out.push(k);
  }
  if (t && !(p.afp && typeof p.afp[t.afp] === "number")) out.push(`tasa de la AFP ${t.afp}`);
  return out;
}

// Monto de la asignación familiar del mes: cada carga simple o maternal vale el monto del tramo; la de invalidez, el doble
// (art. 1 Ley 18.987). Se paga en proporción a los días trabajados; la de los días con licencia la paga quien paga el subsidio.
export function asignacionFamiliar(t: Trabajador, p: Parametros, dias: number): number {
  const tramo = t.tramo_af;
  const monto = tramo === "A" ? p.af_a : tramo === "B" ? p.af_b : tramo === "C" ? p.af_c : 0;
  const n = (t.cargas_simples ?? 0) + (t.cargas_maternales ?? 0) + 2 * (t.cargas_invalidez ?? 0);
  if (!monto || n <= 0) return 0;
  return r((monto * n * Math.min(30, Math.max(0, dias))) / 30);
}
export const tieneCargas = (t: Trabajador) => (t.cargas_simples ?? 0) + (t.cargas_maternales ?? 0) + (t.cargas_invalidez ?? 0) > 0;
// Parámetro del tramo que falta para pagar la asignación (null si no falta nada).
export function faltaMontoAF(t: Trabajador, p: Parametros): string | null {
  if (!tieneCargas(t)) return null;
  if (!t.tramo_af) return "tramo de asignación familiar del trabajador";
  const k = ({ A: "af_a", B: "af_b", C: "af_c", D: null } as const)[t.tramo_af];
  return k && typeof p[k] !== "number" ? `monto de la asignación familiar del tramo ${t.tramo_af}` : null;
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
  const af = asignacionFamiliar(t, p, dias);
  if (af) {
    const cargas = (t.cargas_simples ?? 0) + (t.cargas_maternales ?? 0) + (t.cargas_invalidez ?? 0);
    noImp.push({ concepto: `Asignación familiar (tramo ${t.tramo_af}, ${cargas} carga${cargas === 1 ? "" : "s"}${dias < 30 ? `, ${dias} días` : ""})`, monto: af,
      nota: "La paga el empleador y la descuenta al pagar las cotizaciones (Previred)." });
  }
  if (tieneCargas(t) && t.tramo_af === "D") adv.push("Tramo D: las cargas quedan informadas, pero no corresponde pagar asignación familiar.");
  // Máximo legal de 2 horas extraordinarias por día trabajado (art. 31).
  if (n.horas_extra > 2 * dias) adv.push("Las horas extra superan 2 por cada día trabajado: el máximo legal es de 2 horas extraordinarias diarias.");
  const diasLic = Math.min(30 - dias, Math.max(0, Math.round(n.dias_licencia ?? 0)));
  if ((n.dias_licencia ?? 0) > diasLic) adv.push("Los días trabajados más los días de licencia superan 30: se ajustaron los días de licencia.");

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
  // APV por planilla: el régimen B rebaja la base del impuesto con tope de 50 UF al mes (art. 42 bis); el A no.
  const apv = t.apv_regimen && (t.apv_monto ?? 0) > 0 ? r(t.apv_monto!) : 0;
  const apvB = t.apv_regimen === "B" ? apv : 0;
  const apvA = t.apv_regimen === "A" ? apv : 0;
  const rebajaApv = Math.min(apvB, r(50 * p.uf));
  if (apvB > rebajaApv) adv.push("El APV régimen B supera 50 UF: solo 50 UF rebajan la base del impuesto este mes.");
  const baseTrib = Math.max(0, totalImp - afp - saludLegal - afcTrab - rebajaApv);
  const impuesto = impuestoUnico(baseTrib, p.utm);
  const descuentos: Linea[] = [
    { concepto: `AFP ${t.afp} (${p.afp[t.afp]}%)`, monto: afp },
    { concepto: t.salud === "isapre" ? "Isapre (plan pactado, mínimo 7%)" : `Fonasa (${p.salud_legal}%)`, monto: salud },
  ];
  if (afcTrab) descuentos.push({ concepto: `Seguro de cesantía (${p.afc_indefinido_trab}%)`, monto: afcTrab });
  if (apv) descuentos.push({ concepto: `APV régimen ${t.apv_regimen} (ahorro previsional voluntario)`, monto: apv });
  if (impuesto) descuentos.push({ concepto: "Impuesto único de segunda categoría", monto: impuesto });
  if (n.anticipos > 0) descuentos.push({ concepto: "Anticipos", monto: r(n.anticipos) });
  if (n.otros_descuentos > 0) descuentos.push({ concepto: "Otros descuentos", monto: r(n.otros_descuentos) });

  const afcEmp = pct(baseAfc, t.tipo_contrato === "indefinido" ? p.afc_indefinido_emp : p.afc_plazo_emp);
  // Ley 21.735: capitalización individual y rentabilidad protegida solo por días trabajados; SIS y expectativa de vida
  // sobre la renta de los días trabajados más la RIMA de los días con licencia.
  // Licencia médica: SIS y expectativa de vida también sobre la RIMA proporcional a los días de licencia (campo 92),
  // con el tope imponible para la suma; capitalización individual y rentabilidad protegida, solo por días trabajados.
  const rima = diasLic > 0 ? Math.min(r((Math.min(n.rima ?? 0, topeAfp) * diasLic) / 30), Math.max(0, topeAfp - baseAfp)) : 0;
  if (diasLic > 0 && !rima) adv.push("Hay días de licencia sin renta del mes anterior (RIMA): Previred la exige para el SIS y la expectativa de vida.");
  const sis = pct(baseAfp + rima, p.sis);
  const ci = pct(baseAfp, p.aporte_ci);
  const ev = pct(baseAfp + rima, p.aporte_ev);
  const rp = pct(baseAfp, p.aporte_rp);
  const mutual = pct(baseAfp, tasaMutual);
  const aportes: Linea[] = [
    { concepto: `Seguro de cesantía empleador (${t.tipo_contrato === "indefinido" ? p.afc_indefinido_emp : p.afc_plazo_emp}%)`, monto: afcEmp },
    { concepto: `SIS (${p.sis}%)`, monto: sis },
    { concepto: `Capitalización individual, Ley 21.735 (${p.aporte_ci}%)`, monto: ci },
    { concepto: `Seguro Social · expectativa de vida (${p.aporte_ev}%)`, monto: ev },
    { concepto: `Seguro Social · rentabilidad protegida (${p.aporte_rp}%)`, monto: rp },
    { concepto: `Mutual o ISL, Ley 16.744 (${tasaMutual}%)`, monto: mutual },
  ].filter((l) => l.monto > 0 || l.concepto.startsWith("Mutual"));
  const totalHab = totalImp + noImp.reduce((s, l) => s + l.monto, 0);
  const totalDesc = descuentos.reduce((s, l) => s + l.monto, 0);
  if (totalHab - totalDesc < 0) adv.push("Los descuentos superan los haberes: revisa anticipos y otros descuentos.");
  const montos: Montos = {
    sueldo, horas_extra: extra, bonos: r(Math.max(0, n.bonos_imponibles)), gratificacion: grat,
    colacion: noImp.find((l) => l.concepto === "Colación")?.monto ?? 0, movilizacion: noImp.find((l) => l.concepto === "Movilización")?.monto ?? 0,
    base_afp: baseAfp, base_afc: baseAfc, afp, salud_legal: saludLegal, salud_adicional: salud - saludLegal, afc_trab: afcTrab, impuesto,
    apv_a: apvA, apv_b: apvB,
    asig_familiar: af, af_tramo: t.tramo_af ?? "D", af_simples: t.cargas_simples ?? 0, af_maternales: t.cargas_maternales ?? 0,
    af_invalidez: t.cargas_invalidez ?? 0, dias_licencia: diasLic, rima,
    anticipos: r(Math.max(0, n.anticipos)), otros: r(Math.max(0, n.otros_descuentos)), afc_emp: afcEmp, sis, aporte_ci: ci, aporte_ev: ev, aporte_rp: rp, mutual,
  };
  return {
    montos,
    haberes_imponibles: imponibles, haberes_no_imponibles: noImp, descuentos, aportes_empleador: aportes,
    total_imponible: totalImp, base_tributable: baseTrib, total_haberes: totalHab, total_descuentos: totalDesc,
    // La asignación familiar no es costo de la empresa: la recupera al pagar las cotizaciones.
    liquido: totalHab - totalDesc, costo_empresa: totalHab - af + aportes.reduce((s, l) => s + l.monto, 0), advertencias: adv,
  };
}

// ---------- Utilidades compartidas (página, acciones y pruebas) ----------
export const MOTOR_REM = "rem-2026-11c";
export const AFPS = ["Capital", "Cuprum", "Habitat", "Modelo", "PlanVital", "Provida", "Uno"] as const;
export const MUTUALES = ["ACHS", "IST", "Mutual de Seguridad", "ISL"] as const;
export const CONTRATOS: Record<Trabajador["tipo_contrato"], string> = { indefinido: "Indefinido", plazo_fijo: "Plazo fijo", obra: "Obra o faena" };
export const CLAVES_PARAMETROS: { k: Exclude<keyof Parametros, "afp" | "ccaf_salud">; etiqueta: string; unidad: "$" | "UF" | "%" }[] = [
  { k: "uf", etiqueta: "UF del último día del mes", unidad: "$" },
  { k: "utm", etiqueta: "UTM del mes", unidad: "$" },
  { k: "imm", etiqueta: "Ingreso mínimo mensual", unidad: "$" },
  { k: "tope_afp_uf", etiqueta: "Tope imponible AFP, salud y accidentes", unidad: "UF" },
  { k: "tope_afc_uf", etiqueta: "Tope imponible seguro de cesantía", unidad: "UF" },
  { k: "salud_legal", etiqueta: "Cotización legal de salud", unidad: "%" },
  { k: "sis", etiqueta: "SIS · cargo del empleador (campo 29)", unidad: "%" },
  { k: "aporte_ci", etiqueta: "Ley 21.735 · capitalización individual", unidad: "%" },
  { k: "aporte_ev", etiqueta: "Ley 21.735 · expectativa de vida (campo 94)", unidad: "%" },
  { k: "aporte_rp", etiqueta: "Ley 21.735 · rentabilidad protegida (campo 95)", unidad: "%" },
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
  const ccaf = o.ccaf_salud;
  if (ccaf !== undefined && ccaf !== null && (typeof ccaf !== "number" || ccaf < 0 || ccaf > 7)) return null;
  const af: Partial<Pick<Parametros, "af_a" | "af_b" | "af_c">> = {};
  for (const k of ["af_a", "af_b", "af_c"] as const) {
    const x = o[k];
    if (x === undefined || x === null) continue;
    if (typeof x !== "number" || !Number.isFinite(x) || x < 0 || x > 200000) return null;
    af[k] = x;
  }
  return { ...(out as Omit<Parametros, "afp">), afp: tasas, ...(typeof ccaf === "number" ? { ccaf_salud: ccaf } : {}), ...af };
}

const FECHA = /^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export function leerNovedades(o: Partial<Record<keyof Novedades, unknown>>): Novedades | null {
  const num = (x: unknown, max: number) => { const n = Number(x ?? 0); return Number.isFinite(n) && n >= 0 && n <= max ? n : NaN; };
  const n: Novedades = {
    dias_trabajados: num(o.dias_trabajados ?? 30, 30), horas_extra: num(o.horas_extra, 200), bonos_imponibles: num(o.bonos_imponibles, 50_000_000),
    anticipos: num(o.anticipos, 50_000_000), otros_descuentos: num(o.otros_descuentos, 50_000_000),
  };
  if (Object.values(n).some((x) => Number.isNaN(x))) return null;
  const dl = num(o.dias_licencia, 30);
  if (Number.isNaN(dl) || !Number.isInteger(dl) || n.dias_trabajados + dl > 30) return null;
  if (dl > 0) {
    const lic = o.licencia as Partial<Licencia> | null | undefined;
    const rima = num(o.rima, 50_000_000);
    if (!lic || !["comun", "laboral"].includes(String(lic.tipo)) || !FECHA.test(String(lic.desde)) || !FECHA.test(String(lic.hasta))
        || String(lic.hasta) < String(lic.desde) || Number.isNaN(rima)) return null;
    return { ...n, dias_licencia: dl, rima: Math.round(rima), licencia: { tipo: lic.tipo as Licencia["tipo"], desde: String(lic.desde), hasta: String(lic.hasta) } };
  }
  return n;
}
// Mes (AAAA-MM) anterior al inicio de la licencia: de ahí sale la RIMA.
export function mesAnterior(fecha: string): string {
  const y = Number(fecha.slice(0, 4)), m = Number(fecha.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
