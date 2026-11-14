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
  carta_despido: { nombre: "Carta de despido o aviso de término", como: "La carta o comunicación que recibiste (o enviaste), con su fecha." },
  finiquito: { nombre: "Finiquito", como: "Firmado o el borrador propuesto, si existe." },
  demanda: { nombre: "Demanda o notificación del tribunal", como: "La copia que te notificaron, con la fecha de notificación." },
  acta_dt: { nombre: "Acta, citación o multa de la Dirección del Trabajo", como: "El documento de la fiscalización o del reclamo, con su fecha." },
  reglamento_interno: { nombre: "Reglamento interno y protocolo de acoso (Ley Karin)", como: "La versión vigente de tu empresa." },
  registro_asistencia: { nombre: "Registro de asistencia y horas extra", como: "Del período en conflicto." },
  certificado_deuda: { nombre: "Certificado de deuda fiscal (Tesorería)", como: "Se descarga gratis en tgr.gob.cl con tu propia clave y se comparte como PDF. ENQORA nunca pide tus claves." },
  datos_personales: { nombre: "Lista de los datos personales que maneja tu empresa", como: "Qué datos guardas de clientes y trabajadores, dónde y para qué (una lista simple basta)." },
};

export type AnalisisCaso = { resumen: string; categorias: string[]; documentos: string[]; origen: "ia" | "reglas"; urgencia?: string };

export const CATEGORIAS_CASO = CATEGORIES.filter((c) => c.key !== "enterprise").map((c) => c.key);
const DOCS_POR_CATEGORIA: Record<string, string[]> = {
  contabilidad: ["carpeta_tributaria", "f29", "rcv", "cartolas"],
  tributario: ["carpeta_tributaria", "certificado_deuda", "notificacion_sii", "f29", "f22"],
  marcas: ["marca"],
  constitucion: ["socios"],
  formalizacion: ["escritura", "domicilio"],
  gestion: ["rcv", "cartolas"],
  profesionales: ["contratos", "liquidaciones", "cotizaciones"],
  trabajador: ["carta_despido", "contratos", "finiquito", "liquidaciones", "cotizaciones"],
  empleador: ["demanda", "contratos", "carta_despido", "liquidaciones", "acta_dt"],
  crecimiento: ["carpeta_tributaria", "estados_financieros"],
};

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// Áreas laborales: quién habla define el lado (trabajador o empleador). Van primero: ganan a «profesionales».
const LABORAL_TRABAJADOR = /\b(me (despidieron|echaron|desvincularon|deben)|mi (jefe|jefa|empleador|empleadora)|autodespido|despido indirecto|no me (pagan|pagaron|han pagado)|mis cotizaciones|me (acosan|hostigan|discriminan)|acoso laboral|tutela|accidente (laboral|del trabajo|de trabajo)|horas extra)/;
const LABORAL_EMPLEADOR = /\b(un (trabajador|ex ?trabajador|empleado) me|me demand\w+ (un|una) (trabajador|trabajadora|ex)|demanda laboral|despedir a|desvincular a|mis (trabajadores|empleados)|fiscalizaci\w* de la direccion del trabajo|inspeccion del trabajo (me|nos)|reglamento interno|protocolo (de acoso|ley karin)|multa de la (direccion|inspeccion) del trabajo)/;
const REGLAS: [RegExp, string][] = [
  [LABORAL_EMPLEADOR, "empleador"],
  [LABORAL_TRABAJADOR, "trabajador"],
  [/\b(renta|f22|operacion renta|impuesto|sii|multa|giro|fiscaliz|notificaci|citaci|deuda|deudas|tgr|tesoreria|condonaci\w*|convenio de pago|regimen|pro ?pyme)\b/, "tributario"],
  [/\b(contab|iva|f29|libro|balance|factura|boleta|conciliaci)\w*/, "contabilidad"],
  [/\b(marca|logo|inapi|nombre comercial)\w*/, "marcas"],
  [/\b(trabajador|empleado|contrato|despido|finiquito|sueldo|liquidaci|cotizaci|previred|ley karin|direccion del trabajo|reglamento interno|mutual|prevencion de riesgos|datos personales|privacidad|ley 21\.?719)\w*/, "profesionales"],
  [/\b(constituir|crear (mi |una )?empresa|nueva empresa|sociedad|socio|spa|eirl)\b/, "constitucion"],
  [/\b(patente|permiso|inicio de actividades|formaliz|municipal|resolucion sanitaria|termino de giro|cerrar (?:mi |la )?empresa|disolver|disolucion)\w*/, "formalizacion"],
  [/\b(licitaci|mercado publico|fondo|sercotec|corfo|financiamiento|credito|crecer)\w*/, "crecimiento"],
  [/\b(inventario|caja|clientes|ventas|cobranza)\b/, "gestion"],
];

