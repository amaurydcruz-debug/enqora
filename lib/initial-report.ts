import { salesTrancheLabel } from "@/lib/public-data";

// Informe inicial ENQORA (Fase 0 · diagnóstico). Dos entradas:
//  • Empresa (persona jurídica): datos públicos de las nóminas del SII.
//  • Persona natural con giro: respuestas del propio visitante (no existe una fuente pública lícita de sus datos).
// ENQORA hace el análisis: un veredicto, 2 a 4 conclusiones, las obligaciones con su próxima fecha y los
// 3 servicios que resuelven lo detectado, con su precio. Nunca afirma deudas ni incumplimientos que los datos no prueban.

export type Catalog = { code: string; module: string; name: string; price_from: number | null; market_price?: number | null; welcome_pct?: number | null; welcome_months?: number | null }[];

export type PublicProfileForReport = {
  estado: string;
  rut?: string;
  razon_social?: string;
  inicio_actividades?: string | null;
  termino_giro?: string | null;
  actividades?: { codigo: string; descripcion: string | null }[];
  total_actividades?: number;
  perfil?: { anio_comercial: number; tramo_ventas: string | null; trabajadores: number | null; rubro: string | null; region?: string | null } | null;
  senales?: { codigo: string; gravedad: "alta" | "media" | "baja"; fecha?: string; anio?: number }[];
  fuentes?: { nombre: string; url: string; publicada: string }[];
  carga_parcial?: boolean;
};

export type ServiceOffer = {
  id: string;
  porque: string; // por qué ENQORA lo sugiere para este caso (una línea)
  nombre: string;
  codigo: string | null;
  categoria: string; // categoría de /comenzar
  precio: number | null; // tarifa vigente «desde»; 0 = sin costo; null = requiere evaluación
  mercado: number | null;
  bienvenida: { pct: number; meses: number } | null;
};

export type Obligation = { que: string; cuando: string; nota?: string };

