import "server-only";
import { timingSafeEqual } from "node:crypto";

// Llamadas internas entre funciones de ENQORA (acciones → rutas /api/cron/*), protegidas con CRON_SECRET.

// ¿La petición trae «Authorization: Bearer CRON_SECRET»? Comparación de tiempo constante.
export function cronAutorizado(authorization: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authorization) return false;
  const a = Buffer.from(authorization);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Dirección a la que se envía el secreto en una llamada interna. En producción es la dirección fija del proyecto
// en Vercel, no una cabecera de la petición; en vistas previas y local, la del propio despliegue que atiende.
export function origenInterno(h: Headers): string {
  const prod = process.env.VERCEL_ENV === "production" ? process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() : "";
  if (prod) return `https://${prod.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : "";
}
