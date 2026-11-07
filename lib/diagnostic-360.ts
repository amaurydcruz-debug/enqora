import { BENEFITS } from "@/lib/benefits";
import { buildInitialReport, companyType, offer, type Catalog, type InitialReport, type PublicProfileForReport, type ServiceOffer } from "@/lib/initial-report";
import { salesTrancheLabel } from "@/lib/public-data";
import { runCalculator } from "@/lib/tax-calc";

// Diagnóstico empresarial 360° (Fase 1). Combina:
//  • datos públicos del SII (confirmados, con fuente y fecha), y
//  • una autoevaluación de ~2 minutos que responde el empresario en su navegador (no se envía ni se guarda).
// Reglas: nada se afirma sin fundamento; «No sé» no se convierte en un problema, sino en algo por confirmar;
// la falta de un dato nunca es una infracción; el mapa no es una certificación ni un indicador auditado.

export type Answer = "si" | "no" | "no_se" | "ayuda" | "na";
export type AreaKey = "tributacion" | "legal" | "finanzas" | "comercial" | "gestion" | "rrhh" | "tecnologia" | "crecimiento";
export type Level = "solido" | "atencion" | "prioritario" | "sin_info";
export type Certainty = "confirmado" | "declarado" | "requiere_documentos" | "requiere_profesional";

export const AREAS: { key: AreaKey; nombre: string }[] = [
  { key: "tributacion", nombre: "Tributación" },
  { key: "legal", nombre: "Legal y permisos" },
  { key: "finanzas", nombre: "Finanzas" },
  { key: "comercial", nombre: "Comercial" },
  { key: "gestion", nombre: "Gestión" },
  { key: "rrhh", nombre: "Recursos humanos" },
  { key: "tecnologia", nombre: "Tecnología" },
  { key: "crecimiento", nombre: "Crecimiento" },
];

export const LEVELS: Record<Level, string> = {
  solido: "Sólido",
  atencion: "Necesita atención",
  prioritario: "Prioritario",
  sin_info: "Sin información suficiente",
};

export const CERTAINTY: Record<Certainty, string> = {
  confirmado: "Confirmado en el SII",
  declarado: "Declarado por ti",
  requiere_documentos: "Requiere documentación",
  requiere_profesional: "Requiere evaluación profesional",
};

type ServiceRef = { id: string; code: string | null; fallback: string; categoria: string };

export type Question = {
  id: string;
  area: AreaKey;
  q: string;
  ayuda?: string; // aclaración breve bajo la pregunta
  critica?: boolean; // un «No» o «Necesito ayuda» aquí vuelve prioritaria el área
  noAplica?: string; // texto de la opción «No aplica», si corresponde
  // Hallazgo cuando la respuesta es «No» o «Necesito ayuda»
  detectado: string;
  importa: string;
  riesgo?: string; // solo cuando hay fundamento normativo o práctico claro
  recomienda: string;
  servicio: ServiceRef;
  // Si responde «No sé», qué se recomienda confirmar (no se trata como problema)
  confirmar: string;
};

const S = {
  contabilidad: { id: "contabilidad", code: "CON-01", fallback: "Contabilidad mensual pyme", categoria: "contabilidad" },
  regularizacion: { id: "regularizacion", code: "CON-03", fallback: "Regularización de contabilidad atrasada", categoria: "contabilidad" },
  remuneraciones: { id: "remuneraciones", code: "CON-04", fallback: "Remuneraciones", categoria: "contabilidad" },
  marca: { id: "marca", code: "BRA-01", fallback: "Registro de marca ante INAPI", categoria: "marcas" },
  patente: { id: "patente", code: "FOR-02", fallback: "Patente municipal", categoria: "formalizacion" },
  contrato: { id: "contrato", code: "LEG-01", fallback: "Revisión de contrato", categoria: "profesionales" },
  consulta: { id: "consulta", code: "GEN-01", fallback: "Consulta profesional", categoria: "profesionales" },
  crecimiento: { id: "crecimiento", code: "GEN-01", fallback: "Consulta profesional", categoria: "crecimiento" },
  // Sin servicio en el catálogo todavía: se ofrecen como «Próximamente · Solicitar contacto»
  crm: { id: "crm", code: "CRM-PROX", fallback: "ENQORA Gestión · clientes y ventas", categoria: "gestion" },
  inventario: { id: "inventario", code: "GES-PROX", fallback: "ENQORA Gestión · inventario y proveedores", categoria: "gestion" },
  marketing: { id: "marketing", code: "MKT-PROX", fallback: "Marketing y presencia digital", categoria: "crecimiento" },
  tecnologia: { id: "tecnologia", code: "TEC-PROX", fallback: "Tecnología, sistemas y respaldos", categoria: "gestion" },
} satisfies Record<string, ServiceRef>;

