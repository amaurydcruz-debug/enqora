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
  | "por_investigar" // falta confirmar si existe API, datos abiertos o un mecanismo oficial
  | "descartada"; // revisada y excluida: sus términos o la ley no permiten usarla para investigar empresas

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
  descartada: { label: "Descartada", tone: "warn" },
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
    frecuencia: "Diaria (conector ENQORA, datos abiertos)", estado: "conectada", verificada: "2026-11-06",
    nota: "El buscador web del Registro exige CAPTCHA (verificado el 03-11-2026). Conector de datos abiertos listo (0028): se confirma con la primera carga completa.",
  },
  {
    id: "diario_oficial", pais: "CL", organismo: "Diario Oficial", nombre: "Publicaciones de sociedades",
    url: "https://www.diariooficial.interior.gob.cl", secciones: ["legal"], nivel: "B",
    metodo: "Edición electrónica por fecha (desde 17-08-2016); no tiene buscador por empresa", campos: ["extractos societarios"],
    restricciones: "Sin API ni buscador por razón social: se consulta por la fecha de publicación.", frecuencia: "Diaria", estado: "manual", verificada: "2026-11-03",
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
    restricciones: "La búsqueda presenta CAPTCHA al bot (03-11-2026): ENQORA no lo evade. Vía: búsqueda asistida por el equipo y solicitud formal de acceso a INAPI.", frecuencia: "En línea", estado: "manual", verificada: "2026-11-03",
  },
  {
    id: "inapi_datos", pais: "CL", organismo: "INAPI", nombre: "Datos abiertos de marcas (presentadas y registradas desde 2009)",
    url: "https://tramites.inapi.cl/OpenData/TrademarkOpenData", secciones: ["marca"], nivel: "A",
    metodo: "Descarga oficial de datos abiertos (reemplaza al buscador con CAPTCHA)", campos: ["solicitudes de marca", "marcas registradas", "titular (por confirmar)", "clases (por confirmar)"],
    restricciones: "Falta confirmar formato, columnas (si trae nombre o RUT del titular) y condiciones de uso antes de conectarla.",
    frecuencia: "Por confirmar", estado: "por_investigar", verificada: "2026-11-07", nota: "Prioridad 1: resuelve la consulta de marcas sin CAPTCHA.",
  },
  {
    id: "sma_sea", pais: "CL", organismo: "Superintendencia del Medio Ambiente (SNIFA)", nombre: "Fiscalización y sanciones ambientales",
    url: "https://snifa.sma.gob.cl", secciones: ["permisos"], nivel: "B",
    metodo: "Consulta pública de unidades fiscalizables y expedientes sancionatorios (documentos descargables)", campos: ["unidades fiscalizables", "procedimientos sancionatorios", "resoluciones"],
    restricciones: "Aplica solo a empresas con proyectos o fuentes fiscalizadas (industria, minería, energía, etc.). Falta confirmar si hay descarga estructurada por titular.",
    frecuencia: "En línea", estado: "por_investigar", verificada: "2026-11-07",
  },
  {
    id: "sea_seia", pais: "CL", organismo: "Servicio de Evaluación Ambiental", nombre: "Proyectos en el Sistema de Evaluación de Impacto Ambiental (e-SEIA)",
    url: "https://www.sea.gob.cl/evaluacion-de-impacto-ambiental/buscador-de-proyectos-avanzados", secciones: ["permisos"], nivel: "B",
    metodo: "Buscador público de proyectos (nombre, región, sector, tipo DIA/EIA)", campos: ["proyectos", "estado de evaluación", "resoluciones de calificación ambiental"],
    restricciones: "Solo para empresas con proyectos que ingresan al SEIA. Falta confirmar búsqueda por titular y descarga.",
    frecuencia: "En línea", estado: "por_investigar", verificada: "2026-11-07",
  },
  // ── Comercial ──
  {
    id: "mercado_publico_api", pais: "CL", organismo: "ChileCompra", nombre: "API de Mercado Público",
    url: "https://www.chilecompra.cl/api/", secciones: ["mercado_publico"], nivel: "B",
    metodo: "API oficial: proveedor por RUT → licitaciones y órdenes de compra por código de proveedor",
    campos: ["código de proveedor", "licitaciones", "órdenes de compra", "estados"],
    restricciones: "Requiere un ticket gratuito (se pide con ClaveÚnica); 10.000 consultas diarias.",
    frecuencia: "En línea", estado: "proxima_etapa", verificada: "2026-11-02", nota: "Conector listo: se activa al guardar el ticket en Vercel (MERCADOPUBLICO_TICKET).",
  },
  {
    id: "chilecompra_datos", pais: "CL", organismo: "ChileCompra", nombre: "Datos abiertos de compras públicas",
    url: "https://datos-abiertos.chilecompra.cl", secciones: ["mercado_publico"], nivel: "A",
    metodo: "Descargas masivas (.7z): órdenes de compra por semestre y modalidad, licitaciones por mes; fichas de organismos con rubros y productos más transados",
    campos: ["órdenes de compra", "licitaciones", "organismo comprador", "montos", "productos más transados", "RUT del proveedor (por confirmar)"],
    restricciones: "Datos públicos y gratuitos. Falta confirmar columnas y tamaño de los archivos antes de conectarla. Es la base de la «inteligencia de oportunidades comerciales».",
    frecuencia: "Licitaciones mensual · órdenes de compra semestral", estado: "por_investigar", verificada: "2026-11-07", nota: "Prioridad 2: qué organismos compran lo que vende cada empresa.",
  },
  {
    id: "chilecompra_servicios", pais: "CL", organismo: "ChileCompra", nombre: "Servicios que ChileCompra entrega directamente",
    url: "https://www.chileatiende.gob.cl/fichas/547-inscripcion-para-ser-proveedor-del-estado", secciones: ["mercado_publico"], nivel: "B",
    metodo: "Regla de oferta: ENQORA no revende lo que el Estado entrega gratis", campos: ["inscripción gratuita en Mercado Público", "acreditación pagada en el Registro de Proveedores (6 o 12 meses)", "buscador de licitaciones y Compra Ágil", "cursos para proveedores"],
    restricciones: "ENQORA vende inteligencia y acompañamiento (dónde está la oportunidad y cómo competir), no la inscripción.",
    frecuencia: "Revisión periódica", estado: "normativa", verificada: "2026-11-07",
  },
  {
    id: "aduanas", pais: "CL", organismo: "Servicio Nacional de Aduanas", nombre: "Comercio exterior",
    url: "https://www.aduana.cl", secciones: ["comercio_exterior"], nivel: "E",
    metodo: "Estadísticas mensuales de DIN y DUS (datos abiertos)", campos: ["importaciones y exportaciones agregadas por producto y país"],
    restricciones: "Por Ley 20.285, la publicación excluye los datos que identifican a quienes participan en cada operación: no hay comercio exterior por empresa en fuente oficial. Solo sirve para contexto del rubro.",
    frecuencia: "Mensual", estado: "descartada", verificada: "2026-11-07", nota: "Por empresa: solo con documentos que aporte el cliente (DIN/DUS propias).",
  },
  {
    id: "dt_antisindicales", pais: "CL", organismo: "Dirección del Trabajo", nombre: "Nómina de empresas condenadas por prácticas antisindicales",
    url: "https://www.dt.gob.cl", secciones: ["laboral", "legal"], nivel: "B",
    metodo: "Publicación semestral de la DT (art. 294 bis del Código del Trabajo)", campos: ["razón social", "sentencia"],
    restricciones: "Se publica por razón social, sin RUT: toda coincidencia se verifica con cuidado antes de mencionarla. Nunca se muestra al cliente como acusación.",
    frecuencia: "Semestral", estado: "manual", verificada: "2026-11-07",
  },
  {
    id: "registro_civil_pj", pais: "CL", organismo: "Registro Civil", nombre: "Personas jurídicas sin fines de lucro (corporaciones, fundaciones, asociaciones)",
    url: "https://www.chileatiende.gob.cl/fichas/11333-registro-de-personas-juridicas-sin-fines-de-lucro", secciones: ["identidad", "legal"], nivel: "B",
    metodo: "Certificados en línea de vigencia y de directorio", campos: ["vigencia", "directorio"],
    restricciones: "Solo para organizaciones sin fines de lucro. Certificado por organización; sin descarga masiva.",
    frecuencia: "En línea", estado: "manual", verificada: "2026-11-07",
  },
  {
    id: "conservadores", pais: "CL", organismo: "Conservadores de Bienes Raíces y Comercio", nombre: "Registro de Comercio (sociedades del régimen tradicional)",
    url: "https://www.conservadores.cl", secciones: ["legal"], nivel: "B",
    metodo: "Copias y certificados que se piden a cada conservador según la comuna", campos: ["inscripción social", "modificaciones", "vigencia"],
    restricciones: "Cada conservador tiene su sistema; los certificados suelen tener costo. Sin consulta masiva.",
    frecuencia: "A pedido", estado: "manual", verificada: "2026-11-07",
  },
  {
    id: "cmf", pais: "CL", organismo: "Comisión para el Mercado Financiero", nombre: "Entidades fiscalizadas y registros públicos",
    url: "https://www.cmfchile.cl", secciones: ["finanzas", "legal"], nivel: "B",
    metodo: "Consulta en el sitio de la CMF", campos: ["registro de valores", "entidades informantes", "hechos esenciales"],
    restricciones: "Relevante sobre todo para empresas grandes o reguladas (emisores, aseguradoras, fintech).",
    frecuencia: "En línea", estado: "por_investigar", verificada: "2026-11-07",
  },
  {
    id: "sectoriales", pais: "CL", organismo: "SEC · SAG · SERNAC", nombre: "Registros y autorizaciones sectoriales",
    url: "https://www.chileatiende.gob.cl", secciones: ["permisos"], nivel: "E",
    metodo: "Según el rubro de cada empresa", campos: ["autorizaciones", "registros sectoriales"],
    restricciones: "Solo aplican a ciertos rubros (energía, agro y alimentos, consumo). Se revisan caso a caso.",
    frecuencia: "—", estado: "por_investigar", verificada: "2026-11-07",
  },
  {
    id: "portal_chile", pais: "CL", organismo: "Portal Chile (agregador privado)", nombre: "Directorio de empresas con datos de SII, INAPI, CMF y Mercado Público",
    url: "https://portalchile.org", secciones: ["identidad", "marca", "mercado_publico"], nivel: "E",
    metodo: "Solo como pista para el equipo: CORA no lo consulta ni lo cita", campos: ["ficha de empresa", "marcas", "compras públicas", "rankings"],
    restricciones: "No es un organismo público; no identifica a su operador, declara «todos los derechos reservados» y no ofrece API. Sus datos se toman directo de cada organismo de origen.",
    frecuencia: "—", estado: "descartada", verificada: "2026-11-07", nota: "Integrable solo con una licencia escrita del operador.",
  },
  {
    id: "nic_cl", pais: "CL", organismo: "NIC Chile", nombre: "Titulares de dominios .cl",
    url: "https://www.nic.cl", secciones: ["tecnologia"], nivel: "E",
    metodo: "Consulta de dominios", campos: ["dominio", "titular", "fechas"],
    restricciones: "Su política limita las consultas a fines de gestión de dominios .cl, DNS y conflictos: no se usa para investigar empresas.",
    frecuencia: "—", estado: "descartada", verificada: "2026-11-07",
  },
  {
    id: "servel", pais: "CL", organismo: "Servel", nombre: "Datos electorales",
    url: "https://www.servel.cl", secciones: ["legal"], nivel: "E",
    metodo: "—", campos: ["financiamiento electoral"],
    restricciones: "Información de carácter político: ENQORA no la usa para perfilar empresas ni personas.",
    frecuencia: "—", estado: "descartada", verificada: "2026-11-07",
  },
  {
    id: "web_publica", pais: "CL", organismo: "Fuentes abiertas", nombre: "Presencia web y redes públicas de la empresa",
    url: "", secciones: ["marketing", "tecnologia"], nivel: "E",
    metodo: "Agente de reputación digital con búsqueda web y aprobación humana", campos: ["sitio web", "redes públicas"],
    restricciones: "Solo información pública de la empresa; nunca de personas ni cuentas privadas.", frecuencia: "—", estado: "proxima_etapa", verificada: null,
  },
  {
    id: "beneficios_m16", pais: "CL", organismo: "CORFO · Sercotec · SENCE · SII · ChileCompra · Chile Emprende · ProChile", nombre: "Catálogo de beneficios ENQORA (M16)",
    url: "https://www.chileatiende.gob.cl", secciones: ["crecimiento"], nivel: "B",
    metodo: "Catálogo curado y vigilado por el agente de vigilancia normativa", campos: ["programas", "requisitos", "a quién aplican"],
    restricciones: "Las convocatorias, montos y plazos cambian: se verifican antes de postular.", frecuencia: "Revisión periódica", estado: "curada", verificada: "2026-10-27",
  },
];

export const fuente = (id: string) => FUENTES.find((f) => f.id === id);
