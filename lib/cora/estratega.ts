import type { Expediente } from "@/lib/cora/director";
import { QUESTIONS, type Answer } from "@/lib/diagnostic-360";

// CORA · Opportunity Intelligence Strategist (Consulta Estratégica 360°, Etapa E1).
// Recibe SOLO hechos con identificador, fuente y fecha (evidencias) y devuelve una salida estructurada:
// descubrimientos, hipótesis, UNA pregunta siguiente y, al final, el informe. Un validador descarta toda
// afirmación sin evidencia, servicio fuera del catálogo, monto no aprobado o frase que confunda ausencia de
// resultados con inexistencia. Si la IA no responde o no pasa el validador, se usa el motor de reglas.

export type Evidencia = { id: string; texto: string; fuente: string; fecha: string; tipo: "publica" | "normativa" | "declarada" | "catalogo" };

export const MAX_PREGUNTAS = 5;

// Manual del estratega: metodologías traducidas a procedimientos (redacción propia de ENQORA).
export const MANUAL = `
MANUAL DEL ESTRATEGA CORA (procedimientos obligatorios)
1. Jobs to Be Done: para cada hipótesis, identifica el progreso que la empresa busca (vender más, crecer, cumplir sin sobresaltos, ordenarse)
   y qué la frena según la evidencia. No atribuyas deseos sin evidencia: si no hay, es una hipótesis "por confirmar".
2. Customer Discovery (The Mom Test): pregunta por hechos actuales o pasados y concretos, nunca por intenciones hipotéticas
   ("¿te gustaría…?") ni de forma que sugiera la respuesta. Elige siempre UNA pregunta del banco disponible: la que más reduce la
   incertidumbre sobre la necesidad de mayor impacto.
3. SPIN: Situación = lo ya investigado (no lo preguntes); Problema = brecha que muestra la evidencia; Implicación = consecuencia SOLO
   si hay norma o evidencia que la respalde; Beneficio = qué gana al resolverla.
4. Value Proposition Design: conecta tareas, dolores y ganancias con una necesidad del listado de necesidades (cada una ya tiene un
   servicio real del catálogo o una ruta oficial). Nunca propongas servicios que no estén en ese listado.
5. Reconocimiento de oportunidades: una oportunidad combina al menos dos evidencias (p. ej., tamaño + trabajadores → beneficio
   público). Con una sola evidencia, márcala como hipótesis.
6. Decisiones basadas en evidencia: cita SIEMPRE los identificadores de evidencia (E-…) que respaldan cada afirmación.
   "Sin resultados localizados" nunca significa "no tiene". No inventes cifras, multas, plazos, normas ni precios.
7. Persuasión ética del dueño de empresa: los dueños deciden por tiempo, tranquilidad (fiscalizaciones, multas), control del
   negocio, crecimiento y orden. Haz VISIBLE lo que la evidencia muestra que podría estar dejando pasar (oportunidades no
   aprovechadas, costos de no actuar con fundamento) y conéctalo con lo que gana al resolverlo. Contrasta su situación actual con
   cómo quedaría con ENQORA, usando SOLO las capacidades reales listadas. Una sola llamada a la acción clara.
   Prohibido: urgencia o escasez inventadas, miedo sin fundamento, cifras no verificadas, presentar hipótesis como hechos.
8. Tono: consultor senior, claro y cercano, en español de Chile. Recomendar no contratar nada también es válido cuando corresponde.
   No garantices resultados legales, tributarios ni financieros.
9. Primer contacto (psicología del dueño de empresa). El dueño decide en segundos si esto es para él. Escribe para que sienta que
   alguien estudió SU empresa y entendió lo que se juega:
   a) Reconocimiento específico primero: su nombre, años de trayectoria, lo que ya hace bien según la evidencia. Genera confianza.
   b) Luego la brecha más valiosa, en lenguaje de dueño (vender más, tiempo, tranquilidad, control), nunca de auditor. Evita jerga:
      no escribas «hipótesis», «expediente», «no se puede determinar», «brecha de información». Para lo no confirmado usa
      «por confirmar contigo» o «vale la pena revisarlo».
   c) Cada descubrimiento sigue el arco: hecho (con evidencia) → qué significa para ti → qué está en juego (lo que gana o lo que
      protege, solo con fundamento) → cómo lo resuelve ENQORA (solo capacidades reales). Título en forma de beneficio concreto,
      p. ej. «Un canal de ventas que hoy no estás usando: el Estado», no «Posible camino para vender al Estado».
   d) Lo que falta saber se presenta como la llave del siguiente paso: «con tu respuesta te digo exactamente qué te aplica y qué
      te conviene primero». Nunca como una deficiencia del cliente.
   e) Frases cortas, en segunda persona («tú»), concretas. Una idea por frase. Sin exclamaciones ni superlativos vacíos.
   f) Cercanía: habla como quien está del lado del dueño. A ENQORA le importa que su empresa esté en regla y que aproveche
      lo que la ley le da. Ej.: «Queremos que tu empresa esté en regla y que no deje pasar beneficios que ya son tuyos».
   g) El gancho son los beneficios concretos: si hay evidencia de un beneficio (p. ej., recuperar el IVA de una camioneta
      para el negocio, postergar el pago del IVA, una tasa reducida, un fondo público), ponlo primero y explícalo en simple:
      qué es y por qué podría aplicarle, citando su evidencia. Nunca afirmes que ya le corresponde: falta confirmarlo.
   h) Embudo honesto: en esta consulta gratuita explicas QUÉ es cada oportunidad y POR QUÉ podría aplicarle. Cuánto le
      significa exactamente, si cumple todos los requisitos y cómo aprovecharla paso a paso es trabajo de un profesional
      ENQORA (plan o asesoría): ese es el siguiente paso al que lo invitas, sin presionar.
   i) Encuadre de pérdida solo con hechos: «lo que hoy no estás aprovechando» es válido si la evidencia lo muestra; inventar
      urgencia, escasez, miedo o cifras está prohibido. La confianza es el activo: si la evidencia es débil, dilo con naturalidad.
`.trim();

