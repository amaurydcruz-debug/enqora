import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidRut, normalizeRut } from "@/lib/rut";

// Conector con los DATOS ABIERTOS del Registro de Empresas y Sociedades (datos.gob.cl, Ministerio de Economía).
// Vía oficial y sin CAPTCHA: descarga los CSV publicados (uno por período) y carga las actuaciones por RUT.
// Avanza por tramos con un cursor en bytes (descarga parcial con Range) y deja el avance guardado.
// Si no reconoce las columnas, se detiene y guarda la cabecera real para ajustar el mapeo (nunca inventa datos).

const DATASET = process.env.RES_DATASET?.trim() || "registro-de-empresas-y-sociedades";
const CKAN = "https://datos.gob.cl/api/3/action/package_show?id=";
const UA = { "user-agent": "ENQORA/1.0 (+datos abiertos Registro de Empresas y Sociedades)" };
const BATCH = 1000;

export type ResReport = { estado: "al_dia" | "continua" | "completada" | "error"; recurso?: string; filas?: number; detalle?: string };
type Carga = { recurso: string; url: string; nombre: string | null; modificado: string | null; cursor_bytes: number; estado: string };
type Recurso = { id: string; url: string; name?: string; format?: string; last_modified?: string | null; metadata_modified?: string | null };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Separa una línea CSV respetando comillas.
function splitCsv(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === sep && !q) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

type Mapa = { rut: number; dv: number; razon: number; fecha: number; actuacion: number; tipo: number; capital: number; comuna: number; region: number };

export function mapear(headers: string[]): Mapa | null {
  const h = headers.map(norm);
  const find = (...tests: ((x: string) => boolean)[]) => {
    for (const t of tests) { const i = h.findIndex(t); if (i >= 0) return i; }
    return -1;
  };
  const m: Mapa = {
    rut: find((x) => x === "rut", (x) => x.startsWith("rut") && !x.includes("represent")),
    dv: find((x) => x === "dv" || x === "digito verificador"),
    razon: find((x) => x.includes("razon social"), (x) => x.includes("razon")),
    fecha: find((x) => x.includes("fecha") && (x.includes("actuacion") || x.includes("firma") || x.includes("primera")), (x) => x.includes("fecha") && x.includes("registro"), (x) => x.startsWith("fecha")),
    actuacion: find((x) => x.includes("tipo") && x.includes("actuacion"), (x) => x.includes("actuacion")),
    tipo: find((x) => (x.includes("tipo") || x.includes("descripcion")) && (x.includes("social") || x.includes("sociedad")) && !x.includes("codigo"), (x) => x.includes("sociedad") && !x.includes("codigo"), (x) => x.includes("sociedad")),
    capital: find((x) => x.includes("capital")),
    comuna: find((x) => x.includes("comuna") && x.includes("social"), (x) => x.includes("comuna")),
    region: find((x) => x.includes("region") && x.includes("social"), (x) => x.includes("region")),
  };
  return m.rut >= 0 && m.fecha >= 0 ? m : null;
}

