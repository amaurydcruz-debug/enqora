// «Registrar gasto» (0067): categorías, avisos fijos de CORA, la herramienta de lectura para la IA y su
// validación, y una lectura por reglas para lo dictado o escrito cuando la IA no está disponible.
// Funciones puras, sin red.

import { DOCUMENTO_GASTO_DTE, receptorEsEmpresa, type Dte } from "@/lib/dte";

export const CATEGORIAS_GASTO: Record<string, string> = {
  mercaderia: "Mercadería para vender", insumos: "Insumos y materiales", arriendo: "Arriendo", servicios_basicos: "Luz, agua, gas, internet",
  transporte: "Transporte y fletes", combustible: "Combustible", alimentacion: "Alimentación", honorarios: "Honorarios",
  publicidad: "Publicidad", equipos: "Equipos y herramientas", mantencion: "Mantención y reparaciones", bancarios: "Gastos bancarios",
  impuestos: "Impuestos y patentes", otros: "Otros",
};
export const DOCUMENTOS_GASTO: Record<string, string> = {
  boleta: "Boleta", factura: "Factura", boleta_honorarios: "Boleta de honorarios", sin_documento: "Sin documento", otro: "Otro comprobante",
};
export type Gasto = {
  fecha: string; monto: number; iva: number | null; descripcion: string; categoria: string; documento: string;
  proveedor: string | null; folio: string | null; confianza: "alta" | "media" | "baja"; dudas: string[];
};

// Avisos de CORA con texto fijo (no los redacta la IA).
export const AVISO_GASTO: Record<string, string> = {
  sin_documento: "Un gasto sin boleta ni factura queda en tu control, pero en general no se acepta para rebajar impuestos: la Ley sobre Impuesto a la Renta (art. 31) exige que el gasto esté acreditado. Pide siempre boleta o, mejor, factura.",
  boleta: "La boleta respalda el gasto, pero no da crédito de IVA. Si compras para tu negocio, pide factura a nombre de tu empresa.",
  factura: "Las facturas electrónicas ya llegan a tu Registro de Compras del SII: ENQORA las cruza para no contarlas dos veces.",
  personal: "Un gasto personal no es gasto del negocio: queda fuera de tu contabilidad tributaria.",
};

export const SISTEMA_GASTO = [
  "Eres el lector de gastos de ENQORA (Chile). Transcribes los datos de UN gasto desde la foto de una boleta, factura o comprobante, o desde lo que la persona dictó o escribió.",
  "No inventes: si un dato no se ve o no se dijo, déjalo vacío y anótalo en «dudas». Montos en pesos chilenos como números enteros (sin puntos).",
  "Fecha en formato AAAA-MM-DD. Si dicen «hoy» o «ayer», usa la fecha de referencia que se indica.",
  "Documento: «factura» solo si dice factura; «boleta» si es boleta o ticket de venta; «boleta_honorarios» si es de honorarios; «sin_documento» si la persona dice que no tiene comprobante.",
  "IVA: solo si el documento lo muestra separado (en facturas). No lo calcules.",
  "No transcribas el RUT ni datos de personas naturales; el nombre del comercio sí.",
].join("\n");

export const HERRAMIENTA_GASTO = {
  name: "registrar_lectura_gasto",
  description: "Entrega los datos leídos del gasto.",
  input_schema: {
    type: "object",
    properties: {
      fecha: { type: "string" }, monto: { type: "number" }, iva: { type: "number" }, descripcion: { type: "string", description: "Qué se compró, breve." },
      categoria: { type: "string", enum: Object.keys(CATEGORIAS_GASTO) }, documento: { type: "string", enum: Object.keys(DOCUMENTOS_GASTO) },
      proveedor: { type: "string", description: "Nombre del comercio, si se ve." }, folio: { type: "string" },
      confianza: { type: "string", enum: ["alta", "media", "baja"] }, dudas: { type: "array", items: { type: "string" } },
      es_comprobante: { type: "boolean", description: "false si la imagen no es un comprobante de compra." },
    },
    required: ["monto", "descripcion", "categoria", "documento", "confianza"],
  },
};

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export function validarGasto(raw: unknown, hoy: string): Gasto | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.es_comprobante === false) return null;
  const monto = Math.round(Number(o.monto));
  if (!Number.isFinite(monto) || monto <= 0 || monto >= 1e10) return null;
  const fecha = typeof o.fecha === "string" && FECHA.test(o.fecha) && o.fecha <= hoy ? o.fecha : hoy;
  const iva = Number(o.iva);
  return {
    fecha, monto, iva: Number.isFinite(iva) && iva > 0 && iva < monto ? Math.round(iva) : null,
    descripcion: str(o.descripcion, 300) || "Gasto",
    categoria: typeof o.categoria === "string" && o.categoria in CATEGORIAS_GASTO ? o.categoria : "otros",
    documento: typeof o.documento === "string" && o.documento in DOCUMENTOS_GASTO ? o.documento : "otro",
    proveedor: str(o.proveedor, 160) || null, folio: str(o.folio, 30) || null,
    confianza: o.confianza === "alta" || o.confianza === "media" ? o.confianza : "baja",
    dudas: (Array.isArray(o.dudas) ? o.dudas : []).map((d) => str(d, 200)).filter(Boolean).slice(0, 5),
  };
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const PALABRAS_CATEGORIA: [RegExp, string][] = [
  [/bencina|combustible|petroleo|diesel|copec|shell|aramco|petrobras/, "combustible"],
  [/arriendo|alquiler/, "arriendo"],
  [/luz|agua|gas|internet|telefono|celular|enel|aguas/, "servicios_basicos"],
  [/almuerzo|comida|colacion|cafe|restoran|restaurant/, "alimentacion"],
  [/uber|taxi|flete|despacho|envio|pasaje|peaje|estacionamiento/, "transporte"],
  [/mercaderia|stock|para vender|proveedor/, "mercaderia"],
  [/insumo|material|bolsas|envases|papel/, "insumos"],
  [/publicidad|anuncio|facebook|instagram|google ads|volantes/, "publicidad"],
  [/computador|impresora|herramienta|maquina|equipo|celular nuevo/, "equipos"],
  [/reparacion|mantencion|arreglo/, "mantencion"],
  [/comision|banco|mantencion de cuenta/, "bancarios"],
  [/patente|impuesto|contribuciones/, "impuestos"],
  [/honorario/, "honorarios"],
];

