import { NextResponse, type NextRequest } from "next/server";
import { generarInformeIngreso } from "@/lib/informe-ingreso";
import { createClient } from "@/lib/supabase/server";

// Informe de ingreso (0065). Dos formas de entrar, ambas con «Authorization: Bearer CRON_SECRET»:
//  · ?sol=<id>: lo llama el propio servidor apenas llega una solicitud (app/actions/caso.ts).
//  · sin parámetro: el cron (vercel.json) completa las solicitudes de los últimos 7 días que quedaron sin informe.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUDGET_MS = 230_000;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const service = process.env.ENQORA_SERVICE_TOKEN;
  if (!secret || !service || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, detalle: "Falta CRON_SECRET o ENQORA_SERVICE_TOKEN" }, { status: 401 });
  }
  const t0 = Date.now();
  const sol = request.nextUrl.searchParams.get("sol");
  let ids: string[] = [];
  if (sol) {
    if (!UUID.test(sol)) return NextResponse.json({ ok: false, detalle: "Solicitud no válida" }, { status: 400 });
    ids = [sol];
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("svc_solicitudes_sin_informe", { p_token: service, p_limit: 3 });
    if (error) return NextResponse.json({ ok: false, detalle: error.message }, { status: 502 });
    ids = ((Array.isArray(data) ? data : []) as unknown[]).filter((x): x is string => typeof x === "string");
  }
  const resultados: { id: string; ok: boolean; version?: number; error?: string }[] = [];
  for (const id of ids) {
    if (Date.now() - t0 > BUDGET_MS) break;
    const r = await generarInformeIngreso(id, service).catch((e) => ({ ok: false, error: e instanceof Error ? e.message : "error" }));
    if (!r.ok) console.error("[ENQORA Informe de ingreso]", id, r.error);
    resultados.push({ id, ...r });
  }
  return NextResponse.json({ ok: resultados.every((r) => r.ok), procesadas: resultados.length, resultados });
}
