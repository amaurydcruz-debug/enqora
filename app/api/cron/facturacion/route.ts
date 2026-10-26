import { NextResponse, type NextRequest } from "next/server";
import { flushDeliveries } from "@/lib/notify-delivery";
import { createClient } from "@/lib/supabase/server";

// Tarea diaria de Vercel (vercel.json → crons): facturación (vencimientos, renovaciones, fin de
// suscripciones), vencimiento de mandatos y envío de avisos pendientes.
// Vercel envía «Authorization: Bearer CRON_SECRET». Sin CRON_SECRET y ENQORA_SERVICE_TOKEN no se ejecuta.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const service = process.env.ENQORA_SERVICE_TOKEN;
  if (!secret || !service || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("daily_run", { p_token: service });
  if (error) {
    console.error("[ENQORA facturación diaria]", error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  await flushDeliveries(request.nextUrl.origin, true);
  return NextResponse.json({ ok: true, resultado: data });
}
