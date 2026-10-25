// Diagnóstico ENQORA (M09): tipos y etiquetas compartidas por servidor y navegador.

export type Source = { titulo: string; articulo?: string; vigencia?: string; url?: string };

export type Diagnosis = {
  id: string;
  case_id: string;
  version: number;
  status: "borrador" | "en_revision" | "publicado" | "reemplazado";
  summary: string | null;
  certainty: "alta" | "media" | "baja" | null;
  missing: string | null;
  approval_id: string | null;
  review_note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  published_at: string | null;
  published_by: string | null;
};

export type Finding = {
  id: string;
  diagnosis_id: string;
  position: number;
  title: string;
  situation: string;
  obligations: string | null;
  sources: Source[];
  causes: string | null;
  corrections: string | null;
  benefits: string | null;
  risk_level: "bajo" | "medio" | "alto";
  risk: string | null;
  service_id: string | null;
  cost_min: number | null;
  cost_max: number | null;
  cost_note: string | null;
  certainty: "alta" | "media" | "baja";
  missing: string | null;
  quote_requested_at: string | null;
};

export const DIAGNOSIS_STATUSES: Record<Diagnosis["status"], { label: string; tone: "muted" | "gold" | "ok" }> = {
  borrador: { label: "Borrador", tone: "muted" },
  en_revision: { label: "En revisión profesional", tone: "gold" },
  publicado: { label: "Entregado al cliente", tone: "ok" },
  reemplazado: { label: "Reemplazado", tone: "muted" },
};

export const CERTAINTY: Record<string, { label: string; help: string }> = {
  alta: { label: "Certeza alta", help: "Los antecedentes entregados lo confirman." },
  media: { label: "Certeza media", help: "Es probable, pero falta confirmar algunos antecedentes." },
  baja: { label: "Certeza baja", help: "Es una hipótesis inicial que requiere más antecedentes." },
};

export const RISK: Record<string, { label: string; tone: "ok" | "gold" | "risk" }> = {
  bajo: { label: "Riesgo bajo", tone: "ok" },
  medio: { label: "Riesgo medio", tone: "gold" },
  alto: { label: "Riesgo alto", tone: "risk" },
};

export const pad2 = (n: number) => String(n).padStart(2, "0");

export const FREE_DIAGNOSIS_NOTE =
  "Diagnóstico preliminar: no es una resolución oficial ni garantiza resultados que dependen del SII, una municipalidad, un tribunal u otra institución.";
