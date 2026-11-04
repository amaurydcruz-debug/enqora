// Resultado de la última investigación del bot CORA para un RUT (RPC research_public_findings).
// Lo consume el orquestador: son hechos de portales oficiales con fecha y URL.
export type HallazgoWeb = {
  portal: string;
  estado: "encontrado" | "sin_resultados" | "bloqueado" | "procedimiento_fallo" | "error";
  consultado: string;
  url: string;
  detalle: string | null;
  version: string;
  coincidencias?: number | null;
  tabla?: { headers: string[]; rows: string[][] } | null;
};

export const PORTAL_NOMBRE: Record<string, string> = {
  inapi: "INAPI · Buscador de marcas",
  res: "Registro de Empresas y Sociedades",
  diario_oficial: "Diario Oficial",
  mercado_publico: "ChileCompra · Mercado Público",
};

export function sanearHallazgos(raw: unknown): HallazgoWeb[] {
  if (!Array.isArray(raw)) return [];
  const ESTADOS = ["encontrado", "sin_resultados", "bloqueado", "procedimiento_fallo", "error"];
  return (raw as Record<string, unknown>[]).filter((x) => x && typeof x.portal === "string" && ESTADOS.includes(String(x.estado))).map((x) => ({
    portal: String(x.portal), estado: x.estado as HallazgoWeb["estado"], consultado: String(x.consultado ?? ""), url: String(x.url ?? ""),
    detalle: typeof x.detalle === "string" ? x.detalle : null, version: String(x.version ?? ""),
    coincidencias: typeof x.coincidencias === "number" ? x.coincidencias : null,
    tabla: x.tabla && typeof x.tabla === "object" ? (x.tabla as HallazgoWeb["tabla"]) : null,
  }));
}

// Fila legible: «encabezado: valor · …» (máximo 5 columnas).
export const filaLegible = (headers: string[], row: string[]) =>
  row.slice(0, 5).map((c, i) => (headers[i] ? `${headers[i]}: ${c}` : c)).filter((x) => x.trim()).join(" · ");
