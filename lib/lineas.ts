// Líneas de servicio de ENQORA (0064). El folio de cada caso nuevo empieza con su línea, para que el cliente
// y el equipo sepan de un vistazo qué servicio se pidió: LAB-2026-00031 es un caso laboral.
// La numeración es única y correlativa para todo ENQORA; los casos anteriores conservan su folio ENQ-….

export const LINEAS = {
  CON: "Contabilidad",
  TRI: "Impuestos y SII",
  CRE: "Constitución de empresa",
  FOR: "Formalización y patentes",
  BRA: "Marcas",
  LEG: "Legal",
  LAB: "Laboral",
  GES: "Gestión",
  CRC: "Crecimiento",
  IDE: "Idea de negocio",
  GEN: "Consulta general",
} as const;
export type Linea = keyof typeof LINEAS;

export const esLinea = (v: unknown): v is Linea => typeof v === "string" && v.toUpperCase() in LINEAS;

// Misma regla que private.linea_de_modulo / private.linea_de_categoria (0064).
const POR_MODULO: Record<string, Linea> = {
  contabilidad: "CON", create: "CRE", formaliza: "FOR", brand: "BRA", legal: "LEG", gestion: "GES", crece: "CRC", idea: "IDE",
};
const POR_CATEGORIA: Record<string, Linea> = {
  contabilidad: "CON", tributario: "TRI", constitucion: "CRE", formalizacion: "FOR", marcas: "BRA", profesionales: "LEG",
  trabajador: "LAB", empleador: "LAB", gestion: "GES", crecimiento: "CRC",
};
export const lineaDeModulo = (m: string | null | undefined): Linea => POR_MODULO[m ?? ""] ?? "GEN";
export const lineaDeCategoria = (c: string | null | undefined): Linea | null => POR_CATEGORIA[c ?? ""] ?? null;

// Línea de un folio (LAB-2026-00031 → LAB) o de un código de solicitud (SOL-LAB-7KQ2XA → LAB).
export function lineaDeFolio(folio: string | null | undefined): Linea | null {
  const m = /^(?:SOL-)?([A-Z]{3})-/.exec((folio ?? "").toUpperCase());
  return m && esLinea(m[1]) ? (m[1] as Linea) : null;
}
export const nombreLinea = (folio: string | null | undefined): string | null => {
  const l = lineaDeFolio(folio);
  return l ? LINEAS[l] : null;
};
