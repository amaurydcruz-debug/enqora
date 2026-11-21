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
  // Aprobación del cliente (0066).
  cliente_aprobo_at?: string | null;
  cliente_aprobo_texto?: string | null;
  cliente_observacion?: string | null;
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

// ---------- «Tu mes» (0066): ciclo mensual de la contabilidad ----------
export type EtapaMes = "esperando_datos" | "datos" | "revision" | "por_aprobar" | "aprobado_cliente" | "presentado";
export type TuMes = {
  periodo: string; etapa: EtapaMes; lleva: boolean; faltan: ("ventas" | "compras" | "cartola")[];
  ventas: number; compras: number; movimientos: number; mandato: boolean; plan: string | null; vence_12: string; vence_20: string;
  f29: null | {
    id: string; estado: VatReturn["status"]; version: number; debito: number; credito: number; iva: number; remanente: number;
    ppm: number; retenciones: number; total: number; nota_revision: string | null; aprobado_cliente: string | null;
    texto_aprobacion: string | null; folio: string | null; presentado: string | null; observacion: string | null;
  };
};
// Los 4 pasos que ve el cliente (la etapa «esperando_datos» y «datos» son el mismo paso: reunir datos).
export const PASOS_MES: { clave: EtapaMes[]; titulo: string; texto: string }[] = [
  { clave: ["esperando_datos", "datos"], titulo: "Datos del mes", texto: "Ventas y compras del SII y la cartola del banco." },
  { clave: ["revision"], titulo: "En revisión", texto: "Los agentes concilian y un contador ENQORA revisa." },
  { clave: ["por_aprobar"], titulo: "Listo para aprobar", texto: "Revisa el resumen y apruébalo." },
  { clave: ["aprobado_cliente", "presentado"], titulo: "Presentado", texto: "F29 presentado con su folio del SII." },
];
export const pasoDe = (e: EtapaMes) => PASOS_MES.findIndex((p) => p.clave.includes(e));
export const FALTA_TEXTO: Record<string, { titulo: string; conMandato: string; sinMandato: string }> = {
  ventas: { titulo: "Ventas del mes", conMandato: "ENQORA las trae del Registro de Compras y Ventas del SII con tu Mandato Digital.", sinMandato: "Sube el detalle de ventas del Registro de Compras y Ventas (se descarga en sii.cl)." },
  compras: { titulo: "Compras del mes", conMandato: "ENQORA las trae del Registro de Compras y Ventas del SII con tu Mandato Digital.", sinMandato: "Sube el detalle de compras del Registro de Compras y Ventas (se descarga en sii.cl)." },
  cartola: { titulo: "Cartola del banco", conMandato: "Sube la cartola del mes (Excel o CSV de tu banco).", sinMandato: "Sube la cartola del mes (Excel o CSV de tu banco)." },
};
