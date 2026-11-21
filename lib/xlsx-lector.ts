// Lector mínimo de archivos .xlsx (sin dependencias): abre el zip, lee las cadenas compartidas y la primera hoja,
// y devuelve las filas como texto. Pensado para los conjuntos de datos abiertos (tablas simples, sin fórmulas).
import { constants, inflateRawSync } from "node:zlib";

type Entrada = { nombre: string; metodo: number; comprimido: number; offset: number };

function entradasZip(buf: Buffer): Map<string, Entrada> {
  // Fin del directorio central: firma 0x06054b50, buscada desde el final (comentario de hasta 64 KB).
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("El archivo no es un .xlsx válido.");
  let total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  // ZIP64 (archivos muy grandes): lee el registro extendido si existe.
  if (p === 0xffffffff || total === 0xffff) {
    const loc = eocd - 20;
    if (loc >= 0 && buf.readUInt32LE(loc) === 0x07064b50) {
      const z = Number(buf.readBigUInt64LE(loc + 8));
      total = Number(buf.readBigUInt64LE(z + 32));
      p = Number(buf.readBigUInt64LE(z + 48));
    }
  }
  const out = new Map<string, Entrada>();
  for (let n = 0; n < total && buf.readUInt32LE(p) === 0x02014b50; n++) {
    const metodo = buf.readUInt16LE(p + 10);
    let comprimido = buf.readUInt32LE(p + 20);
    const largoNombre = buf.readUInt16LE(p + 28);
    const largoExtra = buf.readUInt16LE(p + 30);
    const largoComentario = buf.readUInt16LE(p + 32);
    let offset = buf.readUInt32LE(p + 42);
    const nombre = buf.toString("utf8", p + 46, p + 46 + largoNombre);
    if (comprimido === 0xffffffff || offset === 0xffffffff) {
      let q = p + 46 + largoNombre;
      const fin = q + largoExtra;
      while (q < fin) {
        const id = buf.readUInt16LE(q);
        const tam = buf.readUInt16LE(q + 2);
        if (id === 0x0001) {
          let r = q + 4;
          if (buf.readUInt32LE(p + 24) === 0xffffffff) r += 8;
          if (comprimido === 0xffffffff) { comprimido = Number(buf.readBigUInt64LE(r)); r += 8; }
          if (offset === 0xffffffff) offset = Number(buf.readBigUInt64LE(r));
        }
        q += 4 + tam;
      }
    }
    out.set(nombre, { nombre, metodo, comprimido, offset });
    p += 46 + largoNombre + largoExtra + largoComentario;
  }
  return out;
}

// maxComprimido: para una muestra, descomprime solo el comienzo de la entrada (sin cargar todo en memoria).
function leerEntrada(buf: Buffer, e: Entrada, maxComprimido = Number.POSITIVE_INFINITY): string {
  const local = e.offset;
  if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error("Zip dañado.");
  const inicio = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
  const parcial = e.comprimido > maxComprimido;
  const datos = buf.subarray(inicio, inicio + Math.min(e.comprimido, maxComprimido));
  if (e.metodo === 0) return datos.toString("utf8");
  if (e.metodo === 8) return inflateRawSync(datos, parcial ? { finishFlush: constants.Z_SYNC_FLUSH } : {}).toString("utf8");
  throw new Error(`Compresión no soportada (${e.metodo}).`);
}

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const desescapar = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTIDADES[e.toLowerCase()] ?? _);
const textoDe = (xml: string) => desescapar([...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));

// Columna «A», «B»… «AA» → índice desde 0.
function columna(ref: string): number {
  const letras = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export type HojaXlsx = { hoja: string; filas: string[][]; totalFilasLeidas: number; truncado: boolean };

// Lee la primera hoja. maxFilas limita cuántas filas se devuelven (la lectura se detiene ahí).
export function leerXlsx(buf: Buffer, maxFilas = Number.POSITIVE_INFINITY): HojaXlsx {
  const zip = entradasZip(buf);
  const muestra = Number.isFinite(maxFilas);
  const comp = zip.get("xl/sharedStrings.xml");
  const compartidas = comp ? [...leerEntrada(buf, comp, muestra ? 4_000_000 : Infinity).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textoDe(m[1])) : [];
  const libro = zip.get("xl/workbook.xml") ? leerEntrada(buf, zip.get("xl/workbook.xml")!) : "";
  const hojaNombre = desescapar(/<sheet\b[^>]*\bname="([^"]*)"/.exec(libro)?.[1] ?? "Hoja1");
  const ruta = [...zip.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort((a, b) => Number(/\d+/.exec(a)![0]) - Number(/\d+/.exec(b)![0]))[0];
  if (!ruta) throw new Error("El archivo no tiene hojas.");
  const xml = leerEntrada(buf, zip.get(ruta)!, muestra ? 1_000_000 : Infinity);
  const filas: string[][] = [];
  let leidas = 0;
  let truncado = false;
  for (const m of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    leidas++;
    if (filas.length >= maxFilas) { truncado = true; break; }
    const fila: string[] = [];
    for (const c of m[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const cuerpo = c[2] ?? "";
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const tipo = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1];
      let valor = "";
      if (tipo === "s" && v != null) valor = compartidas[Number(v)] ?? "(…)";
      else if (tipo === "inlineStr") valor = textoDe(cuerpo);
      else if (v != null) valor = desescapar(v);
      const i = ref ? columna(ref) : fila.length;
      while (fila.length < i) fila.push("");
      fila[i] = valor;
    }
    filas.push(fila);
  }
  return { hoja: hojaNombre, filas, totalFilasLeidas: leidas, truncado };
}
