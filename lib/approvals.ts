// Aprobaciones internas y autorizaciones del cliente (Etapa 5). Utilizable en servidor y navegador.

export const APPROVAL_KINDS: Record<string, { label: string; help: string }> = {
  diagnostico: { label: "Diagnóstico", help: "Revisión profesional del diagnóstico antes de entregarlo al cliente" },
  cierre: { label: "Cierre del caso", help: "Validar que la solución quedó ejecutada y verificada" },
  precio: { label: "Precio", help: "Precio o descuento fuera de la tarifa vigente" },
  excepcion: { label: "Excepción", help: "Excepción a un procedimiento o plazo" },
  actuacion: { label: "Actuación", help: "Actuar ante una institución en nombre del cliente" },
  otro: { label: "Otro", help: "Otra decisión que requiere aprobación" },
};

export const APPROVER_ROLES: Record<string, string> = {
  responsable: "Responsable del caso",
  accountant_pro: "Contador autorizado",
  lawyer_pro: "Abogado autorizado",
  supervisor: "Supervisión ENQORA",
};

// Estado que toma el caso al aprobar (opcional).
export const ON_APPROVE_STATUSES: Record<string, string> = {
  autorizacion_cliente: "Pedir autorización al cliente",
  en_ejecucion: "Pasar a ejecución",
  verificacion: "Pasar a verificación",
  esperando_cliente: "Pedir antecedentes al cliente",
  en_investigacion: "Volver a investigación",
  diagnostico: "Diagnóstico preparado",
};

type Tone = "ok" | "warn" | "muted" | "gold" | "risk";

export const APPROVAL_STATUSES: Record<string, { label: string; tone: Tone }> = {
  pendiente: { label: "Pendiente", tone: "warn" },
  aprobada: { label: "Aprobada", tone: "ok" },
  rechazada: { label: "Rechazada", tone: "risk" },
  devuelta: { label: "Devuelta con observaciones", tone: "warn" },
  anulada: { label: "Anulada", tone: "muted" },
};

export const AUTH_STATUSES: Record<string, { label: string; tone: Tone }> = {
  pendiente: { label: "Pendiente de tu decisión", tone: "warn" },
  autorizada: { label: "Autorizada", tone: "ok" },
  vencida: { label: "Vencida", tone: "muted" },
  rechazada: { label: "Rechazada", tone: "muted" },
  revocada: { label: "Revocada", tone: "muted" },
  anulada: { label: "Anulada por ENQORA", tone: "muted" },
};

export type Approval = {
  id: string;
  case_id: string;
  kind: string;
  title: string;
  detail: string | null;
  payload: Record<string, unknown>;
  approver_role: string;
  on_approve_status: string | null;
  status: string;
  requested_by: string | null;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  self_decided: boolean;
};

export type ClientAuthorization = {
  id: string;
  case_id: string;
  company_id: string;
  title: string;
  scope: string;
  institution: string | null;
  valid_until: string | null;
  status: string;
  requested_by: string | null;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  revoked_by: string | null;
  revoked_at: string | null;
};

export type InboxItem = {
  id: string;
  case_id: string;
  folio: string;
  case_title: string;
  company_id: string;
  kind: string;
  title: string;
  approver_role: string;
  requested_by: string | null;
  requested_at: string;
  own_request: boolean;
};

// Fecha de hoy en Chile (AAAA-MM-DD).
export const todayCL = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );

// Estado visible: una autorización otorgada con plazo cumplido se muestra como vencida.
export const authStatus = (a: Pick<ClientAuthorization, "status" | "valid_until">) =>
  a.status === "autorizada" && a.valid_until && a.valid_until < todayCL() ? "vencida" : a.status;

export const badgeClass = (tone: Tone | undefined) => `badge badge-${tone ?? "muted"}`;
