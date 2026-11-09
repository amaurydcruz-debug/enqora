import "server-only";
import { entryBuffer, entryLines, openZip } from "@/lib/zip-lines";

// Inspector de fuentes: antes de construir un conector, ENQORA revisa desde su servidor qué publica una fuente
// oficial de datos abiertos (archivos, formato, licencia, columnas y primeras filas). Solo lee: no guarda nada.
// Solo consulta organismos públicos de la lista y solo archivos publicados como datos abiertos.

const HOSTS = [
  "dabiertos.inapi.cl", "tramites.inapi.cl", "snifa.sma.gob.cl", "portal.sma.gob.cl", "datos-abiertos.chilecompra.cl",
  "datosabiertos.chilecompra.cl", "www.sii.cl", "datos.gob.cl", "www.registrodeempresasysociedades.cl", "www.cmfchile.cl",
];
const UA = { "user-agent": "ENQORA/1.0 (+inspector de datos abiertos)" };
const TIMEOUT = 20_000;
// Tope de cada muestra: la acción debe responder dentro del límite de la página (120 s), con margen.
const MUESTRA_MS = 45_000;

export type Preset = { id: string; nombre: string; tipo: "ckan" | "pagina"; url: string; q?: string };
export const PRESETS: Preset[] = [
  { id: "inapi_marcas", nombre: "INAPI · marcas (registros y solicitudes)", tipo: "ckan", url: "https://dabiertos.inapi.cl", q: "marcas" },
  { id: "snifa", nombre: "SMA · SNIFA datos abiertos", tipo: "pagina", url: "https://snifa.sma.gob.cl/DatosAbiertos" },
  { id: "chilecompra", nombre: "ChileCompra · descargas de datos abiertos", tipo: "pagina", url: "https://datos-abiertos.chilecompra.cl/descargas" },
];

export type Recurso = { nombre: string; formato: string; url: string; tamano: number | null; actualizado: string | null };
export type Paquete = { titulo: string; licencia: string | null; actualizado: string | null; frecuencia: string | null; recursos: Recurso[] };
export type Muestra = { archivo: string; url: string; tipo: string; filas_aprox: string | null; columnas: string[]; filas: string[][]; nota?: string };
export type Inspeccion = { fuente: string; url: string; paquetes: Paquete[]; enlaces: string[]; muestras: Muestra[]; avisos: string[] };

function permitido(u: string): URL {
  const url = new URL(u);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Solo enlaces web.");
  if (!HOSTS.includes(url.hostname)) throw new Error(`Dominio no autorizado para el inspector: ${url.hostname}`);
  return url;
}

async function traer(u: string, extra: Record<string, string> = {}) {
  permitido(u);
  return fetch(u, { headers: { ...UA, ...extra }, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT) });
}

// Lee como texto hasta «max» bytes y corta la descarga.
async function texto(res: Response, max: number): Promise<string> {
  if (!res.body) return "";
  const partes: Uint8Array[] = [];
  let n = 0;
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    partes.push(chunk);
    n += chunk.length;
    if (n >= max) break;
  }
  try { await res.body.cancel(); } catch { /* ya terminó */ }
  const buf = Buffer.concat(partes.map((p) => Buffer.from(p))).subarray(0, max);
  const utf = buf.toString("utf8");
  return utf.includes("�") ? buf.toString("latin1") : utf;
}

const anioDe = (s: string) => Number(s.match(/(19|20)\d{2}(?!.*(19|20)\d{2})/)?.[0] ?? 0);

// ---------- Portales CKAN (p. ej., dabiertos.inapi.cl) ----------
async function ckan(base: string, q: string): Promise<Paquete[]> {
  const res = await traer(`${base.replace(/\/$/, "")}/api/3/action/package_search?q=${encodeURIComponent(q)}&rows=20`);
  if (!res.ok) throw new Error(`El portal respondió ${res.status} al listar los conjuntos de datos.`);
  const j = (await res.json()) as { result?: { results?: Record<string, unknown>[] } };
  return (j.result?.results ?? []).map((p) => {
    const extras = Array.isArray(p.extras) ? (p.extras as { key?: string; value?: string }[]) : [];
    const frecuencia = extras.find((x) => /frecuen|frequency|periodicity/i.test(x.key ?? ""))?.value ?? (typeof p.frequency === "string" ? p.frequency : null);
    return {
      titulo: String(p.title ?? p.name ?? ""),
      licencia: (p.license_title as string) ?? (p.license_id as string) ?? null,
      actualizado: (p.metadata_modified as string) ?? null,
      frecuencia: frecuencia ?? null,
      recursos: (Array.isArray(p.resources) ? p.resources : []).map((r: Record<string, unknown>) => ({
        nombre: String(r.name ?? r.url ?? ""), formato: String(r.format ?? ""), url: String(r.url ?? ""),
        tamano: typeof r.size === "number" ? r.size : null, actualizado: (r.last_modified as string) ?? (r.metadata_modified as string) ?? null,
      })),
    };
  });
}