export const FORBIDDEN = /\bno tiene\b|\bno posee\b|garantiz|\$\s?\d|\d{1,3}(\.\d{3})+\s?(pesos|clp)|certificamos|incumple\b|está incumpliendo/i;

// ── Evidencias a partir del expediente determinista (hechos reales con fuente) ──
export function evidenciasDe(exp: Expediente, respuestas: Record<string, Answer>): Evidencia[] {
  const out: Evidencia[] = [];
  let n = 0;
  const add = (texto: string, fuente: string, fecha: string, tipo: Evidencia["tipo"]) => out.push({ id: `E-${++n}`, texto, fuente, fecha, tipo });
  for (const s of exp.secciones) {
    const pub = s.fuentes[0];
    for (const t of s.encontrado) {
      if (t.includes("(declarado)")) continue;
      add(`${s.nombre}: ${t}`, pub?.nombre ?? "Expediente CORA", pub?.fecha ?? "", s.verificadaEnFuente ? "publica" : "normativa");
    }
    for (const o of s.obligaciones ?? []) {
      if (o.aplicacion === "potencial") add(`Obligación potencialmente aplicable: ${o.nombre} (${o.fundamento}). ${o.datos}`, o.fuente.nombre, `verificada el ${o.fuente.verificada}`, "normativa");
    }
  }
  for (const h of exp.hallazgos) add(`Hallazgo (${h.estado}): ${h.encontro}`, h.fuente, h.fecha, h.estado === "declarado" ? "declarada" : h.estado === "confirmado" ? "publica" : "normativa");
  for (const b of exp.beneficios) add(`Beneficio que podría aplicar: ${b.nombre}.${b.queEs ? ` Qué es: ${b.queEs}` : ""} Por qué podría aplicarle: ${b.porque} Falta confirmar: ${b.falta}`, "Catálogo de beneficios ENQORA (M16)", `verificado el ${b.verificado}`, "catalogo");
  for (const q of QUESTIONS) {
    const a = respuestas[q.id];
    if (a) add(`Respuesta del cliente: ${q.q} → ${a === "si" ? "Sí" : a === "no" ? "No" : a === "no_se" ? "No sé" : a === "ayuda" ? "Necesito ayuda" : "No aplica"}`, "Conversación con el cliente", "hoy", "declarada");
  }
  for (const s of exp.secciones) {
    if (!s.conInformacion) add(`${s.nombre}: sin resultados localizados en fuentes públicas (${s.falta[0] ?? "requiere información del cliente"}).`, "Expediente CORA", "hoy", "normativa");
  }
  return out;
}

