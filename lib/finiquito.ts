// Finiquito (0082). Motor puro: calcula la PROPUESTA de finiquito con los datos que entrega la empresa.
// Nada llega al trabajador como definitivo sin la revisión de una persona del equipo ENQORA (contador o abogado).
// Fuentes: Código del Trabajo arts. 67, 69, 73 (feriado proporcional, sábado siempre inhábil), 161, 162, 163, 163 bis,
// 172 (base y tope de 90 UF), 177 (plazo de 10 días hábiles) y 178 (las indemnizaciones legales no son renta);
// Ley 19.728 art. 13 (imputación del aporte del empleador a la cuenta individual de cesantía); dictámenes DT
// 799/67 y 3343/49 (los días hábiles se proyectan en el calendario desde el día siguiente al término, sumando
// sábados, domingos y festivos; la fracción final se imputa al hábil siguiente).

export const MOTOR_FINIQUITO = "finiquito-2026-11";

// Causales (códigos del LRE) que dan derecho a indemnización por años de servicio y a la sustitutiva del aviso previo.
export const CAUSALES_IAS = new Set([18, 19, 20]); // art. 161 inc. 1 y 2; art. 163 bis
export const CAUSALES_AFC = new Set([18, 19]); // la imputación del seguro de cesantía solo procede en el art. 161

export type DatosFiniquito = {
  fecha_ingreso: string; fecha_termino: string; causal: number;
  base_indemnizacion: number;     // última remuneración mensual (art. 172): sin horas extra, asignación familiar ni pagos esporádicos
  base_feriado: number;           // remuneración íntegra mensual para el feriado (art. 71)
  aviso_dado: boolean;            // se avisó con 30 días de anticipación (art. 161)
  feriado_anual: number;          // días hábiles al año: 15, o más con feriado progresivo
  dias_pendientes: number;        // días hábiles de períodos ya cumplidos y no tomados
  uf: number;                     // UF del último día del mes anterior al pago (tope de 90 UF)
  aporte_afc: number;             // aporte del empleador a la cuenta individual, según el certificado de la AFC
  otros_haberes: number; otros_descuentos: number; detalle_otros: string;
};
export type LineaFiniquito = { concepto: string; monto: number; codigo_lre?: number; nota?: string };
export type ResultadoFiniquito = {
  antiguedad: { anos: number; meses: number; dias: number };
  anos_indemnizados: number; base_tope: number; tope_aplicado: boolean;
  dias_habiles: number; dias_corridos: number;
  ias: number; imputacion_afc: number; aviso: number; feriado: number;
  haberes: LineaFiniquito[]; descuentos: LineaFiniquito[]; total: number;
  plazo_pago: string; advertencias: string[]; motor: string;
};

