// Mandato Digital del SII (0055): la forma en que ENQORA actúa ante el SII por un cliente sin conocer su clave.
// Guía oficial: https://www.sii.cl/servicios_online/docs/guia_mandato_digital_y_representar.pdf

export type SiiMandate = {
  id: string; case_id: string; company_id: string; mandatario_id: string | null; mandatario_nombre: string; mandatario_rut: string;
  tramites: string[]; vence: string; status: "solicitado" | "otorgado" | "aceptado" | "revocado" | "cancelado";
  requested_at: string; granted_at: string | null; accepted_at: string | null; revoked_at: string | null; note: string | null;
};

// Nombres tal como aparecen en el menú «Trámite» del SII.
export const SII_TRAMITES: Record<string, string> = {
  dj_renta: "Presentar Declaraciones Juradas de Renta F22",
  declarar_f22: "Declarar Renta (F22)",
  rectificar_f22: "Corregir y rectificar declaración de Renta (F22)",
  rectificar_dj: "Corregir o rectificar declaraciones juradas de Renta F22",
  giros_condonaciones: "Infracciones, pago de giros y condonaciones",
  info_ingresos: "Información de sus ingresos, agentes retenedores y otros",
  dj_mensuales: "Ingresar Declaraciones Juradas mensuales",
  termino_giro: "Término de giro",
};

export const SII_MANDATE_STATUS: Record<SiiMandate["status"], { label: string; tone: "gold" | "ok" | "muted" | "warn" }> = {
  solicitado: { label: "Esperando que lo otorgues en el SII", tone: "gold" },
  otorgado: { label: "Otorgado · falta que ENQORA lo acepte", tone: "warn" },
  aceptado: { label: "Vigente", tone: "ok" },
  revocado: { label: "Revocado", tone: "muted" },
  cancelado: { label: "Anulado", tone: "muted" },
};

export const SII_RUTA = "sii.cl → Servicios online → Clave tributaria, mandatario digital y representantes electrónicos → Mandatario Digital → Administración y gestión de mandatos";

export const formatoRut = (rut: string) => {
  const [n, dv] = rut.split("-");
  return `${Number(n).toLocaleString("es-CL")}-${dv}`;
};