function fecha(v: string): string | null {
  const s = v.trim().slice(0, 19);
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

function fila(cells: string[], m: Mapa) {
  const rawRut = m.dv >= 0 ? `${cells[m.rut] ?? ""}-${cells[m.dv] ?? ""}` : cells[m.rut] ?? "";
  const rut = normalizeRut(rawRut);
  if (!rut || !isValidRut(rut)) return null;
  const cap = m.capital >= 0 ? Number((cells[m.capital] ?? "").replace(/\./g, "").replace(",", ".").replace(/[^0-9.]/g, "")) : NaN;
  const g = (i: number) => (i >= 0 ? (cells[i] ?? "").slice(0, 200) || null : null);
  return { rut, razon_social: g(m.razon), fecha: fecha(cells[m.fecha] ?? ""), actuacion: g(m.actuacion), tipo_social: g(m.tipo),
    capital: Number.isFinite(cap) && cap > 0 && cap < 1e15 ? cap : null, comuna: g(m.comuna), region: g(m.region) };
}

const errText = (e: unknown) => {
  if (!(e instanceof Error)) return "Error";
  if (e.name === "TimeoutError" || e.name === "AbortError") return "Tiempo de espera agotado al descargar de datos.gob.cl";
  const cause = (e as { cause?: { code?: string; message?: string } }).cause;
  return `${e.message === "fetch failed" ? "No se pudo conectar con datos.gob.cl" : e.message}${cause ? ` (${[cause.code, cause.message].filter(Boolean).join(": ")})` : ""}`.slice(0, 480);
};

export async function runResSync(supabase: SupabaseClient, token: string, deadline: number): Promise<ResReport> {
  // 1) Catálogo del conjunto de datos (API oficial CKAN de datos.gob.cl)
  let recursos: Recurso[] = [];
  try {
    const res = await fetch(`${CKAN}${encodeURIComponent(DATASET)}`, { headers: UA, cache: "no-store", signal: AbortSignal.timeout(15_000) });
    const data = (await res.json().catch(() => null)) as { success?: boolean; result?: { resources?: Recurso[] } } | null;
    if (!res.ok || !data?.success) return { estado: "error", detalle: `datos.gob.cl respondió ${res.status} para el conjunto «${DATASET}». Revisa el identificador (RES_DATASET).` };
    recursos = (data.result?.resources ?? []).filter((r) => /csv/i.test(r.format ?? "") || /\.csv(\?|$)/i.test(r.url));
  } catch (e) {
    return { estado: "error", detalle: errText(e) };
  }
  if (!recursos.length) return { estado: "error", detalle: `El conjunto «${DATASET}» no publica archivos CSV.` };

  for (const r of recursos) {
    const { error } = await supabase.rpc("svc_res_recurso", { p_token: token, p_recurso: r.id, p_url: r.url, p_nombre: r.name ?? null, p_modificado: r.last_modified ?? r.metadata_modified ?? null });
    if (error) return { estado: "error", detalle: /ENQ_CLAVE_SERVICIO/.test(error.message) ? "ENQORA_SERVICE_TOKEN no coincide con la clave de servicio." : /svc_res_recurso|does not exist/i.test(error.message) ? "Falta ejecutar la migración 0028_fuentes_oficiales.sql." : error.message };
  }
  const { data: estado } = await supabase.rpc("svc_res_estado", { p_token: token });
  const cargas = ((estado ?? []) as Carga[]).filter((c) => c.estado !== "completada" && recursos.some((r) => r.id === c.recurso))
    .sort((a, b) => (b.nombre ?? "").localeCompare(a.nombre ?? "")); // primero los períodos más recientes
  const c = cargas[0];
  if (!c) return { estado: "al_dia", detalle: "Todos los archivos del Registro están cargados." };
  return procesar(supabase, token, c, deadline);
}

async function procesar(supabase: SupabaseClient, token: string, c: Carga, deadline: number): Promise<ResReport> {
  const lote = async (rows: unknown[], cursor: number, estado: "en_curso" | "completada" | "error", detalle: string | null) => {
    const { data, error } = await supabase.rpc("svc_res_lote", { p_token: token, p_recurso: c.recurso, p_rows: rows, p_cursor: cursor, p_estado: estado, p_detalle: detalle });
    if (error) throw new Error(`No se pudo guardar el lote: ${error.message}`);
    return (data as number) ?? 0;
  };
  try {
    // Cabecera (primeros bytes) para conocer las columnas y el separador.
    const head = await fetch(c.url, { headers: { ...UA, range: "bytes=0-8191" }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!head.ok) throw new Error(`datos.gob.cl respondió ${head.status} al descargar «${c.nombre ?? c.recurso}»`);
    const headBuf = Buffer.from(await head.arrayBuffer());
    const nl = headBuf.indexOf(0x0a);
    const utf8 = !/�/.test(new TextDecoder("utf-8").decode(headBuf.subarray(0, nl > 0 ? nl : headBuf.length)));
    const dec = new TextDecoder(utf8 ? "utf-8" : "latin1");
    const headerLine = dec.decode(headBuf.subarray(0, nl > 0 ? nl : headBuf.length)).replace(/^﻿/, "").replace(/\r$/, "");
    const sep = (headerLine.match(/;/g)?.length ?? 0) > (headerLine.match(/,/g)?.length ?? 0) ? ";" : ",";
    const headers = splitCsv(headerLine, sep);
    const mapa = mapear(headers);
    if (!mapa) {
      await lote([], 0, "error", `Columnas no reconocidas (falta RUT o fecha). Cabecera: ${headerLine.slice(0, 600)}`);
      return { estado: "error", recurso: c.recurso, detalle: `Columnas no reconocidas en «${c.nombre ?? c.recurso}». Cabecera: ${headerLine.slice(0, 300)}` };
    }

    const start = c.cursor_bytes > 0 ? c.cursor_bytes : (nl >= 0 ? nl + 1 : 0);
    const res = await fetch(c.url, { headers: { ...UA, range: `bytes=${start}-` }, cache: "no-store", signal: AbortSignal.timeout(Math.max(5_000, deadline - Date.now() + 10_000)) });
    if (!res.ok || !res.body) throw new Error(`datos.gob.cl respondió ${res.status} al descargar «${c.nombre ?? c.recurso}»`);
    let skip = res.status === 206 ? 0 : start; // sin descarga parcial: se saltan los bytes ya cargados
    let pos = start;
    let carry = Buffer.alloc(0);
    let rows: unknown[] = [];
    let total = 0;
    const reader = res.body.getReader();
    while (true) {
      if (Date.now() > deadline) {
        total += await lote(rows, pos, "en_curso", null);
        await reader.cancel().catch(() => undefined);
        return { estado: "continua", recurso: c.recurso, filas: total };
      }
      const { value, done } = await reader.read();
      if (done) break;
      let chunk = Buffer.from(value);
      if (skip > 0) { const cut = Math.min(skip, chunk.length); chunk = chunk.subarray(cut); skip -= cut; if (!chunk.length) continue; }
      let buf = carry.length ? Buffer.concat([carry, chunk]) : chunk;
      let i: number;
      while ((i = buf.indexOf(0x0a)) >= 0) {
        const line = dec.decode(buf.subarray(0, i)).replace(/\r$/, "");
        pos += i + 1;
        buf = buf.subarray(i + 1);
        if (!line.trim()) continue;
        const f = fila(splitCsv(line, sep), mapa);
        if (f) rows.push(f);
        if (rows.length >= BATCH) { total += await lote(rows, pos, "en_curso", null); rows = []; }
      }
      carry = Buffer.from(buf);
    }
    if (carry.length) { const f = fila(splitCsv(dec.decode(carry).replace(/\r$/, ""), sep), mapa); if (f) rows.push(f); pos += carry.length; }
    total += await lote(rows, pos, "completada", null);
    return { estado: "completada", recurso: c.recurso, filas: total };
  } catch (e) {
    const detalle = errText(e);
    await supabase.rpc("svc_res_lote", { p_token: token, p_recurso: c.recurso, p_rows: [], p_cursor: 0, p_estado: "error", p_detalle: detalle }).then(() => undefined, () => undefined);
    return { estado: "error", recurso: c.recurso, detalle };
  }
}
