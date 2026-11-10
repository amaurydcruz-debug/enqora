import { AGENTES, agentePorSeccion, type Agente } from "@/lib/cora/agentes";
import { fuente, FUENTES } from "@/lib/cora/fuentes";
import { necesidadesDe, type Necesidad } from "@/lib/cora/necesidades";
import { filaLegible, PORTAL_NOMBRE, type HallazgoWeb } from "@/lib/cora/web/hallazgos";
import { evaluarObligaciones, type ObligacionEvaluada } from "@/lib/cora/normativa-laboral";
import { construirPropuesta, type Propuesta } from "@/lib/cora/soluciones";
import { SECCIONES, type Estado, type SectionKey } from "@/lib/cora/secciones";
import { build360, QUESTIONS, type Answer, type Question } from "@/lib/diagnostic-360";
import { buildInitialReport, companyType, offer, type Catalog, type PublicProfileForReport, type ServiceOffer } from "@/lib/initial-report";
import { salesTrancheLabel } from "@/lib/public-data";

// CORA · Director General de Inteligencia (Etapa 1).
// 1) Activa a los investigadores sobre los datos públicos ya cargados (SII) y la normativa verificada.
// 2) Suma lo que declaró el empresario en la autoevaluación (solo lo que no se puede comprobar en fuentes).
// 3) Transversales: verificador (todo hallazgo cita una fuente del catálogo), auditor (duplicados y
//    contradicciones), riesgos, oportunidades y planificador (3 prioridades con servicio real).
// Se ejecuta en el navegador del visitante con datos públicos: nada se guarda (la memoria es la Etapa 3).

export type Hallazgo = {
  id: string;
  seccion: SectionKey;
  agente: string;
  estado: Estado;
  prioridad: "alta" | "media" | "baja";
  encontro: string; // ¿Qué encontró CORA?
  importa: string; // ¿Por qué es importante?
  consecuencias?: string; // ¿Qué consecuencias podría tener? (solo con fundamento)
  hacer: string; // ¿Qué debería hacer el empresario?
  siNoSeAtiende?: string; // ¿Qué pasaría si no se atiende? (solo con fundamento)
  servicio: ServiceOffer | null; // ¿Qué servicio de ENQORA puede ayudar?
  fuente: string; // nombre de la fuente
  fecha: string; // fecha del dato o de la consulta
  profesional?: boolean; // conclusión de alto impacto: requiere revisión profesional antes de actuar
};

export type Seccion = {
  key: SectionKey;
  nombre: string;
  agente: Agente | undefined;
  estado: Estado;
  nivel: "solido" | "atencion" | "prioritario" | "sin_info";
  conInformacion: boolean;
  verificadaEnFuente: boolean;
  investigado: string[];
  encontrado: string[];
  falta: string[];
  fuentes: { nombre: string; url: string; fecha: string }[];
  proxima: string;
  obligaciones?: ObligacionEvaluada[];
};

export type Expediente = {
  generado: string;
  empresa: { razon: string; rut: string };
  completitud: { pct: number; conInformacion: number; verificadas: number; total: number };
  secciones: Seccion[];
  hallazgos: Hallazgo[];
  prioridades: (ServiceOffer & { razon: string })[];
  otras: ServiceOffer[];
  contradicciones: string[];
  preguntas: Question[]; // lo que CORA no puede comprobar en fuentes
  respondidas: number;
  bitacora: { agente: string; resultado: string }[];
  beneficios: ReturnType<typeof build360>["beneficios"];
  necesidades: Necesidad[]; // Motor de Necesidades
  propuesta: Propuesta; // Motor de Soluciones
  obligacionesTributarias: ReturnType<typeof buildInitialReport>["obligaciones"];
};

// La pregunta de fondos no se hace: las oportunidades las investiga CORA (agente 15).
const PREGUNTAS_CORA = QUESTIONS.filter((q) => q.id !== "fondos");
const SECCION_DE_PREGUNTA: Record<string, SectionKey> = {
  declaraciones: "tributacion", cuentas: "finanzas", caja: "finanzas", clientes: "clientes", digital: "marketing",
  inventario: "gestion", marca: "marca", patente: "permisos", contratos: "laboral", respaldos: "tecnologia", sistema: "tecnologia",
};
const PESO: Record<SectionKey, number> = Object.fromEntries(SECCIONES.map((s, i) => [s.key, i])) as Record<SectionKey, number>;

