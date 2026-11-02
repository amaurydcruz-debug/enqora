import type { SectionKey } from "@/lib/cora/secciones";

// CORA · Catálogo Maestro de Fuentes de ENQORA.
// Cada fuente declara cómo se accede y en qué estado está su conexión. Regla: nada se marca como
// «conectada» o «verificada» si no se comprobó; una fuente sin verificar queda «por investigar».
// Preparado por país: para sumar otro país se agregan sus fuentes con su código (p. ej. «DO»).

export type Pais = "CL";

// A: descarga masiva automatizable · B: consulta pública caso a caso (API o verificación manual)
// C: privada, con autorización del titular · D: documento que aporta la empresa · E: no disponible o por investigar
export type NivelAcceso = "A" | "B" | "C" | "D" | "E";

export type EstadoConexion =
  | "conectada" // CORA ya la consulta automáticamente
  | "normativa" // fuente normativa oficial verificada: CORA aplica sus reglas (no consulta datos de la empresa)
  | "curada" // información oficial revisada por el equipo y mantenida en ENQORA (p. ej. beneficios M16)
  | "manual" // consulta pública que se hace a mano: CORA entrega el enlace y lo marca como pendiente
  | "documental" // la empresa la aporta (hoy: hoja de vida M18)
  | "requiere_autorizacion" // privada: solo con autorización expresa del titular
  | "proxima_etapa" // verificada y planificada, aún no conectada
  | "por_investigar"; // falta confirmar si existe API, datos abiertos o un mecanismo oficial

export type Fuente = {
  id: string;
  pais: Pais;
  organismo: string;
  nombre: string;
  url: string; // vacío si no hay un sitio oficial único
  secciones: SectionKey[];
  nivel: NivelAcceso;
  metodo: string;
  campos: string[];
  restricciones: string;
  frecuencia: string;
  estado: EstadoConexion;
  verificada: string | null; // fecha (AAAA-MM-DD) en que el equipo comprobó lo que aquí se dice
  nota?: string;
};

export const NIVELES: Record<NivelAcceso, string> = {
  A: "Descarga masiva automatizable",
  B: "Consulta pública caso a caso",
  C: "Privada: requiere autorización del titular",
  D: "Documentación que aporta la empresa",
  E: "No disponible o por investigar",
};

export const ESTADOS_CONEXION: Record<EstadoConexion, { label: string; tone: "ok" | "gold" | "muted" | "warn" }> = {
  conectada: { label: "Conectada", tone: "ok" },
  normativa: { label: "Normativa verificada", tone: "ok" },
  curada: { label: "Curada por el equipo", tone: "ok" },
  manual: { label: "Verificación manual", tone: "gold" },
  documental: { label: "Documento de la empresa", tone: "gold" },
  requiere_autorizacion: { label: "Requiere autorización", tone: "warn" },
  proxima_etapa: { label: "Próxima etapa", tone: "muted" },
  por_investigar: { label: "Por investigar", tone: "muted" },
};

