// Archivos de remuneraciones (0074): nómina de Previred (formato estándar de largo variable por separador,
// 105 campos, versión 101 de noviembre de 2026) y Libro de Remuneraciones Electrónico de la Dirección del Trabajo
// (carga masiva CSV separada por «;», códigos del Suplemento LRE). Funciones puras: reciben las liquidaciones
// APROBADAS y devuelven el texto, o la lista de datos que faltan. Nunca se genera un archivo incompleto.
import type { Montos } from "@/lib/remuneraciones";

// ---------- Tablas de códigos (Previred tablas 10, 16, 18 y 19; Suplemento LRE 1107, 1104, 1141, 1143, 1152) ----------
export const AFP_CODIGOS: Record<string, { previred: string; lre: number }> = {
  Capital: { previred: "33", lre: 31 }, Cuprum: { previred: "03", lre: 13 }, Habitat: { previred: "05", lre: 14 }, Modelo: { previred: "34", lre: 103 },
  PlanVital: { previred: "29", lre: 11 }, Provida: { previred: "08", lre: 6 }, Uno: { previred: "35", lre: 19 },
};
export const ISAPRES: Record<string, { previred: string; lre: number }> = {
  "Banmédica": { previred: "01", lre: 3 }, Consalud: { previred: "02", lre: 9 }, "Vida Tres": { previred: "03", lre: 12 },
  Colmena: { previred: "04", lre: 4 }, "Cruz Blanca": { previred: "05", lre: 1 }, "Nueva Masvida": { previred: "10", lre: 43 },
  "Isapre Banco Estado": { previred: "12", lre: 40 }, "Cruz del Norte": { previred: "25", lre: 38 },
};
export const FONASA = { previred: "07", lre: 102 };
export const MUTUAL_CODIGOS: Record<string, { previred: string; lre: number }> = {
  ACHS: { previred: "01", lre: 1 }, "Mutual de Seguridad": { previred: "02", lre: 2 }, IST: { previred: "03", lre: 3 }, ISL: { previred: "00", lre: 0 },
};
export const CCAFS: Record<number, string> = { 0: "Sin caja de compensación", 1: "Los Andes", 2: "La Araucana", 3: "Los Héroes", 4: "18 de Septiembre" };
export const JORNADAS_LRE: Record<number, string> = {
  101: "Ordinaria (art. 22)", 201: "Parcial (art. 40 bis)", 401: "Especial (art. 38 inciso 5)", 402: "Especial (art. 23)", 406: "Especial (art. 25)",
  501: "Bisemanal (art. 149 inciso 2)", 601: "Excepcional (art. 38 inciso final)", 701: "Exenta (art. 22 inciso 2)",
};
export const CAUSALES: Record<number, string> = {
  3: "Art. 159 N°1: mutuo acuerdo", 4: "Art. 159 N°2: renuncia", 5: "Art. 159 N°3: muerte del trabajador", 6: "Art. 159 N°4: vencimiento del plazo",
  7: "Art. 159 N°5: conclusión del trabajo o servicio", 8: "Art. 159 N°6: caso fortuito o fuerza mayor",
  24: "Art. 160 N°1 a): falta de probidad", 25: "Art. 160 N°1 b): acoso sexual", 26: "Art. 160 N°1 c): vías de hecho", 27: "Art. 160 N°1 d): injurias",
  28: "Art. 160 N°1 e): conducta inmoral", 29: "Art. 160 N°1 f): acoso laboral", 11: "Art. 160 N°2: negociaciones prohibidas",
  12: "Art. 160 N°3: no concurrencia a las labores", 13: "Art. 160 N°4: abandono del trabajo", 14: "Art. 160 N°5: actos u omisiones temerarias",
  15: "Art. 160 N°6: perjuicio material intencional", 16: "Art. 160 N°7: incumplimiento grave", 18: "Art. 161 inc. 1: necesidades de la empresa",
  19: "Art. 161 inc. 2: desahucio del empleador", 20: "Art. 163 bis: liquidación concursal",
};

export type FichaArchivo = {
  rut: string; apellido_paterno: string | null; apellido_materno: string | null; nombres: string | null; sexo: "M" | "F" | null;
  extranjero: boolean; fecha_ingreso: string; fecha_baja: string | null; causal_termino: number | null; tipo_contrato: "indefinido" | "plazo_fijo" | "obra";
  jornada_horas: number; jornada_lre: number | null; afp: string; salud: "fonasa" | "isapre"; isapre: string | null; fun: string | null;
  plan_isapre_uf: number | null; comuna: number | null; nombre: string;
};
export type EmpresaArchivo = { mutual: string; tasa_mutual: number; mutual_sucursal: number | null; ccaf: number };
export type FilaArchivo = { ficha: FichaArchivo; dias: number; montos: Montos | null; ccaf_salud?: number | null };

