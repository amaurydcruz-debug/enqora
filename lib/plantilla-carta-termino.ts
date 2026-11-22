// Carta de aviso de término de contrato (art. 162 del Código del Trabajo; 0088). Plantilla carta-2026-11.
// Función pura que arma un BORRADOR; un abogado de ENQORA lo revisa y aprueba antes de que la empresa lo entregue.
// La carta informa la causal, los hechos, el monto de las indemnizaciones si corresponden y el estado de pago de las
// cotizaciones hasta el último día del mes anterior al despido, con sus comprobantes. Se entrega personalmente o por
// carta certificada al domicilio del contrato (no por correo electrónico) y se envía copia a la Inspección del Trabajo
// (en Mi DT, «Carta electrónica de aviso de despido»).
import { calcularFiniquito, habilesDespues, type DatosFiniquito } from "@/lib/finiquito";
import { CAUSALES } from "@/lib/rem-archivos";

export const PLANTILLA_CARTA_VERSION = "carta-2026-11";

// Causales que decide el empleador y exigen esta carta (códigos del LRE): art. 159 N° 4, 5 y 6; art. 160; art. 161.
// En la liquidación concursal (art. 163 bis) la comunica el liquidador, no la empresa.
export const CAUSALES_CARTA = [6, 7, 8, 24, 25, 26, 27, 28, 29, 11, 12, 13, 14, 15, 16, 18, 19] as const;
const ART161 = new Set([18, 19]);
const SEIS_DIAS = new Set([8]);

export type DatosCarta = {
  ciudad: string; fecha_carta: string; fecha_termino: string; causal: number; hechos: string;
  entrega: "personal" | "certificada"; domicilio: string; representante: string;
  base_indemnizacion: number; uf: number;
  cotizaciones: "al_dia" | "pendientes"; detalle_pendientes: string;
  fuero: boolean; licencia: boolean;
};
export type MontosCarta = { ias: number; aviso: number; anos: number; base: number; aviso_dado: boolean };

