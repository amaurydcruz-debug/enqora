import type { Profile } from "@/lib/benefits";

// Portal de entrada por perfil y tipo de negocio (M16). Reutiliza las categorías de
// lib/discovery.ts (servicio con el que se crea la solicitud) y las actividades del onboarding
// (lib/onboarding.ts → actividad). Los requisitos son el mapa inicial: el diagnóstico confirma
// cuáles aplican según comuna, inmueble, giro y trabajadores. Nada se presenta como garantizado.

// Ciclo de vida empresarial
export const LIFECYCLE = [
  { n: "01", key: "idea", titulo: "Idea y planificación", detalle: "Validación, modelo de negocio y presupuesto." },
  { n: "02", key: "constitucion", titulo: "Constitución legal", detalle: "Tipo de empresa, socios, estatutos y RUT." },
  { n: "03", key: "tributaria", titulo: "Formalización tributaria", detalle: "Inicio de actividades, giros, documentos e IVA." },
  { n: "04", key: "local", titulo: "Local y permisos", detalle: "Uso de suelo, DOM, autorización sanitaria y patente." },
  { n: "05", key: "inicio", titulo: "Inicio de operaciones", detalle: "Cuenta bancaria, contratos, proveedores y facturación." },
  { n: "06", key: "operacion", titulo: "Operación mensual", detalle: "Contabilidad, remuneraciones, cotizaciones e impuestos." },
  { n: "07", key: "crecimiento", titulo: "Crecimiento y protección", detalle: "Marcas, financiamiento, contratación y expansión." },
  { n: "08", key: "cierre", titulo: "Regularización o cierre", detalle: "Rectificaciones, deudas, reorganización y término de giro." },
] as const;
export type Stage = (typeof LIFECYCLE)[number]["key"];

export type Requirement = { etapa: Stage; institucion: string; tramite: string; cuando: string; url?: string };

// Requisitos comunes a casi todo negocio formal.
const BASE: Requirement[] = [
  { etapa: "constitucion", institucion: "res", tramite: "Constituir la empresa (SpA, EIRL, Ltda.) o definir operar como persona natural", cuando: "Si se opera como empresa; cada socio firma con sus credenciales", url: "https://www.bcn.cl/portal/leyfacil/recurso/procedimiento-simple-para-crear-empresas" },
  { etapa: "tributaria", institucion: "sii", tramite: "Inicio de actividades, giros y régimen tributario", cuando: "Dentro de los dos meses siguientes a comenzar (art. 68 Código Tributario)", url: "https://www.sii.cl/normativa_legislacion/codigo_tributario.pdf" },
  { etapa: "tributaria", institucion: "sii", tramite: "Emisión de documentos tributarios electrónicos", cuando: "Desde la primera venta o servicio" },
  { etapa: "local", institucion: "muni", tramite: "Patente municipal (comercial, industrial o profesional)", cuando: "Para ejercer la actividad en la comuna; antes, verificar uso de suelo del inmueble" },
  { etapa: "operacion", institucion: "sii", tramite: "F29 mensual (IVA, PPM y retenciones)", cuando: "Cada mes, hasta el día 12 o el 20 si declara por internet como facturador electrónico", url: "https://www.sii.cl/preguntas_frecuentes/impuestos_mensuales/001_130_4485.htm" },
];
const WORKERS: Requirement[] = [
  { etapa: "operacion", institucion: "dt", tramite: "Contratos, jornada (42 h desde 26-04-2026) y protocolo Ley Karin", cuando: "Si tiene o tendrá trabajadores" },
  { etapa: "operacion", institucion: "previred", tramite: "Cotizaciones previsionales mensuales", cuando: "Si tiene trabajadores" },
];

export type Rubro = {
  key: string;            // coincide con onboarding.actividad
  nombre: string;
  ejemplos: string;
  requisitos: Requirement[];
  riesgos: string[];      // lo que más se escapa en este rubro
  categoria: string;      // categoría de lib/discovery.ts para comenzar
};

