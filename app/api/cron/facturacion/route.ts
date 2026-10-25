import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Tarea diaria de Vercel (vercel.json → crons): vencimientos, renovaciones y fin de suscripciones.
// Vercel envía «Authorization: Bearer CRON_SECRET». Sin CRON_SECRET y ENQORA_SERVICE_TOKEN no se ejecuta.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const service = process.env.ENQORA_SERVICE_TOKEN;
  if (!secret || !service || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("billing_run", { p_token: service });
  if (error) {
    console.error("[ENQORA facturación diaria]", error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true, resultado: data });
}
