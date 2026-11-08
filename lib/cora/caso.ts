// «Cuéntanos tu caso»: la carta de CORA al dueño (texto directo, armado solo con hechos verificados) y el
// ordenamiento del relato (servicios y documentos necesarios). Funciones puras, sin red.
import type { Expediente } from "@/lib/cora/director";
import { CATEGORIES } from "@/lib/discovery";
import type { PublicCompany } from "@/app/actions/public";

// Documentos que un profesional suele pedir para cotizar y resolver, por área. Lista cerrada: CORA solo
// puede pedir documentos de esta lista (nunca claves: ENQORA no pide ClaveÚnica ni clave del SII).
export const DOCUMENTOS: Record<string, { nombre: string; como: string }> = {
  carpeta_tributaria: { nombre: "Carpeta Tributaria Electrónica", como: "Se descarga gratis en sii.cl, con tu clave, y se comparte como PDF." },
  f29: { nombre: "Últimas declaraciones de IVA (F29)", como: "Copia en PDF desde sii.cl." },
  f22: { nombre: "Declaración de renta (F22) del último año", como: "Copia en PDF desde sii.cl." },
  rcv: { nombre: "Registro de Compras y Ventas", como: "Se exporta desde sii.cl." },
  cartolas: { nombre: "Cartolas bancarias de la empresa", como: "Las de los meses en revisión." },
  notificacion_sii: { nombre: "Notificación, citación o giro del SII o la TGR", como: "Si recibiste alguna, una foto o el PDF." },
  contratos: { nombre: "Contratos de trabajo y anexos", como: "De las personas involucradas." },
  liquidaciones: { nombre: "Liquidaciones de sueldo", como: "De los meses en revisión." },
  cotizaciones: { nombre: "Certificado de cotizaciones previsionales", como: "Se descarga desde Previred." },
  escritura: { nombre: "Escritura o certificado de constitución", como: "Desde el Registro de Empresas o la notaría." },
  socios: { nombre: "Datos de socios o accionistas", como: "Nombre, RUT y porcentaje de cada uno." },
  domicilio: { nombre: "Respaldo del domicilio comercial", como: "Contrato de arriendo, dominio vigente o autorización." },
  marca: { nombre: "Nombre y logo de la marca", como: "Y una descripción de tus productos o servicios." },
  estados_financieros: { nombre: "Balance o estados financieros del último año", como: "Si los tienes." },
};

export type AnalisisCaso = { resumen: string; categorias: string[]; documentos: string[]; origen: "ia" | "reglas" };

export const CATEGORIAS_CASO = CATEGORIES.filter((c) => c.key !== "enterprise").map((c) => c.key);
const DOCS_POR_CATEGORIA: Record<string, string[]> = {
  contabilidad: ["carpeta_tributaria", "f29", "rcv", "cartolas"],
  tributario: ["carpeta_tributaria", "notificacion_sii", "f29", "f22"],
  marcas: ["marca"],
  constitucion: ["socios"],
  formalizacion: ["escritura", "domicilio"],
  gestion: ["rcv", "cartolas"],
  profesionales: ["contratos", "liquidaciones", "cotizaciones"],
  crecimiento: ["carpeta_tributaria", "estados_financieros"],
};

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const REGLAS: [RegExp, string][] = [
  [/\b(renta|f22|operacion renta|impuesto|sii|multa|giro|fiscaliz|notificaci|citaci|deuda|tgr|tesoreria)\b/, "tributario"],
  [/\b(contab|iva|f29|libro|balance|factura|boleta|conciliaci)\w*/, "contabilidad"],
  [/\b(marca|logo|inapi|nombre comercial)\w*/, "marcas"],
  [/\b(trabajador|empleado|contrato|despido|finiquito|sueldo|liquidaci|cotizaci|previred|ley karin|direccion del trabajo)\w*/, "profesionales"],
  [/\b(constituir|crear (mi |una )?empresa|nueva empresa|sociedad|socio|spa|eirl)\b/, "constitucion"],
  [/\b(patente|permiso|inicio de actividades|formaliz|municipal|resolucion sanitaria)\w*/, "formalizacion"],
  [/\b(licitaci|mercado publico|fondo|sercotec|corfo|financiamiento|credito|crecer)\w*/, "crecimiento"],
  [/\b(inventario|caja|clientes|ventas|cobranza)\b/, "gestion"],
];

// Ordenamiento por reglas (respaldo si la IA no está disponible).
export function analizarReglas(relato: string): AnalisisCaso {
  const t = sinTildes(relato);
  const categorias = [...new Set(REGLAS.filter(([re]) => re.test(t)).map(([, c]) => c))].slice(0, 2);
  const cats = categorias.length ? categorias : ["contabilidad"];
  return { resumen: "", categorias: cats, documentos: documentosPara(cats), origen: "reglas" };
}

export const documentosPara = (cats: string[]) => [...new Set(cats.flatMap((c) => DOCS_POR_CATEGORIA[c] ?? []))].slice(0, 5);