export const QUESTIONS: Question[] = [
  {
    id: "declaraciones", area: "tributacion", critica: true,
    q: "¿Tus declaraciones de IVA (F29) y de renta están presentadas y al día?",
    detectado: "Declaras que tus declaraciones de IVA o renta no están al día, o que necesitas ayuda con ellas.",
    importa: "El F29 se presenta todos los meses, aun sin ventas; el F22 cada abril.",
    riesgo: "Las declaraciones atrasadas generan multas e intereses que crecen cada mes, y pueden bloquear la emisión de documentos.",
    recomienda: "Revisar los períodos pendientes con la Carpeta Tributaria y regularizarlos en orden.",
    servicio: S.regularizacion,
    confirmar: "Revisa en tu Carpeta Tributaria Electrónica (gratis en sii.cl) qué períodos están presentados.",
  },
  {
    id: "cuentas", area: "finanzas",
    q: "¿Las cuentas bancarias de la empresa están separadas de tus cuentas personales?",
    detectado: "Las finanzas de la empresa y las personales no están separadas.",
    importa: "Mezclarlas impide saber si el negocio gana o pierde y complica justificar gastos ante el SII.",
    riesgo: "Gastos sin respaldo en la cuenta de la empresa pueden ser rechazados tributariamente.",
    recomienda: "Abrir o usar una cuenta exclusiva de la empresa y ordenar la contabilidad mensual.",
    servicio: S.contabilidad,
    confirmar: "Revisa si todos los pagos y cobros del negocio pasan por una cuenta a nombre de la empresa.",
  },
  {
    id: "caja", area: "finanzas",
    q: "¿Sabes cada mes cuánto dinero entra y sale del negocio (flujo de caja)?",
    detectado: "No llevas un control mensual del flujo de caja.",
    importa: "Sin flujo de caja es difícil anticipar faltas de dinero para sueldos, impuestos o proveedores.",
    recomienda: "Armar un flujo de caja mensual simple y revisarlo con un profesional.",
    servicio: S.consulta,
    confirmar: "Anota durante un mes todos los ingresos y egresos para tener una primera foto.",
  },
  {
    id: "clientes", area: "comercial",
    q: "¿Tienes registrados tus clientes y el seguimiento de tus ventas (planilla o sistema)?",
    detectado: "No tienes un registro de clientes ni del seguimiento de tus ventas.",
    importa: "Sin registro se pierden oportunidades de volver a vender y no se sabe qué clientes son rentables.",
    recomienda: "Ordenar una base de clientes con su historial y próximos contactos.",
    servicio: S.crm,
    confirmar: "Revisa dónde queda hoy la información de cada cliente (correo, WhatsApp, cuaderno).",
  },
  {
    id: "digital", area: "comercial",
    q: "¿Tu negocio tiene página web o redes sociales activas?",
    detectado: "El negocio no tiene presencia digital activa.",
    importa: "Hoy la mayoría de los clientes busca en internet antes de comprar o contactar.",
    recomienda: "Definir una presencia digital mínima: ficha de negocio, una red social activa o una página simple.",
    servicio: S.marketing,
    confirmar: "Busca el nombre de tu negocio en internet y revisa qué aparece.",
  },
  {
    id: "inventario", area: "gestion", noAplica: "No vendo productos",
    q: "¿Controlas tu inventario y tus proveedores con un registro actualizado?",
    detectado: "No tienes un control actualizado de inventario o proveedores.",
    importa: "Sin control de inventario hay quiebres de stock, mermas y compras de más.",
    recomienda: "Llevar inventario y compras en un registro único, idealmente conectado a tus ventas.",
    servicio: S.inventario,
    confirmar: "Compara lo que dice tu registro con lo que hay físicamente en bodega.",
  },
  {
    id: "marca", area: "legal",
    q: "¿El nombre o la marca de tu negocio está registrado en INAPI?",
    ayuda: "La razón social en el SII no protege la marca: el registro en INAPI es otro trámite.",
    detectado: "La marca del negocio no está registrada en INAPI.",
    importa: "Sin registro, otra persona podría inscribir la marca y limitar su uso.",
    recomienda: "Hacer una búsqueda de disponibilidad en INAPI y, si corresponde, solicitar el registro.",
    servicio: S.marca,
    confirmar: "Busca tu marca en el buscador de marcas de INAPI (buscadormarcas.inapi.cl).",
  },
  {
    id: "patente", area: "legal", critica: true,
    q: "¿Tienes patente municipal vigente y los permisos que exige tu rubro?",
    detectado: "Declaras no tener patente municipal vigente o los permisos del rubro, o necesitas ayuda con ellos.",
    importa: "La patente municipal es obligatoria para ejercer una actividad comercial; algunos rubros requieren además permisos sectoriales (por ejemplo, sanitarios).",
    riesgo: "Funcionar sin patente o permisos puede significar multas o la clausura del local.",
    recomienda: "Revisar qué patente y permisos corresponden a tu actividad y comuna, y tramitarlos.",
    servicio: S.patente,
    confirmar: "Revisa en tu municipalidad si la patente está pagada y vigente.",
  },
  {
    id: "contratos", area: "rrhh", critica: true, noAplica: "No tengo trabajadores",
    q: "¿Todos tus trabajadores tienen contrato escrito y sus cotizaciones al día?",
    detectado: "Hay trabajadores sin contrato escrito o con cotizaciones pendientes, o necesitas ayuda con esto.",
    importa: "El contrato escrito y el pago de cotizaciones son obligaciones del empleador.",
    riesgo: "Las cotizaciones impagas generan multas, intereses y responsabilidad ante la Dirección del Trabajo.",
    recomienda: "Ordenar contratos, liquidaciones y cotizaciones mes a mes.",
    servicio: S.remuneraciones,
    confirmar: "Pide en Previred o en la Dirección del Trabajo el certificado de cotizaciones de tus trabajadores.",
  },
  {
    id: "respaldos", area: "tecnologia",
    q: "¿Respaldas tu información (documentos, facturas, contabilidad) fuera de tu computador?",
    detectado: "La información del negocio no tiene respaldo fuera del computador.",
    importa: "Un robo, falla o virus puede borrar documentos que el SII puede pedir durante años.",
    recomienda: "Definir un respaldo automático en la nube y ordenar los documentos tributarios.",
    servicio: S.tecnologia,
    confirmar: "Revisa dónde están hoy tus documentos y si existe una copia en otro lugar.",
  },
  {
    id: "sistema", area: "tecnologia",
    q: "¿Usas un sistema para facturar, vender o administrar (no solo papel o memoria)?",
    detectado: "El negocio se administra sin un sistema.",
    importa: "Sin sistema, la información queda dispersa y cuesta tomar decisiones o cumplir a tiempo.",
    recomienda: "Elegir un sistema simple de ventas y administración conectado con la contabilidad.",
    servicio: S.tecnologia,
    confirmar: "Haz una lista de las tareas que hoy haces a mano cada semana.",
  },
  {
    id: "fondos", area: "crecimiento",
    q: "¿Has evaluado fondos públicos o financiamiento para crecer en el último año?",
    detectado: "No has evaluado fondos públicos ni financiamiento para crecer.",
    importa: "Existen programas públicos (Sercotec, Corfo, SENCE, compras públicas) que podrían calzar con tu empresa.",
    recomienda: "Revisar las convocatorias vigentes que calcen con tu tamaño y rubro.",
    servicio: S.crecimiento,
    confirmar: "Revisa las convocatorias abiertas en Sercotec y Corfo para tu región.",
  },
];

