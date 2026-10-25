// Planes, suscripciones, cobros y pagos (M10): tipos y etiquetas compartidas.
// Las reglas viven en supabase/migrations/0011_planes_pagos.sql.

export type PlanLine = "plataforma" | "contabilidad_profesional";

export type Plan = {
  id: string;
  code: string;
  line: PlanLine;
  name: string;
  summary: string | null;
  scope: string;
  exclusions: string | null;
  limit_documents: number | null;
  limit_operations: number | null;
  limit_workers: number | null;
  included_services: string[];
  renewal_terms: string | null;
  cancellation_terms: string | null;
  position: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type PlanPrice = {
  id: string;
  plan_id: string;
  version: number;
  status: "borrador" | "vigente" | "retirada";
  monthly_price: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  published_by: string | null;
  published_at: string | null;
};

export type Subscription = {
  id: string;
  company_id: string;
  plan_id: string;
  plan_code: string;
  plan_name: string;
  line: PlanLine;
  monthly_price: number;
  status: "pendiente_pago" | "activa" | "vencida" | "cancelada";
  started_on: string | null;
  paid_until: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  created_at: string;
};

export type PlanProposal = {
  id: string;
  case_id: string;
  company_id: string;
  plan_id: string;
  plan_code: string;
  plan_name: string;
  monthly_price: number;
  resolved: string;
  ongoing: string;
  next_month: string | null;
  risks: string | null;
  benefit: string | null;
  valid_until: string;
  status: "pendiente_aprobacion" | "observada" | "enviada" | "aceptada" | "rechazada" | "vencida" | "anulada";
  subscription_id: string | null;
  created_by: string | null;
  created_at: string;
  sent_at: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
};

export type Charge = {
  id: string;
  folio: string;
  company_id: string;
  kind: "cotizacion" | "suscripcion";
  quote_id: string | null;
  subscription_id: string | null;
  case_id: string | null;
  description: string;
  amount: number;
  currency: "CLP";
  period_start: string | null;
  period_end: string | null;
  status: "pendiente" | "en_revision" | "pagado" | "vencido" | "anulado";
  due_date: string;
  paid_at: string | null;
  void_reason: string | null;
  created_at: string;
};

export type Payment = {
  id: string;
  charge_id: string;
  company_id: string;
  method: "transferencia" | "pasarela" | "otro";
  provider: string | null;
  provider_order: string | null;
  media: string | null;
  amount: number;
  status: "iniciado" | "informado" | "confirmado" | "rechazado" | "anulado";
  reference: string | null;
  paid_on: string | null;
  duplicate: boolean;
  reported_by: string | null;
  created_at: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
  review_note: string | null;
};

export type BillingSettings = {
  bank_name: string | null;
  account_type: string | null;
  account_number: string | null;
  holder_name: string | null;
  holder_rut: string | null;
  notify_email: string | null;
  transfer_note: string | null;
};

type Tone = "muted" | "gold" | "ok" | "warn" | "risk";

export const LINES: Record<PlanLine, { name: string; help: string; emblem: string }> = {
  plataforma: {
    name: "ENQORA Plataforma",
    help: "Acceso a la aplicación, herramientas y contabilidad básica automatizada según el plan.",
    emblem: "control",
  },
  contabilidad_profesional: {
    name: "ENQORA Contabilidad Profesional",
    help: "Profesionales que revisan, preparan y presentan tus obligaciones cada mes.",
    emblem: "contabilidad",
  },
};

export const SUBSCRIPTION_STATUSES: Record<Subscription["status"], { label: string; tone: Tone }> = {
  pendiente_pago: { label: "Pendiente de pago", tone: "gold" },
  activa: { label: "Activa", tone: "ok" },
  vencida: { label: "Vencida", tone: "risk" },
  cancelada: { label: "Cancelada", tone: "muted" },
};

export const CHARGE_STATUSES: Record<Charge["status"], { label: string; tone: Tone }> = {
  pendiente: { label: "Por pagar", tone: "gold" },
  en_revision: { label: "Pago en revisión", tone: "warn" },
  pagado: { label: "Pagado", tone: "ok" },
  vencido: { label: "Vencido", tone: "risk" },
  anulado: { label: "Anulado", tone: "muted" },
};

export const PAYMENT_STATUSES: Record<Payment["status"], { label: string; tone: Tone }> = {
  iniciado: { label: "Iniciado en línea", tone: "muted" },
  informado: { label: "Informado, en revisión", tone: "warn" },
  confirmado: { label: "Confirmado", tone: "ok" },
  rechazado: { label: "Rechazado", tone: "risk" },
  anulado: { label: "Anulado", tone: "muted" },
};

export const PAYMENT_METHODS: Record<Payment["method"], string> = {
  transferencia: "Transferencia",
  pasarela: "Pago en línea",
  otro: "Otro medio",
};

export const PROPOSAL_STATUSES: Record<PlanProposal["status"], { label: string; tone: Tone }> = {
  pendiente_aprobacion: { label: "En revisión interna", tone: "gold" },
  observada: { label: "Observada", tone: "warn" },
  enviada: { label: "Espera tu decisión", tone: "gold" },
  aceptada: { label: "Aceptada", tone: "ok" },
  rechazada: { label: "No aceptada", tone: "muted" },
  vencida: { label: "Vencida", tone: "muted" },
  anulada: { label: "Anulada", tone: "muted" },
};

export const payable = (c: Charge) => c.status === "pendiente" || c.status === "vencido";

// Fechas "AAAA-MM-DD" (sin hora) mostradas tal cual, sin desfase por zona horaria.
export const day = (d: string | null | undefined, style: "long" | "medium" = "long") =>
  d ? new Intl.DateTimeFormat("es-CL", { dateStyle: style, timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`)) : "—";

export const moment = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(iso)) : "—";

export const todayCl = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());

export const limitText = (n: number | null, unit: string) => (n == null ? "Según evaluación" : `${n.toLocaleString("es-CL")} ${unit}`);
