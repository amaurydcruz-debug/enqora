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
  // Persona con inicio de actividades sin movimiento, y deudas fiscales (para todos los que tienen inicio).
  declara?: "si" | "no" | "no_se";
  futuro?: "retomar" | "cerrar" | "no_se";
  deudas?: "si" | "no" | "no_se";
  antiguedad?: "antiguas" | "recientes" | "no_se"; // de cuándo son las deudas (prescripción)
};

// Preguntas que solo aplican según lo ya respondido (una persona sin movimiento no responde sobre su local o su marca).
export function preguntaVisible(key: keyof PersonaAnswers, a: Partial<PersonaAnswers>): boolean {
  const inactivo = a.venta === "inactivo";
  if (key === "declara" || key === "futuro") return inactivo;
  if (key === "deudas") return a.venta !== "sin_inicio";
  if (key === "antiguedad") return a.venta !== "sin_inicio" && a.deudas === "si";
  if (key === "contador") return a.venta !== "sin_inicio" && !inactivo;
  if (["trabajadores", "lugar", "cuentas", "crecer", "marca"].includes(key)) return !inactivo;
  return true;
}

// porque: el propósito de cada pregunta (se muestra al preguntar: nada se pregunta «por si acaso»).
export const PREGUNTAS_PERSONA: { key: keyof PersonaAnswers; q: string; porque: string; options: [string, string][] }[] = [
  { key: "venta", q: "¿Cómo generas ingresos hoy?", porque: "Define tu perfil tributario (primera o segunda categoría) y qué declaraciones te corresponden.", options: [
    ["facturas", "Vendo productos o servicios con boletas o facturas"],
    ["honorarios", "Emito boletas de honorarios"],
    ["ambas", "Ambas"],
    ["sin_inicio", "Aún no inicio actividades"],
    ["inactivo", "Tengo inicio de actividades, pero hoy no tengo movimiento"],
  ] },
  { key: "declara", q: "¿Sigues presentando tus declaraciones (el F29 cada mes y la renta en abril), aunque sea sin movimiento?", porque: "Mientras no hagas el término de giro, las declaraciones siguen siendo obligatorias aunque no vendas.", options: [["si", "Sí, al día"], ["no", "No, las dejé de presentar"], ["no_se", "No lo sé"]] },
  { key: "futuro", q: "¿Qué quieres hacer con ese negocio?", porque: "Para cerrarlo se hace el término de giro; para retomarlo, primero se ponen al día las declaraciones.", options: [["cerrar", "Cerrarlo"], ["retomar", "Retomarlo"], ["no_se", "Aún no lo decido"]] },
  { key: "trabajadores", q: "¿Tienes trabajadores contratados?", porque: "Con trabajadores se suman contratos, cotizaciones y prevención de riesgos.", options: [["no", "No"], ["si", "Sí"]] },
  { key: "contador", q: "¿Quién lleva tus impuestos?", porque: "Así sabemos si tus declaraciones ya tienen respaldo profesional o conviene revisarlas.", options: [["nadie", "Yo mismo"], ["contador", "Un contador"], ["no_se", "No lo tengo claro"]] },
  { key: "lugar", q: "¿Dónde funciona tu negocio?", porque: "Un local requiere patente municipal y, según el rubro, permisos.", options: [["local", "En un local"], ["casa", "Desde mi casa"], ["online", "Solo en línea"]] },
  { key: "cuentas", q: "¿Separas tu dinero personal del dinero del negocio?", porque: "Separar las cuentas ordena tus impuestos y te deja ver si el negocio gana.", options: [["si", "Sí"], ["no", "No"]] },
  { key: "crecer", q: "¿Quieres crecer en los próximos 12 meses (más ventas, socios o contratar)?", porque: "Si quieres crecer, conviene revisar tu estructura y los programas de apoyo vigentes.", options: [["si", "Sí"], ["no", "No"], ["no_se", "No lo sé"]] },
  { key: "marca", q: "¿Tu negocio tiene un nombre o marca que quieras proteger?", porque: "Una marca registrada en INAPI es un activo de tu negocio.", options: [["si", "Sí"], ["no", "No"]] },
  { key: "deudas", q: "¿Tienes deudas con la Tesorería (impuestos, multas o giros sin pagar)?", porque: "Hasta el 15 de abril de 2027, la Ley 21.850 permite pagarlas con condonación de intereses y multas.", options: [["si", "Sí"], ["no", "No"], ["no_se", "No lo sé"]] },
  { key: "antiguedad", q: "¿De cuándo son esas deudas?", porque: "Las deudas tributarias prescriben: en general a los 3 años desde que debieron pagarse, o a los 6 si no se declararon. Antes de pagar hay que revisarlo.", options: [["antiguas", "Algunas tienen más de 3 años"], ["recientes", "Todas son de los últimos 3 años"], ["no_se", "No lo sé"]] },
];