export const RUBROS: Rubro[] = [
  {
    key: "gastronomia", nombre: "Gastronomía y alimentos", ejemplos: "Cafetería, restaurante, panadería, food truck, alimentos envasados", categoria: "formalizacion",
    requisitos: [
      ...BASE,
      { etapa: "local", institucion: "seremi_salud", tramite: "Autorización sanitaria de alimentos (vigencia de 3 años, renovable)", cuando: "Si produce, elabora, almacena, distribuye o vende alimentos", url: "https://www.chileatiende.gob.cl/fichas/172" },
      { etapa: "local", institucion: "muni", tramite: "Certificado de informaciones previas y destino del inmueble (DOM)", cuando: "Antes de arrendar o remodelar el local" },
      { etapa: "local", institucion: "sec", tramite: "Declaración de instalaciones de gas o eléctricas", cuando: "Si el local tiene instalaciones nuevas o modificadas" },
      ...WORKERS,
    ],
    riesgos: ["Arrendar un local donde el uso de suelo no permite el giro", "Abrir antes de la autorización sanitaria", "Patente de alcoholes: régimen especial y cupos por comuna"],
  },
  {
    key: "comercio", nombre: "Comercio y tiendas", ejemplos: "Almacén, minimarket, tienda de ropa, ferretería, tienda en línea", categoria: "formalizacion",
    requisitos: [
      ...BASE,
      { etapa: "inicio", institucion: "sernac", tramite: "Información de precios, garantías, derecho a retracto en ventas a distancia y atención de reclamos", cuando: "Si vende a consumidores (Ley 19.496)" },
      { etapa: "local", institucion: "seremi_salud", tramite: "Autorización sanitaria", cuando: "Si vende alimentos" },
      { etapa: "crecimiento", institucion: "inapi", tramite: "Registro de marca", cuando: "Para proteger el nombre de la tienda" },
      ...WORKERS,
    ],
    riesgos: ["Ventas por redes sociales sin documentos tributarios", "Muchos abonos de terceros sin respaldo (Ley 21.713)", "Desde el 25-10-2025 toda importación paga IVA"],
  },
  {
    key: "servicios", nombre: "Servicios y oficios", ejemplos: "Peluquería y estética, consultoría, mantención, limpieza, educación", categoria: "formalizacion",
    requisitos: [
      ...BASE,
      { etapa: "tributaria", institucion: "sii", tramite: "Definir si el servicio está afecto a IVA (desde 2023) o exento", cuando: "Siempre en servicios; revisar exención de sociedades de profesionales", url: "https://www.sii.cl/normativa_legislacion/circulares/2022/circu50.pdf" },
      { etapa: "local", institucion: "seremi_salud", tramite: "Consultar si el servicio requiere autorización sanitaria", cuando: "Estética, procedimientos en el cuerpo y otros giros regulados" },
      { etapa: "operacion", institucion: "sii", tramite: "Retención de boletas de honorarios (15,25% en 2026)", cuando: "Si contrata independientes", url: "https://www.sii.cl/noticias/2025/261225noti01smn.htm" },
      ...WORKERS,
    ],
    riesgos: ["Cobrar sin IVA un servicio afecto", "No retener las boletas de honorarios", "Patente profesional o comercial según la comuna"],
  },
  {
    key: "produccion", nombre: "Producción, industria y agro", ejemplos: "Fábrica, taller, elaboración de productos, agrícola, cosmética", categoria: "formalizacion",
    requisitos: [
      ...BASE,
      { etapa: "local", institucion: "muni", tramite: "Uso de suelo industrial y patente industrial", cuando: "Si fabrica o transforma productos" },
      { etapa: "local", institucion: "seremi_salud", tramite: "Autorización sanitaria", cuando: "Alimentos y otros procesos con riesgo sanitario" },
      { etapa: "local", institucion: "sag", tramite: "Registros y certificaciones agrícolas o pecuarias", cuando: "Productos vegetales o animales, importación o exportación" },
      { etapa: "local", institucion: "isp", tramite: "Notificación o registro sanitario de productos", cuando: "Cosméticos, productos farmacéuticos o dispositivos médicos" },
      ...WORKERS,
    ],
    riesgos: ["Instalar la planta en una zona donde no se permite la industria", "Permisos sectoriales que tardan meses"],
  },
  {
    key: "construccion", nombre: "Construcción e inmobiliaria", ejemplos: "Constructora, contratista, remodelaciones, corretaje", categoria: "formalizacion",
    requisitos: [
      ...BASE,
      { etapa: "local", institucion: "muni", tramite: "Permisos de edificación y recepción definitiva de obras (DOM)", cuando: "En cada obra que lo requiera" },
      { etapa: "local", institucion: "sec", tramite: "Instaladores autorizados para electricidad y gas", cuando: "Si ejecuta instalaciones" },
      ...WORKERS,
    ],
    riesgos: ["Subcontratación sin control de cotizaciones de los trabajadores", "Confundir recepción de obras con patente o autorización sanitaria"],
  },
  {
    key: "tecnologia", nombre: "Tecnología y negocios digitales", ejemplos: "Software, aplicaciones, agencia digital, comercio electrónico", categoria: "constitucion",
    requisitos: [
      ...BASE,
      { etapa: "constitucion", institucion: "nic", tramite: "Dominio .cl del negocio", cuando: "Coordinarlo con el nombre y la marca" },
      { etapa: "crecimiento", institucion: "inapi", tramite: "Registro de marca", cuando: "Antes de invertir en la marca" },
      { etapa: "inicio", institucion: "sernac", tramite: "Términos y condiciones y deberes del comercio electrónico", cuando: "Si vende a consumidores" },
      { etapa: "operacion", institucion: "datos", tramite: "Protección de datos personales (Ley 21.719, desde 01-12-2026)", cuando: "Si trata datos de clientes o usuarios", url: "https://www.bcn.cl/leychile/navegar?idNorma=1209272" },
    ],
    riesgos: ["Dominio registrado sin marca", "Tratar datos personales sin base legal ni política de privacidad"],
  },
  {
    key: "transporte", nombre: "Transporte y logística", ejemplos: "Fletes, transporte de pasajeros, reparto, bodegaje", categoria: "formalizacion",
    requisitos: [
      ...BASE,
      { etapa: "local", institucion: "mtt", tramite: "Inscripción en el Registro Nacional de Servicios de Transporte de Pasajeros", cuando: "Si transporta pasajeros (taxi, turismo, escolar u otros)", url: "https://www.chileatiende.gob.cl/fichas/24016" },
      ...WORKERS,
    ],
    riesgos: ["Operar transporte de pasajeros sin inscripción", "Jornada y descansos de conductores"],
  },
  {
    key: "turismo", nombre: "Turismo y alojamiento", ejemplos: "Hostal, cabañas, tour operador, turismo aventura", categoria: "formalizacion",
    requisitos: [
      ...BASE,
      { etapa: "local", institucion: "sernatur", tramite: "Registro Nacional de Prestadores de Servicios Turísticos", cuando: "Obligatorio para alojamiento turístico y turismo aventura; voluntario para otros", url: "https://www.chileatiende.gob.cl/fichas/4652" },
      { etapa: "local", institucion: "seremi_salud", tramite: "Autorización sanitaria", cuando: "Si sirve alimentos o según el tipo de alojamiento" },
      ...WORKERS,
    ],
    riesgos: ["Arriendo turístico sin patente ni registro", "Seguridad en actividades de aventura"],
  },
];

