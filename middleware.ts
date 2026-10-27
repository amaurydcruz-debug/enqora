import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { supabaseEnvProblems } from "@/lib/supabase/env";

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ENTITIES[c] ?? c);

// Página de mantenimiento: falla de forma cerrada (no deja pasar a nadie) y
// explica qué revisar, sin mostrar ningún valor secreto.
function unavailable(details: string[]) {
  const items = details.map((d) => `<li>${esc(d)}</li>`).join("");
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ENQORA · Configuración</title><meta name="robots" content="noindex"></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0A1220;color:#D9E0EA;font-family:system-ui,sans-serif;padding:16px">
<div style="max-width:520px;background:#101B2D;border:1px solid #24354F;border-top:2px solid #C6A66B;border-radius:14px;padding:28px">
<p style="margin:0 0 6px;letter-spacing:.3em;font-size:12px;color:#C6A66B">ENQORA</p>
<h1 style="margin:0 0 12px;font-size:20px;color:#F4F0E8">Servicio en configuración</h1>
<p style="margin:0 0 12px;color:#9AA6B8">La plataforma no puede conectarse con su servicio de autenticación.</p>
${items ? `<ul style="margin:0 0 12px;padding-left:18px">${items}</ul>` : ""}
<p style="margin:0;font-size:13px;color:#9AA6B8">Tras corregir las variables en Vercel, vuelve a desplegar (Redeploy).</p>
</div></body></html>`;
  return new NextResponse(html, {
    status: 503,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function middleware(request: NextRequest) {
  const problems = supabaseEnvProblems();
  if (problems.length) return unavailable(problems);

  try {
    return await updateSession(request);
  } catch (error) {
    console.error("[ENQORA middleware]", error);
    return unavailable(["No fue posible validar la sesión con Supabase. Revisa la URL y la clave del proyecto."]);
  }
}

export const config = {
  matcher: [
    // Todo excepto archivos estáticos, imágenes de marca, iconos, robots y sitemap, y las rutas que
    // llaman servidores externos sin sesión (pasarela de pago, tarea diaria y verificación de salud).
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|manifest.webmanifest|robots.txt|sitemap.xml|brand/|api/pagos/|api/cron/|api/salud).*)",
  ],
};
