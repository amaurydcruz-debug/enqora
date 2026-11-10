// Documentos legales del cliente y ficha legal de cada trámite.
// Las reglas viven en supabase/migrations/0036_documentos_legales.sql: ningún caso pasa a «En ejecución»
// sin los documentos exigidos firmados, y solo se firman textos aprobados tras la revisión del estudio jurídico.

type Tone = "muted" | "gold" | "ok" | "warn" | "risk";

export type LegalDocument = {
  id: string;
  code: string;
  kind: "contrato" | "datos" | "veracidad" | "mandato" | "revocacion";
  scope: "empresa" | "caso" | "institucion" | "referencia";
  institution: string | null;
  title: string;
  version: number;
  body: string;
  body_hash: string;
  status: "borrador" | "en_revision" | "aprobado" | "reemplazado" | "retirado";
  review_firm: string | null;
  review_reference: string | null;
  reviewed_on: string | null;
  review_note: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LegalProfile = {
  service_code: string;
  service_name?: string;
  institutions: string[];
  represents: boolean;
  formalidad: string;
  base_legal: string | null;
  verificacion: "confirmada" | "por_confirmar" | "no_aplica";
  fuente_url: string | null;
  nota: string | null;
  updated_at?: string;
};

export type LegalSignature = {
  id: string;
  document_id: string;
  code: string;
  version: number;
  signed_text: string;
  signed_hash: string;
  company_id: string;
  case_id: string | null;
  signer_name: string;
  signer_rut: string;
  signer_role: string;
  evidence: Record<string, unknown>;
  status: "vigente" | "revocada";
  created_at: string;
};

export type CaseLegalStatus = {
  faltan: string[];
  documentos: {
    code: string;
    scope: "empresa" | "caso";
    title: string;
    document_id: string | null;
    version: number | null;
    firma: { id: string; fecha: string; firmante: string } | null;
  }[];
  fichas: LegalProfile[];
};

export const DOC_STATUSES: Record<LegalDocument["status"], { label: string; tone: Tone }> = {
  borrador: { label: "Borrador", tone: "muted" },
  en_revision: { label: "En revisión jurídica", tone: "warn" },
  aprobado: { label: "Aprobado", tone: "ok" },
  reemplazado: { label: "Reemplazado", tone: "muted" },
  retirado: { label: "Retirado", tone: "muted" },
};

export const SCOPES: Record<LegalDocument["scope"], string> = {
  empresa: "Se firma una vez por empresa",
  caso: "Se firma en cada caso",
  institucion: "Plantilla de mandato (se firma en Mandatos)",
  referencia: "Texto de consulta",
};

export const VERIFICACION: Record<LegalProfile["verificacion"], { label: string; tone: Tone }> = {
  confirmada: { label: "Confirmada en fuente oficial", tone: "ok" },
  por_confirmar: { label: "Por confirmar por el estudio", tone: "warn" },
  no_aplica: { label: "Sin actuación ante organismos", tone: "muted" },
};

export type DocState = "firmado" | "por_firmar" | "sin_aprobar";

// Estado de cada documento exigido en un caso: lo mismo que calcula la base, para mostrarlo.
export function estadoDocumento(d: CaseLegalStatus["documentos"][number]): DocState {
  if (!d.document_id) return "sin_aprobar";
  return d.firma ? "firmado" : "por_firmar";
}

export function resumenLegal(s: CaseLegalStatus) {
  const estados = s.documentos.map(estadoDocumento);
  const porFirmar = estados.filter((e) => e === "por_firmar").length;
  const sinAprobar = estados.filter((e) => e === "sin_aprobar").length;
  return {
    listo: s.faltan.length === 0,
    porFirmar,
    sinAprobar,
    firmados: estados.filter((e) => e === "firmado").length,
    texto:
      s.faltan.length === 0
        ? "Documentos legales al día"
        : sinAprobar
          ? `${sinAprobar} en revisión jurídica${porFirmar ? ` · ${porFirmar} por firmar` : ""}`
          : `${porFirmar} por firmar`,
  };
}

// Vista previa: reemplaza los datos de la empresa; los de quien firma se completan al firmar.
export function renderPreview(body: string, data: { empresa?: string; rut?: string; caso?: string; hoy?: string }) {
  return body
    .replaceAll("{{EMPRESA}}", data.empresa ?? "[empresa]")
    .replaceAll("{{RUT_EMPRESA}}", data.rut ?? "[RUT]")
    .replaceAll("{{CASO}}", data.caso ?? "[caso]")
    .replaceAll("{{FECHA}}", data.hoy ?? "[fecha]")
    .replaceAll("{{FIRMANTE}}", "[tu nombre]")
    .replaceAll("{{RUN_FIRMANTE}}", "[tu RUN]")
    .replaceAll("{{CARGO}}", "[tu cargo]");
}

export const PLACEHOLDERS = ["{{EMPRESA}}", "{{RUT_EMPRESA}}", "{{FIRMANTE}}", "{{RUN_FIRMANTE}}", "{{CARGO}}", "{{CASO}}", "{{FECHA}}"];