// Jornada parcial (art. 40 bis): hasta dos tercios de la jornada ordinaria máxima legal del período
// (44 h hasta el 25-04-2026; 42 h desde el 26-04-2026; 40 h desde el 26-04-2028, Ley 21.561).
export function jornadaMaxima(periodo: string): number {
  if (periodo >= "2028-05") return 40;
  if (periodo >= "2026-05") return 42;
  return 44;
}
export const esParcial = (horas: number, periodo: string) => horas <= (jornadaMaxima(periodo) * 2) / 3;

const enPeriodo = (fecha: string | null, periodo: string) => !!fecha && fecha.slice(0, 7) === periodo;
const ddmmaaaa = (f: string, sep: "-" | "/") => `${f.slice(8, 10)}${sep}${f.slice(5, 7)}${sep}${f.slice(0, 4)}`;
const limpio = (s: string | null | undefined, max: number) => String(s ?? "").replace(/[;\r\n]/g, " ").trim().slice(0, max);
const coma = (n: number) => String(Math.round(n * 10000) / 10000).replace(".", ",");

// Datos que faltan para poder generar los archivos (por trabajador o por empresa).
export function faltantesArchivo(f: FilaArchivo, e: EmpresaArchivo | null): string[] {
  const x: string[] = [];
  const t = f.ficha;
  if (!f.montos) x.push("recalcular la liquidación (es de una versión anterior del motor)");
  if (!t.apellido_paterno) x.push("apellido paterno");
  if (!t.nombres) x.push("nombres");
  if (!t.sexo) x.push("sexo");
  if (!t.comuna) x.push("comuna donde presta servicios");
  if (!t.jornada_lre) x.push("tipo de jornada (LRE)");
  if (!AFP_CODIGOS[t.afp]) x.push("AFP");
  if (t.salud === "isapre" && (!t.isapre || !ISAPRES[t.isapre])) x.push("isapre (elige de la lista)");
  if (t.salud === "isapre" && !t.fun) x.push("número de FUN de la isapre");
  if (t.fecha_baja && !t.causal_termino) x.push("causal de término");
  if (!e) x.push("mutual de la empresa");
  else if (e.mutual !== "ISL" && !e.mutual_sucursal) x.push("código de sucursal de la mutual (empresa)");
  if (e && e.ccaf > 0 && t.salud === "fonasa" && typeof f.ccaf_salud !== "number") x.push("porcentaje del 7% que va a la CCAF (parámetros del mes)");
  return x;
}