export type InitialReport = {
  nivel: "alerta" | "atencion" | "sin_alertas";
  veredicto: string; // una frase
  conclusiones: string[]; // 2 a 4, ya analizadas
  obligaciones: Obligation[];
  servicios: ServiceOffer[]; // máximo 3, en orden de prioridad
  porComprobar: string[];
  completo: boolean;
};

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const fmt = (d?: string | null) =>
  d ? new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`)) : "";
const dm = (d: Date) => `${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]}`;
const dmy = (d: Date) => `${dm(d)} de ${d.getUTCFullYear()}`;

const yearsSince = (d?: string | null, today = new Date()) =>
  d ? (today.getTime() - new Date(`${d}T12:00:00Z`).getTime()) / (365.25 * 86400000) : null;

// Próxima fecha con día fijo cada mes (si hoy ya pasó, el mes siguiente).
function nextMonthly(day: number, today: Date) {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  return today.getUTCDate() <= day ? new Date(Date.UTC(y, m, day)) : new Date(Date.UTC(y, m + 1, day));
}
function nextYearly(month: number, day: number, today: Date) {
  const y = today.getUTCFullYear();
  const d = new Date(Date.UTC(y, month, day));
  return d.getTime() >= Date.UTC(y, today.getUTCMonth(), today.getUTCDate()) ? d : new Date(Date.UTC(y + 1, month, day));
}
function nextPatente(today: Date) {
  const a = nextYearly(0, 31, today);
  const b = nextYearly(6, 31, today);
  return a < b ? a : b;
}

function offer(catalog: Catalog, id: string, code: string | null, fallback: string, categoria: string, porque: string): ServiceOffer {
  const s = code ? catalog.find((x) => x.code === code) : undefined;
  return {
    id, porque, categoria,
    nombre: s?.name ?? fallback,
    codigo: s?.code ?? null,
    precio: code === null ? 0 : (s?.price_from ?? null),
    mercado: s?.market_price ?? null,
    bienvenida: s?.welcome_pct && s.welcome_months ? { pct: s.welcome_pct, meses: s.welcome_months } : null,
  };
}

function pushUnique(list: ServiceOffer[], o: ServiceOffer) {
  if (!list.some((x) => (x.codigo && x.codigo === o.codigo) || x.id === o.id)) list.push(o);
}

// Tipo societario según la razón social (indicio; la escritura lo confirma).
export function companyType(razon?: string): { nombre: string; deber: string | null } | null {
  const r = ` ${(razon ?? "").toUpperCase().replace(/\./g, "").replace(/\s+/g, " ")} `;
  if (/ SPA /.test(r) || r.includes("POR ACCIONES")) return { nombre: "sociedad por acciones (SpA)", deber: "llevar al día el Registro de Accionistas" };
  if (/ SA $/.test(r) || r.includes("SOCIEDAD ANONIMA") || r.includes("SOCIEDAD ANÓNIMA"))
    return { nombre: "sociedad anónima", deber: "celebrar la junta ordinaria de accionistas en el primer cuatrimestre de cada año" };
  if (/ EIRL /.test(r) || r.includes("INDIVIDUAL DE RESPONSABILIDAD LIMITADA")) return { nombre: "empresa individual de responsabilidad limitada (EIRL)", deber: null };
  if (/ (LTDA|LIMITADA) /.test(r)) return { nombre: "sociedad de responsabilidad limitada", deber: null };
  return null;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// ───────────────────────────── Empresa (persona jurídica) ─────────────────────────────
export function buildInitialReport(p: PublicProfileForReport, catalog: Catalog, today = new Date()): InitialReport {
  const senales = p.senales ?? [];
  const cerrada = !!p.termino_giro;
  const sinVentas = senales.find((s) => s.codigo === "sin_ventas_informadas" || s.codigo === "sin_informacion_reciente");
  const sinActs = senales.some((s) => s.codigo === "sin_actividades");
  const workers = p.perfil?.trabajadores ?? 0;
  const age = yearsSince(p.inicio_actividades, today);
  const tipo = companyType(p.razon_social);
  const tramo = Number(p.perfil?.tramo_ventas);
  const size = salesTrancheLabel(p.perfil?.tramo_ventas);

  const conclusiones: string[] = [];
  const servicios: ServiceOffer[] = [];

  // 1) Situación
  let nivel: InitialReport["nivel"] = "sin_alertas";
  let veredicto: string;
  if (cerrada) {
    nivel = "alerta";
    veredicto = `Terminó su giro el ${fmt(p.termino_giro)}: si sigue operando, debe regularizarse.`;
    conclusiones.push("Emitir documentos u operar con término de giro expone a multas; si el cierre fue intencional, conviene confirmar que se presentaron las declaraciones finales.");
    pushUnique(servicios, offer(catalog, "cierre", "GEN-01", "Consulta profesional", "profesionales", "Revisar el cierre y decidir si se regulariza o reactiva."));
  } else if (sinVentas) {
    nivel = "atencion";
    veredicto = sinVentas.codigo === "sin_ventas_informadas"
      ? `No informa ventas al SII en ${sinVentas.anio ?? "el último año informado"}: podría tener declaraciones pendientes.`
      : `Su última información comercial en el SII es de ${sinVentas.anio ?? "hace años"}: podría tener declaraciones pendientes.`;
    conclusiones.push("Puede ser falta de movimiento o declaraciones no presentadas. Si es lo segundo, las multas e intereses crecen cada mes: conviene revisarlo antes de que lo detecte una fiscalización.");
    pushUnique(servicios, offer(catalog, "atraso", "CON-03", "Regularización de contabilidad atrasada", "contabilidad", "Revisar los períodos sin declarar y ponerlos al día."));
  } else if (sinActs) {
    nivel = "atencion";
    veredicto = "No tiene actividades económicas vigentes publicadas: no podría emitir documentos correctamente.";
    pushUnique(servicios, offer(catalog, "actividades", "FOR-01", "Inicio de actividades", "formalizacion", "Inscribir o actualizar las actividades económicas."));
  } else {
    veredicto = "Empresa activa y sin alertas en los datos públicos del SII.";
  }

  // 2) Trayectoria y forma jurídica
  if (age != null && !cerrada) {
    const t = age < 1 ? "está en su primer año de actividad" : `lleva ${plural(Math.floor(age), "año", "años")} operando`;
    conclusiones.push(`${tipo ? `Es una ${tipo.nombre} y ${t}` : t[0].toUpperCase() + t.slice(1)}${age < 1 ? ": este año se fijan el régimen tributario, la patente y los permisos del rubro, y un error temprano se arrastra." : "."}${tipo?.deber ? ` Por su forma jurídica debe ${tipo.deber}.` : ""}`);
    if (age < 1) pushUnique(servicios, offer(catalog, "primer_anio", "FOR-02", "Patente municipal", "formalizacion", "Dejar en regla la patente y los permisos del primer año."));
  } else if (tipo?.deber && !cerrada) {
    conclusiones.push(`Es una ${tipo.nombre}: debe ${tipo.deber}.`);
  }

  // 3) Tamaño y trabajadores
  if (p.perfil && !cerrada) {
    const partes: string[] = [];
    if (size && tramo > 1) partes.push(`es ${size[0].toLowerCase() + size.slice(1)} por ventas (${p.perfil.anio_comercial})`);
    if (workers > 0) partes.push(`informa ${plural(workers, "trabajador", "trabajadores")}`);
    if (partes.length) {
      let txt = `Según el SII ${partes.join(" e ")}.`;
      if (workers > 0) txt += " Su carga mensual principal es el IVA (F29) más las remuneraciones: liquidaciones, cotizaciones y Libro de Remuneraciones Electrónico.";
      else txt += " Su carga mensual principal es el IVA (F29), y en abril la renta (F22).";
      if (tramo >= 2 && tramo <= 9) txt += " Por su tamaño puede optar al régimen Pro Pyme y a fondos de Sercotec o Corfo; conviene revisar si está en el régimen que más le conviene.";
      conclusiones.push(txt);
    }
  } else if (p.carga_parcial && !cerrada) {
    conclusiones.push("Tamaño, trabajadores y actividades se completan solos cuando termine la carga de las nóminas del SII en ENQORA.");
  }

  // 4) Servicios: lo detectado primero; después la operación de toda empresa activa.
  if (!cerrada) {
    if (workers > 0) pushUnique(servicios, offer(catalog, "remuneraciones", "CON-04", "Remuneraciones", "contabilidad", `Liquidaciones y cotizaciones de ${plural(workers, "trabajador", "trabajadores")} cada mes.`));
    pushUnique(servicios, offer(catalog, "contabilidad", "CON-01", "Contabilidad mensual pyme", "contabilidad", "IVA, libros y control mensual al día, sin sorpresas."));
    const m = today.getUTCMonth();
    if (m <= 3) pushUnique(servicios, offer(catalog, "renta", "CON-05", "Declaración anual de renta", "contabilidad", "La Operación Renta vence el 30 de abril."));
    if (tramo >= 2 && tramo <= 9) pushUnique(servicios, offer(catalog, "pyme", "GEN-01", "Consulta profesional", "crecimiento", "Revisar el régimen tributario y los fondos a los que puede postular."));
  }

  // Obligaciones con su próxima fecha
  const obligaciones: Obligation[] = [];
  if (!cerrada) {
    obligaciones.push({ que: "IVA mensual (F29)", cuando: dm(nextMonthly(20, today)), nota: "Día 20 si declara en línea y emite factura electrónica; si no, día 12. Se presenta aun sin movimiento." });
    if (workers > 0) obligaciones.push({ que: "Cotizaciones previsionales", cuando: dm(nextMonthly(13, today)), nota: "Día 13 si se pagan en línea; día 10 si no." });
    obligaciones.push({ que: "Declaraciones juradas anuales", cuando: "marzo", nota: "Según las operaciones del año (sueldos, honorarios, retiros, entre otras)." });
    obligaciones.push({ que: "Renta anual (F22)", cuando: dmy(nextYearly(3, 30, today)) });
    obligaciones.push({ que: "Patente municipal", cuando: dmy(nextPatente(today)), nota: "Se paga por semestre, en enero y julio; los plazos exactos los fija cada municipio." });
    if (tipo?.deber) obligaciones.push({ que: tipo.deber[0].toUpperCase() + tipo.deber.slice(1), cuando: tipo.nombre.startsWith("sociedad anónima") ? "enero a abril" : "permanente" });
  }

  const porComprobar = [
    "Declaraciones de IVA y renta presentadas (Carpeta Tributaria Electrónica, gratuita en sii.cl).",
    "Observaciones del SII y deudas en Tesorería.",
    ...(workers > 0 ? ["Cotizaciones previsionales al día (certificado de Previred o de la Dirección del Trabajo)."] : []),
    "Patente municipal y permisos del rubro.",
  ];

  return { nivel, veredicto, conclusiones: conclusiones.slice(0, 4), obligaciones, servicios: servicios.slice(0, 3), porComprobar, completo: !p.carga_parcial };
}

// ───────────────────────────── Persona natural con giro ─────────────────────────────
// Se responde en el navegador del visitante: nada de esto se envía ni se guarda.
export type NaturalAnswers = {
  venta: "honorarios" | "facturas" | "ambas" | "sin_inicio";
  trabajadores: "no" | "si";
  contador: "nadie" | "contador" | "no_se";
  lugar: "local" | "casa" | "online";
};

export function buildNaturalReport(a: NaturalAnswers, catalog: Catalog, today = new Date()): InitialReport {
  const conclusiones: string[] = [];
  const servicios: ServiceOffer[] = [];
  const obligaciones: Obligation[] = [];
  const iva = a.venta === "facturas" || a.venta === "ambas";
  const hon = a.venta === "honorarios" || a.venta === "ambas";
  let nivel: InitialReport["nivel"] = "atencion";
  let veredicto: string;

  if (a.venta === "sin_inicio") {
    veredicto = "Antes de vender necesitas iniciar actividades en el SII y elegir cómo operar: a tu nombre o con una empresa.";
    conclusiones.push("Vender sin inicio de actividades impide emitir boletas o facturas y puede generar multas. El inicio de actividades es gratuito y se hace en línea.");
    conclusiones.push("Si tu negocio tendrá socios, deudas o crecimiento, una EIRL o una SpA separa tu patrimonio personal del de la empresa; a tu nombre, respondes con tus bienes.");
    pushUnique(servicios, offer(catalog, "inicio", "FOR-01", "Inicio de actividades", "formalizacion", "Iniciar actividades con el giro y el régimen correctos."));
    pushUnique(servicios, offer(catalog, "constituir", "CRE-01", "Constitución de empresa", "constitucion", "Si te conviene, crear tu EIRL o SpA desde el inicio."));
  } else {
    veredicto = iva
      ? "Operas como empresario individual: tu negocio y tu patrimonio personal son uno solo ante el SII."
      : "Trabajas de forma independiente con boletas de honorarios.";
    if (iva) {
      conclusiones.push("Cada mes declaras el IVA de tus ventas en el F29, aunque no hayas vendido nada, y en abril tu renta (F22) suma lo del negocio a tus ingresos personales.");
      conclusiones.push("Respondes con tus bienes personales por las deudas del negocio. Si estás creciendo, una EIRL o una SpA separa ambos patrimonios y puede cambiar cómo tributas: vale la pena evaluarlo.");
    }
    if (hon) {
      conclusiones.push(`Tus boletas de honorarios tienen una retención de 15,25% en 2026. En abril el F22 cruza esa retención con tu impuesto y tus cotizaciones previsionales: puede resultar devolución o diferencia por pagar.`);
    }
    if (a.contador !== "contador") {
      nivel = "atencion";
      conclusiones.push(a.contador === "nadie"
        ? "Llevas tus impuestos tú mismo: los errores más comunes son F29 sin presentar en meses sin ventas y gastos que no se pueden rebajar."
        : "No tienes claro quién lleva tus impuestos: conviene confirmar que tus declaraciones estén presentadas.");
    } else nivel = "sin_alertas";

    if (iva) pushUnique(servicios, offer(catalog, "contabilidad", "CON-01", "Contabilidad mensual pyme", "contabilidad", "Tu F29, libros y control mensual al día."));
    if (a.trabajadores === "si") pushUnique(servicios, offer(catalog, "remuneraciones", "CON-04", "Remuneraciones", "contabilidad", "Liquidaciones y cotizaciones de tus trabajadores."));
    if (hon && !iva) pushUnique(servicios, offer(catalog, "renta", "CON-05", "Declaración anual de renta", "contabilidad", "Tu F22 de abril con las retenciones bien aplicadas."));
    if (iva) pushUnique(servicios, offer(catalog, "constituir", "CRE-01", "Constitución de empresa", "constitucion", "Evaluar y crear tu EIRL o SpA para separar tu patrimonio."));
    pushUnique(servicios, offer(catalog, "renta", "CON-05", "Declaración anual de renta", "contabilidad", "Tu F22 de abril revisado por un profesional."));
  }
  if (a.lugar === "local") pushUnique(servicios, offer(catalog, "patente", "FOR-02", "Patente municipal", "formalizacion", "La patente y los permisos de tu local."));
  if (a.trabajadores === "si") conclusiones.push("Con trabajadores aplican contratos, liquidaciones, cotizaciones (día 13 si se pagan en línea) y el Libro de Remuneraciones Electrónico.");

  if (a.venta !== "sin_inicio") {
    if (iva) obligaciones.push({ que: "IVA mensual (F29)", cuando: dm(nextMonthly(20, today)), nota: "Día 20 si declaras en línea y emites documentos electrónicos; si no, día 12. Aun sin ventas." });
    if (a.trabajadores === "si") obligaciones.push({ que: "Cotizaciones de tus trabajadores", cuando: dm(nextMonthly(13, today)), nota: "Día 13 si se pagan en línea; día 10 si no." });
    obligaciones.push({ que: "Renta anual (F22)", cuando: dmy(nextYearly(3, 30, today)) });
    if (a.lugar !== "online" || iva) obligaciones.push({ que: "Patente municipal", cuando: dmy(nextPatente(today)), nota: a.lugar === "local" ? "Semestral (enero y julio); los plazos los fija cada municipio." : "En general la exige el municipio de tu domicilio comercial, aunque sea tu casa; hay excepciones, como la microempresa familiar." });
  }

  return {
    nivel, veredicto, conclusiones: conclusiones.slice(0, 4), obligaciones, servicios: servicios.slice(0, 3),
    porComprobar: [
      "Tus declaraciones presentadas y si tienes observaciones: aparecen en tu Carpeta Tributaria Electrónica (gratuita en sii.cl).",
      "Deudas en Tesorería, si las hubiera.",
    ],
    completo: true,
  };
}
