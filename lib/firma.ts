// ENQORA SIGN (0060) · Fase 1: firma electrónica simple propia, sobre la Bóveda.
// Solo datos y textos: las reglas (quién firma, turno, lectura, código reciente, huella) viven en la base.

export type Calidad = "cliente" | "representante_legal" | "profesional_enqora" | "contraparte" | "trabajador" | "empleador";

export const CALIDADES: Record<Calidad, string> = {
  cliente: "Cliente",
  representante_legal: "Representante legal",
  empleador: "Empleador",
  trabajador: "Trabajador",
  contraparte: "Contraparte",
  profesional_enqora: "Profesional ENQORA",
};

export const ESTADOS_SOLICITUD: Record<string, { texto: string; tono: "gold" | "ok" | "muted" | "info" }> = {
  pendiente: { texto: "En firma", tono: "gold" },
  completada: { texto: "Firmado por todas las partes", tono: "ok" },
  rechazada: { texto: "Rechazado por una parte", tono: "muted" },
  anulada: { texto: "Solicitud anulada", tono: "muted" },
};

export const ESTADOS_FIRMANTE: Record<string, string> = { pendiente: "Pendiente", firmado: "Firmó", rechazado: "Rechazó" };

export const NIVELES: Record<string, string> = {
  simple: "Firma electrónica simple (Ley 19.799)",
  avanzada: "Firma electrónica avanzada (prestador acreditado)",
};

// Texto que el firmante acepta. Si cambia, cambia la versión (queda en la evidencia de cada firma).
export const TEXTO_ACEPTACION_VERSION = "FES-1";
export const TEXTO_ACEPTACION =
  "Leí el documento completo. Al confirmar con mi huella, Face ID o código del autenticador, firmo electrónicamente este documento con firma electrónica simple " +
  "(Ley 19.799), con el mismo efecto que mi firma manuscrita, y acepto su contenido en la versión identificada por su huella SHA-256.";

// Mapa de firma: qué documento se firma dónde. La base aplica la misma regla (private.sign_no_admitida).
export function admiteFirma(tipo: string, clase: string): { ok: true } | { ok: false; motivo: string } {
  if (tipo === "finiquito") return { ok: false, motivo: "El finiquito con valor de ratificación se firma en el portal de la Dirección del Trabajo (Ley 21.361). ENQORA lo prepara; la firma ocurre allí." };
  if (tipo === "escritura_publica" || tipo === "escritura") return { ok: false, motivo: "Las escrituras públicas se otorgan ante notario: la ley no admite firma electrónica para ellas." };
  if (["identidad", "evidencia", "respaldo_tributario", "respaldo_contable", "respaldo_laboral"].includes(clase)) return { ok: false, motivo: "Los respaldos y archivos del caso no se firman: se conservan." };
  return { ok: true };
}

export const MAPA_FIRMA: { documento: string; donde: string }[] = [
  { documento: "Contratos de servicios, contratos de trabajo y anexos, poderes simples, aceptaciones, actas, cartas y declaraciones simples", donde: "ENQORA SIGN · firma electrónica simple" },
  { documento: "Finiquito con valor de ratificación", donde: "Portal de la Dirección del Trabajo" },
  { documento: "Escrituras públicas y actos que exigen presencia personal o de derecho de familia", donde: "Notaría o el organismo que corresponda" },
  { documento: "Documentos que la ley o la institución exigen con firma avanzada", donde: "Prestador acreditado (fase 2 de ENQORA SIGN)" },
];

// Código de verificación impreso en el documento: los primeros 20 caracteres del sello final.
export const codigoVerificacion = (sello: string | null | undefined) =>
  sello ? sello.slice(0, 20).toUpperCase().replace(/(.{4})(?=.)/g, "$1-") : null;

export const FOLIO_RE = /^(FIR|DOC)-\d{4}-\d{6}$/;
export function normalizarCodigo(c: string): string {
  return c.replace(/[^0-9a-fA-F]/g, "").toLowerCase();
}
