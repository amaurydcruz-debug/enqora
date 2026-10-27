import { NextResponse } from "next/server";
import { supabaseEnv, supabaseEnvProblems } from "@/lib/supabase/env";

// Verificación de salud para monitores de disponibilidad (p. ej., UptimeRobot o Better Stack).
// Responde 200 si la aplicación está en línea y alcanza Supabase; 503 si no.
// No revela claves, variables ni datos: solo el estado y la versión desplegada.
export const dynamic = "force-dynamic";

export async function GET() {
  const version = (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7);
  let database = false;
  if (!supabaseEnvProblems().length) {
    try {
      const { url, key } = supabaseEnv();
      const res = await fetch(`${url}/auth/v1/health`, { headers: { apikey: key }, cache: "no-store", signal: AbortSignal.timeout(5000) });
      database = res.ok;
    } catch {
      database = false;
    }
  }
  return NextResponse.json(
    { ok: database, servicio: "ENQORA", version, supabase: database ? "en línea" : "sin conexión", hora: new Date().toISOString() },
    { status: database ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
