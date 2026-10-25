// Catálogo y motor de precios (M07 / Etapa 6). Utilizable en servidor y navegador.
// El precio oficial lo calcula la base de datos (private.quote_calc); `previewQuote` replica
// la misma fórmula solo para mostrar una vista previa mientras el equipo completa el formulario.

export const UNITS: Record<string, { label: string; per: string; plural: string }> = {
  caso: { label: "Por caso", per: "caso", plural: "casos" },
  mes: { label: "Mensual", per: "mes", plural: "meses" },
  trabajador: { label: "Por trabajador", per: "trabajador", plural: "trabajadores" },
  documento: { label: "Por documento", per: "documento", plural: "documentos" },
  hora: { label: "Por hora", per: "hora", plural: "horas" },
};

export const COMPLEXITY: Record<string, string> = {
  simple: "Simple",
  media: "Media",
  compleja: "Compleja",
  especializada: "Especializada",
};

export const TARIFF_STATUSES: Record<string, { label: string; tone: "ok" | "gold" | "muted" }> = {
  borrador: { label: "Borrador", tone: "gold" },
  vigente: { label: "Vigente", tone: "ok" },
  retirada: { label: "Retirada", tone: "muted" },
};

export const QUOTE_STATUSES: Record<string, { label: string; tone: "ok" | "gold" | "muted" | "risk" | "warn" }> = {
  pendiente_aprobacion: { label: "En revisión interna", tone: "gold" },
  observada: { label: "Observada en revisión", tone: "risk" },
  enviada: { label: "Espera tu decisión", tone: "warn" },
  aceptada: { label: "Aceptada", tone: "ok" },
  rechazada: { label: "No aceptada", tone: "muted" },
  anulada: { label: "Anulada", tone: "muted" },
  vencida: { label: "Vencida", tone: "muted" },
};

export const REVIEW_REASONS: Record<string, string> = {
  fuera_de_rango: "Precio o descuento fuera de los parámetros de la tarifa",
  criterio_profesional: "El servicio exige criterio profesional antes de confirmar el precio",
  propuesta_de_agente: "Propuesta de un agente IA: siempre la revisa una persona",
};

export const REFERENCE_MAX_DAYS = 180;

export type Service = {
  id: string;
  code: string;
  module: string;
  name: string;
  summary: string | null;
  scope: string;
  exclusions: string | null;
  unit: string;
  requires_professional: boolean;
  active: boolean;
};

export type Tariff = {
  id: string;
  service_id: string;
  version: number;
  status: string;
  base_price: number;
  factor_media: number;
  factor_compleja: number;
  factor_especializada: number;
  onsite_fee: number;
  urgency_pct: number;
  max_discount_pct: number;
  min_price: number;
  max_price: number;
  est_hours: number | null;
  specialty: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  published_by: string | null;
  published_at: string | null;
};

export type MarketReference = {
  id: string;
  service_id: string;
  provider: string;
  url: string;
  consulted_on: string;
  scope_note: string | null;
  amount_min: number;
  amount_max: number | null;
  unit: string;
  created_by: string | null;
};

export type Quote = {
  id: string;
  case_id: string;
  service_id: string;
  tariff_version: number;
  service_code: string;
  service_name: string;
  unit: string;
  scope: string;
  exclusions: string | null;
  complexity: string;
  quantity: number;
  onsite: boolean;
  urgent: boolean;
  discount_pct: number;
  discount_reason: string | null;
  external_costs: number;
  external_detail: string | null;
  payment_terms: string | null;
  valid_until: string;
  subtotal: number;
  urgency_amount: number;
  onsite_amount: number;
  standard_price: number;
  discount_amount: number;
  final_price: number;
  within_range: boolean;
  review_reasons: string[];
  status: string;
  created_by: string | null;
  created_at: string;
  sent_at: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
};

export const clp = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

export const todayCL = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());

// Estado visible: una cotización enviada cuya validez pasó se muestra como vencida.
export const quoteStatus = (q: Pick<Quote, "status" | "valid_until">) =>
  q.status === "enviada" && q.valid_until < todayCL() ? "vencida" : q.status;

export const referenceIsFresh = (r: Pick<MarketReference, "consulted_on">) => {
  const days = (Date.parse(todayCL()) - Date.parse(r.consulted_on)) / 86400000;
  return days <= REFERENCE_MAX_DAYS;
};

// Misma fórmula que private.quote_calc (redondeos idénticos).
export function previewQuote(
  t: Pick<Tariff, "base_price" | "factor_media" | "factor_compleja" | "factor_especializada" | "onsite_fee" | "urgency_pct" | "max_discount_pct" | "min_price" | "max_price">,
  v: { complexity: string; quantity: number; onsite: boolean; urgent: boolean; discountPct: number },
) {
  const factor = { simple: 1, media: Number(t.factor_media), compleja: Number(t.factor_compleja), especializada: Number(t.factor_especializada) }[v.complexity] ?? 1;
  const qty = Math.max(1, Math.floor(v.quantity || 1));
  const subtotal = Math.round(t.base_price * factor) * qty;
  const urgency = v.urgent ? Math.round((subtotal * t.urgency_pct) / 100) : 0;
  const onsite = v.onsite ? t.onsite_fee : 0;
  const standard = subtotal + urgency + onsite;
  const discount = Math.round((standard * (v.discountPct || 0)) / 100);
  const final = standard - discount;
  const reasons: string[] = [];
  if ((v.discountPct || 0) > t.max_discount_pct) reasons.push("Descuento sobre el máximo permitido");
  if (final < t.min_price * qty) reasons.push("Precio bajo el mínimo");
  if (final > t.max_price * qty) reasons.push("Precio sobre el máximo");
  return { subtotal, urgency, onsite, standard, discount, final, within: reasons.length === 0, reasons };
}
