// Datos públicos del sitio y de la empresa responsable (M14).
// Variables en Vercel (públicas, se incorporan al compilar; tras cambiarlas, Redeploy):
//   NEXT_PUBLIC_SITE_URL        dirección pública, p. ej. https://enqora.cl
//   NEXT_PUBLIC_LEGAL_NAME      razón social de la empresa que opera ENQORA
//   NEXT_PUBLIC_LEGAL_RUT       RUT de esa empresa
//   NEXT_PUBLIC_LEGAL_ADDRESS   domicilio legal
//   NEXT_PUBLIC_CONTACT_EMAIL   correo de contacto y de solicitudes sobre datos personales
//   NEXT_PUBLIC_LEGAL_REVIEWED  "si" cuando un abogado haya revisado las páginas legales

const clean = (v: string | undefined) => (v ?? "").trim().replace(/^["'`]+|["'`]+$/g, "").trim();

export function publicSiteUrl(): string {
  const explicit = clean(process.env.NEXT_PUBLIC_SITE_URL).replace(/\/+$/, "");
  if (explicit) return explicit;
  const vercel = clean(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  return vercel ? `https://${vercel}` : "http://localhost:3000";
}

// Solo producción con dirección propia se deja indexar (las vistas previas de Vercel, nunca).
export const indexable = () => process.env.VERCEL_ENV === "production" && !!clean(process.env.NEXT_PUBLIC_SITE_URL);

export const LEGAL = {
  name: clean(process.env.NEXT_PUBLIC_LEGAL_NAME),
  rut: clean(process.env.NEXT_PUBLIC_LEGAL_RUT),
  address: clean(process.env.NEXT_PUBLIC_LEGAL_ADDRESS),
  email: clean(process.env.NEXT_PUBLIC_CONTACT_EMAIL),
  reviewed: clean(process.env.NEXT_PUBLIC_LEGAL_REVIEWED).toLowerCase() === "si",
};

// Fecha de la versión vigente de los textos legales (actualizar al modificarlos).
export const LEGAL_VERSION = "27 de octubre de 2026";
