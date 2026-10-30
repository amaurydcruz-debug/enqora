import { NextResponse, type NextRequest } from "next/server";
import { researchPrices, saveFoundPrices } from "@/lib/price-advisor";
import { createClient } from "@/lib/supabase/server";

// Asesor de precios semanal (vercel.json → crons). Investiga los servicios activos con
// referencias más antiguas; lo encontrado queda «por verificar» en Catálogo y precios.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const service = process.env.ENQORA_SERVICE_TOKEN;
  if (!secret || !service || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("svc_services_for_research", { p_token: service, p_limit: 1 });
  if (error) return NextResponse.json({ ok: false, detalle: error.message }, { status: 500 });
  const results: { servicio: string; nuevas: number; error?: string }[] = [];
  for (const s of (data ?? []) as { id: string; code: string; name: string; scope: string; unit: string }[]) {
    try {
      const found = await researchPrices(s, AbortSignal.timeout(50_000));
      results.push({ servicio: s.code, nuevas: await saveFoundPrices(supabase, service, s.id, found) });
    } catch (e) {
      results.push({ servicio: s.code, nuevas: 0, error: e instanceof Error ? e.message.slice(0, 200) : "Error" });
    }
  }
  return NextResponse.json({ ok: true, resultados: results });
}