const FECHA = /^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const limpio = (v: unknown, max: number) => String(v ?? "").replace(/[\r\n]+/g, " ").replace(/[<>#]/g, "").trim().slice(0, max);
const aFecha = (s: string) => new Date(`${s}T00:00:00Z`);
const diasEntre = (a: string, b: string) => Math.round((aFecha(b).getTime() - aFecha(a).getTime()) / 86400000);
const largo = (s: string) => aFecha(s).toLocaleDateString("es-CL", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// Último mes cuyas cotizaciones deben estar pagadas: el anterior al del despido.
export function mesAnteriorDespido(fecha: string): string {
  const y = Number(fecha.slice(0, 4)), m = Number(fecha.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
const nombreMes = (p: string) => `${MESES[Number(p.slice(5, 7)) - 1]} de ${p.slice(0, 4)}`;

export function validarCarta(x: Partial<Record<keyof DatosCarta, unknown>>, ingreso: string): DatosCarta | string {
  const d: DatosCarta = {
    ciudad: limpio(x.ciudad, 60), fecha_carta: limpio(x.fecha_carta, 10), fecha_termino: limpio(x.fecha_termino, 10), causal: Math.trunc(Number(x.causal)),
    hechos: String(x.hechos ?? "").replace(/[<>#]/g, "").trim().slice(0, 3000),
    entrega: x.entrega === "certificada" ? "certificada" : "personal", domicilio: limpio(x.domicilio, 200), representante: limpio(x.representante, 120),
    base_indemnizacion: Math.round(Number(x.base_indemnizacion) || 0), uf: Number(String(x.uf ?? "").replace(/\./g, "").replace(",", ".")) || 0,
    cotizaciones: x.cotizaciones === "pendientes" ? "pendientes" : "al_dia", detalle_pendientes: limpio(x.detalle_pendientes, 500),
    fuero: x.fuero === true || x.fuero === "si", licencia: x.licencia === true || x.licencia === "si",
  };
  if (d.ciudad.length < 2 || !FECHA.test(d.fecha_carta) || d.representante.length < 5) return "Indica la ciudad, la fecha de la carta y el representante legal.";
  if (!FECHA.test(d.fecha_termino) || d.fecha_termino < ingreso) return "Revisa la fecha de término del contrato.";
  if (!(CAUSALES_CARTA as readonly number[]).includes(d.causal)) return "Elige una causal que decida el empleador (las de mutuo acuerdo, renuncia o muerte no llevan esta carta).";
  if (ART161.has(d.causal) ? d.fecha_carta > d.fecha_termino : d.fecha_carta < d.fecha_termino) {
    return ART161.has(d.causal) ? "Con el art. 161 la carta se da antes o el mismo día del término." : "Con esta causal la carta se entrega desde el día de la separación.";
  }
  if (d.causal !== 19 && d.hechos.length < 30) return "Describe los hechos concretos en que se funda el despido (qué pasó, cuándo y dónde).";
  if (d.domicilio.length < 5) return "Indica el domicilio del trabajador que figura en el contrato.";
  if (ART161.has(d.causal) && (d.base_indemnizacion <= 0 || d.uf < 1000)) return "Indica la última remuneración mensual y el valor de la UF para calcular las indemnizaciones.";
  if (d.cotizaciones === "pendientes" && d.detalle_pendientes.length < 5) return "Indica qué cotizaciones están pendientes.";
  return d;
}

// Indemnizaciones que informa la carta: años de servicio y sustitutiva del aviso previo (las del art. 161 y 163 bis).
export function montosCarta(d: DatosCarta, ingreso: string): MontosCarta {
  const avisoDado = ART161.has(d.causal) && diasEntre(d.fecha_carta, d.fecha_termino) >= 30;
  const datos: DatosFiniquito = {
    fecha_ingreso: ingreso, fecha_termino: d.fecha_termino, causal: d.causal, base_indemnizacion: d.base_indemnizacion, base_feriado: 1,
    aviso_dado: avisoDado, feriado_anual: 15, dias_pendientes: 0, uf: d.uf || 1, aporte_afc: 0, otros_haberes: 0, otros_descuentos: 0, detalle_otros: "",
  };
  const x = calcularFiniquito(datos, new Set());
  return { ias: x.ias, aviso: x.aviso, anos: x.anos_indemnizados, base: x.base_tope, aviso_dado: avisoDado };
}

// Avisos para el abogado y la empresa (no bloquean): plazos, cotizaciones, fuero, licencia y meses sin liquidación.
export function avisosCarta(d: DatosCarta, festivos: ReadonlySet<string>, mesesSinLiquidacion: string[]): string[] {
  const a: string[] = [];
  if (!ART161.has(d.causal)) {
    const n = SEIS_DIAS.has(d.causal) ? 6 : 3;
    const limite = habilesDespues(d.fecha_termino, n, festivos);
    if (d.fecha_carta > limite) a.push(`La carta debía entregarse o enviarse dentro de ${n} días hábiles desde la separación (a más tardar el ${limite.split("-").reverse().join("-")}, referencial).`);
  } else if (diasEntre(d.fecha_carta, d.fecha_termino) < 30) {
    a.push("La carta se da con menos de 30 días de anticipación: corresponde pagar la indemnización sustitutiva del aviso previo.");
  }
  if (d.cotizaciones === "pendientes") a.push("Hay cotizaciones impagas: el despido no produce efecto mientras no se paguen y la empresa debe seguir pagando remuneraciones hasta convalidarlo (art. 162 inc. 5 a 7). Págalas antes de despedir.");
  if (d.fuero) a.push("El trabajador tiene fuero: no se puede despedir sin autorización judicial previa (desafuero).");
  if (d.licencia && ART161.has(d.causal)) a.push("Con licencia médica vigente no se puede invocar el art. 161 (art. 161 inc. final).");
  if ((d.causal >= 11 && d.causal <= 16) || (d.causal >= 24 && d.causal <= 29)) a.push("Causal disciplinaria (art. 160): los hechos deben ser concretos, con fechas, y la empresa debe poder probarlos en un juicio.");
  if (mesesSinLiquidacion.length) a.push(`ENQORA no tiene liquidaciones aprobadas de: ${mesesSinLiquidacion.map(nombreMes).join(", ")}. Confirma con Previred que esas cotizaciones están pagadas.`);
  return a;
}

export type ParteCarta = { nombre: string; rut: string; cargo: string | null };
export function textoCarta(d: DatosCarta, t: ParteCarta, e: { nombre: string; rut: string; domicilio: string }, m: MontosCarta): string {
  const L: string[] = [];
  const p = (...x: string[]) => L.push(...x, "");
  p("# Carta de aviso de término de contrato de trabajo");
  p(`${d.ciudad}, ${largo(d.fecha_carta)}`);
  p(`Señor(a) ${t.nombre}`, `RUT ${t.rut}`, `${d.domicilio}`, "Presente");
  p(`De nuestra consideración: ${e.nombre}, RUT ${e.rut}, comunica a usted que ha decidido poner término a su contrato de trabajo${t.cargo ? ` como ${t.cargo}` : ""} a contar del ${largo(d.fecha_termino)}, por la causal del ${CAUSALES[d.causal] ?? d.causal} del Código del Trabajo.`);
  if (d.causal !== 19) { L.push("## Hechos en que se funda"); p(d.hechos); }
  L.push("## Indemnizaciones");
  if (ART161.has(d.causal)) {
    const l: string[] = [];
    l.push(m.ias ? `- Indemnización por años de servicio: ${pesos(m.ias)} (${m.anos} año${m.anos === 1 ? "" : "s"} × ${pesos(m.base)}).` : "- No corresponde indemnización por años de servicio (menos de un año de servicio).");
    l.push(m.aviso ? `- Indemnización sustitutiva del aviso previo: ${pesos(m.aviso)}.` : "- Este aviso se da con al menos 30 días de anticipación, por lo que no corresponde indemnización sustitutiva.");
    L.push(...l, "");
    p("Además se pagarán el feriado pendiente y proporcional y las remuneraciones que se adeuden, que se detallarán en el finiquito.");
  } else {
    p("Por la causal invocada no corresponden indemnizaciones por término de contrato. Se pagarán las remuneraciones y el feriado que se adeuden, que se detallarán en el finiquito.");
  }
  L.push("## Estado de las cotizaciones previsionales");
  const hasta = mesAnteriorDespido(d.fecha_termino);
  if (d.cotizaciones === "al_dia") p(`Sus cotizaciones previsionales se encuentran pagadas hasta el último día de ${nombreMes(hasta)}. Se adjuntan los comprobantes de pago de todo el período trabajado.`);
  else p(`Sus cotizaciones previsionales hasta el último día de ${nombreMes(hasta)} se encuentran en el siguiente estado: ${d.detalle_pendientes}.`);
  p("Copia de esta carta se envía a la Inspección del Trabajo, conforme al artículo 162 del Código del Trabajo.");
  p("Saluda atentamente,", "______________________________", `${d.representante}`, `p.p. ${e.nombre}`);
  if (d.entrega === "personal") p("Recibí copia de esta carta y de los comprobantes de cotizaciones:", "Firma del trabajador: ______________________________   Fecha: ____ / ____ / ______");
  else p(`Enviada por carta certificada al domicilio indicado en el contrato: ${d.domicilio}.`);
  return L.join("\n");
}
