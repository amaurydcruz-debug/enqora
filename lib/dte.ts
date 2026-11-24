// Lector de documentos tributarios electrónicos (DTE) del SII en XML: factura, boleta, notas, guías.
// Inspirado en cordada/lib-cl-sii-python (MIT): lee el XML por reglas, SIN IA y sin costo, y verifica lo que se
// puede verificar con el propio documento (RUT con dígito verificador, tipo de DTE, folio, fecha, IVA y total).
// No verifica la firma criptográfica ni consulta al SII: eso lo confirma el Registro de Compras y Ventas.
// Funciones puras, sin red.

import { formatRut, isValidRut } from "@/lib/rut";

export const TIPOS_DTE: Record<number, string> = {
  33: "Factura electrónica", 34: "Factura no afecta o exenta electrónica", 39: "Boleta electrónica",
  41: "Boleta exenta electrónica", 43: "Liquidación factura electrónica", 46: "Factura de compra electrónica",
  52: "Guía de despacho electrónica", 56: "Nota de débito electrónica", 61: "Nota de crédito electrónica",
  110: "Factura de exportación electrónica", 111: "Nota de débito de exportación electrónica", 112: "Nota de crédito de exportación electrónica",
};

export type Revision = { ok: boolean; texto: string; grave?: boolean };
export type Dte = {
  tipo: number; tipoNombre: string; folio: number; fecha: string;
  emisor: { rut: string; razon: string; giro: string | null };
  receptor: { rut: string | null; razon: string | null };
  neto: number | null; exento: number | null; tasaIva: number | null; iva: number | null; adicionales: number; total: number;
  items: { nombre: string; monto: number }[];
  timbre: boolean; firma: boolean; documentos: number;
  revisiones: Revision[];
};

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Decodifica respetando la codificación declarada (los DTE suelen venir en ISO-8859-1).
export function decodificarXml(bytes: Uint8Array): string {
  const cabecera = new TextDecoder("latin1").decode(bytes.slice(0, 200));
  const enc = cabecera.match(/encoding=["']([\w-]+)["']/i)?.[1]?.toLowerCase();
  return new TextDecoder(enc && /^(iso-8859-1|latin1|windows-1252)$/.test(enc) ? "latin1" : "utf-8").decode(bytes);
}

const entidades = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, "&").trim();

function bloque(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : null;
}
function bloques(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g"))].map((m) => m[1]);
}
const texto = (xml: string | null, tag: string) => {
  const b = xml ? bloque(xml, tag) : null;
  return b === null ? null : entidades(b);
};
const numero = (xml: string | null, tag: string) => {
  const t = texto(xml, tag);
  if (t === null || t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export type LecturaDte = { dte: Dte } | { error: string };

export function leerDte(xmlBruto: string): LecturaDte {
  if (/<!DOCTYPE|<!ENTITY/i.test(xmlBruto)) return { error: "El XML trae declaraciones no permitidas." };
  // Quita prefijos de espacio de nombres (<sii:Folio> → <Folio>).
  const xml = xmlBruto.replace(/<(\/?)[A-Za-z_][\w.-]*:/g, "<$1");
  const docs = bloques(xml, "Documento");
  const doc = docs[0] ?? bloque(xml, "Exportaciones") ?? bloque(xml, "Liquidacion");
  if (!doc) return { error: "No encontramos un documento tributario electrónico en el archivo. Sube el XML de la factura o boleta tal como lo entrega el SII o tu proveedor." };

  const enc = bloque(doc, "Encabezado");
  const idDoc = enc ? bloque(enc, "IdDoc") : null;
  const em = enc ? bloque(enc, "Emisor") : null;
  const rec = enc ? bloque(enc, "Receptor") : null;
  const tot = enc ? bloque(enc, "Totales") : null;
  const tipo = numero(idDoc, "TipoDTE");
  const folio = numero(idDoc, "Folio");
  const fecha = texto(idDoc, "FchEmis") ?? "";
  const rutEm = texto(em, "RUTEmisor") ?? "";
  const total = numero(tot, "MntTotal");
  if (!tipo || !folio || !rutEm || total === null) return { error: "El XML no tiene los datos mínimos de un DTE (tipo, folio, emisor y total)." };

  const neto = numero(tot, "MntNeto");
  const exento = numero(tot, "MntExe");
  const tasaIva = numero(tot, "TasaIVA");
  const iva = numero(tot, "IVA");
  const impuestos = tot ? bloques(tot, "ImptoReten").map((b) => numero(b, "MontoImp") ?? 0) : [];
  const adicionales = impuestos.reduce((s, n) => s + n, 0);
  const items = bloques(doc, "Detalle").map((d) => ({ nombre: (texto(d, "NmbItem") ?? "").slice(0, 120), monto: numero(d, "MontoItem") ?? 0 })).slice(0, 60);

  const dte: Dte = {
    tipo, tipoNombre: TIPOS_DTE[tipo] ?? `Tipo ${tipo}`, folio, fecha,
    emisor: { rut: formatRut(rutEm), razon: (texto(em, "RznSoc") ?? texto(em, "RznSocEmisor") ?? "").slice(0, 160), giro: (texto(em, "GiroEmis") ?? texto(em, "GiroEmisor"))?.slice(0, 160) || null },
    receptor: { rut: texto(rec, "RUTRecep") ? formatRut(texto(rec, "RUTRecep")!) : null, razon: texto(rec, "RznSocRecep")?.slice(0, 160) || null },
    neto, exento, tasaIva, iva, adicionales, total, items,
    timbre: /<TED[\s>]/.test(xml), firma: /<Signature[\s>]/.test(xml), documentos: Math.max(docs.length, 1),
    revisiones: [],
  };
  dte.revisiones = revisarDte(dte);
  return { dte };
}

// Verificaciones que se pueden hacer con el propio documento.
export function revisarDte(d: Dte): Revision[] {
  const r: Revision[] = [];
  r.push(TIPOS_DTE[d.tipo] ? { ok: true, texto: `Tipo de documento: ${d.tipoNombre} (${d.tipo}).` } : { ok: false, grave: true, texto: `El tipo ${d.tipo} no es un DTE conocido del SII.` });
  r.push(Number.isInteger(d.folio) && d.folio > 0 ? { ok: true, texto: `Folio ${d.folio}.` } : { ok: false, grave: true, texto: "El folio no es válido." });
  r.push(FECHA.test(d.fecha) && !Number.isNaN(Date.parse(`${d.fecha}T12:00:00Z`)) ? { ok: true, texto: `Emitido el ${d.fecha}.` } : { ok: false, grave: true, texto: "La fecha de emisión no es válida." });
  r.push(isValidRut(d.emisor.rut) ? { ok: true, texto: `RUT del emisor ${d.emisor.rut}: dígito verificador correcto.` } : { ok: false, grave: true, texto: `El RUT del emisor ${d.emisor.rut} tiene el dígito verificador incorrecto.` });
  if (d.receptor.rut) {
    r.push(isValidRut(d.receptor.rut) || /^66\.?666\.?666-6$/.test(d.receptor.rut)
      ? { ok: true, texto: `RUT del receptor ${d.receptor.rut}: dígito verificador correcto.` }
      : { ok: false, grave: true, texto: `El RUT del receptor ${d.receptor.rut} tiene el dígito verificador incorrecto.` });
  }
  if (d.neto !== null && d.iva !== null && d.tasaIva) {
    const esperado = Math.round((d.neto * d.tasaIva) / 100);
    r.push(Math.abs(esperado - d.iva) <= 1
      ? { ok: true, texto: `IVA ${d.tasaIva}% sobre el neto: cuadra.` }
      : { ok: false, texto: `El IVA (${d.iva}) no es el ${d.tasaIva}% del neto (${esperado}). Puede haber IVA parcial o un error del emisor: revísalo.` });
  } else if ([33, 43, 46, 56, 61].includes(d.tipo) && d.neto && d.iva === null) {
    r.push({ ok: false, texto: "La factura tiene neto pero no muestra IVA." });
  }
  const suma = (d.neto ?? 0) + (d.exento ?? 0) + (d.iva ?? 0) + d.adicionales;
  if (d.neto !== null || d.exento !== null) {
    r.push(Math.abs(suma - d.total) <= 1
      ? { ok: true, texto: "Neto + exento + IVA + otros impuestos = total: cuadra." }
      : { ok: false, texto: `El total (${d.total}) no coincide con la suma de sus partes (${suma}). Puede haber retenciones o montos no facturables: revísalo.` });
  }
  r.push(d.timbre ? { ok: true, texto: "Trae timbre electrónico (TED)." } : { ok: false, texto: "No trae timbre electrónico (TED): podría no ser el XML original." });
  if (d.documentos > 1) r.push({ ok: false, texto: `El archivo trae ${d.documentos} documentos; se leyó solo el primero.` });
  return r;
}

export const DOCUMENTO_GASTO_DTE: Record<number, string> = { 33: "factura", 34: "factura", 46: "factura", 43: "factura", 39: "boleta", 41: "boleta" };

// ¿Es la empresa el receptor? (para gastos y compras). null si el DTE no trae receptor o la empresa no tiene RUT.
export function receptorEsEmpresa(d: Dte, rutEmpresa: string | null): boolean | null {
  if (!d.receptor.rut || !rutEmpresa) return null;
  const limpio = (s: string) => s.replace(/[^0-9kK]/g, "").toUpperCase();
  return limpio(d.receptor.rut) === limpio(rutEmpresa);
}
