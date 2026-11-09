import { after, NextResponse, type NextRequest } from "next/server";
import { runPublicSync, type SyncReport } from "@/lib/public-sync";
import { createClient } from "@/lib/supabase/server";

// Conector automático con las nóminas públicas del SII (vercel.json → crons, cada día).
// Vercel envía «Authorization: Bearer CRON_SECRET». Si la carga no termina en esta ejecución,
// el propio servidor encadena la siguiente hasta completarla (cada una sigue desde su cursor).
// Cada ejecución queda registrada (Centro de Mando → Datos públicos), también cuando falla.
export const dynamic = "force-dynamic";
// Cada tramo debe volver a descomprimir el ZIP desde el inicio hasta su cursor (el formato no permite saltar):
// con 45 s, pasado ~3 millones de líneas casi todo el tiempo se iba en llegar al cursor y la carga se estancaba.
// Con 270 s por tramo, el avance real por ejecución sigue siendo amplio en archivos de varios millones de líneas.
export const maxDuration = 300;

const BUDGET_MS = 270_000;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const service = process.env.ENQORA_SERVICE_TOKEN;
  if (!secret || !service || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, estado: "error", detalle: "Falta CRON_SECRET o ENQORA_SERVICE_TOKEN" }, { status: 401 });
  }
  // «manual»: botón del Centro de Mando · «portada»: arrancado por una consulta sin datos · resto: tarea diaria.
  const origin = request.nextUrl.searchParams.get("origen") === "manual" ? "manual" : "automatica";
  const supabase = await createClient();
  const step = Number(request.nextUrl.searchParams.get("paso") ?? "0") || 0;
  let report: SyncReport;
  try {
    // paso > 0: continuación encadenada de la ejecución anterior.
    report = await runPublicSync(supabase, service, Date.now() + BUDGET_MS, step > 0);
  } catch (e) {
    report = { estado: "error", detalle: e instanceof Error ? e.message.slice(0, 400) : "Error inesperado" };
  }
  if (report.estado === "error") console.error("[ENQORA nómina SII]", report.conjunto, report.detalle);
  const { error: logErr } = await supabase.rpc("svc_log_public_sync", {
    p_token: service, p_origin: origin, p_result: report.estado, p_dataset: report.conjunto ?? null,
    p_rows: report.filas ?? 0, p_cursor: report.cursor ?? null, p_detail: report.detalle ?? null,
  });
  if (logErr) console.error("[ENQORA nómina SII] registro", logErr.message);

  // Encadenar: queda trabajo (carga a medias) o puede haber otro conjunto con versión nueva.
  // Un corte de red (el SII cierra la conexión) también encadena, hasta 5 fallos seguidos: antes la carga quedaba
  // detenida hasta la tarea del día siguiente. El cursor guardado garantiza que no se pierde ni se duplica avance.
  const fallos = Number(request.nextUrl.searchParams.get("fallos") ?? "0") || 0;
  const corteDeRed = report.estado === "error" && /terminated|socket|other side closed|fetch failed|ECONNRESET|ETIMEDOUT|tiempo|aborted|respondió 5\d\d/i.test(report.detalle ?? "");
  const seguir = report.estado === "continua" || report.estado === "completada" || (corteDeRed && fallos < 5);
  if (seguir && step < 400) {
    const next = new URL("/api/cron/nomina", request.nextUrl.origin);
    next.searchParams.set("paso", String(step + 1));
    if (corteDeRed) next.searchParams.set("fallos", String(fallos + 1));
    after(async () => {
      // Se espera hasta 12 s a que arranque la siguiente ejecución: con 4 s, un arranque en frío lento cortaba la cadena
      // y la carga quedaba detenida hasta la tarea del día siguiente.
      await fetch(next, { headers: { authorization: `Bearer ${secret}` }, cache: "no-store", signal: AbortSignal.timeout(12_000) }).catch(() => undefined);
    });
  }
  return NextResponse.json({ ok: report.estado !== "error", ...report }, { status: report.estado === "error" ? 502 : 200 });
}
