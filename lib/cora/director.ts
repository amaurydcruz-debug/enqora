import { AGENTES, agentePorSeccion, type Agente } from "@/lib/cora/agentes";
import { fuente, FUENTES } from "@/lib/cora/fuentes";
import { necesidadesDe, type Necesidad } from "@/lib/cora/necesidades";
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
const label = (a?: Answer) => (a === "si" ? "Sí" : a === "no" ? "No" : a === "ayuda" ? "Necesito ayuda" : a === "no_se" ? "No sé" : a === "na" ? "No aplica" : "Sin responder");

export function preguntasCora(p: PublicProfileForReport): Question[] {
  const w = p.perfil?.trabajadores ?? 0;
  return PREGUNTAS_CORA.map((q) => (q.id === "contratos" && w > 0 ? { ...q, noAplica: undefined } : q));
}

export function investigar(p: PublicProfileForReport, catalog: Catalog, answers: Record<string, Answer> = {}, today = new Date()): Expediente {
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
    if (tipo.deber) {
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
      importa: "El DS 44 rige desde el 1 de febrero de 2025 y reemplazó a los DS 40 y 54: muchas empresas aún no se adaptan.",
      hacer: "Revisar con la mutualidad o el ISL la matriz de riesgos y la organización preventiva exigible.",
      servicio: svc("seguridad", "SST-PROX", "ENQORA Seguridad Laboral", "profesionales", "Implementar el DS 44 y el protocolo Ley Karin."),
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
  if (!answers.marca) {
    hallazgos.push({
      id: "marca_pendiente", seccion: "marca", agente: "10 · Propiedad intelectual", estado: "requiere_documentacion", prioridad: "baja",
      encontro: "CORA no puede comprobar automáticamente si la marca está registrada: INAPI no ofrece una API.",
      importa: "La razón social en el SII no protege la marca comercial.",
      hacer: "Buscar la marca en INAPI o pedir una búsqueda profesional antes de invertir en ella.",
      servicio: svc("marca", "BRA-01", "Registro de marca ante INAPI", "marcas", "Búsqueda y solicitud de marca."),
      fuente: "INAPI · Buscador de marcas", fecha: `verificada el ${fmt("2026-11-02")}`,
    });
  }

  // ── Agente 09 · Mercado público / 13 · Comercio exterior (próxima etapa) ──
  fuenteCat("mercado_publico", "mercado_publico_api"); fuenteCat("mercado_publico", "chilecompra_datos");
  sec.mercado_publico.investigado.push("API de Mercado Público (verificada; requiere ticket)");
  sec.mercado_publico.falta.push("Registro como proveedor, licitaciones y órdenes de compra (Etapa 2)");
  sec.mercado_publico.proxima = "Se activa en la Etapa 2 con la API oficial de ChileCompra.";
  fuenteCat("comercio_exterior", "aduanas");
  sec.comercio_exterior.investigado.push("Servicio Nacional de Aduanas (fuente por investigar)");
  sec.comercio_exterior.falta.push("Operaciones de importación o exportación: no son de libre consulta");
  sec.comercio_exterior.proxima = "Si la empresa importa o exporta, indícalo al crear tu cuenta.";
  bitacora.push({ agente: "09 · Mercado público", resultado: "Fuente verificada, conexión en la Etapa 2 (ticket de la API)." });
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
      encontro: `${r360.beneficios.length} programa(s) público(s) podrían aplicar según el tamaño y los trabajadores informados al SII.`,
      importa: "Son apoyos no reembolsables, beneficios tributarios u oportunidades de venta al Estado.",
      hacer: "Confirmar requisitos y convocatorias vigentes antes de postular.",
      servicio: svc("crecimiento", "GEN-01", "Consulta profesional", "crecimiento", "Revisar las convocatorias que calzan con tu empresa."),
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
