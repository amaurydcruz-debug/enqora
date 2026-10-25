// Catálogo, estados y roles de casos. Utilizable en servidor y navegador.

export const MODULES = {
  contabilidad: { name: "ENQORA CONTABILIDAD", help: "IVA, F29, conciliación, libros, renta" },
  create: { name: "ENQORA CREATE", help: "Crear y constituir una empresa" },
  formaliza: { name: "ENQORA FORMALIZA", help: "Inicio de actividades, patentes y permisos" },
  brand: { name: "ENQORA BRAND", help: "Nombre, logotipo, marca e INAPI" },
  legal: { name: "ENQORA LEGAL", help: "Contratos, modificaciones y regularización" },
  gestion: { name: "ENQORA GESTIÓN", help: "Clientes, inventario, caja y personas" },
  crece: { name: "ENQORA CRECE", help: "Financiamiento, fondos y expansión" },
  idea: { name: "ENQORA IDEA", help: "Evaluar una idea de negocio" },
  general: { name: "Consulta general", help: "Otro tema o no sabes a qué área corresponde" },
} as const;
export type ModuleKey = keyof typeof MODULES;

type Tone = "ok" | "warn" | "muted" | "gold" | "risk";

export const STATUSES: Record<string, { label: string; tone: Tone }> = {
  recibido: { label: "Recibido", tone: "muted" },
  en_investigacion: { label: "En investigación", tone: "gold" },
  diagnostico: { label: "Diagnóstico preparado", tone: "gold" },
  revision_profesional: { label: "En revisión profesional", tone: "gold" },
  devuelto: { label: "Devuelto con observaciones", tone: "warn" },
  esperando_cliente: { label: "Esperando tu respuesta", tone: "warn" },
  autorizacion_cliente: { label: "Pendiente de tu autorización", tone: "warn" },
  en_ejecucion: { label: "En ejecución", tone: "gold" },
  verificacion: { label: "En verificación", tone: "gold" },
  cerrado: { label: "Cerrado", tone: "ok" },
  cancelado: { label: "Cancelado", tone: "muted" },
};

// Recorrido principal que se muestra al cliente.
export const FLOW = [
  "recibido",
  "en_investigacion",
  "diagnostico",
  "revision_profesional",
  "autorizacion_cliente",
  "en_ejecucion",
  "verificacion",
  "cerrado",
] as const;

export const CLOSED = ["cerrado", "cancelado"];

export const PRIORITIES: Record<string, string> = {
  baja: "Baja",
  normal: "Normal",
  alta: "Alta",
  urgente: "Urgente",
};

export const STAFF_ROLES = {
  enqora_admin: "Administrador ENQORA",
  ops_director: "Director de operaciones",
  accountant_pro: "Contador autorizado",
  lawyer_pro: "Abogado autorizado",
  field_agent: "Gestor presencial",
  ai_agent: "Agente IA",
} as const;
export type StaffRole = keyof typeof STAFF_ROLES;

export const CASE_ROLES: Record<string, string> = {
  responsable: "Responsable",
  apoyo: "Apoyo",
  gestor: "Gestor presencial",
  agente_ia: "Agente IA",
};

export const TASK_STATUSES: Record<string, string> = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  hecha: "Hecha",
  bloqueada: "Bloqueada",
};

export const UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
export const UPLOAD_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/xml",
  "application/xml",
  "text/csv",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
export const UPLOAD_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.xml,.csv,.txt,.xlsx,.xls,.docx";

export type CaseRow = {
  id: string;
  folio: string;
  company_id: string;
  module: ModuleKey;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  responsible_id: string | null;
  result_summary: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

export const isStaffRole = (v: unknown): v is StaffRole => typeof v === "string" && v in STAFF_ROLES;
export const isModule = (v: unknown): v is ModuleKey => typeof v === "string" && v in MODULES;

// Estados en los que el caso espera una acción del cliente.
export const NEEDS_CLIENT = ["esperando_cliente", "autorizacion_cliente"];

// Próximo paso de cada estado, explicado al cliente (se deriva del estado real; no inventa avances).
export const NEXT_STEP: Record<string, string> = {
  recibido: "ENQORA asignará a un profesional responsable",
  en_investigacion: "El equipo investiga tu situación",
  diagnostico: "Se prepara el diagnóstico",
  revision_profesional: "Un profesional revisa el diagnóstico",
  devuelto: "El equipo ajusta la propuesta con las observaciones",
  esperando_cliente: "Revisa lo que ENQORA te envió y responde",
  autorizacion_cliente: "Revisa y decide la autorización solicitada",
  en_ejecucion: "ENQORA ejecuta la solución autorizada",
  verificacion: "Se verifica el resultado",
  cerrado: "Resultado verificado y entregado",
  cancelado: "Solicitud cancelada",
};

export const statusTone = (s: string) => STATUSES[s]?.tone ?? "muted";
export const statusLabel = (s: string) => STATUSES[s]?.label ?? s;
export const statusClass = (s: string) => `badge badge-${STATUSES[s]?.tone ?? "muted"}`;

export function formatBytes(n: number | null | undefined) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