export const rubroByKey = (k: string | null | undefined) => RUBROS.find((r) => r.key === k) ?? null;

// «Tengo un problema»: puertas a las categorías existentes (lib/discovery.ts).
export const PROBLEMS = [
  { key: "tributario", titulo: "Problemas tributarios", detalle: "IVA, declaraciones atrasadas, deudas, multas, notificaciones del SII.", categoria: "tributario", emblem: "investigacion" },
  { key: "legal", titulo: "Legalidad y documentos", detalle: "Contratos, sociedades, poderes y observaciones legales.", categoria: "profesionales", emblem: "legal" },
  { key: "permisos", titulo: "Permisos y trámites", detalle: "Patente, municipalidad, SEREMI, DOM y autorizaciones.", categoria: "formalizacion", emblem: "formaliza" },
  { key: "trabajadores", titulo: "Trabajadores", detalle: "Sueldos, contratos, cotizaciones, jornada y Ley Karin.", categoria: "contabilidad", emblem: "miembros" },
  { key: "finanzas", titulo: "Problemas financieros", detalle: "Deudas, caja, pagos y financiamiento.", categoria: "crecimiento", emblem: "crece" },
  { key: "no_se", titulo: "No sé qué necesito", detalle: "Explícanos tu caso y ENQORA te orienta con un diagnóstico.", categoria: "", emblem: "general" },
] as const;

// Las cuatro entradas del portal.
export type Entry = { key: Profile | "problema"; titulo: string; lead: string; resultado: string; incluye: string[]; emblem: string; etapas: Stage[] };
export const ENTRIES: Entry[] = [
  {
    key: "idea", titulo: "Tengo una idea", lead: "Quiero empezar y no sé por dónde.", emblem: "idea", resultado: "Una ruta personalizada desde cero.",
    etapas: ["idea", "constitucion", "tributaria", "local", "inicio"],
    incluye: ["Validar la idea y estimar costos reales", "Elegir el tipo de empresa que conviene", "Nombre, dominio y marca", "Constitución e inicio de actividades", "Permisos según tu rubro y comuna", "Fondos públicos que podrían corresponderte"],
  },
  {
    key: "pyme", titulo: "Tengo una pyme o mini empresa", lead: "Mi empresa existe y necesito gestionarla.", emblem: "empresas", resultado: "Una empresa ordenada y acompañada mes a mes.",
    etapas: ["operacion", "crecimiento", "cierre"],
    incluye: ["Contabilidad, IVA y F29", "Remuneraciones, contratos y cotizaciones", "Patentes, permisos y renovaciones", "Alertas de vencimientos", "Beneficios tributarios y fondos aplicables", "Regularización de atrasos"],
  },
  {
    key: "enterprise", titulo: "ENQORA Enterprise", lead: "Necesito una solución integral de alto nivel.", emblem: "control", resultado: "Una visión integral y coordinada de la empresa.",
    etapas: ["operacion", "crecimiento", "cierre"],
    incluye: ["Varias empresas y sucursales", "Coordinación de profesionales y agentes IA con auditoría independiente", "Cumplimiento tributario, laboral, legal y sectorial", "Expedientes complejos y seguimiento de trámites", "Panel central de riesgos y obligaciones"],
  },
  {
    key: "problema", titulo: "Tengo un problema", lead: "No sé si es contable, legal o municipal.", emblem: "autorizaciones", resultado: "La ruta correcta para resolverlo.",
    etapas: [],
    incluye: [],
  },
];
