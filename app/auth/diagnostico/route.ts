import { NextResponse } from "next/server";
import { siteUrl, supabaseEnv, supabaseEnvProblems } from "@/lib/supabase/env";

// Diagnóstico TEMPORAL de conexión entre Vercel y Supabase.
// No muestra claves ni datos de usuarios: solo si el servicio responde y cómo está configurado.
// Eliminar este archivo cuando el registro funcione.
export const dynamic = "force-dynamic";

type Probe = { ok: boolean; status?: number; ms: number; error?: string };

async function probe(url: string, key: string): Promise<{ probe: Probe; body?: unknown }> {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const ms = Date.now() - started;
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = undefined;
    }
    return { probe: { ok: res.ok, status: res.status, ms }, body };
  } catch (e) {
    const err = e as Error & { cause?: { code?: string; message?: string } };
    return {
      probe: {
        ok: false,
        ms: Date.now() - started,
        error: [err.name, err.message, err.cause?.code, err.cause?.message].filter(Boolean).join(" · "),
      },
    };
  }
}

export async function GET() {
  const problems = supabaseEnvProblems();
  if (problems.length) {
    return NextResponse.json({ configuracion: "incompleta", problemas: problems }, { headers: { "cache-control": "no-store" } });
  }

  const { url, key } = supabaseEnv();
  const health = await probe(`${url}/auth/v1/health`, key);
  const settings = await probe(`${url}/auth/v1/settings`, key);

  const s = (settings.body ?? {}) as {
    external?: { email?: boolean };
    disable_signup?: boolean;
    mailer_autoconfirm?: boolean;
  };

  return NextResponse.json(
    {
      proyecto: new URL(url).hostname,
      tipo_de_clave: key.startsWith("sb_publishable_") ? "publishable" : key.startsWith("eyJ") ? "anon (antigua)" : "otra",
      site_url: siteUrl(),
      servicio_auth: health.probe,
      configuracion_auth: settings.probe.ok
        ? {
            correo_y_contrasena_activado: s.external?.email ?? null,
            registro_desactivado: s.disable_signup ?? null,
            confirmacion_automatica: s.mailer_autoconfirm ?? null,
          }
        : settings.probe,
      region_vercel: process.env.VERCEL_REGION ?? null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
