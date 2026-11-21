// Marcas INAPI (0077): funciones puras para preparar las filas de los archivos de datos abiertos y normalizar nombres.
// Columnas publicadas por INAPI: ApplicationType, ApplicationSeq, ApplicationSerie, ApplicationNumber, RegistrationNumber,
// NizaClasses, …, Applicants, …, FilingDate, PublicationDate, RegistrationDate, ExpirationDate, BrandName, …, SignType,
// TypeName, SubtypeName, Status, IMAGE, LastUpdatedDate (fechas como número de serie de Excel).

// Igual que private.inapi_norm en la base de datos.
const DE = "áéíóúüñàèìòùâêîôûäëïöç";
const A = "aeiouunaeiouaeiouaeioc";
export function normalizarMarca(s: string): string {
  let out = "";
  for (const ch of String(s ?? "").toLowerCase()) {
    const i = DE.indexOf(ch);
    out += i >= 0 ? A[i] : ch;
  }
  return out.replace(/[^a-z0-9]+/g, " ").trim();
}

// Número de serie de Excel (días desde 1899-12-30) → AAAA-MM-DD.
export function fechaExcel(v: string | undefined): string | null {
  const n = Number(String(v ?? "").trim());
  if (!Number.isFinite(n) || n < 1 || n > 80000) return null;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000);
  return d.toISOString().slice(0, 10);
}

const TERMINAL = /denegad|abandon|caduc|cancelad|renunci|desist|anulad|nulidad|expirad|rechaz|vencid|no renovad|retirad|desechad|extinguid/i;

// ¿Puede esta marca impedir un registro nuevo? Registrada no vencida (o dentro de 6 meses tras vencer, período en
// que aún puede renovarse) o solicitud que sigue en trámite.
export function esVigente(estado: string, vence: string | null, hoy: Date): boolean {
  if (TERMINAL.test(estado)) return false;
  if (vence) {
    const limite = new Date(hoy.getTime() - 183 * 86400000).toISOString().slice(0, 10);
    if (vence < limite) return false;
  }
  return true;
}

export type MarcaFila = {
  clave: string; solicitud: number; registro: number | null; nombre: string; nombre_norm: string; clases: number[]; titulares: string;
  tipo_signo: string; subtipo: string; estado: string; presentada: string | null; registrada: string | null; vence: string | null;
  etiqueta: string | null; actualizado: string | null; vigente: boolean;
};

const COLS = ["ApplicationType", "ApplicationSeq", "ApplicationSerie", "ApplicationNumber", "RegistrationNumber", "NizaClasses", "Applicants",
  "FilingDate", "RegistrationDate", "ExpirationDate", "BrandName", "SignType", "SubtypeName", "Status", "IMAGE", "LastUpdatedDate"] as const;

export function prepararFilasMarcas(filas: string[][], hoy: Date): { filas: MarcaFila[] } | { error: string } {
  const idx = filas.findIndex((f) => f.some((c) => c.trim() === "ApplicationNumber") && f.some((c) => c.trim() === "BrandName"));
  if (idx < 0) return { error: `No se encontró la fila de encabezados (ApplicationNumber, BrandName). Primeras celdas: ${filas.slice(0, 3).map((f) => f.slice(0, 6).join("|")).join(" / ").slice(0, 300)}` };
  const h = filas[idx].map((c) => c.trim());
  const pos = Object.fromEntries(COLS.map((c) => [c, h.indexOf(c)])) as Record<(typeof COLS)[number], number>;
  const faltan = COLS.filter((c) => pos[c] < 0 && !["IMAGE", "SubtypeName", "LastUpdatedDate", "SignType"].includes(c));
  if (faltan.length) return { error: `Faltan columnas: ${faltan.join(", ")}. Encabezados: ${h.join("|").slice(0, 400)}` };
  const g = (f: string[], c: (typeof COLS)[number]) => (pos[c] >= 0 ? (f[pos[c]] ?? "").trim() : "");
  const out: MarcaFila[] = [];
  for (const f of filas.slice(idx + 1)) {
    const numero = g(f, "ApplicationNumber");
    if (!/^\d{1,12}$/.test(numero)) continue;
    const tipo = (g(f, "ApplicationType") || "M").toUpperCase().slice(0, 3);
    const seq = (g(f, "ApplicationSeq") || "A").toUpperCase().slice(0, 3);
    const serie = /^\d{1,3}$/.test(g(f, "ApplicationSerie")) ? g(f, "ApplicationSerie") : "1";
    if (!/^[A-Z]{1,3}$/.test(tipo) || !/^[A-Z]{1,3}$/.test(seq)) continue;
    const nombre = g(f, "BrandName").slice(0, 300);
    const estado = g(f, "Status").slice(0, 80) || "Sin estado";
    const vence = fechaExcel(g(f, "ExpirationDate"));
    const img = g(f, "IMAGE");
    out.push({
      clave: `${tipo}-${seq}-${serie}-${numero}`, solicitud: Number(numero),
      registro: /^\d{1,12}$/.test(g(f, "RegistrationNumber")) ? Number(g(f, "RegistrationNumber")) : null,
      nombre, nombre_norm: normalizarMarca(nombre).slice(0, 300),
      clases: [...new Set(g(f, "NizaClasses").split(/[^\d]+/).filter(Boolean).map(Number).filter((n) => n >= 1 && n <= 45))],
      titulares: g(f, "Applicants").slice(0, 500), tipo_signo: g(f, "SignType").slice(0, 60), subtipo: g(f, "SubtypeName").slice(0, 120), estado,
      presentada: fechaExcel(g(f, "FilingDate")), registrada: fechaExcel(g(f, "RegistrationDate")), vence,
      etiqueta: /^https:\/\/[a-z0-9.-]*inapi\.cl\//.test(img) ? img.slice(0, 300) : null,
      actualizado: fechaExcel(g(f, "LastUpdatedDate")), vigente: !!nombre && esVigente(estado, vence, hoy),
    });
  }
  return { filas: out };
}
