import { LEGAL_VERSION } from "@/lib/site";

// Versión de los Términos y de la Política de privacidad que acepta quien se registra: la misma que muestran
// /terminos y /privacidad (LEGAL_VERSION en lib/site.ts). Al cambiar esos textos, cambia LEGAL_VERSION: las
// cuentas nuevas quedan registradas con la versión que aceptaron (private.consentimientos, migración 0044).
export const TERMINOS_VERSION = LEGAL_VERSION;
export const PRIVACIDAD_VERSION = LEGAL_VERSION;

export const DERECHOS: Record<string, { label: string; help: string }> = {
  acceso: { label: "Acceso", help: "Saber qué datos tuyos tiene ENQORA y recibir una copia." },
  rectificacion: { label: "Rectificación", help: "Corregir datos inexactos o incompletos." },
  supresion: { label: "Supresión", help: "Eliminar tus datos, salvo los que la ley obliga a conservar." },
  oposicion: { label: "Oposición", help: "Que dejemos de tratar tus datos para un fin determinado." },
  portabilidad: { label: "Portabilidad", help: "Recibir tus datos en un formato que puedas llevar a otro proveedor." },
  bloqueo: { label: "Bloqueo", help: "Suspender temporalmente el tratamiento mientras se resuelve otra solicitud." },
};
export const DERECHO_ESTADO: Record<string, { label: string; tone: string }> = {
  recibida: { label: "Recibida", tone: "gold" },
  en_curso: { label: "En curso", tone: "gold" },
  respondida: { label: "Respondida", tone: "ok" },
  rechazada: { label: "Resuelta (no procede)", tone: "muted" },
};
