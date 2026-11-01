// Service worker de ENQORA (ENQORA Everywhere), servido por la propia aplicación.
// Su versión es la del despliegue de Vercel: cada despliegue cambia este archivo y el navegador
// detecta la actualización (el aviso «Nueva versión disponible» lo muestra components/pwa.tsx).
//
// Regla de seguridad: solo se guardan archivos estáticos públicos (código y estilos con nombre
// versionado, íconos de marca y la página «Sin conexión»). Nunca páginas, datos, formularios,
// respuestas de Supabase, del SII ni documentos: siempre se piden a la red.

export const dynamic = "force-static";

const VERSION = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || "dev").slice(0, 12);

const SCRIPT = `
const VERSION = ${JSON.stringify(VERSION)};
const STATIC = "enqora-static-" + VERSION;
const OFFLINE = "/sin-conexion";
const PRECACHE = [OFFLINE, "/brand/enqora-logo.webp", "/brand/enqora-icon-192.png", "/brand/enqora-icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload", credentials: "omit" })))));
  // No se activa solo: espera a que la persona elija «Actualizar» (salvo la primera instalación).
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("enqora-") && key !== STATIC) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data === "ENQORA_ACTUALIZAR") self.skipWaiting();
});

const isStatic = (url) => url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/brand/");

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase, SII, pagos y demás: nunca pasan por aquí

  if (isStatic(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && res.type === "basic") cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  // Páginas: siempre desde la red (con la sesión vigente). Sin conexión, la página «Sin conexión», sin datos.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(async () => (await caches.match(OFFLINE)) || Response.error()));
  }
  // Todo lo demás (datos, acciones, API): red directa, sin caché.
});
`;

export function GET() {
  return new Response(SCRIPT, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Service-Worker-Allowed": "/",
    },
  });
}
