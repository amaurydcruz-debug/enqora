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
9. Informe ejecutivo del primer contacto. El dueño debe sentir que ENQORA investigó SU empresa y que cada recomendación
   tiene una razón concreta. Reglas:
   a) Resumen estratégico (apertura): 2 a 3 frases ejecutivas y personalizadas: qué se descubrió y qué merece atención.
      Sin saludo publicitario, sin repetir datos de identidad que ya están en pantalla.
   b) Oportunidades: hasta 3, solo cuando la evidencia lo sostiene. Si hay 2, entrega 2; si no hay ninguna sólida, entrega
      la que exista con tipo «insuficiente» y dilo con naturalidad. Nunca inventes una para completar.
   c) Cada oportunidad trae: qué encontramos (hecho con evidencia) · por qué es relevante · beneficio potencial (solo con
      fundamento) · qué falta confirmar · cómo ayuda ENQORA (solo si hay relación demostrada con el hallazgo) · próximo paso
      concreto · tipo: hecho | oportunidad | hipotesis | obligacion | riesgo | insuficiente.
   d) Beneficios y obligaciones: nunca presentes un beneficio tributario como aplicable sin comprobar sus requisitos. Si un
      requisito no está en la evidencia (ventas afectas a IVA, régimen, morosidad, ingresos), el tipo es «hipotesis» y el
      requisito va en «qué falta confirmar». No recomiendes comprar bienes (p. ej., vehículos) para obtener un beneficio.
   e) Compras públicas: tener inicio de actividades no basta. Solo es oportunidad si la evidencia muestra rubro, productos o
      historial compatible; la inscripción en Mercado Público es gratuita en ChileCompra y no es un servicio de ENQORA.
   f) Sin repeticiones: cada oportunidad trata un tema distinto; no repitas la misma idea con otras palabras ni repitas en la
      apertura lo que dicen las oportunidades.
   g) Tono ejecutivo, profesional, claro para empresarios; persuasivo sin exageración. Frases cortas en segunda persona. Sin
      frases publicitarias, promesas económicas, urgencias inventadas ni lenguaje alarmista.
   h) Nunca cuentes fallas técnicas ni consultas pendientes (CAPTCHA, verificaciones, portales caídos, «búsqueda aún no
      realizada»): di que vale la pena revisarlo. No escribas códigos de evidencia (E-1, E-2…) dentro del texto.
   i) No revendas lo que el Estado entrega gratis: si un organismo ofrece un trámite directamente, dilo; ENQORA aporta
      inteligencia, preparación y acompañamiento profesional.
   j) Lo que falta saber se presenta como el siguiente paso de la conversación, nunca como una deficiencia del cliente.