// ---------- Páginas HTML con enlaces a archivos ----------
async function enlacesDePagina(url: string): Promise<string[]> {
  const res = await traer(url);
  if (!res.ok) throw new Error(`La página respondió ${res.status}.`);
  const html = await texto(res, 3_000_000);
  const out = new Set<string>();
  for (const m of html.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)) {
    const h = m[1].trim();
    if (!/\.(csv|xlsx?|zip|json|txt|geojson)(\?|$)/i.test(h) && !/descarga|download|export/i.test(h)) continue;
    try { out.add(new URL(h, url).toString()); } catch { /* enlace inválido */ }
  }
  if (!out.size && /habilitar javascript|enable javascript/i.test(html)) throw new Error("La página arma su contenido con JavaScript: no expone los enlaces en el HTML.");
  return [...out].slice(0, 60);
}

// ---------- Muestras ----------
const entidades = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d))).replace(/&amp;/g, "&");

const colIdx = (ref: string) => {
  const letras = ref.replace(/\d+/g, "");
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

async function muestraXlsx(url: string): Promise<Muestra> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MUESTRA_MS);
  try {
    const { source, entries } = await openZip(url, controller.signal);
    const hoja = entries.filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(e.name)).sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }))[0];
    if (!hoja) throw new Error("El Excel no trae hojas legibles.");
    const ss = entries.find((e) => /^xl\/sharedStrings\.xml$/i.test(e.name));
    const compartidos: string[] = [];
    let nota: string | undefined;
    if (ss) {
      const { data, completo } = await entryBuffer(source, ss, controller.signal, 40_000_000);
      if (!completo) nota = "Textos del Excel muy extensos: algunas celdas pueden mostrarse como número de texto.";
      for (const m of data.toString("utf8").matchAll(/<si>([\s\S]*?)<\/si>/g)) {
        compartidos.push(entidades([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
      }
    }
    const { data } = await entryBuffer(source, hoja, controller.signal, 1_500_000);
    const xml = data.toString("utf8");
    const dim = xml.match(/<dimension ref="([A-Z]+\d+):?([A-Z]+)?(\d+)?"/);
    const filas: string[][] = [];
    for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const fila: string[] = [];
      for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1];
        const ref = attrs.match(/r="([A-Z]+)\d+"/)?.[1];
        const t = attrs.match(/t="(\w+)"/)?.[1];
        const v = c[2]?.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
        const inline = c[2]?.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1];
        const val = t === "s" ? compartidos[Number(v)] ?? `#${v}` : t === "inlineStr" ? entidades(inline ?? "") : entidades(v);
        fila[ref ? colIdx(ref) : fila.length] = val;
      }
      filas.push(Array.from(fila, (x) => x ?? ""));
      if (filas.length >= 6) break;
    }
    return {
      archivo: decodeURIComponent(url.split("/").pop() ?? url), url, tipo: "Excel (.xlsx)",
      filas_aprox: dim?.[3] ? `${(Number(dim[3]) - 1).toLocaleString("es-CL")} filas de datos (según la hoja)` : null,
      columnas: filas[0] ?? [], filas: filas.slice(1), nota,
    };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