// ---------- Previred: una línea principal (tipo 00) por trabajador ----------
export function lineaPrevired(f: FilaArchivo, e: EmpresaArchivo, periodo: string): string {
  const t = f.ficha;
  const m = f.montos!;
  const [rut, dv] = t.rut.split("-");
  const mmaaaa = `${periodo.slice(5, 7)}${periodo.slice(0, 4)}`;
  // Movimiento de personal: retiro (2) tiene prioridad; si no, contratación del mes (1 indefinido, 7 plazo fijo u obra).
  let mov = "0", desde = "", hasta = "";
  if (enPeriodo(t.fecha_baja, periodo)) { mov = "2"; hasta = ddmmaaaa(t.fecha_baja!, "-"); }
  else if (enPeriodo(t.fecha_ingreso, periodo)) { mov = t.tipo_contrato === "indefinido" ? "1" : "7"; desde = ddmmaaaa(t.fecha_ingreso, "-"); }
  const fonasa = t.salud === "fonasa";
  const ccafSalud = e.ccaf > 0 && fonasa ? Math.round((m.base_afp * (f.ccaf_salud ?? 0)) / 100) : 0;
  const isl = e.mutual === "ISL";
  const base64 = fonasa || isl ? m.base_afp : 0;
  const c: (string | number)[] = new Array(106).fill(0);
  const set = (n: number, v: string | number) => { c[n] = v; };
  set(1, Number(rut)); set(2, dv); set(3, limpio(t.apellido_paterno, 30)); set(4, limpio(t.apellido_materno, 30)); set(5, limpio(t.nombres, 30));
  set(6, t.sexo ?? ""); set(7, t.extranjero ? 1 : 0); set(8, "01"); set(9, mmaaaa); set(10, 0); set(11, "AFP"); set(12, 0); set(13, f.dias);
  set(14, "00"); set(15, mov); set(16, desde); set(17, hasta); set(18, "D"); set(25, "");
  // AFP: el 0,1% de capitalización individual del empleador se entera junto a la cotización obligatoria (campo 28).
  set(26, AFP_CODIGOS[t.afp].previred); set(27, m.base_afp); set(28, m.afp + m.aporte_ci); set(29, m.sis);
  set(37, ""); set(38, "00,00"); set(41, ""); set(46, ""); set(51, ""); set(52, ""); set(53, ""); set(54, ""); set(56, ""); set(57, "");
  set(32, "00,00"); set(35, ""); set(36, "");
  set(62, "0000"); set(63, "00,00"); set(64, base64); set(67, "0000"); set(68, "00,00");
  set(70, fonasa ? m.salud_legal - ccafSalud : 0); set(71, isl ? m.mutual : 0);
  if (fonasa) { set(75, FONASA.previred); set(76, ""); set(78, 1); }
  else {
    set(75, ISAPRES[t.isapre!].previred); set(76, limpio(t.fun, 16)); set(77, m.base_afp); set(78, 2); set(79, coma(t.plan_isapre_uf ?? 0));
    set(80, m.salud_legal); set(81, m.salud_adicional);
  }
  set(83, e.ccaf > 0 ? String(e.ccaf).padStart(2, "0") : "00"); set(84, e.ccaf > 0 ? m.base_afp : 0); set(90, ccafSalud);
  set(93, esParcial(t.jornada_horas, periodo) ? 2 : 1); set(94, m.aporte_ev); set(95, m.aporte_rp);
  set(96, MUTUAL_CODIGOS[e.mutual].previred); set(97, isl ? 0 : m.base_afp); set(98, isl ? 0 : m.mutual); set(99, isl ? 0 : e.mutual_sucursal ?? 0);
  set(100, m.base_afc); set(101, m.afc_trab); set(102, m.afc_emp); set(104, ""); set(105, "");
  return c.slice(1).join(";");
}

