// ENQORA CONTABILIDAD (M12): tipos, etiquetas y reglas de presentación.
// Las reglas de cálculo viven en supabase/migrations/0013_contabilidad.sql.

export type AccDocument = {
  id: string;
  period: string;
  book: "compra" | "venta";
  doc_type: number;
  folio: number;
  counterpart_rut: string;
  counterpart_name: string | null;
  issue_date: string | null;
  exempt: number;
  net: number;
  vat: number;
  vat_non_recoverable: number;
  fixed_asset_vat: number;
  common_use_vat: number;
  other_taxes: number;
  total: number;
};

export type BankMovement = {
  id: string;
  period: string;
  account_label: string;
  movement_date: string;
  description: string;
  amount: number;
  balance: number | null;
  reference: string | null;
};

export type Reconciliation = { id: string; movement_id: string; document_id: string | null; category: string | null; note: string | null };

export type VatReturn = {
  id: string;
  period: string;
  version: number;
  status: "borrador" | "en_revision" | "aprobado" | "presentado" | "anulado";
  figures: Record<string, number | string[]>;
  debit: number;
  credit: number;
  prev_remanente: number;
  iva_determinado: number;
  remanente_siguiente: number;
  ppm_base: number;
  ppm_rate: number;
  ppm: number;
  retenciones: number;
  total_pagar: number;
  flags: string[];
  note: string | null;
  prepared_by: string | null;
  prepared_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  presented_folio: string | null;
  presented_on: string | null;
};

export const DOC_TYPES: Record<number, string> = {
  29: "Factura de inicio", 30: "Factura", 32: "Factura exenta", 33: "Factura electrónica", 34: "Factura exenta electrónica",
  35: "Boleta", 38: "Boleta exenta", 39: "Boleta electrónica", 41: "Boleta exenta electrónica", 43: "Liquidación factura",
  45: "Factura de compra", 46: "Factura de compra electrónica", 48: "Comprobante de pago electrónico", 55: "Nota de débito",
  56: "Nota de débito electrónica", 60: "Nota de crédito", 61: "Nota de crédito electrónica", 110: "Factura de exportación",
  111: "Nota de débito de exportación", 112: "Nota de crédito de exportación", 914: "Declaración de ingreso (DIN)",
};
export const docLabel = (t: number) => DOC_TYPES[t] ?? `Tipo ${t}`;
export const docSign = (t: number) => ([60, 61, 106, 112].includes(t) ? -1 : 1);

export const RECON_CATEGORIES: Record<string, string> = {
  comision_bancaria: "Comisión o cargo bancario",
  remuneraciones: "Remuneraciones",
  impuestos: "Pago de impuestos",
  prestamo: "Préstamo o crédito",
  traspaso: "Traspaso entre cuentas",
  aporte_retiro: "Aporte o retiro de socios",
  otro: "Otro",
};

export const VAT_STATUSES: Record<VatReturn["status"], { label: string; tone: "muted" | "gold" | "ok" | "warn" | "risk" }> = {
  borrador: { label: "Borrador", tone: "muted" },
  en_revision: { label: "En revisión profesional", tone: "gold" },
  aprobado: { label: "Aprobado", tone: "ok" },
  presentado: { label: "Presentado", tone: "ok" },
  anulado: { label: "Anulado", tone: "muted" },
};

export const FLAGS: Record<string, string> = {
  facturas_de_compra: "Hay facturas de compra (tipo 46): el IVA lo retiene el comprador y se declara en líneas propias.",
  iva_activo_fijo: "Hay IVA de activo fijo: va en una línea propia del F29.",
  iva_uso_comun: "Hay IVA de uso común: el crédito se calcula con el factor de proporcionalidad.",
  otros_impuestos: "Hay otros impuestos (específicos, adicionales o retenciones) que requieren su propia línea.",
  exportaciones: "Hay operaciones de exportación: se declaran en líneas propias y pueden dar derecho a recuperar IVA.",
  otros_documentos: "Hay documentos de tipos poco frecuentes: revisa su tratamiento.",
  remanente_reajuste_utm: "El remanente del mes anterior se reajusta según la variación de la UTM (cód. 504).",
  ppm_sin_tasa: "Falta la tasa de PPM (cód. 115): el PPM quedó en cero.",
  sin_revision_profesional: "Se presentó sin revisión profesional de ENQORA.",
};

// Período «AAAA-MM» ↔ primer día del mes.
export const periodFromParam = (p: string | undefined) => (p && /^\d{4}-(0[1-9]|1[0-2])$/.test(p) ? `${p}-01` : null);
export const periodParam = (d: string) => d.slice(0, 7);
export const periodLabel = (d: string) => {
  const s = new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d.slice(0, 7)}-01T12:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
};
export const lastPeriods = (n: number, from = new Date()) => {
  const out: string[] = [];
  const base = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
};
export const nextMonthLabel = (d: string) => {
  const dt = new Date(`${d.slice(0, 7)}-01T12:00:00Z`);
  dt.setUTCMonth(dt.getUTCMonth() + 1);
  return new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric", timeZone: "UTC" }).format(dt);
};
