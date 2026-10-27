// Nóminas públicas del SII (personas jurídicas): fuentes oficiales y lectura de sus columnas.
// Las columnas se reconocen por el encabezado del archivo, así un cambio de orden no rompe la carga;
// si falta una columna obligatoria, la carga se detiene con un mensaje claro en el Centro de Mando.

export type Dataset = "razon_social" | "actividades" | "empresas";

export const SOURCES: Record<Dataset, { nombre: string; url: string }> = {
  razon_social: {
    nombre: "Nómina de razón social de contribuyentes personas jurídicas",
    url: "https://www.sii.cl/estadisticas/nominas/PUB_NOMBRES_PJ.zip",
  },
  actividades: {
    nombre: "Nómina de actividades económicas de contribuyentes personas jurídicas",
    url: "https://www.sii.cl/estadisticas/nominas/PUB_NOM_ACTECOS.zip",
  },
  empresas: {
    nombre: "Nómina de empresas personas jurídicas (años comerciales 2020 a 2024)",
    url: "https://www.sii.cl/estadisticas/nominas/PUB_EMPRESAS_PJ_2020_A_2024.zip",
  },
};

export const SYNC_ORDER: Dataset[] = ["razon_social", "actividades", "empresas"];
export const SOURCE_PAGE = "https://www.sii.cl/sobre_el_sii/nominapersonasjuridicas.html";

type Spec = { key: string; re: RegExp; not?: RegExp; required?: boolean };

const RUT: Spec = { key: "rut", re: /^RUT$|^RUT_|_RUT$|^NUMERO_RUT|^RUT_CONTRIBUYENTE/, required: true };
const DV: Spec = { key: "dv", re: /^DV$|^DV_|DIGITO/ };

const SPECS: Record<Dataset, Spec[]> = {
  razon_social: [
    RUT, DV,
    { key: "legal_name", re: /RAZON|NOMBRE/, required: true },
    { key: "activity_start", re: /INICIO/ },
    { key: "end_of_business", re: /TERMINO/, not: /TIPO/ },
  ],
  actividades: [
    RUT, DV,
    { key: "code", re: /COD|ACTECO/, required: true },
    { key: "description", re: /GLOSA|DESCRIP|ACTIVIDAD|NOMBRE/ },
  ],
  empresas: [
    RUT, DV,
    { key: "year", re: /^ANO|^ANIO|^YEAR|ANO_COMERCIAL|ANO_TRIBUTARIO/, required: true },
    { key: "sales_tranche", re: /TRAMO.*VENTA/ },
    { key: "workers", re: /TRABAJADOR/ },
    { key: "region", re: /REGION/ },
    { key: "subrubro", re: /^SUBRUBRO|SUB_RUBRO/ },
    { key: "rubro", re: /^RUBRO/ },
    { key: "end_type", re: /TIPO.*TERMINO/ },
    { key: "contributor_subtype", re: /SUBTIPO|SUB_TIPO/ },
    { key: "contributor_type", re: /^TIPO.*CONTRIBUYENTE/ },
    { key: "equity_tranche", re: /CAPITAL/ },
    { key: "main_activity", re: /ACTIVIDAD/, not: /FECHA|INICIO|TERMINO/ },
  ],
};

export const normHeader = (h: string) =>
  h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export function detectDelimiter(line: string): string {
  const cands = ["\t", ";", "|", ","];
  return cands.map((d) => [d, line.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
}

export type Mapping = { delimiter: string; columns: Record<string, number>; missing: string[]; header: string[] };

export function mapHeader(dataset: Dataset, headerLine: string): Mapping {
  const delimiter = detectDelimiter(headerLine);
  const header = headerLine.split(delimiter).map((h) => normHeader(h.replace(/^﻿/, "")));
  const used = new Set<number>();
  const columns: Record<string, number> = {};
  for (const s of SPECS[dataset]) {
    const i = header.findIndex((h, idx) => !used.has(idx) && s.re.test(h) && !(s.not && s.not.test(h)));
    if (i >= 0) {
      columns[s.key] = i;
      used.add(i);
    }
  }
  const missing = SPECS[dataset].filter((s) => s.required && columns[s.key] === undefined).map((s) => s.key);
  return { delimiter, columns, missing, header };
}

// RUT en una columna con o sin DV («76086428-5», «76.086.428», «76086428» + columna DV).
export function parseRut(raw?: string, dvRaw?: string): { rut: number; dv: string } | null {
  if (!raw) return null;
  let body = raw.trim().toUpperCase();
  let dv = (dvRaw ?? "").trim().toUpperCase();
  if (!dv) {
    const m = body.replace(/\./g, "").match(/^(\d{1,9})-?([0-9K])$/);
    if (!m) return null;
    body = m[1];
    dv = m[2];
  } else {
    body = body.replace(/[^0-9]/g, "");
  }
  const n = Number(body);
  if (!Number.isInteger(n) || n <= 0 || n > 999_999_999 || !/^[0-9K]$/.test(dv)) return null;
  return dv === rutDv(n) ? { rut: n, dv } : null;
}

export function rutDv(n: number): string {
  let sum = 0;
  let mul = 2;
  for (let x = n; x > 0; x = Math.floor(x / 10)) {
    sum += (x % 10) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const r = 11 - (sum % 11);
  return r === 11 ? "0" : r === 10 ? "K" : String(r);
}

// Fechas en los formatos mixtos de las nóminas: dd-mm-aaaa, dd/mm/aaaa, aaaa-mm-dd, aaaammdd (con o sin hora).
export function parseDate(raw?: string): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  let y: number, m: number, d: number;
  let r = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (r) [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/))) [d, m, y] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = v.match(/^(\d{4})(\d{2})(\d{2})$/))) [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else return null;
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return dt.toISOString().slice(0, 10);
}

