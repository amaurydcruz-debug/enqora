import { Readable, Transform, type TransformCallback } from "node:stream";
import { createInflateRaw } from "node:zlib";

// Lectura de las nóminas del SII publicadas como ZIP. Un ZIP puede traer varios archivos de texto
// (por ejemplo, una tabla de códigos y la nómina): se lee el índice del ZIP (directorio central),
// se elige el archivo correcto y solo ese se descomprime en streaming, línea a línea (Latin-1).
// Si el servidor acepta descargas parciales (Range), se descarga solo lo necesario; si no, el ZIP completo.

const UA = { "user-agent": "ENQORA/1.0 (+datos abiertos SII)" };
const TAIL = 256 * 1024;

export type ZipEntry = { name: string; method: number; compSize: number; size: number; offset: number };
type Source = { url: string; total: number | null; full: Buffer | null; ranges: boolean; modified: string | null };

async function get(url: string, signal: AbortSignal, range?: string) {
  return fetch(url, { signal, cache: "no-store", headers: range ? { ...UA, range } : UA });
}

// Abre el ZIP: intenta leer solo el final (índice); si el servidor no acepta Range, descarga todo.
export async function openZip(url: string, signal: AbortSignal): Promise<{ source: Source; entries: ZipEntry[] }> {
  let res = await get(url, signal, `bytes=-${TAIL}`);
  if (!res.ok) throw new Error(`El SII respondió ${res.status} al descargar la nómina`);
  const modified = res.headers.get("last-modified");
  let source: Source;
  let tail: Buffer;
  let tailStart: number;
  if (res.status === 206) {
    const m = (res.headers.get("content-range") ?? "").match(/bytes (\d+)-(\d+)\/(\d+)/);
    tail = Buffer.from(await res.arrayBuffer());
    if (!m) throw new Error("Respuesta parcial del SII sin tamaño total.");
    tailStart = Number(m[1]);
    source = { url, total: Number(m[3]), full: null, ranges: true, modified };
  } else {
    tail = Buffer.from(await res.arrayBuffer());
    tailStart = 0;
    source = { url, total: tail.length, full: tail, ranges: false, modified };
  }

  // Fin del directorio central (EOCD)
  let eocd = -1;
  for (let i = tail.length - 22; i >= Math.max(0, tail.length - 66_000); i--) {
    if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("El archivo descargado no es un ZIP válido.");
  let cdSize = tail.readUInt32LE(eocd + 12);
  let cdOffset = tail.readUInt32LE(eocd + 16);
  // ZIP64
  if (cdOffset === 0xffffffff || cdSize === 0xffffffff) {
    const loc = eocd - 20;
    if (loc >= 0 && tail.readUInt32LE(loc) === 0x07064b50) {
      const z64 = Number(tail.readBigUInt64LE(loc + 8)) - tailStart;
      if (z64 >= 0 && tail.readUInt32LE(z64) === 0x06064b50) {
        cdSize = Number(tail.readBigUInt64LE(z64 + 40));
        cdOffset = Number(tail.readBigUInt64LE(z64 + 48));
      }
    }
  }
  let cd: Buffer;
  if (cdOffset >= tailStart && cdOffset + cdSize <= tailStart + tail.length) {
    cd = tail.subarray(cdOffset - tailStart, cdOffset - tailStart + cdSize);
  } else {
    res = await get(url, signal, `bytes=${cdOffset}-${cdOffset + cdSize - 1}`);
    if (res.status !== 206) throw new Error("No se pudo leer el índice del ZIP del SII.");
    cd = Buffer.from(await res.arrayBuffer());
  }

  const entries: ZipEntry[] = [];
  for (let p = 0; p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50; ) {
    const method = cd.readUInt16LE(p + 10);
    let compSize = cd.readUInt32LE(p + 20);
    let size = cd.readUInt32LE(p + 24);
    const n = cd.readUInt16LE(p + 28);
    const x = cd.readUInt16LE(p + 30);
    const c = cd.readUInt16LE(p + 32);
    let offset = cd.readUInt32LE(p + 42);
    const name = cd.subarray(p + 46, p + 46 + n).toString("latin1");
    // Campo extra ZIP64 (tamaños u offset mayores a 4 GB)
    for (let q = p + 46 + n; q + 4 <= p + 46 + n + x; ) {
      const id = cd.readUInt16LE(q);
      const len = cd.readUInt16LE(q + 2);
      if (id === 0x0001) {
        let r = q + 4;
        if (size === 0xffffffff) { size = Number(cd.readBigUInt64LE(r)); r += 8; }
        if (compSize === 0xffffffff) { compSize = Number(cd.readBigUInt64LE(r)); r += 8; }
        if (offset === 0xffffffff) { offset = Number(cd.readBigUInt64LE(r)); }
      }
      q += 4 + len;
    }
    entries.push({ name, method, compSize, size, offset });
    p += 46 + n + x + c;
  }
  return { source, entries };
}

// Salta el encabezado local del archivo y entrega exactamente sus bytes comprimidos.
class LocalEntry extends Transform {
  private head = Buffer.alloc(0);
  private started = false;
  private ended = false;
  constructor(private remaining: number) { super(); }
  _transform(chunk: Buffer, _enc: BufferEncoding, cb: TransformCallback) {
    if (this.ended) return cb();
    if (!this.started) {
      this.head = Buffer.concat([this.head, chunk]);
      if (this.head.length < 30) return cb();
      if (this.head.readUInt32LE(0) !== 0x04034b50) return cb(new Error("ZIP dañado: encabezado local no válido."));
      const skip = 30 + this.head.readUInt16LE(26) + this.head.readUInt16LE(28);
      if (this.head.length < skip) return cb();
      this.started = true;
      chunk = this.head.subarray(skip);
      this.head = Buffer.alloc(0);
    }
    if (this.remaining > 0 && chunk.length) {
      const part = chunk.subarray(0, this.remaining);
      this.remaining -= part.length;
      this.push(part);
    }
    if (this.remaining <= 0) {
      this.ended = true;
      this.push(null);
    }
    cb();
  }
}

// Líneas (Latin-1) de un archivo del ZIP. Al cortar la lectura se cancela la descarga.
export async function* entryLines(source: Source, e: ZipEntry, signal: AbortSignal): AsyncGenerator<string> {
  if (e.method !== 0 && e.method !== 8) throw new Error(`Compresión ZIP no soportada en «${e.name}».`);
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal.addEventListener("abort", onAbort);
  let raw: Readable;
  if (source.full) {
    raw = Readable.from([source.full.subarray(e.offset, Math.min(source.full.length, e.offset + 30 + 65_535 * 2 + e.compSize))]);
  } else {
    const end = Math.min((source.total ?? Infinity) - 1, e.offset + 30 + 65_535 * 2 + e.compSize);
    const res = await get(source.url, controller.signal, `bytes=${e.offset}-${end}`);
    if (res.status !== 206 || !res.body) throw new Error(`El SII respondió ${res.status} al leer «${e.name}».`);
    raw = Readable.fromWeb(res.body as import("node:stream/web").ReadableStream<Uint8Array>);
  }
  const local = new LocalEntry(e.compSize);
  raw.on("error", (err) => local.destroy(err));
  raw.pipe(local);
  let data: AsyncIterable<Buffer> = local;
  let inflate: ReturnType<typeof createInflateRaw> | null = null;
  if (e.method === 8) {
    inflate = createInflateRaw();
    local.on("error", (err) => inflate?.destroy(err));
    local.pipe(inflate);
    data = inflate;
  }
  const dec = new TextDecoder("latin1");
  let carry = "";
  try {
    for await (const chunk of data) {
      const text = carry + dec.decode(chunk as Buffer, { stream: true });
      const parts = text.split("\n");
      carry = parts.pop() ?? "";
      for (const p of parts) yield p.replace(/\r$/, "");
    }
    if (carry) yield carry.replace(/\r$/, "");
  } finally {
    signal.removeEventListener("abort", onAbort);
    controller.abort();
    raw.destroy();
    local.destroy();
    inflate?.destroy();
  }
}

// Primera línea con contenido (para reconocer el encabezado de cada archivo del ZIP).
export async function firstLine(source: Source, e: ZipEntry, signal: AbortSignal): Promise<string> {
  const it = entryLines(source, e, signal);
  try {
    for await (const l of it) if (l.trim()) return l;
    return "";
  } finally {
    await it.return(undefined);
  }
}
