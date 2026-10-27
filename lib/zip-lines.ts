import { Readable, Transform, type TransformCallback } from "node:stream";
import { createInflateRaw } from "node:zlib";

// Lee en streaming el primer archivo de texto de un ZIP (sin guardarlo completo en memoria)
// y entrega sus líneas. Las nóminas del SII vienen en Latin-1 (Windows-1252).

class FirstEntry extends Transform {
  name = "";
  private head = Buffer.alloc(0);
  private started = false;
  private remaining = -1; // solo para archivos sin compresión

  _transform(chunk: Buffer, _enc: BufferEncoding, cb: TransformCallback) {
    if (this.started) {
      this.forward(chunk);
      return cb();
    }
    this.head = Buffer.concat([this.head, chunk]);
    if (this.head.length < 30) return cb();
    if (this.head.readUInt32LE(0) !== 0x04034b50) return cb(new Error("El archivo descargado no es un ZIP válido."));
    const flags = this.head.readUInt16LE(6);
    const method = this.head.readUInt16LE(8);
    const size = this.head.readUInt32LE(18);
    const n = this.head.readUInt16LE(26);
    const m = this.head.readUInt16LE(28);
    if (this.head.length < 30 + n + m) return cb();
    this.name = this.head.subarray(30, 30 + n).toString("latin1");
    if (flags & 0x1) return cb(new Error("El ZIP está cifrado."));
    if (method === 0) {
      if (!size || size === 0xffffffff) return cb(new Error("Formato ZIP no soportado."));
      this.remaining = size;
    } else if (method !== 8) {
      return cb(new Error("Compresión ZIP no soportada."));
    }
    this.started = true;
    const rest = this.head.subarray(30 + n + m);
    this.head = Buffer.alloc(0);
    if (rest.length) this.forward(rest);
    cb();
  }

  private forward(chunk: Buffer) {
    if (this.remaining < 0) {
      this.push(chunk);
      return;
    }
    if (this.remaining === 0) return;
    const part = chunk.subarray(0, this.remaining);
    this.remaining -= part.length;
    this.push(part);
  }

  get stored() {
    return this.remaining >= 0;
  }
}

export async function* zipTextLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const source = Readable.fromWeb(body as import("node:stream/web").ReadableStream<Uint8Array>);
  const entry = new FirstEntry();
  source.on("error", (e) => entry.destroy(e));
  source.pipe(entry);

  // Se espera el encabezado para saber si hay que descomprimir.
  const firstChunks: Buffer[] = [];
  const iter = entry[Symbol.asyncIterator]() as AsyncIterator<Buffer>;
  const first = await iter.next();
  if (!first.done) firstChunks.push(first.value);
  if (entry.name && !/\.(txt|csv)$/i.test(entry.name)) {
    source.destroy();
    throw new Error(`El ZIP contiene «${entry.name}», no un archivo de texto.`);
  }

  async function* raw(): AsyncGenerator<Buffer> {
    for (const c of firstChunks) yield c;
    for (let r = await iter.next(); !r.done; r = await iter.next()) yield r.value;
  }

  let data: AsyncIterable<Buffer>;
  let inflate: ReturnType<typeof createInflateRaw> | null = null;
  if (entry.stored) data = raw();
  else {
    inflate = createInflateRaw();
    const feeder = Readable.from(raw());
    feeder.on("error", (e) => inflate?.destroy(e));
    // Al terminar el flujo comprimido, zlib ignora el resto del ZIP (directorio central).
    feeder.pipe(inflate);
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
    source.destroy();
    entry.destroy();
    inflate?.destroy();
  }
}