// Puede haber deudas prescritas: hay que revisarlo antes de pagar o firmar un convenio (que reconoce la deuda).
export const revisarPrescripcion = (a: Partial<PersonaAnswers>) =>
  a.venta !== "sin_inicio" && ((a.deudas === "si" && a.antiguedad !== "recientes") || a.deudas === "no_se");

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
  inactivo: "Persona con negocio a su nombre, hoy sin movimiento",
};

export function investigarPersona(a: PersonaAnswers, catalog: Catalog, today = new Date()): ExpedientePersona {
  const base = buildNaturalReport(a, catalog, today);
  const fecha = `respondido el ${new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Santiago" }).format(today)}`;
  const fuente = "Tus respuestas";
  const iva = a.venta === "facturas" || a.venta === "ambas";
  const hon = a.venta === "honorarios" || a.venta === "ambas";
  const inicio = a.venta !== "sin_inicio";
  const inactivo = a.venta === "inactivo";
  const h: HallazgoBase[] = [];
  const add = (x: Omit<HallazgoBase, "fuente" | "fecha" | "estado"> & { estado?: HallazgoBase["estado"] }) => h.push({ fuente, fecha, estado: x.estado ?? "declarado", ...x });
  const svc = (id: string, code: string, nombre: string, cat: string, porque: string) => offer(catalog, id, code, nombre, cat, porque);

  // Deudas con la Tesorería: plazo legal acotado (Ley 21.850), por eso van primero.
  if (inicio && (a.deudas === "si" || a.deudas === "no_se")) {
    add({ id: "p_tgr", prioridad: "alta", estado: a.deudas === "si" ? "declarado" : "requiere_documentacion",
      encontro: a.deudas === "si" ? "Declaras deudas con la Tesorería." : "No sabes si tienes deudas con la Tesorería.",
      consecuencias: "Las deudas fiscales siguen sumando intereses y multas mientras no se paguen o se convengan.",
      hacer: revisarPrescripcion(a)
        ? "Obtener tu certificado de deuda en tgr.cl (gratis, con tu clave), revisar primero qué deudas podrían estar prescritas y pagar solo las demás con la condonación de la Ley 21.850 (deudas vencidas al 31 de diciembre de 2025, hasta el 15 de abril de 2027)."
        : "Obtener tu certificado de deuda en tgr.cl (gratis, con tu clave) y evaluar pagarlo con la condonación de la Ley 21.850, solo para deudas vencidas al 31 de diciembre de 2025 y hasta el 15 de abril de 2027.",
      servicio: svc("tgr", "CON-06", "Regularización de deudas fiscales con condonación (Ley 21.850)", "contabilidad", "Calcular contado frente a convenio y acompañarte en la Tesorería.") });
  }
  // Prescripción (Código Tributario, arts. 200 y 201): se revisa ANTES de pagar o firmar un convenio.
  if (revisarPrescripcion(a)) {
    add({ id: "p_prescripcion", prioridad: "alta", estado: "requiere_documentacion",
      encontro: a.deudas === "no_se" ? "No sabes si tienes deudas ni de cuándo serían." : a.antiguedad === "antiguas" ? "Declaras que algunas de tus deudas tienen más de 3 años." : "No sabes de cuándo son tus deudas.",
      consecuencias: "Si pagas o firmas un convenio por una deuda que podría estar prescrita, la reconoces por escrito y puedes perder la prescripción.",
      hacer: "Antes de pagar, revisar deuda por deuda si el cobro prescribió (en general 3 años desde que debió pagarse, o 6 si no se declaró) y, si corresponde, pedir que se declare prescrita.",
      servicio: svc("prescripcion", "LEG-04", "Revisión y solicitud de prescripción de deudas fiscales", "profesionales", "Revisar qué deudas prescribieron antes de pagar.") });
  }
  if (inactivo && a.declara !== "si") {
    add({ id: "p_declaraciones", prioridad: "alta", estado: a.declara === "no" ? "declarado" : "requiere_documentacion",
      encontro: a.declara === "no" ? "Declaras que dejaste de presentar tus declaraciones." : "No sabes si tus declaraciones están presentadas.",
      consecuencias: "Mientras no hagas el término de giro, el F29 (si eras contribuyente de IVA) y la renta siguen siendo obligatorios aunque no vendas; las declaraciones atrasadas generan multas.",
      hacer: "Revisar en tu Carpeta Tributaria (gratis en sii.cl) qué falta y presentarlo.",
      servicio: svc("regularizacion", "CON-03", "Regularización de contabilidad atrasada", "contabilidad", "Poner al día tus declaraciones atrasadas.") });
  }
  if (inactivo && a.futuro !== "retomar") {
    add({ id: "p_cierre", prioridad: a.futuro === "cerrar" ? "alta" : "media",
      encontro: a.futuro === "cerrar" ? "Quieres cerrar el negocio." : "Aún no decides si cerrar o retomar el negocio.",
      consecuencias: "Sin término de giro, las obligaciones mensuales y anuales siguen corriendo.",
      hacer: a.futuro === "cerrar" ? "Hacer el término de giro ante el SII, después de revisar las declaraciones y deudas pendientes." : "Evaluar con un profesional si te conviene cerrar con el término de giro.",
      servicio: svc("cierre", "FOR-03", "Término de giro", "formalizacion", "Cerrar ordenadamente el negocio ante el SII.") });
  }
  if (inactivo && a.futuro === "retomar") {
    add({ id: "p_retomar", prioridad: "media", encontro: "Quieres retomar el negocio.",
      hacer: "Poner al día las declaraciones y deudas, y luego llevar la contabilidad mensual.",
      servicio: svc("contabilidad", "CON-01", "Contabilidad mensual pyme", "contabilidad", "Tu F29, libros y control mensual al día.") });
  }
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
  if (inicio && !inactivo && a.contador !== "contador") {
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
  if (inicio && !inactivo && a.crecer === "si" && crece) beneficios.push({ nombre: crece.nombre, url: crece.url, porque: "Apoya a micro y pequeñas empresas con inicio de actividades que quieren crecer.", falta: "Que tus ventas calcen con los rangos de la convocatoria y sus bases regionales." });
  if (beneficios.length) {
    add({ id: "p_fondos", prioridad: "baja", estado: "parcial", encontro: `${beneficios.length} programa(s) público(s) podrían aplicar a tu situación.`,
      hacer: "Confirmar requisitos y fechas de la convocatoria vigente.",
      servicio: svc("crecimiento", "GEN-01", "Consulta profesional", "crecimiento", "Preparar tu postulación.") });
  }

  const fortalezas = [
    ...(inicio && !inactivo ? ["Tienes actividad económica iniciada."] : []),
    ...(inactivo ? ["Buscas ordenar tu situación: es el primer paso para cerrar o retomar sin cargas."] : []),
    ...(a.contador === "contador" ? ["Cuentas con apoyo contable."] : []),
    ...(a.cuentas === "si" ? ["Separas tus finanzas personales de las del negocio."] : []),
    ...(a.crecer === "si" ? ["Tienes intención de crecer: es el mejor momento para ordenar la estructura."] : []),
  ];

  const necesidades = necesidadesDe(h);
  const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;

  // Perfil tributario contextual (según lo declarado: no se infiere un régimen a partir del giro).
  const categoria = !inicio ? "Sin inicio de actividades: aún no tributas por una actividad independiente"
    : inactivo ? "Con inicio de actividades y sin movimiento: tus obligaciones siguen hasta el término de giro"
    : a.venta === "honorarios" ? "Segunda categoría: profesional independiente con boletas de honorarios"
    : a.venta === "facturas" ? "Primera categoría: negocio a tu nombre con boletas o facturas (régimen por confirmar)"
    : "Actividades mixtas: primera categoría (negocio) y segunda categoría (honorarios)";

  // Evaluación de situación (cuatro estados; sin etiquetas de incumplimiento).
  const situacion: ExpedientePersona["situacion"] = [
    { tema: "Actividad económica", estado: "confirmado", detalle: inactivo ? "Declaras inicio de actividades sin movimiento actual y sin término de giro." : inicio ? "Declaras actividad iniciada ante el SII." : "Declaras que aún no inicias actividades." },
    ...(revisarPrescripcion(a) ? [{ tema: "Prescripción de deudas antiguas", estado: "requiere_documentos" as EstadoSituacion,
      detalle: "Se revisa deuda por deuda con el certificado de deuda y los movimientos de tu cuenta en la Tesorería, antes de pagar nada." }] : []),
    ...(inicio && a.deudas ? [{ tema: "Deudas con la Tesorería", estado: (a.deudas === "no_se" ? "requiere_documentos" : "confirmado") as EstadoSituacion,
      detalle: a.deudas === "si" ? "Declaras que tienes deudas: el monto se confirma con el certificado de deuda." : a.deudas === "no" ? "Declaras que no tienes deudas." : "Se confirma con el certificado de deuda de la Tesorería." }] : []),
    ...(inactivo ? [{ tema: "Declaraciones (F29 y renta)", estado: (a.declara === "si" ? "confirmado" : "requiere_documentos") as EstadoSituacion,
      detalle: a.declara === "si" ? "Declaras que las sigues presentando: se verifica con tu Carpeta Tributaria." : "Se verifica con tu Carpeta Tributaria." }] : []),
    ...(inicio ? [{ tema: "Régimen tributario", estado: "pendiente" as const, detalle: iva ? "Define tus impuestos de primera categoría: se confirma con tu Carpeta Tributaria." : "Se confirma con tu Carpeta Tributaria." }] : []),
    { tema: "Antecedentes en el SII", estado: "no_consultado", detalle: "Por privacidad, CORA no consulta fuentes con el RUT de una persona. Con tu cuenta y autorización se revisan tus documentos." },
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

  if (inicio && (a.deudas === "si" || a.deudas === "no_se") && today.toISOString().slice(0, 10) <= "2027-04-15") {
    impacto.push({
      titulo: "Condonación de la Tesorería (Ley 21.850)", datos: `Ejemplo: ${pesos(1_000_000)} de multas y ${pesos(500_000)} de intereses, en deudas vencidas al 31-12-2025.`,
      supuestos: "Montos ilustrativos; tu deuda real sale del certificado de la Tesorería.",
      formula: "Al contado: se condona 100% de los intereses y 80% de las multas. En convenio de hasta 48 cuotas: 95% y 75%.",
      resultado: `Al contado se condonan ${pesos(500_000 + 800_000)} de ${pesos(1_500_000)} (pagas ${pesos(200_000)} más el capital del impuesto).`,
      confirmar: "Que las deudas sean fiscales, estén vencidas al 31 de diciembre de 2025 y no estén prescritas (si lo están, no conviene pagarlas: pagar o firmar convenio reconoce la deuda). Si se atrasa una cuota del convenio, el beneficio se revoca.",
    });
  }

  // Plan de acción: máximo tres prioridades, sin repetir servicio.
  const vistos = new Set<string>();
  // La revisión de prescripción va primero: decide qué se paga y qué no.
  const prioridades = [...necesidades].sort((x, y) => Number(y.id === "p_prescripcion") - Number(x.id === "p_prescripcion") || y.urgencia - x.urgencia)
    .filter((n) => { const k = n.servicio?.id ?? n.id; if (vistos.has(k)) return false; vistos.add(k); return true; }).slice(0, 3);

  return {
    categoria, situacion, impacto, prioridades,
    perfil: [
      { etiqueta: "Perfil", valor: SEGMENTO[a.venta] },
      { etiqueta: "Formalización", valor: inactivo ? "Con inicio de actividades, sin movimiento (declarado)" : inicio ? "Con inicio de actividades (declarado)" : "Sin inicio de actividades" },
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
