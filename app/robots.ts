import type { MetadataRoute } from "next";
import { indexable, publicSiteUrl } from "@/lib/site";

// Solo las páginas públicas se pueden indexar, y solo en producción con dirección propia.
export default function robots(): MetadataRoute.Robots {
  if (!indexable()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: ["/$", "/registro", "/ingresar", "/privacidad", "/terminos"],
      disallow: ["/api/", "/auth/", "/mfa/", "/panel", "/casos", "/empresas", "/contabilidad", "/mando", "/planes",
        "/facturacion", "/notificaciones", "/seguridad", "/diagnostico", "/mandatos", "/invitacion", "/comenzar"],
    },
    sitemap: `${publicSiteUrl()}/sitemap.xml`,
  };
}
