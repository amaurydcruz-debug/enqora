import type { NextConfig } from "next";

// Cabeceras de seguridad aplicadas a todas las respuestas. «form-action» admite Flow porque el pago redirige
// a su página después de enviar el formulario.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Micrófono solo para el propio ENQORA (dictado de gastos y conversación con CORA); nunca para sitios incrustados.
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Content-Security-Policy", value: `frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://www.flow.cl https://sandbox.flow.cl; object-src 'none'${process.env.NODE_ENV === "production" ? "; upgrade-insecure-requests" : ""}` },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // CORA Web Research Agent: Chromium liviano para Vercel. Se empaqueta solo en la función del investigador.
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core"],
  outputFileTracingIncludes: { "/api/cora/investigador": ["./node_modules/@sparticuz/chromium/bin/**"] },
  reactStrictMode: true,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Imágenes de marca: el navegador las guarda una semana (cambian solo con una nueva versión).
      { source: "/brand/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }] },
      // La verificación de salud nunca se guarda en caché.
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
