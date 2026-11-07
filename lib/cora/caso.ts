// «Cuéntanos tu caso»: la carta de CORA al dueño (texto directo, armado solo con hechos verificados) y el
// ordenamiento del relato (servicios y documentos necesarios). Funciones puras, sin red.
import type { Expediente } from "@/lib/cora/director";
import { CATEGORIES } from "@/lib/discovery";
import { evaluarObligaciones } from "@/lib/cora/normativa-laboral";
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

// ── Carta de CORA: directa, en segunda persona, solo con hechos de la consulta ──
export function cartaCora(r: PublicCompany, exp: Expediente): { titulo: string; parrafos: string[] } {
  const razon = r.razon_social ?? "Tu empresa";
  const inicio = r.inicio_actividades ? Number(r.inicio_actividades.slice(0, 4)) : null;
  const anios = inicio ? new Date().getUTCFullYear() - inicio : null;
  const cerrada = !!r.termino_giro;
  const alertas = (r.senales ?? []).filter((s) => s.gravedad === "alta" || s.gravedad === "media").length;
  const trabajadores = r.perfil?.trabajadores ?? null;
  const constitucion = exp.secciones.flatMap((s) => s.encontrado).find((x) => x.startsWith("Constituida el "));
  const ganchos = exp.beneficios.filter((b) => b.gancho && !/Estado/.test(b.gancho)).map((b) => b.gancho!.replace(/\.$/, ""));
  const estado = exp.beneficios.some((b) => /Estado/.test(b.nombre));

  const p: string[] = [];
  if (cerrada) {
    p.push(`${razon} registra término de giro${r.termino_giro ? ` el ${new Date(`${r.termino_giro}T12:00:00Z`).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}` : ""}. Si quedó algo pendiente del cierre, o quieres volver a emprender, te acompañamos de principio a fin.`);
  } else {
    const desde = constitucion ? constitucion.replace(/\. Fuente:.*$/, "").replace(/^Constituida el /, "constituida el ") : inicio ? `con inicio de actividades en ${inicio}${anios && anios > 0 ? ` (${anios} ${anios === 1 ? "año" : "años"} en marcha)` : ""}` : "con inicio de actividades informado";
    p.push(`Empresa ${desde}, sin término de giro${alertas ? ` y con ${alertas} ${alertas === 1 ? "punto" : "puntos"} a revisar en la información pública del SII` : " y sin alertas en la información pública del SII"}.`);
    // Trabajadores según el SII (indicador anual): qué le pide la ley con ese tamaño, de la normativa laboral verificada.
    const anio = r.perfil?.anio_comercial ?? null;
    if (trabajadores && trabajadores > 0) {
      // Primero lo que depende del tamaño (lo que más se pasa por alto), luego lo que aplica a todo empleador.
      const ORDEN = ["depto_prevencion", "cphs", "delegado", "reglamento_interno", "lre", "karin", "ds44_base", "contrato", "cotizaciones", "seguro_16744"];
      const pide = evaluarObligaciones(trabajadores, anio).filter((o) => o.aplicacion === "potencial" && ORDEN.includes(o.id))
        .sort((a, b) => ORDEN.indexOf(a.id) - ORDEN.indexOf(b.id)).map((o) => o.nombre);
      p.push(`El SII informa ${trabajadores} ${trabajadores === 1 ? "trabajador" : "trabajadores"}${anio ? ` en ${anio}` : ""}. Con ese tamaño, la ley te pide, entre otras cosas: ${pide.slice(0, 5).join("; ")}. ¿Lo tienes todo al día? Nuestros asesores lo revisan contigo y resuelven lo que esté pendiente.`);
    } else if (trabajadores === 0) {
      p.push(`El SII no informa trabajadores dependientes${anio ? ` en ${anio}` : ""}. Si ya contrataste o vas a hacerlo, te dejamos contratos, cotizaciones y el protocolo de la Ley Karin en regla desde el primer día.`);
    } else {
      p.push("Si tienes trabajadores, te ayudamos a tener contratos y cotizaciones en regla, y si hay alguna situación pendiente, nuestros asesores la resuelven contigo.");
    }
    if (ganchos.length) p.push(`El Estado da beneficios tributarios que puedes usar a tu favor. Por ejemplo: ${ganchos.slice(0, 2).map((g) => g.charAt(0).toLowerCase() + g.slice(1)).join("; ")}.`);
    if (estado) p.push(`Si tu empresa está al día, puedes venderle al Estado${r.perfil?.rubro ? ` en tu rubro (${r.perfil.rubro.toLowerCase()})` : ""}. La inscripción en Mercado Público es gratuita; ENQORA te ayuda a descubrir qué organismos compran lo que ofreces y a preparar ofertas que compitan.`);
  }
  p.push("¿Declaración de renta pendiente o problemas contables? ENQORA es tu solución: nuestros expertos resuelven desde cero hasta dejar tu empresa funcionando. Llevamos tu contabilidad, registramos tu marca y formalizamos tu empresa.");
  return { titulo: razon, parrafos: p };
}