export type AreaResult = { key: AreaKey; nombre: string; nivel: Level; fundamento: string[] };

export type Finding = {
  id: string;
  area: AreaKey;
  prioridad: "alta" | "media" | "baja";
  certeza: Certainty;
  fuente: string;
  detectado: string;
  importa: string;
  riesgo?: string;
  recomienda: string;
  servicio: ServiceOffer;
};

// gancho/porqueTu/faltaTu: texto en segunda persona para la consulta pública. ejemplo: cálculo ilustrativo del motor contable.
export type BenefitMatch = { nombre: string; porque: string; falta: string; url: string; verificado: string; queEs?: string; gancho?: string; porqueTu?: string; faltaTu?: string; ejemplo?: string };

export type Report360 = {
  perfil: { etiqueta: string; valor: string }[];
  resumen: string;
  areas: AreaResult[];
  hallazgos: Finding[];
  porConfirmar: { tema: string; como: string }[];
  ruta: ServiceOffer[]; // los 3 servicios más relevantes
  beneficios: BenefitMatch[];
  base: InitialReport; // obligaciones verificadas y veredicto público
  fuentes: { nombre: string; fecha: string; url?: string }[];
};

const AREA_WEIGHT: Record<AreaKey, number> = { tributacion: 0, rrhh: 1, legal: 2, finanzas: 3, comercial: 4, gestion: 5, tecnologia: 6, crecimiento: 7 };
const fmtDate = (d: string) =>
  new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d.slice(0, 10)}T12:00:00Z`));

// Preguntas que aplican a esta empresa (la de trabajadores siempre aplica si el SII informa trabajadores).
export function questionsFor(p: PublicProfileForReport): Question[] {
  const workers = p.perfil?.trabajadores ?? 0;
  return QUESTIONS.map((q) => (q.id === "contratos" && workers > 0 ? { ...q, noAplica: undefined } : q));
}

export function build360(p: PublicProfileForReport, answers: Record<string, Answer>, catalog: Catalog, today = new Date()): Report360 {
  const base = buildInitialReport(p, catalog, today);
  const qs = questionsFor(p);
  const svc = (r: ServiceRef, porque: string) => offer(catalog, r.id, r.code, r.fallback, r.categoria, porque);
  const hallazgos: Finding[] = [];
  const porConfirmar: Report360["porConfirmar"] = [];
  const workers = p.perfil?.trabajadores ?? 0;
  const tramo = Number(p.perfil?.tramo_ventas);
  const cerrada = !!p.termino_giro;
  const senales = p.senales ?? [];

  // 1) Hallazgos confirmados en fuentes públicas (SII)
  if (cerrada) {
    hallazgos.push({
      id: "termino_giro", area: "tributacion", prioridad: "alta", certeza: "confirmado", fuente: "Nómina de razón social del SII",
      detectado: `La empresa registra término de giro (${fmtDate(p.termino_giro!)}).`,
      importa: "Con término de giro no corresponde emitir documentos ni operar.",
      riesgo: "Operar con término de giro expone a multas.",
      recomienda: "Confirmar si la empresa sigue operando y, si corresponde, revisar el cierre o la reactivación.",
      servicio: svc(S.consulta, "Revisar el cierre y decidir si se regulariza o reactiva."),
    });
  }
  const sinVentas = senales.find((s) => s.codigo === "sin_ventas_informadas" || s.codigo === "sin_informacion_reciente");
  if (sinVentas && !cerrada) {
    hallazgos.push({
      id: "sin_ventas", area: "tributacion", prioridad: "media", certeza: "confirmado", fuente: "Nómina de empresas del SII",
      detectado: sinVentas.codigo === "sin_ventas_informadas"
        ? `El SII no registra información de ventas en ${sinVentas.anio ?? "el último año informado"}.`
        : `La última información comercial en el SII es de ${sinVentas.anio ?? "hace años"}.`,
      importa: "Puede ser falta de movimiento o declaraciones no presentadas; el dato público no permite saber cuál.",
      recomienda: "Revisar las declaraciones del período en la Carpeta Tributaria.",
      servicio: svc(S.regularizacion, "Revisar los períodos y ponerlos al día si falta alguno."),
    });
  }

  // 2) Hallazgos declarados en la autoevaluación
  for (const q of qs) {
    const a = answers[q.id];
    if (a === "no" || a === "ayuda") {
      hallazgos.push({
        id: q.id, area: q.area, certeza: "declarado", fuente: "Tu autoevaluación",
        prioridad: q.critica ? "alta" : "media",
        detectado: a === "ayuda" ? `Pediste ayuda con: ${q.q.replace(/^¿|\?$/g, "").toLowerCase()}.` : q.detectado,
        importa: q.importa, riesgo: q.riesgo, recomienda: q.recomienda,
        servicio: svc(q.servicio, q.recomienda),
      });
    } else if (a === "no_se") {
      porConfirmar.push({ tema: q.q.replace(/^¿|\?$/g, ""), como: q.confirmar });
    }
  }
  // Prioridad baja para crecimiento: es una oportunidad, no un problema.
  for (const h of hallazgos) if (h.area === "crecimiento") h.prioridad = "baja";

  // 3) Mapa por áreas (con su fundamento)
  const areas: AreaResult[] = AREAS.map(({ key, nombre }) => {
    const fund: string[] = [];
    const aq = qs.filter((q) => q.area === key);
    let si = 0, mal = 0, critico = false, nose = 0;
    for (const q of aq) {
      const a = answers[q.id];
      const label = a === "si" ? "Sí" : a === "no" ? "No" : a === "ayuda" ? "Necesito ayuda" : a === "no_se" ? "No sé" : a === "na" ? "No aplica" : "Sin respuesta";
      fund.push(`${q.q} → ${label}`);
      if (a === "si") si++;
      else if (a === "no" || a === "ayuda") { mal++; if (q.critica) critico = true; }
      else if (a === "no_se") nose++;
    }
    // Datos públicos que pesan en el área
    const publicos = hallazgos.filter((h) => h.area === key && h.certeza === "confirmado");
    for (const h of publicos) fund.unshift(`SII: ${h.detectado}`);
    if (key === "rrhh" && workers > 0) fund.unshift(`SII: la empresa informa ${workers} trabajador(es) en ${p.perfil?.anio_comercial}.`);

    let nivel: Level;
    if (publicos.some((h) => h.prioridad === "alta") || critico) nivel = "prioritario";
    else if (mal > 0 || publicos.length > 0) nivel = "atencion";
    else if (si > 0 && nose > 0) nivel = "atencion";
    else if (si > 0) nivel = "solido";
    else nivel = "sin_info";
    if (nivel === "atencion" && mal === 0 && publicos.length === 0) fund.push("Hay respuestas «No sé»: conviene confirmarlas.");
    if (nivel === "sin_info" && aq.every((q) => answers[q.id] === "na")) fund.push("No aplica a tu negocio según tus respuestas.");
    return { key, nombre, nivel, fundamento: fund };
  });

  // 4) Orden de hallazgos y ruta recomendada: lo prioritario primero, sin repetir servicios; máximo 3.
  const order = { alta: 0, media: 1, baja: 2 };
  hallazgos.sort((a, b) => order[a.prioridad] - order[b.prioridad] || AREA_WEIGHT[a.area] - AREA_WEIGHT[b.area]);
  const ruta: ServiceOffer[] = [];
  for (const h of hallazgos) {
    if (ruta.length >= 3) break;
    if (!ruta.some((r) => r.id === h.servicio.id)) ruta.push(h.servicio);
  }
  // Si quedan cupos y la empresa está activa: completar con lo que ya detectó el informe público (sin repetir).
  for (const s of base.servicios) {
    if (ruta.length >= 3) break;
    if (!ruta.some((r) => r.id === s.id || (r.codigo && r.codigo === s.codigo))) ruta.push(s);
  }

  // 5) Beneficios M16 con criterios verificables en datos públicos (el resto se indica como «por confirmar»).
  // Si el SII no informa el tamaño, los beneficios tributarios se muestran igual, con el tamaño como dato por confirmar.
  const beneficios: BenefitMatch[] = [];
  const find = (id: string) => BENEFITS.find((b) => b.id === id);
  const sinTramo = !Number.isFinite(tramo) || tramo <= 0;
  const tam = salesTrancheLabel(p.perfil?.tramo_ventas);
  const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
  if (!cerrada) {
    // Beneficios tributarios: el gancho más concreto para el dueño, con fundamento legal verificado.
    const camioneta = find("iva_camionetas");
    if (camioneta && (sinTramo || tramo >= 2)) {
      const c = runCalculator("calcular_iva", { neto: 20_000_000 });
      const iva = c.ok ? Number(c.resultado.iva) : null;
      beneficios.push({ nombre: camioneta.nombre, url: camioneta.url, verificado: camioneta.verificado, queEs: camioneta.entrega,
        porque: "Tiene giro vigente: si compra o renueva una camioneta, jeep o furgón para el negocio, podría recuperar el IVA de esa compra.",
        falta: "Que tenga ventas afectas a IVA y que el vehículo se use directamente en el giro.",
        gancho: "Si compras una camioneta para tu negocio, puedes recuperar su IVA",
        porqueTu: "Tu empresa tiene giro vigente. Si compras o renuevas una camioneta, jeep o furgón que usas en el negocio, el IVA de esa compra puede descontarse del IVA de tus ventas.",
        faltaTu: "que tengas ventas afectas a IVA y que el vehículo se use directamente en tu giro.",
        ...(iva ? { ejemplo: `Ejemplo ilustrativo: en una camioneta de ${pesos(20_000_000)} más IVA, el IVA es ${pesos(iva)}. Ese monto puede usarse como crédito fiscal en tu F29.` } : {}) });
    }
    const posterga = find("postergacion_iva");
    if (posterga && (sinTramo || (tramo >= 2 && tramo <= 9))) beneficios.push({ nombre: posterga.nombre, url: posterga.url, verificado: posterga.verificado, queEs: posterga.entrega,
      porque: sinTramo ? "Aplica a empresas con ingresos promedio de hasta 100.000 UF." : `Según el SII su tamaño es ${tam}: por ventas, calza con el límite de 100.000 UF.`,
      falta: "Estar al día: F29 de los últimos 36 meses a tiempo, sin morosidad reiterada y notificaciones por correo.",
      gancho: "Más aire para tu caja: pagar el IVA hasta dos meses después",
      porqueTu: sinTramo ? "Es para empresas con ingresos promedio de hasta 100.000 UF al año, que es la gran mayoría de las pymes." : `Según el SII tu empresa está en el tramo ${tam}: por ventas, estás dentro del límite de 100.000 UF.`,
      faltaTu: `${sinTramo ? "tu nivel de ingresos y " : ""}que estés al día: F29 de los últimos 36 meses presentados a tiempo, sin morosidad reiterada y notificaciones del SII por correo.` });
    const propyme = find("pro_pyme_tasa");
    if (propyme && tramo >= 2 && tramo <= 9) beneficios.push({ nombre: propyme.nombre, url: propyme.url, verificado: propyme.verificado, queEs: propyme.entrega,
      porque: "Por su tamaño podría estar en el régimen Pro Pyme general.",
      falta: "Confirmar el régimen tributario actual (no es público).",
      gancho: "Pagar la mitad del impuesto a la renta: tasa de 12,5%",
      porqueTu: "Por tu tamaño podrías estar en el régimen Pro Pyme general, que hoy tiene una tasa reducida.",
      faltaTu: "tu régimen tributario actual, que no es público." });
    const crece = find("sercotec_crece");
    if (crece && tramo >= 2 && tramo <= 7) beneficios.push({ nombre: crece.nombre, url: crece.url, verificado: crece.verificado, queEs: crece.entrega,
      porque: `Según el SII su tamaño es ${tam} y tiene inicio de actividades.`,
      falta: "Que las ventas calcen con la convocatoria regional vigente y sus bases.",
      gancho: "Fondos que no se devuelven para hacer crecer tu negocio",
      porqueTu: `Tu empresa está en el tramo ${tam} y tiene inicio de actividades, el perfil al que apuntan estos fondos.`,
      faltaTu: "que tus ventas calcen con la convocatoria regional vigente y sus bases." });
    const sence = find("sence_franquicia");
    if (sence && workers > 0) beneficios.push({ nombre: sence.nombre, url: sence.url, verificado: sence.verificado, queEs: sence.entrega,
      porque: `La empresa informa ${workers} trabajador(es) al SII.`,
      falta: "Que la planilla supere 35 UTM mensuales y las cotizaciones estén pagadas.",
      gancho: "Capacitar a tu equipo descontándolo de tus impuestos",
      porqueTu: `Tu empresa informa ${workers} trabajador(es) al SII.`,
      faltaTu: "que tu planilla supere 35 UTM mensuales y las cotizaciones estén pagadas." });
    const compra = find("chilecompra");
    if (compra && answers.fondos !== "si") beneficios.push({ nombre: compra.nombre, url: compra.url, verificado: compra.verificado, queEs: compra.entrega,
      porque: "Tiene inicio de actividades: puede vender al Estado.",
      falta: "Que sus productos o servicios calcen con lo que compran los organismos públicos.",
      gancho: "Vender al Estado: saber quién compra lo que vendes",
      porqueTu: "Con inicio de actividades vigente puedes vender al Estado. La inscripción en Mercado Público es gratuita y la haces directo en ChileCompra; lo valioso es saber qué organismos compran lo que ofreces, cuánto y cada cuánto, y prepararte para competir.",
      faltaTu: "que lo que ofreces calce con lo que compran los organismos públicos; eso se revisa con sus órdenes de compra reales." });
  }

  // 6) Perfil, resumen y fuentes
  const tipo = companyType(p.razon_social);
  const perfil = [
    { etiqueta: "Razón social", valor: p.razon_social ?? "—" },
    ...(tipo ? [{ etiqueta: "Tipo (según razón social)", valor: tipo.nombre }] : []),
    ...(p.inicio_actividades ? [{ etiqueta: "Inicio de actividades", valor: fmtDate(p.inicio_actividades) }] : []),
    ...(p.perfil?.tramo_ventas ? [{ etiqueta: `Tamaño (${p.perfil.anio_comercial})`, valor: salesTrancheLabel(p.perfil.tramo_ventas) ?? "—" }] : []),
    ...(p.perfil?.trabajadores != null ? [{ etiqueta: "Trabajadores informados", valor: String(p.perfil.trabajadores) }] : []),
    ...(p.perfil?.rubro ? [{ etiqueta: "Rubro", valor: p.perfil.rubro }] : []),
  ];
  const n = (l: Level) => areas.filter((a) => a.nivel === l).length;
  const prio = areas.filter((a) => a.nivel === "prioritario").map((a) => a.nombre.toLowerCase());
  const resumen = [
    `De 8 áreas revisadas: ${n("prioritario")} prioritaria(s), ${n("atencion")} que necesitan atención, ${n("solido")} sólida(s) y ${n("sin_info")} sin información suficiente.`,
    prio.length ? `Lo primero a atender: ${prio.join(" y ")}.` : hallazgos.length ? "No hay áreas prioritarias; hay mejoras que fortalecerían la empresa." : "Según los datos públicos y tus respuestas, no detectamos necesidades urgentes.",
  ].join(" ");

  const fuentes: Report360["fuentes"] = [
    ...(p.fuentes ?? []).map((f) => ({ nombre: f.nombre, fecha: `publicada el ${fmtDate(f.publicada)}`, url: f.url })),
    { nombre: "Tu autoevaluación", fecha: `respondida el ${fmtDate(today.toISOString())}` },
    ...(beneficios.length ? [{ nombre: "Catálogo de beneficios ENQORA (fuentes oficiales)", fecha: `verificado el ${fmtDate(beneficios[0].verificado)}` }] : []),
  ];

  return { perfil, resumen, areas, hallazgos, porConfirmar, ruta: ruta.slice(0, 3), beneficios: beneficios.slice(0, 3), base, fuentes };
}
