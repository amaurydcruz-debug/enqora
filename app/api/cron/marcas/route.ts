import { cronAutorizado } from "@/lib/interno";
import { after, NextResponse, type NextRequest } from "next/server";
import { runInapiSync, type InapiReport } from "@/lib/inapi-sync";
import { createClient } from "@/lib/supabase/server";

// Carga diaria de las marcas de INAPI (vercel.json → crons). Vercel envía «Authorization: Bearer CRON_SECRET».
// Procesa un archivo por ejecución y encadena la siguiente hasta dejar todo al día (como el Registro de Empresas).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUDGET_MS = 42_000;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const service = process.env.ENQORA_SERVICE_TOKEN;
  if (!secret || !service || !cronAutorizado(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, estado: "error", detalle: "Falta CRON_SECRET o ENQORA_SERVICE_TOKEN" }, { status: 401 });
  }
  const supabase = await createClient();
  const step = Number(request.nextUrl.searchParams.get("paso") ?? "0") || 0;
  let report: InapiReport;
  try {
    report = await runInapiSync(supabase, service, Date.now() + BUDGET_MS);
  } catch (e) {
    report = { estado: "error", detalle: e instanceof Error ? e.message.slice(0, 400) : "Error inesperado" };
  }
  if (report.estado === "error") console.error("[ENQORA Marcas INAPI]", report.archivo, report.detalle);
  if ((report.estado === "continua" || report.estado === "completada") && step < 200) {
    const next = new URL("/api/cron/marcas", request.nextUrl.origin);
    next.searchParams.set("paso", String(step + 1));
    after(async () => {
      await fetch(next, { headers: { authorization: `Bearer ${secret}` }, cache: "no-store", signal: AbortSignal.timeout(12_000) }).catch(() => undefined);
    });
  }
  return NextResponse.json({ ok: report.estado !== "error", ...report }, { status: report.estado === "error" ? 502 : 200 });
}
