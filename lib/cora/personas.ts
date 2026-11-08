import { BENEFITS } from "@/lib/benefits";
import { necesidadesDe, type HallazgoBase, type Necesidad } from "@/lib/cora/necesidades";
import { construirPropuesta, type Propuesta } from "@/lib/cora/soluciones";
import { buildNaturalReport, offer, type Catalog, type NaturalAnswers, type Obligation } from "@/lib/initial-report";
import { runCalculator } from "@/lib/tax-calc";

// CORA PERSONAS · modalidad pública (Etapa 1B).
// Regla de privacidad: con el RUT de una persona, CORA NO consulta ninguna fuente sobre ella (cualquiera puede
// escribir un RUT ajeno). El perfil se arma solo con lo que la propia persona declara, en su navegador, sin
// enviarse ni guardarse. El expediente personal con documentos requiere cuenta y consentimiento (etapa posterior).

export type PersonaAnswers = NaturalAnswers & {
  cuentas: "si" | "no";
  crecer: "si" | "no" | "no_se";
  marca: "si" | "no";
};

// porque: el propósito de cada pregunta (se muestra al preguntar: nada se pregunta «por si acaso»).
export const PREGUNTAS_PERSONA: { key: keyof PersonaAnswers; q: string; porque: string; options: [string, string][] }[] = [
  { key: "venta", q: "¿Cómo generas ingresos hoy?", porque: "Define tu perfil tributario (primera o segunda categoría) y qué declaraciones te corresponden.", options: [
    ["facturas", "Vendo productos o servicios con boletas o facturas"],
    ["honorarios", "Emito boletas de honorarios"],
    ["ambas", "Ambas"],
    ["sin_inicio", "Aún no inicio actividades"],
  ] },
  { key: "trabajadores", q: "¿Tienes trabajadores contratados?", porque: "Con trabajadores se suman contratos, cotizaciones y prevención de riesgos.", options: [["no", "No"], ["si", "Sí"]] },
  { key: "contador", q: "¿Quién lleva tus impuestos?", porque: "Así sabemos si tus declaraciones ya tienen respaldo profesional o conviene revisarlas.", options: [["nadie", "Yo mismo"], ["contador", "Un contador"], ["no_se", "No lo tengo claro"]] },
  { key: "lugar", q: "¿Dónde funciona tu negocio?", porque: "Un local requiere patente municipal y, según el rubro, permisos.", options: [["local", "En un local"], ["casa", "Desde mi casa"], ["online", "Solo en línea"]] },
  { key: "cuentas", q: "¿Separas tu dinero personal del dinero del negocio?", porque: "Separar las cuentas ordena tus impuestos y te deja ver si el negocio gana.", options: [["si", "Sí"], ["no", "No"]] },
  { key: "crecer", q: "¿Quieres crecer en los próximos 12 meses (más ventas, socios o contratar)?", porque: "Si quieres crecer, conviene revisar tu estructura y los programas de apoyo vigentes.", options: [["si", "Sí"], ["no", "No"], ["no_se", "No lo sé"]] },
  { key: "marca", q: "¿Tu negocio tiene un nombre o marca que quieras proteger?", porque: "Una marca registrada en INAPI es un activo de tu negocio.", options: [["si", "Sí"], ["no", "No"]] },
];

// Estados de la evaluación de situación: nunca se califica de incumplimiento sin evidencia.
export type EstadoSituacion = "confirmado" | "pendiente" | "no_consultado" | "requiere_documentos";
export const ESTADO_SITUACION: Record<EstadoSituacion, string> = {
  confirmado: "Confirmado (lo declaraste)", pendiente: "Pendiente de verificar", no_consultado: "No consultado en fuentes", requiere_documentos: "Requiere documentación",
};
export type Impacto = { titulo: string; datos: string; supuestos: string; formula: string; resultado: string; confirmar: string };