async function muestraZip(url: string): Promise<Muestra[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MUESTRA_MS);
  try {
    const { source, entries } = await openZip(url, controller.signal);
    const textos = entries.filter((e) => /\.(txt|csv)$/i.test(e.name) && e.size > 0).sort((a, b) => b.size - a.size).slice(0, 3);
    const out: Muestra[] = [];
    for (const e of textos) {
      const lineas: string[] = [];
      for await (const l of entryLines(source, e, controller.signal)) {
        if (l.trim()) lineas.push(l);
        if (lineas.length >= 6) break;
      }
      const sep = [";", "|", "\t", ","].find((s) => (lineas[0] ?? "").includes(s)) ?? ";";
      out.push({ archivo: `${url.split("/").pop()} › ${e.name}`, url, tipo: "ZIP con texto", filas_aprox: `${(e.size / 1_048_576).toFixed(1)} MB sin comprimir`,
        columnas: (lineas[0] ?? "").split(sep), filas: lineas.slice(1).map((l) => l.split(sep)) });
    }
    if (!out.length) out.push({ archivo: url.split("/").pop() ?? url, url, tipo: "ZIP", filas_aprox: null, columnas: [], filas: [], nota: `Contenido: ${entries.map((e) => e.name).slice(0, 20).join(", ")}` });
    return out;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

async function muestraTexto(url: string): Promise<Muestra> {
  const res = await traer(url, { range: "bytes=0-131071" });
  if (!res.ok) throw new Error(`El archivo respondió ${res.status}.`);
  const t = await texto(res, 131_072);
  if (/\.json(\?|$)/i.test(url)) return { archivo: url.split("/").pop() ?? url, url, tipo: "JSON", filas_aprox: null, columnas: [], filas: [], nota: t.slice(0, 1500) };
  const lineas = t.split(/\r?\n/).filter((l) => l.trim()).slice(0, 6);
  const sep = [";", "|", "\t", ","].find((s) => (lineas[0] ?? "").includes(s)) ?? ",";
  return { archivo: url.split("/").pop() ?? url, url, tipo: "Texto (CSV)", filas_aprox: null, columnas: (lineas[0] ?? "").split(sep), filas: lineas.slice(1).map((l) => l.split(sep)) };
}

async function muestra(url: string): Promise<Muestra[]> {
  permitido(url);
  if (/\.xlsx(\?|$)/i.test(url)) return [await muestraXlsx(url)];
  if (/\.zip(\?|$)/i.test(url)) return muestraZip(url);
  return [await muestraTexto(url)];
}

// ---------- Inspección ----------
export async function inspeccionar(presetId: string): Promise<Inspeccion> {
  const p = PRESETS.find((x) => x.id === presetId);
  if (!p) throw new Error("Fuente no reconocida.");
  const out: Inspeccion = { fuente: p.nombre, url: p.url, paquetes: [], enlaces: [], muestras: [], avisos: [] };
  let candidatos: string[] = [];
  if (p.tipo === "ckan") {
    out.paquetes = await ckan(p.url, p.q ?? "");
    // Muestra del archivo más reciente de cada conjunto (normalmente el año en curso, el más liviano).
    for (const pq of out.paquetes.slice(0, 4)) {
      const r = [...pq.recursos].filter((x) => x.url).sort((a, b) => anioDe(b.nombre || b.url) - anioDe(a.nombre || a.url))[0];
      if (r) candidatos.push(r.url);
    }
  } else {
    out.enlaces = await enlacesDePagina(p.url);
    candidatos = [...out.enlaces].sort((a, b) => anioDe(b) - anioDe(a)).slice(0, 2);
  }
  // Las muestras se leen en paralelo: cada una tiene su propio tope de tiempo y un fallo no detiene a las demás.
  const resultados = await Promise.allSettled([...new Set(candidatos)].slice(0, 3).map((u) => muestra(u)));
  resultados.forEach((r, i) => {
    const u = [...new Set(candidatos)][i];
    if (r.status === "fulfilled") out.muestras.push(...r.value);
    else {
      const e = r.reason;
      const causa = (e as { cause?: { code?: string; message?: string } })?.cause;
      const msg = e instanceof Error ? (e.name === "AbortError" || e.name === "TimeoutError" ? "el archivo no terminó de leerse a tiempo" : `${e.message}${causa ? ` (${[causa.code, causa.message].filter(Boolean).join(": ")})` : ""}`) : "no se pudo leer";
      out.avisos.push(`${decodeURIComponent(u.split("/").pop() ?? u)}: ${msg}`);
    }
  });
  return out;
}

// Texto plano del resultado, para copiar y pegar en una conversación o un informe.
export function comoTexto(r: Inspeccion): string {
  const l: string[] = [`INSPECCIÓN · ${r.fuente}`, r.url, ""];
  for (const p of r.paquetes) {
    l.push(`Conjunto: ${p.titulo} · licencia: ${p.licencia ?? "—"} · actualizado: ${p.actualizado ?? "—"}${p.frecuencia ? ` · frecuencia: ${p.frecuencia}` : ""}`);
    for (const x of p.recursos.slice(0, 40)) l.push(`  - ${x.nombre} [${x.formato}] ${x.url}${x.tamano ? ` (${(x.tamano / 1_048_576).toFixed(1)} MB)` : ""}`);
  }
  if (r.enlaces.length) {
    l.push("Enlaces a archivos:");
    for (const e of r.enlaces) l.push(`  - ${e}`);
  }
  for (const m of r.muestras) {
    l.push("", `MUESTRA · ${m.archivo} · ${m.tipo}${m.filas_aprox ? ` · ${m.filas_aprox}` : ""}`);
    l.push(`Columnas: ${m.columnas.join(" | ")}`);
    for (const f of m.filas) l.push(`  ${f.join(" | ")}`);
    if (m.nota) l.push(`Nota: ${m.nota}`);
  }
  for (const a of r.avisos) l.push(`Aviso: ${a}`);
  return l.join("\n");
}