// Ordenamiento por reglas (respaldo si la IA no está disponible).
export function analizarReglas(relato: string): AnalisisCaso {
  const t = sinTildes(relato);
  let todas = [...new Set(REGLAS.filter(([re]) => re.test(t)).map(([, c]) => c))];
  if (todas.includes("empleador")) todas = todas.filter((c) => c !== "trabajador" && c !== "profesionales");
  else if (todas.includes("trabajador")) todas = todas.filter((c) => c !== "profesionales");
  const categorias = todas.slice(0, 2);
  const cats = categorias.length ? categorias : ["contabilidad"];
  // Documentos específicos que el relato pide aunque la categoría sea general.
  const extra = [
    ...(/\b(deuda|deudas|tgr|tesoreria|condonaci\w*|convenio de pago)\b/.test(t) ? ["certificado_deuda"] : []),
    ...(/\b(datos personales|privacidad|ley 21\.?719)\b/.test(t) ? ["datos_personales"] : []),
  ];
  const documentos = [...new Set([...extra, ...documentosPara(cats)])].slice(0, 5);
  return { resumen: "", categorias: cats, documentos, origen: "reglas" };
}

// Plazos laborales verificados (Código del Trabajo; Dirección del Trabajo). Texto fijo, nunca generado por IA:
// CORA solo avisa que hay un plazo corriendo; el abogado calcula el plazo exacto del caso.
export function urgenciaLaboral(relato: string, categorias: string[]): string | undefined {
  const t = sinTildes(relato);
  if (categorias.includes("trabajador")) {
    if (/despid|despido|autodespido|desvincul|me echaron|termino (de|del) contrato|carta de aviso/.test(t))
      return "Atención a los plazos: para demandar por despido injustificado (o por vulneración de derechos con ocasión del despido) hay 60 días hábiles desde la separación, de lunes a sábado sin feriados. Si reclamas ante la Inspección del Trabajo, el plazo se suspende mientras dura el reclamo, con un máximo de 90 días hábiles desde la separación (arts. 168 y 489 del Código del Trabajo). Si ya pasaron varias semanas, avísanos de inmediato.";
    if (/acoso|hostig|discrimin|vulnera|tutela/.test(t))
      return "Atención a los plazos: la denuncia por vulneración de derechos fundamentales durante la relación laboral se presenta dentro de 60 días desde que ocurre la vulneración (art. 486 del Código del Trabajo). Cuéntanos desde cuándo ocurre.";
    if (/no me (pagan|pagaron|han pagado)|me deben|cotizacion|horas extra|sueldo|remuneraci|indemnizaci|finiquito/.test(t))
      return "Atención a los plazos: los derechos laborales prescriben en 2 años desde que se hicieron exigibles, y si el contrato ya terminó, las acciones deben ejercerse dentro de 6 meses desde el término de los servicios (art. 510 del Código del Trabajo).";
  }
  if (categorias.includes("empleador") && /demand|notific|tribunal|juzgado|audiencia/.test(t))
    return "Atención a los plazos: si te notificaron una demanda laboral, los plazos para contestarla y preparar la audiencia corren desde la notificación y son breves. Sube la demanda apenas la tengas para que el abogado revise las fechas exactas.";
  if (categorias.includes("empleador") && /fiscaliz|multa|inspeccion|direccion del trabajo/.test(t))
    return "Atención a los plazos: las multas y actas de la Dirección del Trabajo tienen plazos acotados para reclamar o corregir. Sube el acta o la resolución con su fecha para que el abogado revise el plazo exacto.";
  return undefined;
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
