import type { ModuleKey } from "@/lib/cases";

// Rutas de trabajo por módulo (M13): preguntas iniciales propias de cada servicio, la ruta
// estándar de tareas y los documentos que normalmente se necesitan. Es una guía de partida:
// el equipo la ajusta caso a caso y nada de esto reemplaza la revisión profesional.

export type IntakeField = {
  key: string;
  label: string;
  type: "text" | "textarea" | "select";
  options?: string[];
  placeholder?: string;
};
export type RouteTask = { title: string; for: "cliente" | "equipo" };
export type ModuleRoute = { intake: IntakeField[]; tasks: RouteTask[]; documents: string[] };

const SI_NO = ["Sí", "No", "No lo sé"];

export const MODULE_ROUTES: Record<ModuleKey, ModuleRoute> = {
  idea: {
    intake: [
      { key: "idea", label: "¿Qué quieres vender u ofrecer?", type: "textarea", placeholder: "Producto o servicio, a quién y dónde" },
      { key: "etapa", label: "¿En qué etapa estás?", type: "select", options: ["Solo es una idea", "Ya probé con algunos clientes", "Ya vendo informalmente"] },
      { key: "inversion", label: "¿Cuentas con capital para comenzar?", type: "select", options: ["Sí, propio", "Necesito financiamiento", "Aún no lo sé"] },
    ],
    tasks: [
      { title: "Describir el producto o servicio y el cliente objetivo", for: "cliente" },
      { title: "Identificar permisos o autorizaciones que exige la actividad", for: "equipo" },
      { title: "Estimar costos de puesta en marcha con antecedentes reales", for: "equipo" },
      { title: "Comparar formas de operar: persona natural o empresa", for: "equipo" },
    ],
    documents: ["Descripción del proyecto", "Cotizaciones de proveedores o costos conocidos"],
  },
  create: {
    intake: [
      { key: "tipo_sociedad", label: "¿Qué tipo de empresa quieres crear?", type: "select", options: ["SpA", "EIRL", "Sociedad de Responsabilidad Limitada", "No lo sé"] },
      { key: "socios", label: "¿Cuántos socios o accionistas tendrá?", type: "text", placeholder: "Ej.: 2" },
      { key: "actividad", label: "¿A qué se dedicará?", type: "textarea" },
      { key: "capital", label: "Capital inicial aproximado", type: "text", placeholder: "Ej.: $1.000.000" },
    ],
    tasks: [
      { title: "Definir tipo de sociedad, socios, capital y administración", for: "equipo" },
      { title: "Enviar cédula de identidad (ambos lados) de cada socio", for: "cliente" },
      { title: "Redactar y revisar los estatutos", for: "equipo" },
      { title: "Constitución en el Registro de Empresas y Sociedades (con firma de los socios)", for: "equipo" },
      { title: "Obtener RUT e iniciar actividades ante el SII", for: "equipo" },
    ],
    documents: ["Cédula de identidad de cada socio", "Domicilio de la empresa (documento que acredite su uso)", "Datos de contacto de cada socio"],
  },
  brand: {
    intake: [
      { key: "nombre_marca", label: "Nombre de la marca", type: "text" },
      { key: "productos", label: "¿Qué productos o servicios distinguirá?", type: "textarea" },
      { key: "logo", label: "¿Ya tienes logotipo?", type: "select", options: SI_NO },
      { key: "uso_actual", label: "¿Ya la usas en el mercado?", type: "select", options: SI_NO },
    ],
    tasks: [
      { title: "Búsqueda de anterioridades en INAPI", for: "equipo" },
      { title: "Definir clases de productos o servicios (Clasificación de Niza)", for: "equipo" },
      { title: "Enviar logotipo en alta resolución (si corresponde)", for: "cliente" },
      { title: "Presentar la solicitud de registro en INAPI", for: "equipo" },
      { title: "Seguimiento de publicación y posibles oposiciones", for: "equipo" },
    ],
    documents: ["Logotipo en formato de imagen", "RUT del titular de la marca"],
  },
  formaliza: {
    intake: [
      { key: "actividad", label: "¿Qué actividad realizas?", type: "textarea" },
      { key: "inicio_actividades", label: "¿Ya hiciste inicio de actividades en el SII?", type: "select", options: SI_NO },
      { key: "local", label: "¿Dónde funciona?", type: "select", options: ["Local comercial", "Domicilio particular", "Solo en línea", "Otro"] },
      { key: "comuna", label: "Comuna", type: "text" },
      { key: "ventas", label: "¿Ya estás vendiendo?", type: "select", options: SI_NO },
    ],
    tasks: [
      { title: "Revisar situación tributaria actual en el SII", for: "equipo" },
      { title: "Inicio de actividades o actualización de giros", for: "equipo" },
      { title: "Identificar patente municipal y permisos sectoriales aplicables", for: "equipo" },
      { title: "Enviar documento que acredite el uso del domicilio", for: "cliente" },
      { title: "Configurar emisión de documentos tributarios electrónicos", for: "equipo" },
    ],
    documents: ["Cédula de identidad del titular o representante", "Escritura o estatuto de la empresa (si existe)", "Contrato de arriendo, título de dominio o autorización de uso del domicilio"],
  },
  contabilidad: {
    intake: [
      { key: "periodo", label: "¿Qué período te preocupa?", type: "text", placeholder: "Ej.: septiembre 2026" },
      { key: "regimen", label: "Régimen tributario (si lo sabes)", type: "select", options: ["Pro Pyme general", "Pro Pyme transparente", "Semi integrado", "No lo sé"] },
      { key: "contador", label: "¿Tienes contador actualmente?", type: "select", options: SI_NO },
      { key: "atrasos", label: "¿Tienes declaraciones atrasadas?", type: "select", options: SI_NO },
    ],
    tasks: [
      { title: "Cargar el Registro de Compras y Ventas del período en ENQORA CONTABILIDAD", for: "cliente" },
      { title: "Cargar la cartola bancaria del período", for: "cliente" },
      { title: "Conciliar movimientos bancarios con documentos", for: "equipo" },
      { title: "Preparar borrador del F29 y enviarlo a revisión profesional", for: "equipo" },
    ],
    documents: ["Detalle del Registro de Compras y Ventas (sii.cl)", "Cartola bancaria del período", "Boletas de honorarios recibidas o emitidas"],
  },
  gestion: {
    intake: [
      { key: "area", label: "¿Qué quieres ordenar?", type: "select", options: ["Clientes y cobranza", "Inventario", "Caja", "Personas y remuneraciones", "Otro"] },
      { key: "trabajadores", label: "¿Cuántas personas trabajan en la empresa?", type: "text" },
      { key: "herramientas", label: "¿Qué herramientas usas hoy?", type: "text", placeholder: "Ej.: planillas, software de facturación" },
    ],
    tasks: [
      { title: "Levantar el proceso actual y sus problemas", for: "equipo" },
      { title: "Enviar planillas o reportes que usas hoy", for: "cliente" },
      { title: "Proponer procedimiento y controles", for: "equipo" },
    ],
    documents: ["Planillas o reportes actuales", "Contratos de trabajo (si el tema es personas)"],
  },
  crece: {
    intake: [
      { key: "objetivo", label: "¿Qué quieres lograr?", type: "select", options: ["Financiamiento", "Fondos concursables", "Abrir nueva sucursal o mercado", "Exportar", "Otro"] },
      { key: "monto", label: "Monto aproximado que necesitas", type: "text" },
      { key: "antiguedad", label: "Antigüedad de la empresa", type: "text", placeholder: "Ej.: 2 años" },
    ],
    tasks: [
      { title: "Revisar estados financieros y declaraciones de los últimos períodos", for: "equipo" },
      { title: "Identificar fondos o instrumentos vigentes (CORFO, SERCOTEC u otros)", for: "equipo" },
      { title: "Enviar carpeta tributaria y balances disponibles", for: "cliente" },
      { title: "Preparar escenarios de financiamiento con datos reales", for: "equipo" },
    ],
    documents: ["Carpeta tributaria electrónica (sii.cl)", "Balance y estado de resultados", "Declaraciones de renta (F22)"],
  },
  legal: {
    intake: [
      { key: "tema", label: "¿Qué necesitas?", type: "select", options: ["Contrato", "Modificar la sociedad", "Poderes", "Regularizar una situación", "Protección de datos", "Otro"] },
      { key: "contraparte", label: "¿Hay otra parte involucrada?", type: "text" },
      { key: "plazo", label: "¿Tienes algún plazo?", type: "text", placeholder: "Ej.: firma el 15 de noviembre" },
    ],
    tasks: [
      { title: "Revisar estatutos vigentes y poderes de representación", for: "equipo" },
      { title: "Enviar estatutos, modificaciones y documentos relacionados", for: "cliente" },
      { title: "Preparar borrador o informe para revisión del abogado", for: "equipo" },
    ],
    documents: ["Estatutos y modificaciones", "Certificado de vigencia de la sociedad", "Borradores o contratos existentes"],
  },
  general: {
    intake: [
      { key: "tema", label: "¿Sobre qué es tu consulta?", type: "textarea" },
      { key: "urgencia", label: "¿Hay un plazo o urgencia?", type: "text" },
    ],
    tasks: [
      { title: "Clasificar la consulta y derivarla al área correspondiente", for: "equipo" },
    ],
    documents: [],
  },
};

// Lee las respuestas del formulario (campos intake_<clave>) del módulo elegido.
export function intakeFromForm(module: ModuleKey, fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of MODULE_ROUTES[module].intake) {
    const v = String(fd.get(`intake_${f.key}`) ?? "").trim().slice(0, 1000);
    if (v && (f.type !== "select" || f.options?.includes(v))) out[f.key] = v;
  }
  return out;
}