// ── Tipos de salida ──
export type Descubrimiento = { titulo: string; por_que_importa: string; en_juego?: string; con_enqora?: string; evidencias: string[] };
export type Turno = {
  apertura: string;
  descubrimientos: Descubrimiento[];
  contexto: string; // por qué se hace la pregunta
  pregunta_id: string | null;
};
// Capacidades reales de ENQORA (la IA solo puede prometer estas).
export const CAPACIDADES: Record<string, string> = {
  contabilidad: "Contabilidad, IVA (F29) y renta con profesionales",
  cumplimiento: "Calendario de obligaciones con alertas de vencimiento",
  hoja_de_vida: "Hoja de vida tributaria de la empresa a partir de su Carpeta Tributaria",
  expedientes: "Expedientes con profesionales: formalización, patentes, marcas y asesoría",
  cotizaciones: "Cotizaciones con precio y plazos antes de decidir",
  documentos: "Documentos y mandatos firmados en un solo lugar",
  oportunidades: "Vigilancia de normas y beneficios públicos que aplican a tu empresa",
  beneficios: "Asesoría profesional para confirmar y aprovechar beneficios tributarios y estatales (cálculo, requisitos y postulación)",
};

export type Informe = {
  oportunidades_perdidas: { texto: string; evidencias: string[] }[]; // lo que podría estar dejando pasar
  propuesta_enqora: string; // cómo quedaría su empresa con ENQORA (solo capacidades reales)
  capacidades: string[]; // ids de CAPACIDADES
  resumen_estrategico: string;
  situacion: string;
  hallazgos_verificados: { texto: string; evidencias: string[] }[];
  fortalezas: { texto: string; evidencias: string[] }[];
  oportunidades: { titulo: string; explicacion: string; estado: "confirmada" | "hipotesis"; evidencias: string[] }[];
  necesidades_confirmadas: { texto: string; evidencias: string[] }[];
  riesgos: { texto: string; fundamento: string; evidencias: string[] }[];
  pendientes: string[];
  prioridades: { necesidad_id: string; por_que: string }[];
};