// Valida la salida de la IA contra las listas cerradas.
export function validarAnalisis(raw: unknown): AnalisisCaso | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { resumen?: unknown; categorias?: unknown; documentos?: unknown };
  const resumen = typeof o.resumen === "string" ? o.resumen.trim().slice(0, 600) : "";
  const categorias = Array.isArray(o.categorias) ? o.categorias.filter((c): c is string => typeof c === "string" && CATEGORIAS_CASO.includes(c)).slice(0, 2) : [];
  const documentos = Array.isArray(o.documentos) ? o.documentos.filter((d): d is string => typeof d === "string" && d in DOCUMENTOS).slice(0, 5) : [];
  if (!resumen || !categorias.length) return null;
  if (/garantiz|\$\s?\d|clave ?unica|clave del sii|contrase/i.test(resumen)) return null;
  return { resumen, categorias, documentos: documentos.length ? documentos : documentosPara(categorias), origen: "ia" };
}

export const nombreCategoria = (k: string) => CATEGORIES.find((c) => c.key === k)?.title ?? k;

// ── Identidad empresarial: solo antecedentes encontrados en fuentes, sin recomendaciones ──
// Distingue la constitución (Registro de Empresas) del inicio de actividades (SII).
export type DatoIdentidad = { etiqueta: string; valor: string; fuente: string };
export function identidadEmpresa(r: PublicCompany, exp: Expediente): DatoIdentidad[] {
  const fecha = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const datos: DatoIdentidad[] = [];
  const res = exp.secciones.flatMap((s) => s.encontrado).find((x) => x.startsWith("Constituida el "));
  const m = res?.match(/^Constituida el (.+?) \((.+?)\)(?: como ([^,]+))?(?:, con capital inicial de ([^,]+))?(?:, en (.+?))?\. Fuente/);
  if (m) {
    datos.push({ etiqueta: "Constitución", valor: `${m[1]}${m[3] ? ` · ${m[3]}` : ""}`, fuente: "Registro de Empresas y Sociedades" });
    if (m[4]) datos.push({ etiqueta: "Capital inicial", valor: m[4], fuente: "Registro de Empresas y Sociedades" });
    if (m[5]) datos.push({ etiqueta: "Domicilio", valor: m[5].replace(/\b([A-ZÁÉÍÓÚÑ])([A-ZÁÉÍÓÚÑ]+)\b/g, (_, a: string, b: string) => a + b.toLowerCase()), fuente: "Registro de Empresas y Sociedades" });
  }
  if (r.inicio_actividades) datos.push({ etiqueta: "Inicio de actividades", valor: fecha(r.inicio_actividades), fuente: "SII" });
  datos.push({ etiqueta: "Situación", valor: r.termino_giro ? `Término de giro el ${fecha(r.termino_giro)}` : "Sin término de giro informado", fuente: "SII" });
  const acts = r.actividades ?? [];
  if (acts.length) datos.push({ etiqueta: `Actividades vigentes (${r.total_actividades ?? acts.length})`, valor: acts.slice(0, 2).map((a) => a.descripcion ?? a.codigo).filter(Boolean).join(" · "), fuente: "SII" });
  if (r.perfil?.tramo_ventas) datos.push({ etiqueta: "Tamaño por ventas", valor: `${r.perfil.tramo_ventas}${r.perfil.anio_comercial ? ` (${r.perfil.anio_comercial})` : ""}`, fuente: "SII" });
  if (r.perfil?.trabajadores != null) datos.push({ etiqueta: "Trabajadores informados", valor: `${r.perfil.trabajadores}${r.perfil.anio_comercial ? ` (${r.perfil.anio_comercial})` : ""}`, fuente: "SII" });
  if (r.perfil?.rubro) datos.push({ etiqueta: "Rubro", valor: r.perfil.rubro, fuente: "SII" });
  return datos;
}

// Objetivos del cierre «Conozcamos qué quieres conseguir»: se ordenan según lo que CORA encontró.
export const OBJETIVOS: { id: string; texto: string; categoria: string; pista: RegExp }[] = [
  { id: "impuestos", texto: "Ordenar mis impuestos y mi contabilidad", categoria: "contabilidad", pista: /tribut|iva|f29|renta|contab|sii/i },
  { id: "personas", texto: "Contratar o tener en regla a mis trabajadores", categoria: "profesionales", pista: /trabajador|laboral|contrato|cotizaci|karin|prevenci/i },
  { id: "vender", texto: "Vender más (también al Estado)", categoria: "crecimiento", pista: /mercado público|estado|licitaci|proveedor|ventas/i },
  { id: "marca", texto: "Proteger mi marca", categoria: "marcas", pista: /marca|inapi/i },
  { id: "financiar", texto: "Conseguir financiamiento o fondos", categoria: "crecimiento", pista: /fondo|sercotec|corfo|financ|crece/i },
  { id: "formalizar", texto: "Formalizar o modificar mi empresa", categoria: "formalizacion", pista: /patente|permiso|socie|estatut|accionista|formaliz/i },
];
export function objetivosOrdenados(textos: string[]): typeof OBJETIVOS {
  const t = textos.join(" ");
  return [...OBJETIVOS].sort((a, b) => Number(b.pista.test(t)) - Number(a.pista.test(t)));
}
