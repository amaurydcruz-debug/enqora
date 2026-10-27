// Textos de la auditoría independiente (compartidos por servidor y navegador).
export const DECISION_TEXT: Record<string, string> = {
  aprobar: "Auditoría sin observaciones importantes.",
  corregir: "La auditoría pidió correcciones.",
  investigar: "La auditoría pidió verificar normas o fuentes.",
  falta_dato: "La auditoría necesita antecedentes del cliente.",
  escalar: "La auditoría escaló el caso a la supervisión.",
};
export const VERDICT_LABEL: Record<string, { label: string; tone: "ok" | "gold" | "risk" | "muted" }> = {
  aprobada: { label: "Auditada: sin observaciones", tone: "ok" },
  corregir: { label: "Auditoría: corregir", tone: "gold" },
  investigar: { label: "Auditoría: verificar fuente", tone: "gold" },
  falta_dato: { label: "Auditoría: faltan datos", tone: "gold" },
  escalar: { label: "Auditoría: escalada a supervisión", tone: "risk" },
};
export const AUDIT_STATUS: Record<string, string> = {
  no_aplica: "Sin auditoría automática",
  pendiente: "Auditoría pendiente",
  auditando: "Auditoría en curso",
  auditada: "Auditada",
  fallida: "Auditoría no completada",
};
export const OBS_TYPE: Record<string, string> = {
  norma: "Norma", fuente: "Fuente", calculo: "Cálculo", hechos: "Hechos", riesgo: "Riesgo", reglas: "Reglas ENQORA", redaccion: "Redacción",
};