// ── Herramientas (salida estructurada) ──
const evid = { type: "array", items: { type: "string" }, description: "Identificadores de evidencia (E-…) que respaldan la afirmación." };
export const TOOL_TURNO = {
  name: "turno_cora",
  description: "Entrega la apertura, los descubrimientos y la siguiente pregunta (o null si ya no hace falta preguntar).",
  input_schema: {
    type: "object",
    properties: {
      apertura: { type: "string", description: "2 a 3 frases cortas: reconocimiento específico de la empresa (nombre, trayectoria, lo que hace bien) y la oportunidad o tema más valioso que encontró CORA. Sin cifras inventadas." },
      descubrimientos: { type: "array", maxItems: 3, items: { type: "object", properties: {
        titulo: { type: "string", description: "Beneficio concreto para el dueño, en pocas palabras." },
        por_que_importa: { type: "string", description: "El hecho y qué significa para su negocio (1 a 2 frases)." },
        en_juego: { type: "string", description: "Qué gana o qué protege si lo atiende, solo con fundamento en la evidencia (1 frase)." },
        con_enqora: { type: "string", description: "Cómo lo resuelve ENQORA con una capacidad real (1 frase)." },
        evidencias: evid,
      }, required: ["titulo", "por_que_importa", "en_juego", "con_enqora", "evidencias"] } },
      contexto: { type: "string", description: "Por qué la siguiente pregunta es la llave: qué podrás decirle con su respuesta (1 a 2 frases)." },
      pregunta_id: { type: "string", description: "Id de UNA pregunta del banco disponible, o la palabra «ninguna» si ya no hace falta preguntar." },
    },
    required: ["apertura", "descubrimientos", "contexto", "pregunta_id"],
  },
};
export const TOOL_INFORME = {
  name: "informe_cora",
  description: "Entrega el informe estratégico final, con evidencias en cada afirmación.",
  input_schema: {
    type: "object",
    properties: {
      resumen_estrategico: { type: "string" },
      situacion: { type: "string" },
      oportunidades_perdidas: { type: "array", maxItems: 4, description: "Lo que la evidencia muestra que podría estar dejando pasar (oportunidades no aprovechadas o costos de no actuar con fundamento).", items: { type: "object", properties: { texto: { type: "string" }, evidencias: evid }, required: ["texto", "evidencias"] } },
      propuesta_enqora: { type: "string", description: "2 a 4 frases: cómo quedaría su empresa con ENQORA (más ordenada, todo en un lugar, creciendo), usando solo las capacidades listadas." },
      capacidades: { type: "array", items: { type: "string" }, description: "Ids de las capacidades de ENQORA que aplican a este caso." },
      hallazgos_verificados: { type: "array", items: { type: "object", properties: { texto: { type: "string" }, evidencias: evid }, required: ["texto", "evidencias"] } },
      fortalezas: { type: "array", items: { type: "object", properties: { texto: { type: "string" }, evidencias: evid }, required: ["texto", "evidencias"] } },
      oportunidades: { type: "array", items: { type: "object", properties: { titulo: { type: "string" }, explicacion: { type: "string" }, estado: { type: "string", enum: ["confirmada", "hipotesis"] }, evidencias: evid }, required: ["titulo", "explicacion", "estado", "evidencias"] } },
      necesidades_confirmadas: { type: "array", items: { type: "object", properties: { texto: { type: "string" }, evidencias: evid }, required: ["texto", "evidencias"] } },
      riesgos: { type: "array", items: { type: "object", properties: { texto: { type: "string" }, fundamento: { type: "string" }, evidencias: evid }, required: ["texto", "fundamento", "evidencias"] } },
      pendientes: { type: "array", items: { type: "string" } },
      prioridades: { type: "array", maxItems: 3, items: { type: "object", properties: { necesidad_id: { type: "string" }, por_que: { type: "string" } }, required: ["necesidad_id", "por_que"] } },
    },
    required: ["resumen_estrategico", "situacion", "oportunidades_perdidas", "propuesta_enqora", "capacidades", "hallazgos_verificados", "fortalezas", "oportunidades", "necesidades_confirmadas", "riesgos", "pendientes", "prioridades"],
  },
};

// ── Banco de preguntas disponible y orden de relevancia (para la IA y para el motor de reglas) ──
export function preguntasDisponibles(exp: Expediente, respuestas: Record<string, Answer>) {
  const ya = Object.keys(respuestas).length;
  if (ya >= MAX_PREGUNTAS) return [];
  const ids = new Set(exp.hallazgos.map((h) => h.id));
  const workers = exp.secciones.find((s) => s.key === "laboral")?.obligaciones?.some((o) => o.aplicacion === "potencial") ?? false;
  const peso = (id: string) =>
    id === "declaraciones" ? (ids.has("sin_ventas") ? 10 : 7)
      : id === "contratos" ? (workers ? 9 : 3)
        : id === "patente" ? 6 : id === "cuentas" ? 6 : id === "caja" ? 5 : id === "marca" ? 4 : id === "clientes" ? 4
          : id === "respaldos" ? 3 : id === "inventario" ? 2 : id === "digital" ? 3 : id === "sistema" ? 2 : 1;
  return exp.preguntas.filter((q) => !respuestas[q.id]).sort((a, b) => peso(b.id) - peso(a.id));
}

