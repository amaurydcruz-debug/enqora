import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runWatch } from "@/lib/watch";

// Vigilancia normativa semanal (vercel.json → crons). Vercel envía «Authorization: Bearer CRON_SECRET».
// Las novedades se guardan como «detectadas» con la clave de servicio; la supervisión las verifica.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const service = process.env.ENQORA_SERVICE_TOKEN;
  if (!secret || !service || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const result = await runWatch(AbortSignal.timeout(50_000));
  if (!result.ok) {
    console.error("[ENQORA vigilancia]", result.error);
    return NextResponse.json({ ok: false, temas: result.groups }, { status: 502 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ingest_regulatory_updates", { p_token: service, p_items: result.items });
  if (error) {
    console.error("[ENQORA vigilancia] ingest", error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true, temas: result.groups, encontradas: result.items.length, nuevas: data });
}