export type ExpedientePersona = {
  categoria: string; // perfil tributario según lo declarado
  situacion: { tema: string; estado: EstadoSituacion; detalle: string }[];
  impacto: Impacto[];
  prioridades: Necesidad[]; // máximo 3
  perfil: { etiqueta: string; valor: string }[];
  fortalezas: string[];
  necesidades: Necesidad[];
  propuesta: Propuesta;
  obligaciones: Obligation[];
  beneficios: { nombre: string; url: string; porque: string; falta: string }[];
  conclusiones: string[];
};

const SEGMENTO: Record<NaturalAnswers["venta"], string> = {
  sin_inicio: "Persona que quiere iniciar un negocio",
  honorarios: "Profesional independiente (boletas de honorarios)",
  facturas: "Emprendedor con negocio a su nombre (persona natural con giro)",
  ambas: "Emprendedor y profesional independiente",
};

export function investigarPersona(a: PersonaAnswers, catalog: Catalog, today = new Date()): ExpedientePersona {
  const base = buildNaturalReport(a, catalog, today);
  const fecha = `respondido el ${new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Santiago" }).format(today)}`;
  const fuente = "Tus respuestas";
  const iva = a.venta === "facturas" || a.venta === "ambas";
  const hon = a.venta === "honorarios" || a.venta === "ambas";
  const inicio = a.venta !== "sin_inicio";
  const h: HallazgoBase[] = [];
  const add = (x: Omit<HallazgoBase, "fuente" | "fecha" | "estado"> & { estado?: HallazgoBase["estado"] }) => h.push({ fuente, fecha, estado: x.estado ?? "declarado", ...x });
  const svc = (id: string, code: string, nombre: string, cat: string, porque: string) => offer(catalog, id, code, nombre, cat, porque);

  if (!inicio) {
    add({ id: "p_inicio", prioridad: "alta", encontro: "Declaras que aún no inicias actividades en el SII.",
      consecuencias: "Vender sin inicio de actividades impide emitir documentos y puede generar multas.",
      hacer: "Iniciar actividades con el giro y el régimen correctos antes de la primera venta.",
      servicio: svc("inicio", "FOR-01", "Inicio de actividades", "formalizacion", "Iniciar actividades con el giro y el régimen correctos.") });
  }
  if ((iva || !inicio) && a.crecer !== "no") {
    add({ id: "p_estructura", prioridad: a.crecer === "si" ? "media" : "baja",
      encontro: iva ? "Operas a tu nombre: ante el SII tu negocio y tu patrimonio personal son uno solo." : "Vas a iniciar un negocio y quieres crecer.",
      consecuencias: iva ? "Respondes con tus bienes personales por las deudas del negocio." : undefined,
      hacer: "Evaluar con un profesional si te conviene una EIRL o una SpA (cambia también cómo tributas).",
      servicio: svc("constituir", "CRE-01", "Constitución de empresa", "constitucion", "Evaluar y crear tu EIRL o SpA.") });
  }
  if (inicio && a.contador !== "contador") {
    add({ id: "p_impuestos", prioridad: "media",
      encontro: a.contador === "nadie" ? "Llevas tus impuestos tú mismo." : "No tienes claro quién lleva tus impuestos.",
      consecuencias: iva ? "El F29 se presenta todos los meses, aunque no vendas; olvidarlo genera multas." : undefined,
      hacer: iva ? "Delegar el F29 mensual y la renta anual en un profesional." : "Revisar tu declaración de renta de abril con un profesional.",
      servicio: iva ? svc("contabilidad", "CON-01", "Contabilidad mensual pyme", "contabilidad", "Tu F29 y libros al día.")
        : svc("renta", "CON-05", "Declaración anual de renta", "contabilidad", "Tu F22 con las retenciones bien aplicadas.") });
  } else if (hon && a.contador === "contador") {
    add({ id: "p_renta", prioridad: "baja", encontro: "Emites boletas de honorarios (retención de 15,25% en 2026).",
      hacer: "Revisar en abril cómo se cruzan tus retenciones con tu impuesto y tus cotizaciones.",
      servicio: svc("renta", "CON-05", "Declaración anual de renta", "contabilidad", "Tu F22 revisado por un profesional.") });
  }
  if (a.trabajadores === "si") {
    add({ id: "p_trabajadores", prioridad: "media", estado: "requiere_documentacion",
      encontro: "Tienes trabajadores contratados: aplican contratos, cotizaciones, seguro de accidentes y el protocolo de la Ley Karin.",
      hacer: "Revisar contratos, liquidaciones y cotizaciones de cada mes.",
      servicio: svc("remuneraciones", "CON-04", "Remuneraciones", "contabilidad", "Liquidaciones y cotizaciones al día.") });
  }
  if (a.lugar === "local") {
    add({ id: "p_patente", prioridad: "media", estado: "requiere_documentacion",
      encontro: "Tu negocio funciona en un local: requiere patente municipal y, según el rubro, permisos sectoriales.",
      hacer: "Confirmar que la patente esté vigente y que tengas los permisos de tu rubro.",
      servicio: svc("patente", "FOR-02", "Patente municipal", "formalizacion", "Patente y permisos de tu local.") });
  }
  if (a.cuentas === "no") {
    add({ id: "p_cuentas", prioridad: "media", encontro: "Declaras que no separas tu dinero personal del dinero del negocio.",
      hacer: "Usar una cuenta solo para el negocio y registrar sus ingresos y gastos.",
      servicio: svc("contabilidad", "CON-01", "Contabilidad mensual pyme", "contabilidad", "Ordenar las finanzas del negocio.") });
  }
  if (a.marca === "si") {
    add({ id: "p_marca", prioridad: "baja", encontro: "Tu negocio tiene un nombre o marca que quieres proteger.",
      hacer: "Buscar la marca en INAPI y, si está disponible, solicitar su registro.",
      servicio: svc("marca", "BRA-01", "Registro de marca ante INAPI", "marcas", "Búsqueda y solicitud de marca.") });
  }

  // Oportunidades (M16) con criterios que la persona declaró
  const beneficios: ExpedientePersona["beneficios"] = [];
  const semilla = BENEFITS.find((b) => b.id === "capital_semilla_emprende");
  const crece = BENEFITS.find((b) => b.id === "sercotec_crece");
  if (!inicio && semilla) beneficios.push({ nombre: semilla.nombre, url: semilla.url, porque: "Está dirigido a personas sin inicio de actividades en primera categoría.", falta: "Que tu idea calce con el foco regional de la convocatoria vigente." });
  if (inicio && a.crecer === "si" && crece) beneficios.push({ nombre: crece.nombre, url: crece.url, porque: "Apoya a micro y pequeñas empresas con inicio de actividades que quieren crecer.", falta: "Que tus ventas calcen con los rangos de la convocatoria y sus bases regionales." });
  if (beneficios.length) {
    add({ id: "p_fondos", prioridad: "baja", estado: "parcial", encontro: `${beneficios.length} programa(s) público(s) podrían aplicar a tu situación.`,
      hacer: "Confirmar requisitos y fechas de la convocatoria vigente.",
      servicio: svc("crecimiento", "GEN-01", "Consulta profesional", "crecimiento", "Preparar tu postulación.") });
  }

  const fortalezas = [
    ...(inicio ? ["Tienes actividad económica iniciada."] : []),
    ...(a.contador === "contador" ? ["Cuentas con apoyo contable."] : []),
    ...(a.cuentas === "si" ? ["Separas tus finanzas personales de las del negocio."] : []),
    ...(a.crecer === "si" ? ["Tienes intención de crecer: es el mejor momento para ordenar la estructura."] : []),
  ];

  const necesidades = necesidadesDe(h);
  const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;

  // Perfil tributario contextual (según lo declarado: no se infiere un régimen a partir del giro).
  const categoria = !inicio ? "Sin inicio de actividades: aún no tributas por una actividad independiente"
    : a.venta === "honorarios" ? "Segunda categoría: profesional independiente con boletas de honorarios"
    : a.venta === "facturas" ? "Primera categoría: negocio a tu nombre con boletas o facturas (régimen por confirmar)"
    : "Actividades mixtas: primera categoría (negocio) y segunda categoría (honorarios)";

  // Evaluación de situación (cuatro estados; sin etiquetas de incumplimiento).
  const situacion: ExpedientePersona["situacion"] = [
    { tema: "Actividad económica", estado: "confirmado", detalle: inicio ? "Declaras actividad iniciada ante el SII." : "Declaras que aún no inicias actividades." },
    ...(inicio ? [{ tema: "Régimen tributario", estado: "pendiente" as const, detalle: iva ? "Define tus impuestos de primera categoría: se confirma con tu Carpeta Tributaria." : "Se confirma con tu Carpeta Tributaria." }] : []),
    { tema: "Antecedentes en el SII y la Tesorería", estado: "no_consultado", detalle: "Por privacidad, CORA no consulta fuentes con el RUT de una persona. Con tu cuenta y autorización se revisan tus documentos." },
    ...(iva ? [{ tema: "Declaraciones mensuales (F29)", estado: "requiere_documentos" as const, detalle: "Se verifican con tu Carpeta Tributaria o tus F29." }] : []),
    ...(a.trabajadores === "si" ? [{ tema: "Contratos y cotizaciones", estado: "requiere_documentos" as const, detalle: "Se verifican con contratos y el certificado de cotizaciones." }] : []),
  ];

  // Motor de impacto: ejemplos calculados por el motor contable, con datos, supuestos y fórmula.
  const impacto: Impacto[] = [];
  if (hon) {
    const r = runCalculator("calcular_retencion_honorarios", { bruto: 1_000_000, anio: today.getFullYear() });
    if (r.ok) impacto.push({
      titulo: "Retención de tus boletas de honorarios", datos: `Boleta de ejemplo de ${pesos(1_000_000)} bruto, emitida en ${today.getFullYear()}.`,
      supuestos: "Monto ilustrativo; tu monto real puede ser distinto.", formula: `Retención = bruto × ${String(r.resultado.tasa).replace(".", ",")} (tasa vigente del año).`,
      resultado: `Retención ${pesos(Number(r.resultado.retencion))} · recibes ${pesos(Number(r.resultado.liquido))}.`,
      confirmar: "En la renta de abril esa retención se cruza con tu impuesto y tus cotizaciones: puede haber devolución o pago.",
    });
  }
  if (iva) {
    const r = runCalculator("calcular_iva", { neto: 1_000_000 });
    if (r.ok) impacto.push({
      titulo: "IVA de tus ventas afectas", datos: `Venta de ejemplo de ${pesos(1_000_000)} neto.`,
      supuestos: "Venta afecta a IVA; tus compras con factura generan crédito fiscal que se descuenta.", formula: "IVA = neto × 19%.",
      resultado: `IVA ${pesos(Number(r.resultado.iva))} · total ${pesos(Number(r.resultado.total))}.`,
      confirmar: "Cuánto pagas cada mes depende de tus compras con derecho a crédito: se calcula con tus libros.",
    });
  }

  // Plan de acción: máximo tres prioridades, sin repetir servicio.
  const vistos = new Set<string>();
  const prioridades = [...necesidades].sort((x, y) => y.urgencia - x.urgencia)
    .filter((n) => { const k = n.servicio?.id ?? n.id; if (vistos.has(k)) return false; vistos.add(k); return true; }).slice(0, 3);

  return {
    categoria, situacion, impacto, prioridades,
    perfil: [
      { etiqueta: "Perfil", valor: SEGMENTO[a.venta] },
      { etiqueta: "Formalización", valor: inicio ? "Con inicio de actividades (declarado)" : "Sin inicio de actividades" },
      { etiqueta: "Estructura", valor: inicio ? "Persona natural (sin empresa separada)" : "Por definir" },
      { etiqueta: "Equipo", valor: a.trabajadores === "si" ? "Con trabajadores" : "Sin trabajadores" },
    ],
    fortalezas,
    necesidades,
    propuesta: construirPropuesta(necesidades),
    obligaciones: base.obligaciones,
    beneficios,
    conclusiones: base.conclusiones,
  };
}
