import type { ModuleKey } from "@/lib/cases";

// Onboarding ENQORA (M09). Preguntas por opciones; las opciones deben coincidir con
// private.onboarding_options() en supabase/migrations/0010_diagnostico.sql.
// Las rutas sugeridas salen de reglas explícitas sobre las respuestas: orientan, no diagnostican.

export type Option = { value: string; label: string; help?: string; emblem?: string };
export type Question = {
  key: string;
  title: string;
  lead?: string;
  multi?: number; // máximo de opciones (si es selección múltiple)
  required?: boolean;
  options: Option[];
};

export const QUESTIONS: Question[] = [
  {
    key: "etapa",
    title: "¿En qué momento está tu empresa?",
    lead: "Así sabemos por dónde empezar.",
    required: true,
    options: [
      { value: "idea", label: "Es una idea", help: "Aún no existe la empresa", emblem: "idea" },
      { value: "constitucion", label: "Quiero constituirla", help: "Tengo claro el negocio", emblem: "create" },
      { value: "inicio", label: "Recién comienza", help: "Menos de un año operando", emblem: "formaliza" },
      { value: "operando", label: "Está operando", help: "Más de un año", emblem: "empresas" },
      { value: "regularizar", label: "Necesita regularizarse", help: "Atrasos o pendientes", emblem: "autorizaciones" },
    ],
  },
  {
    key: "actividad",
    title: "¿A qué se dedica?",
    options: [
      { value: "comercio", label: "Comercio", help: "Compra y venta de productos" },
      { value: "servicios", label: "Servicios", help: "Profesionales, asesorías, oficios" },
      { value: "gastronomia", label: "Gastronomía", help: "Restaurantes, alimentos" },
      { value: "produccion", label: "Producción", help: "Fabricación, agricultura" },
      { value: "construccion", label: "Construcción", help: "Obras e inmobiliaria" },
      { value: "tecnologia", label: "Tecnología", help: "Software, digital" },
      { value: "transporte", label: "Transporte", help: "Logística y fletes" },
      { value: "otra", label: "Otra" },
    ],
  },
  {
    key: "trabajadores",
    title: "¿Cuántas personas trabajan con contrato?",
    options: [
      { value: "ninguno", label: "Ninguna" },
      { value: "1_5", label: "1 a 5" },
      { value: "6_20", label: "6 a 20" },
      { value: "mas_20", label: "Más de 20" },
    ],
  },
  {
    key: "ventas",
    title: "¿Cuánto vende al mes, aproximadamente?",
    lead: "Un rango basta. Puedes no responder.",
    options: [
      { value: "sin_ventas", label: "Aún no vende" },
      { value: "hasta_5m", label: "Hasta $5 millones" },
      { value: "5m_25m", label: "$5 a $25 millones" },
      { value: "25m_100m", label: "$25 a $100 millones" },
      { value: "mas_100m", label: "Más de $100 millones" },
      { value: "prefiero_no", label: "Prefiero no decirlo" },
    ],
  },
  {
    key: "contabilidad",
    title: "¿Quién lleva hoy la contabilidad?",
    required: true,
    options: [
      { value: "nadie", label: "Nadie", help: "Está pendiente", emblem: "autorizaciones" },
      { value: "yo", label: "Yo mismo", emblem: "identidad" },
      { value: "contador", label: "Un contador", help: "Independiente", emblem: "miembros" },
      { value: "oficina", label: "Una oficina contable", emblem: "empresas" },
      { value: "no_se", label: "No lo sé", emblem: "general" },
    ],
  },
  {
    key: "documentos",
    title: "¿Qué documentos tributarios emite?",
    options: [
      { value: "facturas", label: "Facturas" },
      { value: "boletas", label: "Boletas" },
      { value: "ambos", label: "Facturas y boletas" },
      { value: "ninguno", label: "Ninguno todavía" },
      { value: "no_se", label: "No lo sé" },
    ],
  },
  {
    key: "preocupaciones",
    title: "¿Qué te preocupa hoy?",
    lead: "Elige hasta 4.",
    multi: 4,
    required: true,
    options: [
      { value: "impuestos_atrasados", label: "Impuestos atrasados", emblem: "contabilidad" },
      { value: "observaciones_sii", label: "Observaciones o cartas del SII", emblem: "investigacion" },
      { value: "ordenar_contabilidad", label: "Ordenar la contabilidad", emblem: "documentos" },
      { value: "remuneraciones", label: "Sueldos y cotizaciones", emblem: "miembros" },
      { value: "elegir_regimen", label: "Elegir el régimen tributario", emblem: "diagnostico" },
      { value: "constituir", label: "Constituir la empresa", emblem: "create" },
      { value: "inicio_actividades", label: "Inicio de actividades", emblem: "formaliza" },
      { value: "patente_permisos", label: "Patente y permisos", emblem: "autorizaciones" },
      { value: "marca", label: "Proteger mi marca", emblem: "brand" },
      { value: "contratos", label: "Contratos", emblem: "legal" },
      { value: "financiamiento", label: "Financiamiento y fondos", emblem: "crece" },
      { value: "crecer", label: "Ordenar y hacer crecer el negocio", emblem: "gestion" },
    ],
  },
  {
    key: "urgencia",
    title: "¿Qué tan urgente es?",
    required: true,
    options: [
      { value: "vence_pronto", label: "Vence pronto", help: "En los próximos 7 días", emblem: "proximas" },
      { value: "este_mes", label: "Este mes", emblem: "tareas" },
      { value: "sin_apuro", label: "Sin apuro", help: "Quiero planificar", emblem: "proceso" },
    ],
  },
];

