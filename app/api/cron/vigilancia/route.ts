import { NextResponse, type NextRequest } from "next/server";
import { cronAutorizado } from "@/lib/interno";
import { createClient } from "@/lib/supabase/server";
import { rondasInforma } from "@/lib/informa-director";

// ENQORA Informa: rondas del Director IA, todos los días (vercel.json → crons). Si hay investigaciones pedidas en cola,
// sigue con más rondas hasta vaciarla o hasta unos 4 minutos. Vercel envía «Authorization: Bearer CRON_SECRET».
// Los hallazgos quedan como «detectados» y se registran como misiones; la supervisión verifica y publica.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const service = process.env.ENQORA_SERVICE_TOKEN;
  if (!secret || !service || !cronAutorizado(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const supabase = await createClient();
  const r = await rondasInforma(supabase, service, 240_000);
  if (!r.ok) {
    console.error("[ENQORA Informa]", r.error);
    return NextResponse.json({ ok: false, departamentos: r.departamentos }, { status: 502 });
  }
  return NextResponse.json({ ok: true, rondas: r.rondas, departamentos: r.departamentos, encontrados: r.encontrados, nuevos: r.nuevos });
}