export const FUENTES: Fuente[] = [
  // ── Identidad, constitución y tributación ──
  {
    id: "sii_nominas", pais: "CL", organismo: "SII", nombre: "Nóminas de personas jurídicas (razón social, actividades, empresas)",
    url: "https://www.sii.cl/sobre_el_sii/nominapersonasjuridicas.html", secciones: ["identidad", "tributacion", "laboral"], nivel: "A",
    metodo: "Descarga de ZIP oficiales y carga por tramos con el conector ENQORA (M18)",
    campos: ["RUT", "razón social", "inicio de actividades", "término de giro", "actividades económicas", "tramo de ventas", "trabajadores informados", "rubro", "región"],
    restricciones: "Solo personas jurídicas. Datos anuales y preliminares según el SII; no incluye información reservada.",
    frecuencia: "Según publicación del SII (revisión diaria)", estado: "conectada", verificada: "2026-11-02",
  },
  {
    id: "sii_terceros", pais: "CL", organismo: "SII", nombre: "Consulta de situación tributaria de terceros",
    url: "https://www.sii.cl/como_se_hace_para/situacion_trib_terceros.html", secciones: ["tributacion"], nivel: "B",
    metodo: "Consulta individual en el sitio del SII", campos: ["actividades vigentes", "autorización para emitir documentos", "observaciones"],
    restricciones: "Tiene verificación anti-robots: ENQORA no la automatiza. Se ofrece el enlace para consultarla.",
    frecuencia: "En línea", estado: "manual", verificada: "2026-10-30",
  },
  {
    id: "sii_cte", pais: "CL", organismo: "SII", nombre: "Carpeta Tributaria Electrónica",
    url: "https://www.sii.cl", secciones: ["tributacion", "finanzas"], nivel: "D",
    metodo: "La genera la propia empresa y la sube a su hoja de vida ENQORA (M18)", campos: ["declaraciones F29 y F22", "observaciones", "propiedades", "socios"],
    restricciones: "Información reservada: solo con la carpeta que entrega el contribuyente. ENQORA nunca pide la clave del SII.",
    frecuencia: "Cuando la empresa la entrega", estado: "documental", verificada: "2026-10-30",
  },
  {
    id: "tgr", pais: "CL", organismo: "Tesorería General de la República", nombre: "Certificado de deuda fiscal",
    url: "https://www.tgr.cl", secciones: ["tributacion"], nivel: "C",
    metodo: "Lo obtiene la propia empresa con su clave y lo aporta", campos: ["deudas fiscales", "convenios"],
    restricciones: "Información del propio contribuyente.", frecuencia: "Cuando la empresa lo entrega", estado: "requiere_autorizacion", verificada: null,
  },
  {
    id: "res_constituciones", pais: "CL", organismo: "Registro de Empresas y Sociedades (Min. Economía)", nombre: "Constituciones y actuaciones (datos abiertos)",
    url: "https://www.registrodeempresasysociedades.cl", secciones: ["identidad", "legal"], nivel: "A",
    metodo: "Descarga de bases anuales de datos abiertos con el mismo conector de las nóminas del SII",
    campos: ["RUT", "razón social", "tipo de sociedad", "capital", "fecha de constitución", "comuna"],
    restricciones: "Cubre solo empresas creadas en el Registro (desde 2013), no las constituidas por notaría.",
    frecuencia: "Mensual (por confirmar)", estado: "proxima_etapa", verificada: null,
    nota: "Etapa 2: confirmar la URL oficial de descarga y sus campos antes de conectar.",
  },
  {
    id: "diario_oficial", pais: "CL", organismo: "Diario Oficial", nombre: "Publicaciones de sociedades",
    url: "https://www.diariooficial.interior.gob.cl", secciones: ["legal"], nivel: "B",
    metodo: "Búsqueda manual de extractos de constitución y modificaciones", campos: ["extractos societarios"],
    restricciones: "Sin API conocida.", frecuencia: "Diaria", estado: "manual", verificada: null,
  },
  // ── Laboral, previsión y seguridad ──
  {
    id: "dt_normativa", pais: "CL", organismo: "Dirección del Trabajo", nombre: "Normativa y dictámenes laborales",
    url: "https://www.dt.gob.cl", secciones: ["laboral", "prevision"], nivel: "B",
    metodo: "Reglas verificadas en dictámenes y leyes; CORA las aplica según los datos de la empresa",
    campos: ["Libro de Remuneraciones Electrónico", "reglamento interno", "Ley Karin", "jornada"],
    restricciones: "La fiscalización de la DT no es una consulta pública de empresas.", frecuencia: "Vigilancia normativa (M16)", estado: "normativa", verificada: "2026-11-02",
  },
  {
    id: "dt_f30", pais: "CL", organismo: "Dirección del Trabajo", nombre: "Certificado de antecedentes laborales y previsionales (F30)",
    url: "https://www.dt.gob.cl", secciones: ["laboral", "prevision"], nivel: "D",
    metodo: "Lo solicita la propia empresa y lo aporta", campos: ["multas laborales", "deudas previsionales declaradas"],
    restricciones: "Lo emite la DT a solicitud del empleador.", frecuencia: "Cuando la empresa lo entrega", estado: "documental", verificada: null,
  },
  {
    id: "previred", pais: "CL", organismo: "Previred", nombre: "Declaración y pago de cotizaciones",
    url: "https://www.previred.com", secciones: ["prevision"], nivel: "C",
    metodo: "Certificados que aporta la empresa; integración solo con mecanismo oficial y autorización", campos: ["cotizaciones declaradas y pagadas"],
    restricciones: "Información privada de la empresa y de sus trabajadores. ENQORA no pide claves de Previred.",
    frecuencia: "Mensual", estado: "requiere_autorizacion", verificada: null,
  },
  {
    id: "afc", pais: "CL", organismo: "AFC Chile", nombre: "Seguro de cesantía",
    url: "https://www.afc.cl", secciones: ["prevision"], nivel: "C",
    metodo: "Certificados que aporta la empresa", campos: ["cotizaciones del seguro de cesantía"],
    restricciones: "Información privada.", frecuencia: "Mensual", estado: "requiere_autorizacion", verificada: null,
  },
  {
    id: "suseso_ds44", pais: "CL", organismo: "SUSESO · ISL · mutualidades", nombre: "Ley 16.744 y DS 44 (gestión de riesgos laborales)",
    url: "https://www.isl.gob.cl/decreto-44/", secciones: ["seguridad"], nivel: "B",
    metodo: "Reglas verificadas; CORA las aplica según el tamaño de la empresa",
    campos: ["encargado y delegado de prevención", "comité paritario", "departamento de prevención", "matriz de riesgos"],
    restricciones: "La adhesión, la siniestralidad y los antecedentes de cada empresa son privados.", frecuencia: "Vigilancia normativa (M16)", estado: "normativa", verificada: "2026-11-02",
  },
  {
    id: "mutualidad", pais: "CL", organismo: "ACHS · Mutual de Seguridad · IST · ISL", nombre: "Adhesión y antecedentes preventivos",
    url: "https://www.suseso.gob.cl", secciones: ["seguridad"], nivel: "C",
    metodo: "Certificado de adhesión y de siniestralidad que aporta la empresa", campos: ["organismo administrador", "tasa de cotización", "accidentabilidad"],
    restricciones: "Privado.", frecuencia: "Anual", estado: "requiere_autorizacion", verificada: null,
  },
  // ── Permisos, marca y regulación ──
  {
    id: "municipalidades", pais: "CL", organismo: "Municipalidades", nombre: "Patentes municipales y permisos",
    url: "https://www.chileatiende.gob.cl", secciones: ["permisos"], nivel: "B",
    metodo: "Consulta en cada municipio o patente que aporta la empresa", campos: ["patente comercial", "vigencia"],
    restricciones: "Sin fuente nacional única; depende de cada municipio.", frecuencia: "Semestral", estado: "manual", verificada: null,
  },
  {
    id: "seremi_salud", pais: "CL", organismo: "SEREMI de Salud", nombre: "Autorizaciones sanitarias",
    url: "https://www.minsal.cl", secciones: ["permisos"], nivel: "B",
    metodo: "Según rubro; resolución que aporta la empresa", campos: ["autorización sanitaria"],
    restricciones: "Aplica solo a ciertos rubros.", frecuencia: "Según rubro", estado: "manual", verificada: null,
  },
  {
    id: "inapi", pais: "CL", organismo: "INAPI", nombre: "Buscador de marcas",
    url: "https://buscadormarcas.inapi.cl/Marca/BuscarMarca.aspx", secciones: ["marca"], nivel: "B",
    metodo: "Búsqueda manual por nombre de marca", campos: ["marcas", "solicitudes", "titular", "clases"],
    restricciones: "Sin API ni descarga conocidas: ENQORA no lo automatiza.", frecuencia: "En línea", estado: "manual", verificada: "2026-11-02",
  },
  {
    id: "sma_sea", pais: "CL", organismo: "SMA · SEA", nombre: "Fiscalización ambiental y evaluación ambiental",
    url: "https://snifa.sma.gob.cl", secciones: ["permisos"], nivel: "E",
    metodo: "Por investigar", campos: ["resoluciones de calificación ambiental", "procesos sancionatorios"],
    restricciones: "Aplica a ciertos proyectos y rubros.", frecuencia: "—", estado: "por_investigar", verificada: null,
  },
  // ── Comercial ──
  {
    id: "mercado_publico_api", pais: "CL", organismo: "ChileCompra", nombre: "API de Mercado Público",
    url: "https://www.chilecompra.cl/api/", secciones: ["mercado_publico"], nivel: "B",
    metodo: "API oficial: proveedor por RUT → licitaciones y órdenes de compra por código de proveedor",
    campos: ["código de proveedor", "licitaciones", "órdenes de compra", "estados"],
    restricciones: "Requiere un ticket gratuito (se pide con ClaveÚnica); 10.000 consultas diarias.",
    frecuencia: "En línea", estado: "proxima_etapa", verificada: "2026-11-02", nota: "Etapa 2: requiere el ticket en Vercel (MERCADOPUBLICO_TICKET).",
  },
  {
    id: "chilecompra_datos", pais: "CL", organismo: "ChileCompra", nombre: "Datos abiertos de compras públicas",
    url: "https://datos-abiertos.chilecompra.cl", secciones: ["mercado_publico"], nivel: "A",
    metodo: "Descargas masivas", campos: ["órdenes de compra", "licitaciones", "proveedores"],
    restricciones: "Por confirmar formato y campos.", frecuencia: "Por confirmar", estado: "por_investigar", verificada: null,
  },
  {
    id: "aduanas", pais: "CL", organismo: "Servicio Nacional de Aduanas", nombre: "Comercio exterior",
    url: "https://www.aduana.cl", secciones: ["comercio_exterior"], nivel: "E",
    metodo: "Por investigar", campos: ["operaciones de importación y exportación"],
    restricciones: "Los datos por empresa no son de libre consulta.", frecuencia: "—", estado: "por_investigar", verificada: null,
  },
  {
    id: "web_publica", pais: "CL", organismo: "Fuentes abiertas", nombre: "Presencia web y redes públicas de la empresa",
    url: "", secciones: ["marketing", "tecnologia"], nivel: "E",
    metodo: "Agente de reputación digital con búsqueda web y aprobación humana", campos: ["sitio web", "redes públicas"],
    restricciones: "Solo información pública de la empresa; nunca de personas ni cuentas privadas.", frecuencia: "—", estado: "proxima_etapa", verificada: null,
  },
  {
    id: "beneficios_m16", pais: "CL", organismo: "CORFO · Sercotec · SENCE · SII · ChileCompra", nombre: "Catálogo de beneficios ENQORA (M16)",
    url: "https://www.chileatiende.gob.cl", secciones: ["crecimiento"], nivel: "B",
    metodo: "Catálogo curado y vigilado por el agente de vigilancia normativa", campos: ["programas", "requisitos", "a quién aplican"],
    restricciones: "Las convocatorias, montos y plazos cambian: se verifican antes de postular.", frecuencia: "Revisión periódica", estado: "curada", verificada: "2026-10-27",
  },
];

export const fuente = (id: string) => FUENTES.find((f) => f.id === id);