// ── Validadores ──
// Limpia el texto y quita solo las oraciones con lenguaje prohibido (no descarta la respuesta completa).
const clean = (s: unknown, max = 600) => {
  if (typeof s !== "string") return "";
  const t = s.replace(/\s+/g, " ").trim();
  const frases = t.split(/(?<=[.!?])\s+/).filter((f) => !FORBIDDEN.test(f));
  return frases.join(" ").slice(0, max).trim();
};
const okText = (s: string) => !!s && !FORBIDDEN.test(s);
function okEvid(raw: unknown, ids: Set<string>): string[] | null {
  if (!Array.isArray(raw)) return null;
  const list = raw.filter((x): x is string => typeof x === "string" && ids.has(x)).slice(0, 6);
  return list.length ? list : null;
}

export function validarTurno(raw: unknown, ev: Evidencia[], disponibles: string[]): Turno | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const ids = new Set(ev.map((e) => e.id));
  const apertura = clean(r.apertura, 700);
  if (!okText(apertura)) return null;
  const descubrimientos: Descubrimiento[] = [];
  for (const d of (Array.isArray(r.descubrimientos) ? r.descubrimientos : []).slice(0, 3) as Record<string, unknown>[]) {
    const titulo = clean(d.titulo, 160), por = clean(d.por_que_importa, 400), e = okEvid(d.evidencias, ids);
    const enJuego = clean(d.en_juego, 300), conEnqora = clean(d.con_enqora, 300);
    if (okText(titulo) && okText(por) && e) descubrimientos.push({ titulo, por_que_importa: por, ...(okText(enJuego) ? { en_juego: enJuego } : {}), ...(okText(conEnqora) ? { con_enqora: conEnqora } : {}), evidencias: e });
  }
  const pid = typeof r.pregunta_id === "string" && disponibles.includes(r.pregunta_id) ? r.pregunta_id : null;
  const contexto = clean(r.contexto, 400);
  if (!descubrimientos.length) return null;
  const ninguna = typeof r.pregunta_id === "string" && /^ninguna$/i.test(r.pregunta_id.trim());
  return { apertura, descubrimientos, contexto: okText(contexto) ? contexto : "", pregunta_id: !disponibles.length || ninguna ? null : pid ?? disponibles[0] };
}

export function validarInforme(raw: unknown, ev: Evidencia[], necesidadIds: string[]): Informe | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const ids = new Set(ev.map((e) => e.id));
  const arr = (x: unknown) => (Array.isArray(x) ? (x as Record<string, unknown>[]).slice(0, 8) : []);
  const textos = (x: unknown) => arr(x).map((i) => ({ texto: clean(i.texto, 400), evidencias: okEvid(i.evidencias, ids) }))
    .filter((i): i is { texto: string; evidencias: string[] } => okText(i.texto) && !!i.evidencias);
  const resumen = clean(r.resumen_estrategico, 900), situacion = clean(r.situacion, 700);
  if (!okText(resumen) || !okText(situacion)) return null;
  const prioridades: Informe["prioridades"] = [];
  for (const p of arr(r.prioridades)) {
    const id = typeof p.necesidad_id === "string" ? p.necesidad_id : "";
    const por = clean(p.por_que, 300);
    if (necesidadIds.includes(id) && okText(por) && !prioridades.some((x) => x.necesidad_id === id)) prioridades.push({ necesidad_id: id, por_que: por });
  }
  const caps = (Array.isArray(r.capacidades) ? r.capacidades : []).filter((c): c is string => typeof c === "string" && c in CAPACIDADES);
  return {
    resumen_estrategico: resumen, situacion,
    oportunidades_perdidas: textos(r.oportunidades_perdidas).slice(0, 4),
    propuesta_enqora: clean(r.propuesta_enqora, 700) || "Con ENQORA, tu información, tus obligaciones con sus fechas, tus documentos y los profesionales que te asesoran quedan en un solo lugar.",
    capacidades: [...new Set(caps)].slice(0, 6),
    hallazgos_verificados: textos(r.hallazgos_verificados),
    fortalezas: textos(r.fortalezas),
    oportunidades: arr(r.oportunidades).map((o) => ({ titulo: clean(o.titulo, 160), explicacion: clean(o.explicacion, 400), estado: (o.estado === "confirmada" ? "confirmada" : "hipotesis") as "confirmada" | "hipotesis", evidencias: okEvid(o.evidencias, ids) }))
      .filter((o): o is Informe["oportunidades"][number] => okText(o.titulo) && okText(o.explicacion) && !!o.evidencias),
    necesidades_confirmadas: textos(r.necesidades_confirmadas),
    riesgos: arr(r.riesgos).map((x) => ({ texto: clean(x.texto, 400), fundamento: clean(x.fundamento, 300), evidencias: okEvid(x.evidencias, ids) }))
      .filter((x): x is Informe["riesgos"][number] => okText(x.texto) && okText(x.fundamento) && !!x.evidencias),
    pendientes: (Array.isArray(r.pendientes) ? r.pendientes : []).map((p) => clean(p, 300)).filter(okText).slice(0, 8),
    prioridades: prioridades.slice(0, 3),
  };
}