const txt = (v?: string) => {
  const t = (v ?? "").trim();
  return t ? t : null;
};

export function toRow(dataset: Dataset, map: Mapping, line: string): Record<string, unknown> | null {
  const cells = line.split(map.delimiter);
  const get = (k: string) => (map.columns[k] !== undefined ? cells[map.columns[k]] : undefined);
  const id = parseRut(get("rut"), map.columns.dv !== undefined ? get("dv") ?? "" : undefined);
  if (!id) return null;
  if (dataset === "razon_social") {
    const name = txt(get("legal_name"));
    if (!name) return null;
    return { rut: id.rut, dv: id.dv, legal_name: name, activity_start: parseDate(get("activity_start")), end_of_business: parseDate(get("end_of_business")) };
  }
  if (dataset === "actividades") {
    const code = txt(get("code"));
    if (!code) return null;
    return { rut: id.rut, code, description: txt(get("description")) };
  }
  const year = Number((get("year") ?? "").match(/\d{4}/)?.[0]);
  if (!year) return null;
  const w = (get("workers") ?? "").replace(/[^0-9]/g, "");
  return {
    rut: id.rut,
    year,
    sales_tranche: txt(get("sales_tranche")),
    workers: w ? Math.min(Number(w), 2_000_000_000) : null,
    region: txt(get("region")),
    rubro: txt(get("rubro")),
    subrubro: txt(get("subrubro")),
    main_activity: txt(get("main_activity")),
    end_type: txt(get("end_type")),
    contributor_type: txt(get("contributor_type")),
    contributor_subtype: txt(get("contributor_subtype")),
    equity_tranche: txt(get("equity_tranche")),
  };
}

// Escala SII de 13 tramos según ventas anuales (1 = sin información).
const TRAMOS: Record<string, string> = {
  "1": "Sin información de ventas",
  "2": "Micro · hasta 200 UF", "3": "Micro · 200 a 600 UF", "4": "Micro · 600 a 2.400 UF",
  "5": "Pequeña · 2.400 a 5.000 UF", "6": "Pequeña · 5.000 a 10.000 UF", "7": "Pequeña · 10.000 a 25.000 UF",
  "8": "Mediana · 25.000 a 50.000 UF", "9": "Mediana · 50.000 a 100.000 UF",
  "10": "Grande · 100.000 a 200.000 UF", "11": "Grande · 200.000 a 600.000 UF", "12": "Grande · 600.000 a 1.000.000 UF",
  "13": "Grande · más de 1.000.000 UF",
};
export const salesTrancheLabel = (v?: string | null) => (v ? TRAMOS[v.trim()] ?? v : null);

// Señales objetivas del perfil público (las calcula la base de datos) y el servicio que las atiende.
export type Signal = { codigo: string; gravedad: "alta" | "media" | "baja"; fecha?: string; anio?: number };
type SignalText = { titulo: (s: Signal) => string; detalle: (s: Signal) => string; servicio: "contabilidad" | "legal" | "formaliza"; asunto: string };
const fmtDay = (d?: string) =>
  d ? new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`)) : "";

export const SIGNALS: Record<string, SignalText> = {
  termino_giro: {
    titulo: () => "Registra término de giro",
    detalle: (s) => `Según el SII, la empresa terminó su giro el ${fmtDay(s.fecha)}. Si sigue operando o quedaron obligaciones pendientes, hay que regularizarlo.`,
    servicio: "legal", asunto: "Regularizar la situación de una empresa con término de giro",
  },
  sin_actividades: {
    titulo: () => "Sin actividades económicas vigentes publicadas",
    detalle: () => "La nómina del SII no muestra actividades vigentes. Sin ellas no se pueden emitir documentos ni declarar correctamente.",
    servicio: "formaliza", asunto: "Regularizar mis actividades económicas en el SII",
  },
  sin_ventas_informadas: {
    titulo: (s) => `Sin información de ventas en el año comercial ${s.anio ?? ""}`.trim(),
    detalle: () => "El SII no pudo estimar ventas para ese año. Puede deberse a declaraciones faltantes o a que la empresa no tuvo movimiento: conviene revisarlo.",
    servicio: "contabilidad", asunto: "Revisar mis declaraciones de impuestos",
  },
  sin_informacion_reciente: {
    titulo: (s) => `La última información comercial publicada es del año ${s.anio ?? ""}`.trim(),
    detalle: () => "No hay datos más recientes en la nómina de empresas del SII. Si la empresa está activa, hay que revisar que sus declaraciones estén al día.",
    servicio: "contabilidad", asunto: "Revisar mi situación tributaria",
  },
  sin_registro_empresas: {
    titulo: () => "No aparece en la nómina de empresas 2020–2024",
    detalle: () => "Puede ser una empresa nueva o sin declaraciones informadas en esos años.",
    servicio: "contabilidad", asunto: "Revisar mi situación tributaria",
  },
};
