import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rondaInforma } from "@/lib/informa-director";

// ENQORA Informa: ronda del Director IA (vercel.json → crons). Vercel envía «Authorization: Bearer CRON_SECRET».
// Los hallazgos quedan como «detectados» y se registran como misiones; la supervisión verifica y publica.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const service = process.env.ENQORA_SERVICE_TOKEN;
  if (!secret || !service || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const supabase = await createClient();
  const r = await rondaInforma(supabase, service, AbortSignal.timeout(50_000));
  if (!r.ok) {
    console.error("[ENQORA Informa]", r.error);
    return NextResponse.json({ ok: false, departamentos: r.departamentos }, { status: 502 });
  }
  return NextResponse.json({ ok: true, departamentos: r.departamentos, encontrados: r.encontrados, nuevos: r.nuevos });
}