`.trim();

export const FORBIDDEN = /captcha|a[uú]n no se ha realizado|pendiente de completar|revisi[oó]n est[aá] pendiente|b[uú]squeda (est[aá] )?pendiente|no se ha realizado (la|una) b[uú]squeda|verificaci[oó]n (del|que pidi)|no pudimos completar|el portal (pidi|exig)|\bno tiene\b|\bno posee\b|garantiz|\$\s?\d|\d{1,3}(\.\d{3})+\s?(pesos|clp)|certificamos|incumple\b|está incumpliendo/i;

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
// tipo: cómo debe leerse el hallazgo (hecho confirmado, oportunidad detectada, hipótesis pendiente, obligación verificada,
// riesgo potencial o información insuficiente).
export type TipoHallazgo = "hecho" | "oportunidad" | "hipotesis" | "obligacion" | "riesgo" | "insuficiente";
export const TIPOS_HALLAZGO: Record<TipoHallazgo, string> = {
  hecho: "Hecho confirmado", oportunidad: "Oportunidad detectada", hipotesis: "Hipótesis pendiente",
  obligacion: "Obligación verificada", riesgo: "Riesgo potencial", insuficiente: "Información insuficiente",
};
export type Descubrimiento = {
  titulo: string; hallazgo?: string; por_que_importa: string; en_juego?: string; falta?: string; con_enqora?: string; proximo?: string;
  tipo?: TipoHallazgo; evidencias: string[];
};
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
  compras_publicas: "Inteligencia de oportunidades comerciales con el Estado: un profesional identifica qué organismos compran lo que ofreces y te ayuda a preparar ofertas (la inscripción en Mercado Público es gratuita y la haces en ChileCompra)",
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
      apertura: { type: "string", description: "Resumen estratégico: 2 a 3 frases ejecutivas y personalizadas sobre qué se descubrió y qué merece atención. Sin cifras inventadas ni datos de identidad repetidos." },
      descubrimientos: { type: "array", maxItems: 3, items: { type: "object", properties: {
        titulo: { type: "string", description: "La oportunidad o el tema, en pocas palabras y en términos de negocio." },
        hallazgo: { type: "string", description: "Evidencia y fuente: el hecho concreto y de dónde sale (1 frase)." },
        por_que_importa: { type: "string", description: "Por qué es relevante para esta empresa (1 a 2 frases)." },
        en_juego: { type: "string", description: "Beneficio potencial, solo con fundamento en la evidencia (1 frase). Vacío si no hay fundamento." },
        falta_confirmar: { type: "string", description: "Qué falta confirmar antes de actuar (requisitos no comprobados)." },
        con_enqora: { type: "string", description: "Cómo ayuda ENQORA con una capacidad real relacionada con este hallazgo (1 frase). Vacío si no hay relación." },
        proximo_paso: { type: "string", description: "Próximo paso concreto (1 frase)." },
        tipo: { type: "string", enum: ["hecho", "oportunidad", "hipotesis", "obligacion", "riesgo", "insuficiente"] },
        evidencias: evid,
      }, required: ["titulo", "hallazgo", "por_que_importa", "falta_confirmar", "proximo_paso", "tipo", "evidencias"] } },
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
  // Los códigos internos de evidencia («(E-10, E-11)») no se muestran al cliente: ya van en «Evidencia».
  const t = s.replace(/\s*\((?:E-\d+(?:,\s*)?)+\)/g, "").replace(/\bE-\d+\b,?\s*/g, "").replace(/\s+/g, " ").replace(/\s+([.,;:])/g, "$1").trim();
  const frases = t.split(/(?<=[.!?])\s+/).filter((f) => !FORBIDDEN.test(f));
  return frases.join(" ").slice(0, max).trim();
};
const okText = (s: string) => !!s && !FORBIDDEN.test(s);
function okEvid(raw: unknown, ids: Set<string>): string[] | null {
  if (!Array.isArray(raw)) return null;
  const list = raw.filter((x): x is string => typeof x === "string" && ids.has(x)).slice(0, 6);
  return list.length ? list : null;
}

// Dos textos tratan lo mismo si comparten la mayoría de sus palabras significativas.
const VACIAS = new Set(["para", "como", "con", "que", "del", "las", "los", "una", "uno", "por", "sus", "tus", "este", "esta", "esto", "sin", "más", "mas", "hay", "puede", "tu", "tú", "de", "la", "el", "en", "y", "a", "o", "al", "se", "su", "es", "lo", "le"]);
const palabras = (t: string) => new Set(t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9ñ]+/).filter((w) => w.length > 3 && !VACIAS.has(w)));
export function parecidos(a: string, b: string): boolean {
  const A = palabras(a), B = palabras(b);
  if (!A.size || !B.size) return false;
  let comunes = 0;
  for (const w of A) if (B.has(w)) comunes++;
  return comunes / Math.min(A.size, B.size) >= 0.6;
}

export function validarTurno(raw: unknown, ev: Evidencia[], disponibles: string[]): Turno | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const ids = new Set(ev.map((e) => e.id));
  const apertura = clean(r.apertura, 700);
  if (!okText(apertura)) return null;
  const descubrimientos: Descubrimiento[] = [];
  for (const d of (Array.isArray(r.descubrimientos) ? r.descubrimientos : []).slice(0, 3) as Record<string, unknown>[]) {
    const titulo = clean(d.titulo, 160), por = clean(d.por_que_importa, 400), e = okEvid(d.evidencias, ids);
    const hallazgo = clean(d.hallazgo, 300), enJuego = clean(d.en_juego, 300), conEnqora = clean(d.con_enqora, 300);
    const falta = clean(d.falta_confirmar, 300), proximo = clean(d.proximo_paso, 240);
    const tipo = typeof d.tipo === "string" && d.tipo in TIPOS_HALLAZGO ? (d.tipo as TipoHallazgo) : undefined;
    if (!okText(titulo) || !okText(por) || !e) continue;
    // Sin repeticiones: se descarta un descubrimiento que dice lo mismo que otro con otras palabras.
    if (descubrimientos.some((x) => parecidos(`${x.titulo} ${x.hallazgo ?? ""}`, `${titulo} ${hallazgo}`))) continue;
    descubrimientos.push({
      titulo, por_que_importa: por, evidencias: e,
      ...(okText(hallazgo) ? { hallazgo } : {}), ...(okText(enJuego) ? { en_juego: enJuego } : {}), ...(okText(falta) ? { falta } : {}),
      ...(okText(conEnqora) ? { con_enqora: conEnqora } : {}), ...(okText(proximo) ? { proximo } : {}), ...(tipo ? { tipo } : {}),
    });
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
  // Oportunidades por reglas: sin consultas pendientes (no son hallazgos) y un solo tema por área de personas.
  const NO_OPORTUNIDAD = new Set(["marca_pendiente"]);
  const candidatos = exp.hallazgos.filter((h) => !NO_OPORTUNIDAD.has(h.id))
    .filter((h, _, all) => !(h.id === "seguridad_potencial" && all.some((x) => x.id === "laboral_potencial")));
  const top = candidatos.slice(0, 3);
  const POR_ID: Record<string, TipoHallazgo> = {
    deber_societario: "obligacion", laboral_potencial: "obligacion", seguridad_potencial: "obligacion", oportunidades: "oportunidad",
    marca_sin_registro: "hipotesis", proveedor_estado: "hecho", marca_registrada: "hecho",
  };
  const tipoDe = (h: Expediente["hallazgos"][number]): TipoHallazgo =>
    h.estado === "declarado" ? "riesgo" : POR_ID[h.id] ? POR_ID[h.id]
      : h.estado === "confirmado" ? (h.prioridad === "alta" ? "riesgo" : "hecho")
      : h.estado === "no_encontrado" || h.estado === "fuente_no_disponible" ? "insuficiente" : "hipotesis";
  const descubrimientos: Descubrimiento[] = top.map((h) => ({
    titulo: h.encontro, hallazgo: `${h.fuente}${h.fecha ? ` (${h.fecha})` : ""}.`, por_que_importa: h.importa, tipo: tipoDe(h),
    ...(h.servicio ? { con_enqora: `${h.servicio.nombre}: ${h.servicio.porque}` } : {}), proximo: h.hacer,
    evidencias: evidPara(ev, h.encontro),
  })).filter((d) => d.evidencias.length);
  const siguiente = disp[0];
  return {
    apertura: exp.completitud.pct < 25
      ? `La información pública disponible sobre ${exp.empresa.razon} es limitada, así que no proponemos oportunidades sin evidencia${top.length ? `; solo ${top.length === 1 ? "un tema se puede" : "algunos temas se pueden"} señalar con fundamento` : ""}. Lo que sigue depende de lo que quieras conseguir con tu empresa.`
      : top.length
      ? `Revisamos ${exp.empresa.razon} en las fuentes públicas disponibles y en la normativa vigente. ${top.length === 1 ? "Hay un tema" : `Hay ${top.length} temas`} que merece${top.length === 1 ? "" : "n"} atención antes de recomendarte un camino.`
      : `Revisamos ${exp.empresa.razon} en las fuentes públicas disponibles: no encontramos señales de alerta ni oportunidades con evidencia suficiente. Lo que sigue depende de lo que quieras conseguir con tu empresa.`,
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
    "Aplica el procedimiento 9 (informe ejecutivo). Entrega el resumen estratégico, hasta 3 oportunidades SOLO con evidencia (cada una con hallazgo, relevancia, beneficio potencial si tiene fundamento, qué falta confirmar, cómo ayuda ENQORA si hay relación, próximo paso, tipo y evidencias), sin repetir temas, y la siguiente pregunta (o «ninguna»).",
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