// Necesidades sin repetir el mismo servicio (dos hallazgos que se resuelven con lo mismo son un solo paso).
export function distintas(exp: Expediente) {
  const vistos = new Set<string>();
  return exp.necesidades.filter((n) => {
    const k = n.servicio?.codigo ?? n.servicio?.id ?? n.id;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

// ── Motor de reglas (respaldo cuando la IA no está disponible) ──
const evidPara = (ev: Evidencia[], texto: string) => ev.filter((e) => e.texto.includes(texto)).map((e) => e.id).slice(0, 3);

export function turnoReglas(exp: Expediente, ev: Evidencia[], respuestas: Record<string, Answer>): Turno {
  const disp = preguntasDisponibles(exp, respuestas);
  const top = exp.hallazgos.slice(0, 3);
  const descubrimientos = top.map((h) => ({ titulo: h.encontro, por_que_importa: h.importa, ...(h.consecuencias ? { en_juego: h.consecuencias } : {}), evidencias: evidPara(ev, h.encontro) }))
    .filter((d) => d.evidencias.length);
  const siguiente = disp[0];
  return {
    apertura: `Investigamos ${exp.empresa.razon} en las fuentes públicas disponibles y en la normativa vigente. ${top.length ? "Encontramos puntos que vale la pena revisar contigo antes de recomendarte un camino." : "No encontramos señales de alerta en los datos públicos; hay aspectos que solo tú puedes confirmar."}`,
    descubrimientos,
    contexto: siguiente ? "Esto no aparece en ninguna fuente pública. Con tu respuesta te digo qué te aplica y qué te conviene hacer primero." : "",
    pregunta_id: siguiente?.id ?? null,
  };
}

export function informeReglas(exp: Expediente, ev: Evidencia[]): Informe {
  const e = (t: string) => evidPara(ev, t);
  const conf = exp.hallazgos.filter((h) => h.estado === "confirmado" || h.estado === "declarado");
  const planes = new Set(exp.necesidades.map((n) => n.plan));
  const caps = ["cumplimiento", "hoja_de_vida", ...(planes.has("regularizacion") || planes.has("gestion") ? ["contabilidad"] : []),
    ...(planes.has("formalizacion") ? ["expedientes"] : []), ...(planes.has("crecimiento") ? ["oportunidades"] : []), ...(exp.beneficios.length ? ["beneficios"] : []), "cotizaciones"];
  return {
    oportunidades_perdidas: [
      ...exp.beneficios.map((b) => ({ texto: `${b.nombre}: ${b.porque}`, evidencias: e(b.nombre) })),
      ...exp.hallazgos.filter((h) => h.id === "marca_sin_registro").map((h) => ({ texto: h.importa, evidencias: e(h.encontro) })),
    ].filter((x) => x.evidencias.length).slice(0, 4),
    propuesta_enqora: "Con ENQORA, la información tributaria, las obligaciones con sus fechas, los documentos y los profesionales que te asesoran quedan en un solo lugar, y cada paso se cotiza antes de decidir.",
    capacidades: caps,
    resumen_estrategico: `${exp.empresa.razon}: el expediente tiene ${exp.completitud.pct}% de completitud (${exp.completitud.verificadas} secciones verificadas en fuentes oficiales). ${exp.propuesta.mensaje}`,
    situacion: exp.secciones.find((s) => s.key === "tributacion")?.encontrado[0] ?? "Situación pública sin alertas.",
    hallazgos_verificados: exp.hallazgos.filter((h) => h.estado === "confirmado").map((h) => ({ texto: h.encontro, evidencias: e(h.encontro) })).filter((x) => x.evidencias.length),
    fortalezas: exp.secciones.filter((s) => s.nivel === "solido" && s.key !== "crecimiento").map((s) => ({ texto: `${s.nombre}: sin brechas en la información disponible.`, evidencias: e(`${s.nombre}:`) })).filter((x) => x.evidencias.length),
    oportunidades: exp.beneficios.map((b) => ({ titulo: b.nombre, explicacion: b.porque, estado: "hipotesis" as const, evidencias: e(b.nombre) })).filter((x) => x.evidencias.length),
    necesidades_confirmadas: conf.map((h) => ({ texto: h.encontro, evidencias: e(h.encontro) })).filter((x) => x.evidencias.length),
    riesgos: exp.hallazgos.filter((h) => h.consecuencias).map((h) => ({ texto: h.consecuencias!, fundamento: h.fuente, evidencias: e(h.encontro) })).filter((x) => x.evidencias.length),
    pendientes: exp.secciones.filter((s) => !s.conInformacion).map((s) => `${s.nombre}: ${s.falta[0] ?? "sin resultados localizados"}`).slice(0, 6),
    prioridades: distintas(exp).slice(0, 3).map((n) => ({ necesidad_id: n.id, por_que: n.evidencia })),
  };
}

// ── Mensajes para la IA ──
export function promptTurno(ev: Evidencia[], disponibles: { id: string; q: string }[], respuestas: Record<string, Answer>) {
  return [
    "EVIDENCIAS (únicos hechos que puedes usar):",
    ...ev.map((e) => `${e.id} [${e.tipo}] ${e.texto} — Fuente: ${e.fuente}${e.fecha ? `, ${e.fecha}` : ""}`),
    "",
    `PREGUNTAS YA RESPONDIDAS: ${Object.keys(respuestas).length}/${MAX_PREGUNTAS}.`,
    "BANCO DE PREGUNTAS DISPONIBLE (elige UNA por id, o «ninguna» si ya no hace falta):",
    ...disponibles.map((q) => `${q.id}: ${q.q}`),
    "",
    `CAPACIDADES REALES DE ENQORA (las únicas que puedes mencionar en «con_enqora»): ${Object.values(CAPACIDADES).join("; ")}.`,
    "",
    "Aplica el procedimiento 9 (primer contacto). Entrega la apertura, hasta 3 descubrimientos con el arco completo (hecho → qué significa → qué está en juego → cómo lo resuelve ENQORA) y sus evidencias, y la siguiente pregunta presentada como la llave del siguiente paso (o «ninguna»).",
  ].join("\n");
}

export function promptInforme(ev: Evidencia[], necesidades: { id: string; necesidad: string; servicio: string; evidencia: string }[]) {
  return [
    "EVIDENCIAS (únicos hechos que puedes usar):",
    ...ev.map((e) => `${e.id} [${e.tipo}] ${e.texto} — Fuente: ${e.fuente}${e.fecha ? `, ${e.fecha}` : ""}`),
    "",
    "NECESIDADES DISPONIBLES (para 'prioridades' usa solo estos id; cada una ya tiene servicio real o ruta oficial):",
    ...necesidades.map((n) => `${n.id}: ${n.necesidad} — evidencia: ${n.evidencia} — solución: ${n.servicio}`),
    "",
    "CAPACIDADES REALES DE ENQORA (usa solo estos id en 'capacidades' y solo estas en 'propuesta_enqora'):",
    ...Object.entries(CAPACIDADES).map(([id, t]) => `${id}: ${t}`),
    "",
    "Redacta el informe estratégico. Distingue hechos verificados de hipótesis. Muestra lo que podría estar dejando pasar y cómo quedaría con ENQORA. Elige como máximo 3 prioridades y explica por qué cada una va primero.",
  ].join("\n");
}
