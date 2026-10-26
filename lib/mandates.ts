// Mandatos y actuaciones ante instituciones (M11): tipos y etiquetas compartidas.
// Las reglas viven en supabase/migrations/0012_mandatos_notificaciones.sql.

export const INSTITUTIONS: Record<string, string> = {
  sii: "Servicio de Impuestos Internos (SII)",
  tgr: "Tesorería General de la República",
  inapi: "INAPI",
  registro_empresas: "Registro de Empresas y Sociedades",
  municipalidad: "Municipalidad",
  direccion_trabajo: "Dirección del Trabajo",
  cbr: "Conservador de Bienes Raíces",
  notaria: "Notaría",
  tribunal: "Tribunal",
  otra: "Otra institución",
};

export type Mandate = {
  id: string;
  folio: string;
  company_id: string;
  case_id: string | null;
  kind: "simple" | "notarial";
  representative_name: string;
  representative_rut: string | null;
  institutions: string[];
  procedures: string;
  scope: string;
  valid_from: string;
  valid_until: string;
  status: "borrador" | "pendiente_firma" | "en_verificacion" | "vigente" | "revocado" | "vencido" | "anulado";
  observation: string | null;
  signer_name: string | null;
  signer_rut: string | null;
  signer_role: string | null;
  accepted_by: string | null;
  accepted_at: string | null;
  document_path: string | null;
  document_name: string | null;
  document_uploaded_at: string | null;
  verification: Record<string, unknown>;
  verified_by: string | null;
  verified_at: string | null;
  prepared_by: string | null;
  created_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
};

export type CaseAction = {
  id: string;
  case_id: string;
  company_id: string;
  institution: string;
  procedure: string;
  detail: string | null;
  mandate_id: string | null;
  authorization_id: string | null;
  status: "planificada" | "verificada" | "ejecutada" | "fallida" | "cancelada";
  checks: { mandato_vigente?: boolean; autorizacion_vigente?: boolean };
  planned_by: string | null;
  created_at: string;
  verified_by: string | null;
  verified_at: string | null;
  executed_by: string | null;
  executed_at: string | null;
  result: string | null;
};

type Tone = "muted" | "gold" | "ok" | "warn" | "risk";

export const MANDATE_KINDS: Record<Mandate["kind"], { label: string; help: string }> = {
  simple: { label: "Mandato simple", help: "Firmado por el representante legal; algunas instituciones lo aceptan para trámites determinados." },
  notarial: { label: "Mandato notarial", help: "Otorgado ante notario (escritura o firma autorizada). Lo exigen trámites de mayor alcance." },
};

export const MANDATE_STATUSES: Record<Mandate["status"], { label: string; tone: Tone }> = {
  borrador: { label: "Borrador interno", tone: "muted" },
  pendiente_firma: { label: "Pendiente de firma", tone: "gold" },
  en_verificacion: { label: "En verificación", tone: "warn" },
  vigente: { label: "Vigente", tone: "ok" },
  revocado: { label: "Revocado", tone: "muted" },
  vencido: { label: "Vencido", tone: "muted" },
  anulado: { label: "Anulado", tone: "muted" },
};

export const ACTION_STATUSES: Record<CaseAction["status"], { label: string; tone: Tone }> = {
  planificada: { label: "Planificada", tone: "muted" },
  verificada: { label: "Habilitada", tone: "gold" },
  ejecutada: { label: "Realizada", tone: "ok" },
  fallida: { label: "No se completó", tone: "risk" },
  cancelada: { label: "Cancelada", tone: "muted" },
};

export const VERIFY_CHECKS: { key: string; label: string }[] = [
  { key: "identidad_firmante", label: "Identidad de quien firma comprobada (cédula vigente)" },
  { key: "representacion_legal", label: "Quien firma es representante legal con facultades suficientes" },
  { key: "documento_coincide", label: "El documento firmado coincide con el texto, el alcance y la vigencia preparados" },
  { key: "requisitos_institucion", label: "Cumple los requisitos de cada institución (tipo de mandato, formato, firma)" },
];

export const instList = (codes: string[]) => codes.map((c) => INSTITUTIONS[c] ?? c).join(", ");