const fmt = (d?: string | null) =>
  d ? new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d.slice(0, 10)}T12:00:00Z`)) : "";
// Constitución según el Registro de Empresas (filas: fecha, actuación, tipo, capital, comuna): fecha, antigüedad y
// capital inicial, tal como figuran en la fuente. Nada se deduce más allá de lo publicado.
function constitucion(w: HallazgoWeb, today: Date): string | null {
  const fila = (w.tabla?.rows ?? []).find((r) => /CONSTITU/i.test(r[1] ?? "") && /^\d{4}-\d{2}-\d{2}/.test(r[0] ?? ""));
  if (!fila) return null;
  const meses = (today.getUTCFullYear() - Number(fila[0].slice(0, 4))) * 12 + (today.getUTCMonth() + 1 - Number(fila[0].slice(5, 7)));
  const antig = meses < 1 ? "este mes" : meses < 12 ? `hace ${meses} ${meses === 1 ? "mes" : "meses"}` : `hace ${Math.floor(meses / 12)} ${Math.floor(meses / 12) === 1 ? "año" : "años"}`;
  return `Constituida el ${fmt(fila[0])} (${antig})${fila[2] ? ` como ${fila[2]}` : ""}${fila[3] ? `, con capital inicial de ${fila[3]}` : ""}${fila[4] ? `, en ${fila[4]}` : ""}. Fuente: Registro de Empresas y Sociedades.`;
}
const label = (a?: Answer) => (a === "si" ? "Sí" : a === "no" ? "No" : a === "ayuda" ? "Necesito ayuda" : a === "no_se" ? "No sé" : a === "na" ? "No aplica" : "Sin responder");

export function preguntasCora(p: PublicProfileForReport): Question[] {
  const w = p.perfil?.trabajadores ?? 0;
  return PREGUNTAS_CORA.map((q) => (q.id === "contratos" && w > 0 ? { ...q, noAplica: undefined } : q));
}

export function investigar(p: PublicProfileForReport, catalog: Catalog, answers: Record<string, Answer> = {}, today = new Date(), web: HallazgoWeb[] = []): Expediente {
  const hoy = today.toISOString().slice(0, 10);
  const svc = (id: string, code: string | null, nombre: string, cat: string, porque: string) => offer(catalog, id, code, nombre, cat, porque);
  const siiPub = (p.fuentes ?? []).map((f) => ({ nombre: f.nombre, url: f.url, fecha: `publicada el ${fmt(f.publicada)}` }));
  const siiFecha = p.fuentes?.[0]?.publicada ? `publicada el ${fmt(p.fuentes[0].publicada)}` : `consultada el ${fmt(hoy)}`;
  const hallazgos: Hallazgo[] = [];
  const bitacora: Expediente["bitacora"] = [];
  const contradicciones: string[] = [];
  const cerrada = !!p.termino_giro;
  const workers = p.perfil?.trabajadores ?? null;
  const anio = p.perfil?.anio_comercial ?? null;
  const tipo = companyType(p.razon_social);
  const base = buildInitialReport(p, catalog, today);
  const r360 = build360(p, answers, catalog, today);
  const qs = preguntasCora(p);

  const sec = Object.fromEntries(SECCIONES.map(({ key, nombre }) => [key, {
    key, nombre, agente: agentePorSeccion(key), estado: "fuente_no_disponible" as Estado, nivel: "sin_info" as Seccion["nivel"],
    conInformacion: false, verificadaEnFuente: false, investigado: [] as string[], encontrado: [] as string[], falta: [] as string[],
    fuentes: [] as Seccion["fuentes"], proxima: "",
  } satisfies Seccion])) as Record<SectionKey, Seccion>;
  const fuenteCat = (k: SectionKey, id: string) => {
    const f = fuente(id);
    if (f && !sec[k].fuentes.some((x) => x.nombre === `${f.organismo} · ${f.nombre}`)) {
      sec[k].fuentes.push({ nombre: `${f.organismo} · ${f.nombre}`, url: f.url, fecha: f.verificada ? `verificada el ${fmt(f.verificada)}` : "por verificar" });
    }
  };

  // ── Agente 01 · Identidad (SII) ──
  sec.identidad.investigado.push("Nóminas de personas jurídicas del SII");
  sec.identidad.fuentes.push(...siiPub);
  sec.identidad.encontrado.push(`Razón social: ${p.razon_social ?? "—"}`);
  if (p.inicio_actividades) sec.identidad.encontrado.push(`Inicio de actividades: ${fmt(p.inicio_actividades)}`);
  sec.identidad.encontrado.push(cerrada ? `Término de giro: ${fmt(p.termino_giro)}` : "Sin término de giro informado");
  if (p.total_actividades) sec.identidad.encontrado.push(`${p.total_actividades} actividad(es) económica(s) vigente(s)`);
  if (p.perfil?.region) sec.identidad.encontrado.push(`Región: ${p.perfil.region}`);
  sec.identidad.estado = p.carga_parcial ? "parcial" : "confirmado";
  sec.identidad.conInformacion = sec.identidad.verificadaEnFuente = true;
  sec.identidad.falta.push("Fecha de constitución, capital y modificaciones: Registro de Empresas y Sociedades (Etapa 2)");
  sec.identidad.proxima = "Sin acciones pendientes con los datos públicos.";
  bitacora.push({ agente: "01 · Identidad y sociedades", resultado: `Identidad confirmada en el SII${p.carga_parcial ? " (carga de nóminas en curso)" : ""}. Registro de Empresas: próxima etapa.` });

  // ── Agentes 01 y 03 · Constitución y legal ──
  sec.legal.investigado.push("Tipo de sociedad según la razón social", "Registro de Empresas y Sociedades", "Diario Oficial");
  fuenteCat("legal", "res_constituciones"); fuenteCat("legal", "diario_oficial");
  if (tipo) {
    sec.legal.encontrado.push(`Tipo de sociedad (indicio por la razón social): ${tipo.nombre}`);
    sec.legal.estado = "parcial"; sec.legal.conInformacion = true;
    if (tipo.deber && !cerrada) {
      hallazgos.push({
        id: "deber_societario", seccion: "legal", agente: "03 · Jurídico", estado: "requiere_documentacion", prioridad: "baja",
        encontro: `Por ser una ${tipo.nombre}, la empresa debe ${tipo.deber}.`,
        importa: "Es un deber societario permanente; su respaldo se pide en operaciones como créditos, ventas de acciones o fiscalizaciones.",
        hacer: "Revisar que el registro o las actas estén al día.", servicio: svc("societario", "GEN-01", "Consulta profesional", "profesionales", "Revisar estatutos y registros societarios."),
        fuente: "Razón social en la nómina del SII", fecha: siiFecha,
      });
    }
  } else {
    sec.legal.estado = "no_encontrado";
    sec.legal.encontrado.push("La razón social no permite deducir el tipo de sociedad.");
  }
  sec.legal.falta.push("Estatutos, poderes y representantes (documentos de la empresa)", "Constitución y capital (Registro de Empresas: Etapa 2)");
  sec.legal.proxima = "Subir los estatutos y poderes vigentes a la hoja de vida.";
  bitacora.push({ agente: "03 · Jurídico", resultado: tipo ? `Tipo de sociedad deducido: ${tipo.nombre}.` : "Tipo de sociedad no deducible de la razón social." });

  // ── Agente 02 · Tributario ──
  sec.tributacion.investigado.push("Señales públicas del SII", "Calendario tributario aplicable", "Carpeta Tributaria (reservada)");
  sec.tributacion.fuentes.push(...siiPub); fuenteCat("tributacion", "sii_cte"); fuenteCat("tributacion", "tgr");
  sec.tributacion.conInformacion = sec.tributacion.verificadaEnFuente = true;
  sec.tributacion.estado = "parcial";
  sec.tributacion.encontrado.push(base.veredicto);
  if (p.perfil?.tramo_ventas) sec.tributacion.encontrado.push(`Tamaño por ventas (${anio}): ${salesTrancheLabel(p.perfil.tramo_ventas)}`);
  for (const r of r360.hallazgos.filter((h) => h.certeza === "confirmado")) {
    hallazgos.push({
      id: r.id, seccion: "tributacion", agente: "02 · Tributario", estado: "confirmado", prioridad: r.prioridad,
      encontro: r.detectado, importa: r.importa, consecuencias: r.riesgo, hacer: r.recomienda, servicio: r.servicio,
      siNoSeAtiende: r.id === "termino_giro" ? "Operar o emitir documentos con término de giro mantiene la exposición a multas." : undefined,
      fuente: r.fuente, fecha: siiFecha, profesional: r.prioridad === "alta",
    });
  }
  sec.tributacion.falta.push("Declaraciones presentadas, régimen tributario y observaciones (Carpeta Tributaria)", "Deuda fiscal (certificado de la TGR)");
  sec.tributacion.proxima = "Generar la Carpeta Tributaria en sii.cl y subirla a la hoja de vida: un profesional la revisa gratis.";
  bitacora.push({ agente: "02 · Tributario", resultado: `${r360.hallazgos.filter((h) => h.certeza === "confirmado").length} señal(es) pública(s) del SII. Información reservada: requiere documentos.` });

  // ── Agentes 04, 05 y 06 · Laboral, previsión y seguridad (normativa verificada + indicador SII) ──
  const declaraSin = answers.contratos === "na";
  if (declaraSin && (workers ?? 0) > 0) contradicciones.push(`El SII informa ${workers} trabajador(es) en ${anio}, pero respondiste que no tienes trabajadores. Puede deberse a un cambio de dotación: confírmalo.`);
  const obligaciones = cerrada ? [] : evaluarObligaciones(workers, anio, declaraSin);
  for (const k of ["laboral", "prevision", "seguridad"] as const) {
    const s = sec[k];
    const obs = obligaciones.filter((o) => o.seccion === k);
    s.obligaciones = obs;
    s.investigado.push("Normativa oficial verificada (leyes, dictámenes y decretos)", "Trabajadores informados al SII (indicador orientativo)");
    fuenteCat(k, k === "seguridad" ? "suseso_ds44" : "dt_normativa");
    if (k === "prevision") { fuenteCat(k, "previred"); fuenteCat(k, "afc"); }
    if (k === "seguridad") fuenteCat(k, "mutualidad");
    if (k !== "seguridad") fuenteCat(k, "dt_f30");
    const potenciales = obs.filter((o) => o.aplicacion === "potencial");
    if (workers == null) {
      s.estado = "requiere_documentacion";
      s.encontrado.push("El SII no informa trabajadores para esta empresa: no es posible determinar qué obligaciones aplican.");
    } else if (workers === 0 || potenciales.length === 0) {
      s.estado = "parcial"; s.conInformacion = true;
      s.encontrado.push(`El SII no informa trabajadores en ${anio}: según ese indicador, estas obligaciones no aplicarían.`);
    } else {
      s.estado = "requiere_documentacion"; s.conInformacion = true;
      s.encontrado.push(`${potenciales.length} obligación(es) potencialmente aplicable(s) según ${workers} trabajador(es) informado(s) al SII en ${anio}.`);
    }
    s.falta.push("Dotación actual y documentos que acreditan el cumplimiento (contratos, certificados de cotizaciones, F30, adhesión a la mutualidad).");
    s.proxima = potenciales.length ? "Reunir los documentos indicados en cada obligación y revisarlos con un profesional." : "Confirmar la dotación actual de trabajadores.";
  }
  if (!cerrada && workers != null && workers > 0) {
    const ans = answers.contratos;
    const problema = ans === "no" || ans === "ayuda";
    hallazgos.push({
      id: "laboral_potencial", seccion: "laboral", agente: "04 · Laboral", estado: problema ? "declarado" : "requiere_documentacion",
      prioridad: problema ? "alta" : "media",
      encontro: problema
        ? `Con ${workers} trabajador(es) informados al SII, declaras que hay contratos o cotizaciones pendientes o que necesitas ayuda.`
        : `Con ${workers} trabajador(es) informados al SII aplican potencialmente obligaciones laborales, previsionales y de seguridad: su cumplimiento no es público.`,
      importa: "Contratos, cotizaciones, seguro de accidentes, protocolo Ley Karin y organización preventiva (DS 44) son exigibles según la dotación.",
      consecuencias: problema ? "Las cotizaciones impagas generan multas, intereses y responsabilidad del empleador." : undefined,
      hacer: "Confirmar la dotación actual y reunir contratos, certificados de cotizaciones (o F30) y el certificado de la mutualidad.",
      siNoSeAtiende: problema ? "Las deudas previsionales se reajustan y devengan intereses; una fiscalización puede derivar en multas por cada trabajador." : undefined,
      servicio: svc("remuneraciones", "CON-04", "Remuneraciones", "contabilidad", "Liquidaciones, cotizaciones y LRE al día."),
      fuente: "Nómina de empresas del SII + normativa laboral verificada", fecha: siiFecha, profesional: problema,
    });
    hallazgos.push({
      id: "seguridad_potencial", seccion: "seguridad", agente: "06 · Salud y seguridad", estado: "requiere_documentacion", prioridad: "media",
      encontro: `Según el DS 44, una empresa con ${workers} trabajador(es) debe contar con encargado de prevención, matriz de riesgos y programa preventivo${workers > 25 ? ", y comité paritario" : workers >= 10 ? ", y delegado de seguridad (si no hay comité paritario)" : ""}.`,
      importa: "El DS 44 rige desde el 1 de febrero de 2025 y reemplazó a los DS 40 y 54, con nuevas exigencias de gestión preventiva.",
      hacer: "Revisar con la mutualidad o el ISL la matriz de riesgos y la organización preventiva exigible.",
      servicio: svc("seguridad", "LEG-02", "Cumplimiento laboral y prevención", "profesionales", "Implementar el DS 44 y el protocolo Ley Karin."),
      fuente: "Decreto 44 (ISL) + trabajadores informados al SII", fecha: `verificada el ${fmt("2026-11-02")}`,
    });
  }
  bitacora.push({ agente: "04 · Laboral / 05 · Previsional / 06 · Salud y seguridad", resultado: workers == null ? "Sin indicador de trabajadores: requiere documentación." : `${obligaciones.filter((o) => o.aplicacion === "potencial").length} obligación(es) potencialmente aplicable(s) con fundamento legal. Cumplimiento: requiere documentos o autorización.` });

  // ── Agentes 07, 08, 10, 11, 14, 16 · Áreas sin fuente pública: lo que declara el empresario ──
  const conPreguntas: SectionKey[] = ["finanzas", "clientes", "gestion", "marca", "permisos", "marketing", "tecnologia"];
  const fuentesArea: Partial<Record<SectionKey, string[]>> = {
    finanzas: ["sii_cte"], marca: ["inapi"], permisos: ["municipalidades", "seremi_salud", "sma_sea"], marketing: ["web_publica"], tecnologia: ["web_publica"],
  };
  for (const k of conPreguntas) {
    const s = sec[k];
    for (const id of fuentesArea[k] ?? []) fuenteCat(k, id);
    s.investigado.push(k === "marca" ? "INAPI: sin API; la búsqueda es manual" : k === "permisos" ? "Patente y permisos: dependen de cada municipio y organismo" : "Sin fuente pública para esta área");
    s.estado = k === "marca" || k === "permisos" ? "requiere_documentacion" : "fuente_no_disponible";
    s.falta.push(
      k === "finanzas" ? "Balance, estado de resultados y flujo de caja (documentos de la empresa)"
        : k === "marca" ? "Búsqueda de la marca en INAPI (buscadormarcas.inapi.cl)"
          : k === "permisos" ? "Patente municipal vigente y autorizaciones del rubro"
            : "Información de la empresa (autoevaluación o documentos)",
    );
    s.proxima = k === "marca" ? "Buscar la marca en INAPI antes de invertir en ella." : k === "permisos" ? "Confirmar la patente y los permisos con el municipio." : "Responder la autoevaluación de CORA.";
  }
  if (sec.marca.fuentes.length === 0) fuenteCat("marca", "inapi");
  for (const q of qs) {
    const k = SECCION_DE_PREGUNTA[q.id];
    const a = answers[q.id];
    if (!k || !a) continue;
    sec[k].conInformacion = true;
    sec[k].encontrado.push(`${q.q} → ${label(a)} (declarado)`);
    if (sec[k].estado === "fuente_no_disponible") sec[k].estado = "declarado";
  }
  for (const r of r360.hallazgos.filter((h) => h.certeza === "declarado" && h.id !== "fondos" && !(h.id === "contratos" && (workers ?? 0) > 0))) {
    const k = SECCION_DE_PREGUNTA[r.id];
    if (!k) continue;
    hallazgos.push({
      id: r.id, seccion: k, agente: agentePorSeccion(k) ? `${agentePorSeccion(k)!.numero} · ${agentePorSeccion(k)!.nombre}` : "CORA",
      estado: "declarado", prioridad: r.prioridad, encontro: r.detectado, importa: r.importa, consecuencias: r.riesgo,
      hacer: r.recomienda, servicio: r.servicio, fuente: "Autoevaluación del empresario", fecha: `respondida el ${fmt(hoy)}`,
      profesional: r.prioridad === "alta",
    });
  }
  // ── Agente 10 · Propiedad intelectual: resultado del bot en INAPI (si existe) ──
  const inapi = web.find((w) => w.portal === "inapi");
  const fechaWeb = (w: HallazgoWeb) => {
    const f = new Intl.DateTimeFormat("es-CL", { dateStyle: "long", timeZone: "America/Santiago" }).format(new Date(w.consultado));
    return w.version === "datos-abiertos" ? `datos abiertos cargados el ${f}` : w.version.startsWith("api") ? `consultado el ${f}`
      : w.version === "asistida-humana" ? `búsqueda asistida por el equipo ENQORA el ${f}` : `consultado por el bot CORA el ${f}`;
  };
  if (inapi && (inapi.estado === "encontrado" || inapi.estado === "sin_resultados")) {
    const m = sec.marca;
    m.investigado = m.investigado.filter((x) => !x.startsWith("INAPI: sin API"));
    m.investigado.unshift(`${inapi.version === "asistida-humana" ? "Búsqueda asistida" : "Búsqueda"} en INAPI por titular «${p.razon_social}»`);
    m.fuentes.unshift({ nombre: PORTAL_NOMBRE.inapi, url: inapi.url, fecha: fechaWeb(inapi) });
    m.conInformacion = m.verificadaEnFuente = true;
    m.falta = m.falta.filter((f) => !f.startsWith("Búsqueda de la marca"));
    if (inapi.estado === "encontrado") {
      m.estado = "confirmado";
      const filas = (inapi.tabla?.rows ?? []).slice(0, 5).map((r) => filaLegible(inapi.tabla?.headers ?? [], r));
      m.encontrado.push(`${inapi.coincidencias ?? filas.length} registro(s) en INAPI con titular «${p.razon_social}»`, ...filas);
      m.proxima = "Revisar la vigencia y las clases protegidas de cada marca (renovación cada 10 años).";
      hallazgos.push({
        id: "marca_registrada", seccion: "marca", agente: "10 · Propiedad intelectual", estado: "confirmado", prioridad: "baja",
        encontro: `INAPI registra ${inapi.coincidencias ?? filas.length} marca(s) o solicitud(es) con titular «${p.razon_social}».`,
        importa: "La marca es un activo: su vigencia, clases y renovación determinan si el nombre queda protegido donde vendes.",
        hacer: "Revisar el estado, la vigencia y si las clases cubren todo lo que vendes hoy.",
        servicio: svc("marca", "BRA-01", "Registro de marca ante INAPI", "marcas", "Revisar clases, vigencia y nuevas solicitudes."),
        fuente: PORTAL_NOMBRE.inapi, fecha: fechaWeb(inapi),
      });
    } else {
      m.estado = "no_encontrado";
      m.encontrado.push(`Sin marcas localizadas en INAPI con titular exactamente «${p.razon_social}» (puede estar a nombre de otra persona o con otro nombre).`);
      m.proxima = "Confirmar a nombre de quién está la marca y, si no está registrada, evaluar su registro.";
      if (!cerrada) hallazgos.push({
        id: "marca_sin_registro", seccion: "marca", agente: "10 · Propiedad intelectual", estado: "no_encontrado", prioridad: "media",
        encontro: `No localizamos marcas en INAPI con titular «${p.razon_social}».`,
        importa: "La razón social en el SII no protege el nombre comercial: si la marca no está registrada a nombre de la empresa, un tercero podría inscribirla.",
        hacer: "Confirmar si la marca está a nombre de otra persona o con otra denominación y, si no existe, solicitar su registro.",
        servicio: svc("marca", "BRA-01", "Registro de marca ante INAPI", "marcas", "Búsqueda y solicitud de marca."),
        fuente: PORTAL_NOMBRE.inapi, fecha: fechaWeb(inapi),
      });
    }
    bitacora.push({ agente: "10 · Propiedad intelectual (bot)", resultado: inapi.detalle ?? inapi.estado });
  } else if (!answers.marca && !cerrada) {
    hallazgos.push({
      id: "marca_pendiente", seccion: "marca", agente: "10 · Propiedad intelectual", estado: "requiere_documentacion", prioridad: "baja",
      encontro: inapi ? `El bot CORA no pudo completar la búsqueda en INAPI (${inapi.estado === "bloqueado" ? "el portal pidió una verificación" : "el procedimiento debe revalidarse"}).` : "La búsqueda en INAPI para esta empresa aún no se ha realizado.",
      importa: "La razón social en el SII no protege la marca comercial.",
      hacer: "Buscar la marca en INAPI o pedir una búsqueda profesional antes de invertir en ella.",
      servicio: svc("marca", "BRA-01", "Registro de marca ante INAPI", "marcas", "Búsqueda y solicitud de marca."),
      fuente: "INAPI · Buscador de marcas", fecha: `verificada el ${fmt("2026-11-02")}`,
    });
  }

  // ── Agentes 01 y 03 · Registro de Empresas (datos abiertos o bot) y Diario Oficial ──
  for (const w of web.filter((x) => x.portal === "res" || x.portal === "diario_oficial")) {
    const via = w.version === "datos-abiertos" ? "datos abiertos" : "bot";
    if (w.estado !== "encontrado" && w.estado !== "sin_resultados") { bitacora.push({ agente: `01 · ${PORTAL_NOMBRE[w.portal] ?? w.portal} (${via})`, resultado: w.detalle ?? w.estado }); continue; }
    const l = sec.legal;
    l.investigado.unshift(`${w.version === "datos-abiertos" ? "Datos abiertos de" : "Búsqueda en"} ${PORTAL_NOMBRE[w.portal] ?? w.portal}`);
    l.fuentes.unshift({ nombre: PORTAL_NOMBRE[w.portal] ?? w.portal, url: w.url, fecha: fechaWeb(w) });
    l.conInformacion = l.verificadaEnFuente = true;
    if (w.estado === "encontrado") {
      l.estado = "confirmado";
      l.encontrado.push(`${PORTAL_NOMBRE[w.portal]}: ${w.detalle ?? "resultados localizados"}`, ...(w.tabla?.rows ?? []).slice(0, 5).map((r) => filaLegible(w.tabla?.headers ?? [], r)));
      const c = w.portal === "res" ? constitucion(w, today) : null;
      if (c) {
        l.encontrado.unshift(c);
        // El dato ya se obtuvo de la fuente oficial: deja de figurar como pendiente.
        l.falta = l.falta.filter((f) => !f.startsWith("Constitución y capital"));
      }
    } else {
      l.encontrado.push(`${PORTAL_NOMBRE[w.portal]}: sin resultados localizados (${w.portal === "res" ? "puede haberse constituido por notaría" : "sin publicaciones localizadas"}).`);
    }
    bitacora.push({ agente: `01 · ${PORTAL_NOMBRE[w.portal] ?? w.portal} (${via})`, resultado: w.detalle ?? w.estado });
  }

  // ── Agente 09 · Mercado público / 13 · Comercio exterior (próxima etapa) ──
  const mp = web.find((w) => w.portal === "mercado_publico");
  if (mp && (mp.estado === "encontrado" || mp.estado === "sin_resultados")) {
    const s9 = sec.mercado_publico;
    s9.investigado.push("API oficial de Mercado Público (ChileCompra): proveedor por RUT");
    s9.fuentes.push({ nombre: "ChileCompra · API de Mercado Público", url: mp.url, fecha: `consultada el ${fmt(mp.consultado)}` });
    s9.conInformacion = s9.verificadaEnFuente = true;
    s9.estado = mp.estado === "encontrado" ? "confirmado" : "no_encontrado";
    s9.encontrado.push(mp.detalle ?? "", ...(mp.tabla?.rows ?? []).map((r) => filaLegible(mp.tabla?.headers ?? [], r)));
    s9.falta.push("Licitaciones y órdenes de compra recientes (se agregan en la siguiente versión del conector)");
    s9.proxima = mp.estado === "encontrado" ? "Revisar las licitaciones abiertas de su rubro y su desempeño como proveedor." : "Evaluar si sus productos o servicios calzan con lo que compra el Estado.";
    if (!cerrada) hallazgos.push(mp.estado === "encontrado" ? {
      id: "proveedor_estado", seccion: "mercado_publico", agente: "09 · Mercado público", estado: "confirmado", prioridad: "baja",
      encontro: "La empresa está registrada como proveedora del Estado en Mercado Público.",
      importa: "Ya tiene la puerta de entrada a las compras públicas: el valor está en postular de forma constante y con ofertas bien preparadas.",
      hacer: "Revisar licitaciones y Compra Ágil de su rubro y preparar ofertas con su documentación al día.",
      servicio: svc("compras_publicas", "CRC-02", "Inteligencia de compras públicas", "crecimiento", "Preparar ofertas para compras públicas."),
      fuente: "ChileCompra · API de Mercado Público", fecha: `consultada el ${fmt(mp.consultado)}`,
    } : {
      id: "sin_proveedor", seccion: "mercado_publico", agente: "09 · Mercado público", estado: "no_encontrado", prioridad: "baja",
      encontro: "No localizamos a la empresa como proveedora en Mercado Público.",
      importa: "Vender al Estado solo conviene si lo que ofrece calza con lo que compran los organismos públicos; la inscripción en Mercado Público es gratuita en ChileCompra.",
      hacer: "Revisar con órdenes de compra reales si su rubro calza con lo que compra el Estado antes de inscribirse.",
      servicio: svc("compras_publicas", "CRC-02", "Inteligencia de compras públicas", "crecimiento", "Evaluar y preparar el ingreso a Mercado Público."),
      fuente: "ChileCompra · API de Mercado Público", fecha: `consultada el ${fmt(mp.consultado)}`,
    });
  } else {
    fuenteCat("mercado_publico", "mercado_publico_api");
    sec.mercado_publico.investigado.push("API de Mercado Público (verificada; requiere ticket)");
    sec.mercado_publico.falta.push("Registro como proveedor, licitaciones y órdenes de compra");
    sec.mercado_publico.proxima = "Se activa al configurar el ticket de la API oficial de ChileCompra.";
  }
  fuenteCat("comercio_exterior", "aduanas");
  sec.comercio_exterior.investigado.push("Servicio Nacional de Aduanas (fuente por investigar)");
  sec.comercio_exterior.falta.push("Operaciones de importación o exportación: no son de libre consulta");
  sec.comercio_exterior.proxima = "Si la empresa importa o exporta, indícalo al crear tu cuenta.";
  bitacora.push({ agente: "09 · Mercado público", resultado: mp ? (mp.detalle ?? mp.estado) : "Fuente verificada; falta el ticket de la API oficial." });
  bitacora.push({ agente: "13 · Comercio exterior", resultado: "Fuente por investigar: sin resultados." });

  // ── Agente 15 · Crecimiento (beneficios M16 con criterios verificables) ──
  fuenteCat("crecimiento", "beneficios_m16");
  sec.crecimiento.investigado.push("Catálogo de beneficios ENQORA (fuentes oficiales)");
  if (r360.beneficios.length) {
    sec.crecimiento.estado = "parcial"; sec.crecimiento.conInformacion = sec.crecimiento.verificadaEnFuente = true;
    for (const b of r360.beneficios) sec.crecimiento.encontrado.push(`${b.nombre}: ${b.porque}`);
    sec.crecimiento.falta.push(...r360.beneficios.map((b) => `${b.nombre}: ${b.falta}`));
    hallazgos.push({
      id: "oportunidades", seccion: "crecimiento", agente: "15 · Crecimiento", estado: "parcial", prioridad: "baja",
      encontro: `${r360.beneficios.length} programa(s) público(s) podrían aplicar según los datos públicos de la empresa: ${r360.beneficios.map((b) => b.nombre).join(", ")}.`,
      importa: "Son apoyos no reembolsables, beneficios tributarios u oportunidades de venta al Estado.",
      hacer: "Confirmar requisitos y convocatorias vigentes antes de postular.",
      servicio: svc("beneficios", "CRC-01", "Postulación a beneficios y fondos", "crecimiento", "Revisar las convocatorias que calzan con tu empresa."),
      fuente: "Catálogo de beneficios ENQORA (M16)", fecha: `verificado el ${fmt(r360.beneficios[0].verificado)}`,
    });
  } else {
    sec.crecimiento.estado = "no_encontrado";
    sec.crecimiento.encontrado.push("No encontramos programas con criterios verificables para esta empresa en el catálogo actual.");
  }
  sec.crecimiento.proxima = "Revisar convocatorias vigentes con un profesional.";
  bitacora.push({ agente: "15 · Crecimiento", resultado: `${r360.beneficios.length} oportunidad(es) con criterios verificables.` });

  // ── Transversal · Verificador: todo hallazgo debe tener fuente y fecha ──
  const verificados = hallazgos.filter((h) => h.fuente && h.fecha);
  // ── Transversal · Auditor: duplicados ──
  const unicos = verificados.filter((h, i) => verificados.findIndex((x) => x.id === h.id) === i);
  // ── Transversal · Riesgos: orden por prioridad y sección ──
  const order = { alta: 0, media: 1, baja: 2 };
  unicos.sort((a, b) => order[a.prioridad] - order[b.prioridad] || PESO[a.seccion] - PESO[b.seccion]);

  // Nivel por sección
  for (const s of Object.values(sec)) {
    const hs = unicos.filter((h) => h.seccion === s.key);
    s.nivel = hs.some((h) => h.prioridad === "alta") ? "prioritario"
      : hs.some((h) => h.prioridad === "media") ? "atencion"
        : s.conInformacion && !hs.length && s.estado !== "requiere_documentacion" ? "solido"
          : s.conInformacion ? "atencion" : "sin_info";
    if (s.key === "crecimiento" && s.nivel === "atencion" && !hs.some((h) => h.prioridad !== "baja")) s.nivel = "solido";
    if (!s.proxima) s.proxima = "—";
  }

  // ── Transversal · Planificador: 3 prioridades con servicio, sin repetir ──
  const prioridades: Expediente["prioridades"] = [];
  const otras: ServiceOffer[] = [];
  for (const h of unicos) {
    if (!h.servicio) continue;
    const dup = (x: ServiceOffer) => x.id === h.servicio!.id || (x.codigo && x.codigo === h.servicio!.codigo);
    if (prioridades.some(dup) || otras.some(dup)) continue;
    if (prioridades.length < 3) prioridades.push({ ...h.servicio, razon: h.encontro });
    else otras.push(h.servicio);
  }

  // ── Motor de Necesidades: cada hallazgo con conocimiento verificado se vuelve una necesidad priorizada ──
  const necesidades = necesidadesDe(unicos);

  const secciones = SECCIONES.map(({ key }) => sec[key]);
  const conInformacion = secciones.filter((s) => s.conInformacion).length;
  const verificadas = secciones.filter((s) => s.verificadaEnFuente).length;

  return {
    generado: today.toISOString(),
    empresa: { razon: p.razon_social ?? "—", rut: p.rut ?? "" },
    completitud: { pct: Math.round((conInformacion / secciones.length) * 100), conInformacion, verificadas, total: secciones.length },
    secciones, hallazgos: unicos, prioridades, otras, contradicciones,
    preguntas: qs, respondidas: qs.filter((q) => answers[q.id]).length,
    bitacora, beneficios: r360.beneficios, necesidades, propuesta: construirPropuesta(necesidades), obligacionesTributarias: cerrada ? [] : base.obligaciones,
  };
}

export const resumenCatalogo = () => ({
  fuentes: FUENTES.length,
  conectadas: FUENTES.filter((f) => ["conectada", "normativa", "curada"].includes(f.estado)).length,
  agentes: AGENTES.length,
  activos: AGENTES.filter((a) => a.estado !== "proxima_etapa").length,
});