export type Answers = Record<string, string | string[]>;

export const questionByKey = (k: string) => QUESTIONS.find((q) => q.key === k);

export const optionLabel = (key: string, value: string) =>
  questionByKey(key)?.options.find((o) => o.value === value)?.label ?? value;

export const answerText = (key: string, v: string | string[] | undefined) =>
  v === undefined ? null : Array.isArray(v) ? v.map((x) => optionLabel(key, x)).join(", ") : optionLabel(key, v);

export const isComplete = (a: Answers) =>
  QUESTIONS.filter((q) => q.required).every((q) => (Array.isArray(a[q.key]) ? (a[q.key] as string[]).length > 0 : !!a[q.key]));

// Limpia y valida las respuestas antes de enviarlas (la base de datos vuelve a validar).
export function sanitizeAnswers(raw: unknown): Answers | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Answers = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const q = questionByKey(k);
    if (!q) return null;
    const valid = new Set(q.options.map((o) => o.value));
    if (q.multi) {
      if (!Array.isArray(v)) return null;
      const list = [...new Set(v.filter((x): x is string => typeof x === "string"))];
      if (!list.length || list.length > q.multi || list.some((x) => !valid.has(x))) return null;
      out[k] = list;
    } else {
      if (typeof v !== "string" || !valid.has(v)) return null;
      out[k] = v;
    }
  }
  return out;
}

// ---------- Rutas sugeridas ----------

export type Route = {
  category: string; // clave de lib/discovery.ts
  module: ModuleKey;
  title: string;
  reason: string; // por qué se sugiere, citando la respuesta
  weight: number;
};

const has = (a: Answers, key: string, ...values: string[]) => {
  const v = a[key];
  return Array.isArray(v) ? v.some((x) => values.includes(x)) : typeof v === "string" && values.includes(v);
};

export function suggestRoutes(a: Answers): Route[] {
  const r: Route[] = [];
  const add = (category: string, module: ModuleKey, title: string, reason: string, weight: number) => {
    const prev = r.find((x) => x.category === category);
    if (prev) {
      prev.weight += weight;
      if (!prev.reason.includes(reason)) prev.reason += ` ${reason}`;
    } else r.push({ category, module, title, reason, weight });
  };

  if (has(a, "etapa", "idea")) add("idea", "idea", "Evaluar tu idea y darle forma", "Indicaste que tu empresa aún es una idea.", 3);
  if (has(a, "etapa", "constitucion") || has(a, "preocupaciones", "constituir"))
    add("constitucion", "create", "Constituir tu empresa", "Quieres constituir la empresa.", 4);
  if (has(a, "preocupaciones", "inicio_actividades") || (has(a, "etapa", "inicio") && has(a, "documentos", "ninguno", "no_se")))
    add("formalizacion", "formaliza", "Formalizar: inicio de actividades", "Mencionaste el inicio de actividades o aún no emites documentos.", 3);
  if (has(a, "preocupaciones", "patente_permisos"))
    add("formalizacion", "formaliza", "Patente y permisos", "Te preocupan la patente o los permisos.", 3);

  if (has(a, "preocupaciones", "impuestos_atrasados", "observaciones_sii") || has(a, "etapa", "regularizar"))
    add("tributario", "contabilidad", "Regularizar tu situación tributaria",
      "Señalaste impuestos atrasados, observaciones del SII o pendientes por regularizar.", 5);
  if (has(a, "preocupaciones", "elegir_regimen"))
    add("tributario", "contabilidad", "Elegir el régimen tributario", "Quieres saber qué régimen te conviene.", 3);

  const runs = has(a, "etapa", "inicio", "operando", "regularizar");
  if (runs && has(a, "contabilidad", "nadie", "yo", "no_se"))
    add("contabilidad", "contabilidad", "Poner al día tu contabilidad", "Hoy nadie externo lleva tu contabilidad.", 4);
  if (has(a, "preocupaciones", "ordenar_contabilidad"))
    add("contabilidad", "contabilidad", "Ordenar tu contabilidad", "Quieres ordenar la contabilidad.", 3);
  if (has(a, "preocupaciones", "remuneraciones") || (runs && has(a, "trabajadores", "1_5", "6_20", "mas_20")))
    add("contabilidad", "contabilidad", "Remuneraciones y cotizaciones", "Tienes o tendrás trabajadores con contrato.", 2);

  if (has(a, "preocupaciones", "marca")) add("marcas", "brand", "Proteger tu marca", "Quieres proteger tu marca.", 3);
  if (has(a, "preocupaciones", "contratos")) add("profesionales", "legal", "Revisar tus contratos", "Te preocupan los contratos.", 2);
  if (has(a, "preocupaciones", "financiamiento")) add("crecimiento", "crece", "Fondos y financiamiento", "Buscas financiamiento o fondos.", 2);
  if (has(a, "preocupaciones", "crecer")) add("gestion", "gestion", "Ordenar y hacer crecer el negocio", "Quieres ordenar y hacer crecer el negocio.", 2);

  if (has(a, "urgencia", "vence_pronto")) r.forEach((x) => { if (x.weight >= 4) x.weight += 2; });
  return r.sort((x, y) => y.weight - x.weight).slice(0, 4);
}