// ---------- Libro de Remuneraciones Electrónico ----------
const COLUMNAS: [number, string][] = [
  [1101, "Rut Trabajador"], [1102, "Fecha Inicio Contrato"], [1103, "Fecha Término de Contrato"], [1104, "Causal Término de Contrato"],
  [1105, "Región Prestación de Servicios"], [1106, "Comuna Prestación de Servicios"], [1107, "Código Tipo de Jornada"],
  [1108, "Persona con Discapacidad - Pensionado por Invalidez"], [1109, "Pensionado por Vejez"], [1110, "CCAF"],
  [1111, "Nro Cargas Familiares Legales Autorizadas"], [1112, "Nro de Cargas Familiares Maternales"], [1113, "Nro de Cargas Familiares Invalidez"],
  [1114, "Tramo Asignación Familiar"], [1115, "Nro Días Trabajados en el Mes"], [1116, "Nro Días de Licencia Médica en el Mes"],
  [1117, "Nro Días de Vacaciones en el Mes"], [1118, "Subsidio Trabajador Joven"], [1131, "Indemnización a todo Evento"],
  [1132, "Tasa Indemnización a todo Evento"], [1141, "AFP"], [1142, "IPS (ExINP)"], [1143, "FONASA - ISAPRE"],
  [1146, "Técnico Extranjero Exención Cot. Previsionales"], [1151, "AFC"], [1152, "Org. Administrador Ley 16.744"], [1154, "Puesto Trabajo Pesado"],
  [1155, "Ahorro Previsional Voluntario APV APVI"], [1157, "APVC"], [1170, "Tipo Impuesto a la Renta"],
  ...Array.from({ length: 10 }, (_, i) => [1171 + i, `Rut Org. Sindical ${i + 1}`] as [number, string]),
  [2101, "Sueldo"], [2102, "Sobresueldo"], [2103, "Comisiones"], [2104, "Semana Corrida"], [2105, "Participación"], [2106, "Gratificación"],
  [2107, "Recargo 30% Día Domingo"], [2108, "Remun. Variable Pagada en Vacaciones"], [2109, "Remun. Variable Pagada en Clausura"], [2110, "Aguinaldo"],
  [2111, "Bonos u Otras Remun. Fijas Mensuales"], [2112, "Tratos"], [2113, "Bonos u Otras Remun. Variables Mensuales o Superiores a un Mes"],
  [2114, "Ejercicio Opción no Pactada en Contrato"], [2115, "Beneficios en Especie Constitutivos de Remun"], [2116, "Remuneraciones Bimestrales"],
  [2117, "Remuneraciones Trimestrales"], [2118, "Remuneraciones Cuatrimestral"], [2119, "Remuneraciones Semestrales"], [2120, "Remuneraciones Anuales"],
  [2121, "Participación Anual"], [2122, "Gratificación Anual"], [2123, "Otras Remuneraciones Superiores a un Mes"], [2124, "Pago por Horas de Trabajo Sindical"],
  [2161, "Sueldo empresarial "],
  [2201, "Subsidio por Incapacidad Laboral por Licencia Médica"], [2202, "Beca de Estudio"], [2203, "Gratificaciones de Zona"],
  [2204, "Otros Ingresos no Constitutivos de Renta"],
  [2301, "Colación"], [2302, "Movilización"], [2303, "Viáticos"], [2304, "Asignación de Perdida de Caja"], [2305, "Asignación de Desgaste Herramienta"],
  [2306, "Gastos por Causa del Trabajo"], [2307, "Gastos por Cambio de Residencia"], [2308, "Sala Cuna"], [2309, "Asignacion Trabajo a Distancia o Teletrabajo"],
  [2310, "Alojamiento por Razones de Trabajo"], [2311, "Asignacion Familiar Legal"], [2312, "Asignacion de Traslacion"], [2313, "Indemnización por Feriado Legal"],
  [2314, "Indemnización Años de Servicio"], [2315, "Indemnización Sustitutiva del Aviso Previo"], [2316, "Indemnización Fuero Maternal"],
  [2331, "Pago Indemnización a Todo Evento"], [2347, "Depósito Convenido Hasta UF 900"],
  [2417, "Indemnizaciónes Voluntarias Tributables"], [2418, "Indemnizaciónes Contractuales Tributables"],
  [3110, "Crédito Social CCAF"], [3141, "Cotización Obligatoria Previsional (AFP o IPS)"], [3143, "Cotización Obligatoria Salud 7%"],
  [3144, "Cotización Voluntaria para Salud"], [3146, "Cotizaciónes Tecnico Extranjero para Seguridad Social Fuera de Chile"],
  [3147, "Descuento Depósito Convenido Hasta UF 900 Anual"], [3151, "Cotización AFC - Trabajador"], [3154, "Cotización Adicional Trabajo Pesado - Trabajador"],
  [3155, "Cotización APVi Mod A"], [3156, "Cotización APVi Mod B Hasta UF50"], [3157, "Cotización APVc Mod A"], [3158, "Cotización APVc Mod B Hasta UF50"],
  [3161, "Impuesto Retenido por Remuneraciones"], [3162, "Impuesto Retenido por Indemnizaciónes"], [3163, "Mayor Retencion de Impuestos Solicitada por el Trabajador"],
  [3164, "Impuesto Retenido por Reliquidación Remun. Devengadas otros Períodos"], [3165, "Diferencia Impuesto Reliquidación Remun. Devengadas en este Período"],
  [3166, "Retención préstamo clase media 2020"], [3167, "Rebaja zona extrema DL 889"],
  ...Array.from({ length: 10 }, (_, i) => [3171 + i, `Cuota Sindical ${i + 1}`] as [number, string]),
  [3181, "Cuota Vivienda o Educación"], [3182, "Crédito Cooperativas de Ahorro"], [3183, "Otros Descuentos Autorizados y Solicitados por el Trabajador"],
  [3184, "Donaciones Culturales y de Reconstrucción"], [3185, "Otros Descuentos"], [3186, "Pensiones de Alimentos"], [3187, "Descuento Mujer Casada"],
  [3188, "Descuentos por Anticipos y Préstamos"],
  [4131, "Aporte Empleador Indemnización a Todo Evento"], [4151, "AFC - Aporte Empleador"], [4152, "Aporte Empleador Seguro Accidentes del Trabajo y Ley SANNA"],
  [4154, "Aporte Adicional Trabajo Pesado - Empleador"], [4155, "Aporte Empleador Seguro Invalidez y Sobrevivencia"], [4157, "APVC - Aporte Empleador"],
  [5201, "Total Haberes"], [5210, "Total Haberes Imponibles y Tributables"], [5220, "Total Haberes Imponibles no Tributables"],
  [5230, "Total Haberes no Imponibles y no Tributables"], [5240, "Total Haberes no Imponibles y Tributables"], [5301, "Total Descuentos"],
  [5302, "Total Otros Descuentos"], [5341, "Total Descuentos por Cotizaciónes del Trabajador"], [5361, "Total Descuentos Impuestos a las Remuneraciones"],
  [5362, "Total Descuentos Impuestos por Indemnizaciónes"], [5410, "Total Aportes Empleador"], [5501, "Total Liquido"], [5502, "Total Indemnizaciónes"],
  [5564, "Total Indemnizaciónes Tributables"], [5565, "Total Indemnizaciónes no Tributables"],
];
// Campos de identificación que van vacíos cuando no aplican (el resto de los numéricos va en 0).
const VACIOS = new Set([1103, 1104, 1132, 1154, ...Array.from({ length: 10 }, (_, i) => 1171 + i)]);

