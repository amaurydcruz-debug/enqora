import { after, NextResponse, type NextRequest } from "next/server";
import { runResSync, type ResReport } from "@/lib/res-sync";
import { createClient } from "@/lib/supabase/server";

// Conector con los datos abiertos del Registro de Empresas y Sociedades (vercel.json → crons, diario).
// Vercel envía «Authorization: Bearer CRON_SECRET». Si un archivo no termina en esta ejecución, el propio
// servidor encadena la siguiente, que sigue desde su cursor. Si la cadena se corta (p. ej., un arranque en frío
// lento), el cron diario la retoma desde el mismo cursor; cuando todo está al día, la ejecución termina al instante.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUDGET_MS = 45_000;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const service = process.env.ENQORA_SERVICE_TOKEN;
  if (!secret || !service || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, estado: "error", detalle: "Falta CRON_SECRET o ENQORA_SERVICE_TOKEN" }, { status: 401 });
  }
  const supabase = await createClient();
  const step = Number(request.nextUrl.searchParams.get("paso") ?? "0") || 0;
  let report: ResReport;
  try {
    report = await runResSync(supabase, service, Date.now() + BUDGET_MS);
  } catch (e) {
    report = { estado: "error", detalle: e instanceof Error ? e.message.slice(0, 400) : "Error inesperado" };
  }
  if (report.estado === "error") console.error("[ENQORA Registro de Empresas]", report.recurso, report.detalle);
  if ((report.estado === "continua" || report.estado === "completada") && step < 300) {
    const next = new URL("/api/cron/registro", request.nextUrl.origin);
    next.searchParams.set("paso", String(step + 1));
    after(async () => {
      // Se espera hasta 12 s a que la siguiente ejecución arranque: con 4 s, un arranque en frío lento cortaba la cadena.
      await fetch(next, { headers: { authorization: `Bearer ${secret}` }, cache: "no-store", signal: AbortSignal.timeout(12_000) }).catch(() => undefined);
    });
  }
  return NextResponse.json({ ok: report.estado !== "error", ...report }, { status: report.estado === "error" ? 502 : 200 });
}