// Lectura por reglas de lo dictado o escrito: «gasté 15.990 en bencina con boleta».
export function gastoDesdeTexto(texto: string, hoy: string): Gasto | null {
  const t = sinTildes(texto);
  // El monto es la cifra más grande dicha («el 12 gasté 15.990» → 15.990); «15 mil» → 15.000.
  const cifras = [...t.matchAll(/(\d{1,3}(?:\.\d{3})+|\d+)(\s*mil\b)?/g)].map((m) => Number(m[1].replace(/\./g, "")) * (m[2] ? 1000 : 1));
  const monto = cifras.length ? Math.max(...cifras) : 0;
  if (!monto) return null;
  const ayer = new Date(`${hoy}T12:00:00`);
  ayer.setDate(ayer.getDate() - 1);
  const fecha = /\bayer\b/.test(t) ? ayer.toISOString().slice(0, 10) : hoy;
  const documento = /sin (boleta|factura|comprobante|documento)/.test(t) ? "sin_documento" : /factura/.test(t) ? "factura" : /honorario/.test(t) ? "boleta_honorarios" : /boleta|ticket/.test(t) ? "boleta" : "otro";
  const categoria = PALABRAS_CATEGORIA.find(([re]) => re.test(t))?.[1] ?? "otros";
  return {
    fecha, monto, iva: null, descripcion: texto.trim().slice(0, 300), categoria, documento, proveedor: null, folio: null, confianza: "baja",
    dudas: ["Lectura automática simple: revisa los datos antes de guardar."],
  };
}

// Doble lectura (dos modelos distintos): si coinciden en monto y fecha, se mantiene la primera; si no, se deja la
// primera pero con confianza baja y la diferencia anotada para que la persona la revise.
export function cruzarLecturas(a: Gasto, b: Gasto): Gasto {
  const dudas = [...a.dudas];
  const fmt = (n: number) => n.toLocaleString("es-CL");
  if (a.monto !== b.monto) dudas.unshift(`Dos lectores independientes leyeron montos distintos (${fmt(a.monto)} y ${fmt(b.monto)}): confirma el total.`);
  if (a.fecha !== b.fecha) dudas.unshift(`Dos lectores independientes leyeron fechas distintas (${a.fecha} y ${b.fecha}).`);
  if ((a.iva ?? 0) !== (b.iva ?? 0)) dudas.push("El IVA leído no coincide entre los dos lectores.");
  const coinciden = dudas.length === a.dudas.length;
  return {
    ...a, dudas: (coinciden ? [...a.dudas, "Dos lectores independientes coinciden en monto y fecha."] : dudas).slice(0, 6),
    confianza: coinciden ? a.confianza : "baja",
  };
}

// Gasto desde un DTE en XML (factura o boleta electrónica). Solo documentos de compra; las notas y guías no.
export function gastoDesdeDte(d: Dte, rutEmpresa: string | null, hoy: string): { gasto: Gasto } | { error: string } {
  const documento = DOCUMENTO_GASTO_DTE[d.tipo];
  if (!documento) return { error: `${d.tipoNombre}: no se registra como gasto aquí. Tu contador la ve en el Registro de Compras.` };
  if (d.total <= 0) return { error: "El documento tiene total cero." };
  const graves = d.revisiones.filter((r) => !r.ok && r.grave);
  if (graves.length) return { error: `El XML no pasó la verificación: ${graves.map((r) => r.texto).join(" ")}` };
  const dudas = d.revisiones.filter((r) => !r.ok).map((r) => r.texto);
  const esEmpresa = receptorEsEmpresa(d, rutEmpresa);
  if (esEmpresa === false) dudas.unshift("El documento no está emitido a nombre de tu empresa: no da crédito de IVA a tu empresa.");
  const descripcion = d.items.map((i) => i.nombre).filter(Boolean).slice(0, 3).join(", ") || d.tipoNombre;
  return {
    gasto: {
      fecha: d.fecha <= hoy ? d.fecha : hoy, monto: Math.round(d.total),
      iva: documento === "factura" && d.iva && d.iva < d.total && esEmpresa !== false ? Math.round(d.iva) : null,
      descripcion: descripcion.slice(0, 300), documento,
      categoria: PALABRAS_CATEGORIA.find(([re]) => re.test(sinTildes(`${descripcion} ${d.emisor.razon} ${d.emisor.giro ?? ""}`)))?.[1] ?? "otros",
      proveedor: d.emisor.razon || null, folio: String(d.folio).slice(0, 30),
      confianza: dudas.length ? "media" : "alta", dudas: dudas.slice(0, 5),
    },
  };
}