export const encabezadoLre = () => COLUMNAS.map(([cod, nombre]) => `${nombre}(${cod})`).join(";");

export function filaLre(f: FilaArchivo, e: EmpresaArchivo, periodo: string): string {
  const t = f.ficha;
  const m = f.montos!;
  const v = new Map<number, string | number>();
  const termina = enPeriodo(t.fecha_baja, periodo);
  v.set(1101, t.rut); v.set(1102, ddmmaaaa(t.fecha_ingreso, "/"));
  if (termina) { v.set(1103, ddmmaaaa(t.fecha_baja!, "/")); v.set(1104, t.causal_termino ?? ""); }
  v.set(1105, Math.floor((t.comuna ?? 0) / 1000)); v.set(1106, t.comuna ?? 0); v.set(1107, t.jornada_lre ?? 101);
  v.set(1110, e.ccaf); v.set(1114, "D"); v.set(1115, f.dias);
  v.set(1141, AFP_CODIGOS[t.afp].lre); v.set(1143, t.salud === "fonasa" ? FONASA.lre : ISAPRES[t.isapre!].lre);
  v.set(1151, 1); v.set(1152, MUTUAL_CODIGOS[e.mutual].lre); v.set(1170, 1);
  v.set(2101, m.sueldo); v.set(2102, m.horas_extra); v.set(2106, m.gratificacion); v.set(2113, m.bonos);
  v.set(2301, m.colacion); v.set(2302, m.movilizacion);
  v.set(3141, m.afp); v.set(3143, m.salud_legal); v.set(3144, m.salud_adicional); v.set(3151, m.afc_trab); v.set(3161, m.impuesto);
  v.set(3185, m.otros); v.set(3188, m.anticipos);
  // El Suplemento LRE aún no tiene códigos propios para los aportes de la Ley 21.735: se informan en 4155, como lo hace el mercado.
  v.set(4151, m.afc_emp); v.set(4152, m.mutual); v.set(4155, m.sis + m.aporte_ci + m.aporte_ev + m.aporte_rp);
  const imp = m.sueldo + m.horas_extra + m.gratificacion + m.bonos;
  const noImp = m.colacion + m.movilizacion;
  const cotiz = m.afp + m.salud_legal + m.salud_adicional + m.afc_trab;
  const desc = cotiz + m.impuesto + m.otros + m.anticipos;
  v.set(5201, imp + noImp); v.set(5210, imp); v.set(5230, noImp); v.set(5301, desc); v.set(5341, cotiz); v.set(5361, m.impuesto);
  v.set(5302, desc - cotiz - m.impuesto);
  v.set(5410, m.afc_emp + m.mutual + m.sis + m.aporte_ci + m.aporte_ev + m.aporte_rp); v.set(5501, imp + noImp - desc);
  return COLUMNAS.map(([cod]) => (v.has(cod) ? v.get(cod) : VACIOS.has(cod) ? "" : 0)).join(";");
}

export function archivoLre(filas: FilaArchivo[], e: EmpresaArchivo, periodo: string): string {
  return [encabezadoLre(), ...filas.map((f) => filaLre(f, e, periodo))].join("\r\n") + "\r\n";
}
export function archivoPrevired(filas: FilaArchivo[], e: EmpresaArchivo, periodo: string): string {
  return filas.map((f) => lineaPrevired(f, e, periodo)).join("\r\n") + "\r\n";
}
