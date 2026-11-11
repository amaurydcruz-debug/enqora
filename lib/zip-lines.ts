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

// Descarga por rangos que se reanuda: el servidor del SII corta las descargas largas («other side closed»).
// Si la conexión se cae, se vuelve a pedir desde el último byte recibido (hasta 6 veces seguidas sin avance),
// y el descompresor sigue sin notar el corte.
async function* rangoReanudable(url: string, e: ZipEntry, desde: number, hasta: number, signal: AbortSignal): AsyncGenerator<Buffer> {
  let pos = desde;
  let fallos = 0;
  while (pos <= hasta) {
    let avanzo = false;
    try {
      const res = await get(url, signal, `bytes=${pos}-${hasta}`);
      if (res.status !== 206 || !res.body) throw Object.assign(new Error(`El SII respondió ${res.status} al leer «${e.name}».`), { definitivo: res.status !== 200 && res.status < 500 });
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        const b = Buffer.from(chunk);
        pos += b.length;
        avanzo = true;
        yield b;
      }
      return;
    } catch (err) {
      if (signal.aborted || (err as { definitivo?: boolean }).definitivo) throw err;
      fallos = avanzo ? 1 : fallos + 1;
      if (fallos > 6) throw err;
      await new Promise((r) => setTimeout(r, 1_000 * fallos));
    }
  }
}

// Descarga en paralelo por tramos de 4 MB (hasta 6 a la vez) y entrega los bytes EN ORDEN al descompresor.
// Cada carga de la nómina debe volver a leer el archivo desde el inicio hasta su cursor (el formato ZIP no
// permite saltar): con una sola conexión lenta, pasado cierto avance todo el tiempo se iba en llegar al cursor
// y la carga se estancaba. Con varias conexiones a la vez, llegar al cursor toma una fracción del tiempo.
// Cada tramo se reintenta solo (hasta 6 veces) si el SII corta la conexión.
const TRAMO = 4 * 1024 * 1024;
const PARALELO = 6;
async function tramoCompleto(url: string, e: ZipEntry, desde: number, hasta: number, signal: AbortSignal): Promise<Buffer> {
  const partes: Buffer[] = [];
  for await (const b of rangoReanudable(url, e, desde, hasta, signal)) partes.push(b);
  return Buffer.concat(partes);
}
async function* rangoParalelo(url: string, e: ZipEntry, desde: number, hasta: number, signal: AbortSignal): AsyncGenerator<Buffer> {
  const cola: Promise<Buffer>[] = [];
  let siguiente = desde;
  const pedir = () => {
    if (siguiente > hasta) return;
    const fin = Math.min(hasta, siguiente + TRAMO - 1);
    const p = tramoCompleto(url, e, siguiente, fin, signal);
    p.catch(() => undefined); // el error se entrega cuando le toque su turno
    cola.push(p);
    siguiente = fin + 1;
  };
  for (let i = 0; i < PARALELO; i++) pedir();
  while (cola.length) {
    const b = await cola.shift()!;
    pedir();
    yield b;
  }
}

// Líneas (Latin-1) de un archivo del ZIP. Al cortar la lectura se cancela la descarga.
// paralelo: descarga en varias conexiones (para leer archivos completos); false para leer solo el inicio.
export async function* entryLines(source: Source, e: ZipEntry, signal: AbortSignal, paralelo = true): AsyncGenerator<string> {
  if (e.method !== 0 && e.method !== 8) throw new Error(`Compresión ZIP no soportada en «${e.name}».`);
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal.addEventListener("abort", onAbort);
  let raw: Readable;
  if (source.full) {
    raw = Readable.from([source.full.subarray(e.offset, Math.min(source.full.length, e.offset + 30 + 65_535 * 2 + e.compSize))]);
  } else {
    const end = Math.min((source.total ?? Infinity) - 1, e.offset + 30 + 65_535 * 2 + e.compSize);
    raw = Readable.from(paralelo ? rangoParalelo(source.url, e, e.offset, end, controller.signal) : rangoReanudable(source.url, e, e.offset, end, controller.signal));
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

// Bytes descomprimidos de un archivo del ZIP, hasta «max» bytes (se corta la descarga al llegar al límite).
// Lo usa el inspector de fuentes para leer el XML interno de un Excel (.xlsx también es un ZIP).
export async function entryBuffer(source: Source, e: ZipEntry, signal: AbortSignal, max: number): Promise<{ data: Buffer; completo: boolean }> {
  if (e.method !== 0 && e.method !== 8) throw new Error(`Compresión ZIP no soportada en «${e.name}».`);
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal.addEventListener("abort", onAbort);
  let raw: Readable;
  if (source.full) {
    raw = Readable.from([source.full.subarray(e.offset, Math.min(source.full.length, e.offset + 30 + 65_535 * 2 + e.compSize))]);
  } else {
    const end = Math.min((source.total ?? Infinity) - 1, e.offset + 30 + 65_535 * 2 + e.compSize);
    raw = Readable.from(rangoReanudable(source.url, e, e.offset, end, controller.signal));
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
  const partes: Buffer[] = [];
  let n = 0;
  let completo = true;
  try {
    for await (const chunk of data) {
      partes.push(chunk as Buffer);
      n += (chunk as Buffer).length;
      if (n >= max) { completo = false; break; }
    }
    return { data: Buffer.concat(partes).subarray(0, max), completo };
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
  const it = entryLines(source, e, signal, false);
  try {
    for await (const l of it) if (l.trim()) return l;
    return "";
  } finally {
    await it.return(undefined);
  }
}