const r = Math.round;
const d2 = (n: number) => Math.round(n * 100) / 100;
const FECHA = /^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const aFecha = (s: string) => new Date(`${s}T00:00:00Z`);
const masDias = (s: string, n: number) => { const d = aFecha(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
// Suma meses sin desbordar (31-01 + 1 mes = 28/29-02).
function masMeses(s: string, n: number): string {
  const d = aFecha(s);
  const dia = d.getUTCDate();
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const ultimo = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  x.setUTCDate(Math.min(dia, ultimo));
  return iso(x);
}
const diasEntre = (a: string, b: string) => r((aFecha(b).getTime() - aFecha(a).getTime()) / 86400000);

// Tiempo servido desde el ingreso hasta el término, ambos inclusive.
export function antiguedad(ingreso: string, termino: string): { anos: number; meses: number; dias: number } {
  const fin = masDias(termino, 1);
  let meses = 0;
  while (masMeses(ingreso, meses + 1) <= fin) meses++;
  return { anos: Math.floor(meses / 12), meses: meses % 12, dias: diasEntre(masMeses(ingreso, meses), fin) };
}

// Años indemnizables: cada año y fracción superior a seis meses, con tope de 11 (art. 163). Requiere un año de servicio.
export function anosIndemnizacion(a: { anos: number; meses: number; dias: number }): number {
  if (a.anos < 1) return 0;
  const extra = a.meses > 6 || (a.meses === 6 && a.dias > 0) ? 1 : 0;
  return Math.min(11, a.anos + extra);
}

// Días hábiles de feriado proporcional desde el último aniversario: (feriado anual / 12) por mes y /30 por día.
export function feriadoProporcional(ingreso: string, termino: string, feriadoAnual: number): number {
  const a = antiguedad(ingreso, termino);
  const porMes = feriadoAnual / 12;
  return a.meses * porMes + (a.dias * porMes) / 30;
}

// Proyecta los días hábiles en el calendario desde el día siguiente al término: sábados, domingos y festivos se suman
// completos y la fracción final se imputa al hábil en que cae. Devuelve los días corridos a pagar.
export function diasCorridos(termino: string, habiles: number, festivos: ReadonlySet<string>): number {
  let quedan = habiles;
  let corridos = 0;
  let dia = termino;
  for (let i = 0; quedan > 1e-9 && i < 2000; i++) {
    dia = masDias(dia, 1);
    const dow = aFecha(dia).getUTCDay();
    if (dow === 0 || dow === 6 || festivos.has(dia)) { corridos += 1; continue; }
    const toma = Math.min(1, quedan);
    corridos += toma;
    quedan -= toma;
  }
  return corridos;
}

// Plazo del art. 177: 10 días hábiles desde la separación. Referencial: cuenta de lunes a sábado sin festivos.
export function plazoPago(termino: string, festivos: ReadonlySet<string>): string {
  let dia = termino;
  let n = 0;
  while (n < 10) {
    dia = masDias(dia, 1);
    if (aFecha(dia).getUTCDay() !== 0 && !festivos.has(dia)) n++;
  }
  return dia;
}

export function validarDatosFiniquito(x: Partial<Record<keyof DatosFiniquito, unknown>>): DatosFiniquito | string {
  const n = (v: unknown, max: number) => { const k = Number(v ?? 0); return Number.isFinite(k) && k >= 0 && k <= max ? k : NaN; };
  const d: DatosFiniquito = {
    fecha_ingreso: String(x.fecha_ingreso ?? ""), fecha_termino: String(x.fecha_termino ?? ""), causal: Math.trunc(Number(x.causal)),
    base_indemnizacion: r(n(x.base_indemnizacion, 100_000_000)), base_feriado: r(n(x.base_feriado, 100_000_000)),
    aviso_dado: x.aviso_dado === true || x.aviso_dado === "si", feriado_anual: n(x.feriado_anual ?? 15, 35),
    dias_pendientes: n(x.dias_pendientes, 60), uf: n(x.uf, 1_000_000), aporte_afc: r(n(x.aporte_afc, 500_000_000)),
    otros_haberes: r(n(x.otros_haberes, 500_000_000)), otros_descuentos: r(n(x.otros_descuentos, 500_000_000)),
    detalle_otros: String(x.detalle_otros ?? "").replace(/[\r\n]+/g, " ").replace(/[<>]/g, "").trim().slice(0, 300),
  };
  if (!FECHA.test(d.fecha_ingreso) || !FECHA.test(d.fecha_termino) || d.fecha_termino < d.fecha_ingreso) return "Revisa las fechas de ingreso y de término.";
  if (!Number.isFinite(d.causal) || d.causal <= 0) return "Indica la causal de término.";
  if ([d.base_indemnizacion, d.base_feriado, d.feriado_anual, d.dias_pendientes, d.uf, d.aporte_afc, d.otros_haberes, d.otros_descuentos].some(Number.isNaN))
    return "Hay montos fuera de rango.";
  if (d.feriado_anual < 15) return "El feriado anual es de al menos 15 días hábiles.";
  if (d.base_feriado <= 0) return "Indica la remuneración mensual para el feriado.";
  if (CAUSALES_IAS.has(d.causal) && (d.base_indemnizacion <= 0 || d.uf < 1000)) return "Indica la última remuneración (art. 172) y el valor de la UF.";
  if ((d.otros_haberes > 0 || d.otros_descuentos > 0) && d.detalle_otros.length < 3) return "Explica a qué corresponden los otros haberes o descuentos.";
  return d;
}

export function calcularFiniquito(d: DatosFiniquito, festivos: ReadonlySet<string>): ResultadoFiniquito {
  const adv: string[] = [];
  const ant = antiguedad(d.fecha_ingreso, d.fecha_termino);
  const conIas = CAUSALES_IAS.has(d.causal);
  const tope = r(90 * d.uf);
  const base = conIas ? Math.min(d.base_indemnizacion, tope) : 0;
  const topeAplicado = conIas && d.base_indemnizacion > tope;
  if (topeAplicado) adv.push("La última remuneración supera 90 UF: las indemnizaciones se calculan con el tope.");
  const anos = conIas ? anosIndemnizacion(ant) : 0;
  if (conIas && ant.anos < 1) adv.push("Menos de un año de servicio: no corresponde indemnización por años de servicio.");
  if (conIas && ant.anos >= 11) adv.push("La indemnización por años de servicio tiene tope de 11 años (330 días).");
  const ias = base * anos;
  const imput = CAUSALES_AFC.has(d.causal) ? Math.min(d.aporte_afc, ias) : 0;
  if (d.aporte_afc > 0 && !CAUSALES_AFC.has(d.causal)) adv.push("El aporte al seguro de cesantía solo se descuenta con las causales del art. 161: no se imputó.");
  if (CAUSALES_AFC.has(d.causal) && ias > 0 && d.aporte_afc === 0) adv.push("Sin certificado de la AFC no se descuenta el aporte del empleador al seguro de cesantía (art. 13 Ley 19.728).");
  // Sustitutiva del aviso previo: art. 161 sin aviso de 30 días; en el art. 163 bis se paga siempre.
  const aviso = conIas && (d.causal === 20 || !d.aviso_dado) ? base : 0;

  const habiles = d.dias_pendientes + feriadoProporcional(d.fecha_ingreso, d.fecha_termino, d.feriado_anual);
  const corridos = diasCorridos(d.fecha_termino, habiles, festivos);
  const feriado = r((d.base_feriado / 30) * corridos);
  const ultimoFestivo = [...festivos].sort().at(-1) ?? "";
  if (habiles > 0 && masDias(d.fecha_termino, Math.ceil(corridos) + 1) > ultimoFestivo)
    adv.push("El feriado se proyecta más allá del último año de festivos cargado: el equipo debe cargar los festivos que faltan.");

  const haberes: LineaFiniquito[] = [];
  if (ias) haberes.push({ concepto: `Indemnización por años de servicio (${anos} año${anos === 1 ? "" : "s"} × $${base.toLocaleString("es-CL")})`, monto: ias, codigo_lre: 2314 });
  if (aviso) haberes.push({ concepto: "Indemnización sustitutiva del aviso previo", monto: aviso, codigo_lre: 2315 });
  if (feriado) haberes.push({ concepto: `Feriado ${d.dias_pendientes > 0 ? "pendiente y " : ""}proporcional (${d2(habiles)} días hábiles = ${d2(corridos)} días corridos)`, monto: feriado, codigo_lre: 2313 });
  if (d.otros_haberes) haberes.push({ concepto: `Otros haberes: ${d.detalle_otros}`, monto: d.otros_haberes });
  const descuentos: LineaFiniquito[] = [];
  if (imput) descuentos.push({ concepto: "Aporte del empleador a la cuenta individual del seguro de cesantía (art. 13 Ley 19.728)", monto: imput,
    nota: "El trabajador lo retira de su cuenta en la AFC." });
  if (d.otros_descuentos) descuentos.push({ concepto: `Otros descuentos: ${d.detalle_otros}`, monto: d.otros_descuentos });
  const total = haberes.reduce((s, l) => s + l.monto, 0) - descuentos.reduce((s, l) => s + l.monto, 0);
  if (total < 0) adv.push("Los descuentos superan los haberes: revisa los otros descuentos.");
  return {
    antiguedad: ant, anos_indemnizados: anos, base_tope: base, tope_aplicado: topeAplicado,
    dias_habiles: d2(habiles), dias_corridos: d2(corridos), ias, imputacion_afc: imput, aviso, feriado,
    haberes, descuentos, total, plazo_pago: plazoPago(d.fecha_termino, festivos), advertencias: adv, motor: MOTOR_FINIQUITO,
  };
}

// ---------- Texto de la propuesta (# título, ## secciones, párrafos y viñetas) ----------
export type PartesFiniquito = {
  empresa: string; rut_empresa: string; domicilio: string; trabajador: string; rut_trabajador: string; cargo: string | null; causal_texto: string;
};
const fecha = (s: string) => aFecha(s).toLocaleDateString("es-CL", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
const pesos = (n: number) => `$${n.toLocaleString("es-CL")}`;

export function textoFiniquito(p: PartesFiniquito, d: DatosFiniquito, x: ResultadoFiniquito): string {
  const l: string[] = [];
  l.push("# Finiquito de contrato de trabajo", "");
  l.push(`En ____________, a ____ de ____________ de ______, entre ${p.empresa}, RUT ${p.rut_empresa}, con domicilio en ${p.domicilio || "____________"}, representada por ____________________, en adelante «el empleador», y don(ña) ${p.trabajador}, RUT ${p.rut_trabajador}, en adelante «el trabajador», se acuerda el siguiente finiquito:`, "");
  l.push("## Primero: término del contrato");
  l.push(`El trabajador prestó servicios${p.cargo ? ` como ${p.cargo}` : ""} desde el ${fecha(d.fecha_ingreso)} hasta el ${fecha(d.fecha_termino)}, fecha en que terminó el contrato por la causal ${p.causal_texto} del Código del Trabajo.`, "");
  l.push("## Segundo: montos que se pagan");
  for (const h of x.haberes) l.push(`- ${h.concepto}: ${pesos(h.monto)}`);
  for (const h of x.descuentos) l.push(`- Menos ${h.concepto.charAt(0).toLowerCase()}${h.concepto.slice(1)}: ${pesos(h.monto)}`);
  l.push(`- Total a pagar: ${pesos(x.total)}`, "");
  l.push("Las remuneraciones del último mes trabajado se pagan en su liquidación. Las indemnizaciones legales no son remuneración ni renta (arts. 172 y 178 del Código del Trabajo).", "");
  l.push("## Tercero: cotizaciones previsionales");
  l.push("El empleador declara haber pagado las cotizaciones previsionales y de salud del trabajador hasta el último día del mes anterior al término, y adjunta los certificados de pago, conforme al artículo 162 del Código del Trabajo.", "");
  l.push("## Cuarto: forma de pago");
  l.push("La suma total se paga en este acto mediante ____________________ (transferencia, vale vista o cheque).", "");
  l.push("## Quinto: declaraciones");
  l.push("El trabajador declara recibir la suma indicada y que, salvo las reservas que deje escritas a continuación, nada se le adeuda por remuneraciones, indemnizaciones ni otro concepto derivado de la relación laboral.", "");
  l.push("Reserva de derechos del trabajador (opcional): ________________________________________________", "");
  l.push("## Sexto: ratificación");
  l.push("Este finiquito se firma y ratifica ante un ministro de fe (inspector del trabajo, notario u otro autorizado por el artículo 177 del Código del Trabajo) o en forma electrónica en el portal de la Dirección del Trabajo.", "");
  l.push("Firma del empleador: ______________________________", "");
  l.push(`Firma del trabajador (${p.rut_trabajador}): ______________________________`);
  return l.join("\n");
}
