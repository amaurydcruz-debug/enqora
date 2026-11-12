// Despacho en terreno (0053): encargos presenciales preparados por ENQORA, revisados por el abogado cuando
// corresponde, despachados a un gestor que declara su hora estimada de llegada, y verificados por otra persona.

type Tone = "muted" | "gold" | "ok" | "warn" | "risk";

export type FieldStatus =
  | "preparacion" | "revision_juridica" | "observado" | "listo" | "asignado" | "en_camino" | "en_oficina"
  | "realizado" | "no_realizado" | "verificado" | "cancelado";

export const FIELD_STATUS: Record<FieldStatus, { label: string; tone: Tone }> = {
  preparacion: { label: "En preparación", tone: "muted" },
  revision_juridica: { label: "Revisión del abogado", tone: "warn" },
  observado: { label: "Observado por el abogado", tone: "risk" },
  listo: { label: "Listo para despachar", tone: "gold" },
  asignado: { label: "Asignado · espera aceptación", tone: "gold" },
  en_camino: { label: "En camino", tone: "ok" },
  en_oficina: { label: "En la oficina", tone: "ok" },
  realizado: { label: "Realizado · por verificar", tone: "warn" },
  no_realizado: { label: "No realizado · por revisar", tone: "risk" },
  verificado: { label: "Verificado", tone: "ok" },
  cancelado: { label: "Cancelado", tone: "muted" },
};

export const CUSTODY: Record<string, string> = {
  por_recibir: "Por recibir",
  con_gestor: "Con el gestor",
  entregado_oficina: "Entregado en la oficina",
  devuelto_cliente: "Devuelto al cliente",
  no_aplica: "No aplica",
};

export const INSTITUTIONS: Record<string, string> = {
  sii: "SII", tgr: "Tesorería", inapi: "INAPI", registro_empresas: "Registro de Empresas", municipalidad: "Municipalidad",
  direccion_trabajo: "Dirección del Trabajo", cbr: "Conservador de Bienes Raíces", notaria: "Notaría", tribunal: "Tribunal", otra: "Otra",
};

export type FieldTaskType = {
  code: string; name: string; institution: string; requires_lawyer: boolean; requires_mandate: boolean;
  checklist: string[]; guidance: string | null; source_url: string | null; gestor_fee: number | null; active: boolean;
};

export type FieldTask = {
  id: string; folio: string; case_id: string; company_id: string; type_code: string; office_name: string; office_address: string;
  comuna: string | null; instructions: string | null; due_date: string | null; status: FieldStatus; created_by: string | null;
  lawyer_id: string | null; lawyer_note: string | null; lawyer_at: string | null; gestor_id: string | null; gestor_fee: number | null;
  assigned_at: string | null; eta: string | null; arrived_at: string | null; done_at: string | null; receipt: string | null;
  result: string | null; verified_by: string | null; verified_at: string | null; payout_id: string | null; created_at: string; updated_at: string;
};

export type MiEncargo = {
  id: string; folio: string; estado: FieldStatus; tipo: string; oficina: string; direccion: string; comuna: string | null;
  instrucciones: string | null; vence: string | null; pago: number | null; eta: string | null; asignado: string | null;
  guia: string | null; empresa: string; documentos: { id: string; nombre: string; custodia: string }[];
};

export const clp = (n: number | null | undefined) => (n == null ? "—" : `$${n.toLocaleString("es-CL")}`);
export const hora = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("es-CL", { timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(iso)) : "—";
export const fechaHora = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(iso)) : "—";

// Columnas del tablero de despacho.
export const COLUMNAS: { key: string; titulo: string; estados: FieldStatus[] }[] = [
  { key: "preparar", titulo: "Por preparar o corregir", estados: ["preparacion", "observado"] },
  { key: "abogado", titulo: "Con el abogado", estados: ["revision_juridica"] },
  { key: "despachar", titulo: "Listos para despachar", estados: ["listo"] },
  { key: "curso", titulo: "En terreno", estados: ["asignado", "en_camino", "en_oficina"] },
  { key: "verificar", titulo: "Por verificar", estados: ["realizado", "no_realizado"] },
];

// ¿La hora estimada ya pasó? (para marcar atraso en el tablero)
export const atrasado = (t: Pick<FieldTask, "status" | "eta">, now = Date.now()) =>
  t.status === "en_camino" && !!t.eta && new Date(t.eta).getTime() < now - 10 * 60_000;
