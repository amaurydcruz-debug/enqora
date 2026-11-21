import { NextResponse, type NextRequest } from "next/server";
import { flushDeliveries } from "@/lib/notify-delivery";
import { createClient } from "@/lib/supabase/server";
import { diasHasta, tocaAvisar, vencimientos } from "@/lib/calendario-cumplimiento";
import { perfilValido } from "@/lib/empresa-al-dia";
import { todayCL } from "@/lib/pricing";

// Tarea diaria de Vercel (vercel.json → crons): facturación (vencimientos, renovaciones, fin de
// suscripciones), vencimiento de mandatos, vigilancia de casos (sin responsable o vencidos) y envío de avisos pendientes.
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
  // Vigilancia de casos: sin responsable por más de 24 h y vencidos (0045). Un aviso por caso y por día.
  const { data: casos, error: casosErr } = await supabase.rpc("svc_casos_vigilar", { p_token: service });
  if (casosErr) console.error("[ENQORA vigilancia de casos]", casosErr.message);
  // Investigaciones del robot que quedaron colgadas: se cierran como fallidas (0048).
  await supabase.rpc("svc_research_vencer", { p_token: service }).then(() => undefined, () => undefined);
  // Contabilidad mensual (0066): días 1–5 faltan datos del mes; días 13–17 el mes espera la aprobación del cliente.
  const { data: mes, error: mesErr } = await supabase.rpc("svc_recordatorios_mes", { p_token: service });
  if (mesErr) console.error("[ENQORA contabilidad mensual]", mesErr.message);
  // Calendario de cumplimiento (0072): avisos 7 días y 1 día antes de cada vencimiento, sin repetir.
  let calendario = 0;
  const { data: empresas, error: calErr } = await supabase.rpc("svc_calendario_empresas", { p_token: service });
  if (calErr) console.error("[ENQORA calendario]", calErr.message);
  const hoy = todayCL();
  for (const e of (Array.isArray(empresas) ? empresas : []) as { company_id: string; perfil: unknown }[]) {
    const perfil = perfilValido(e.perfil);
    if (!perfil) continue;
    for (const v of vencimientos(perfil, hoy, 8).filter((x) => tocaAvisar(hoy, x))) {
      const d = diasHasta(hoy, v.fecha);
      const { data: ok } = await supabase.rpc("svc_aviso_calendario", {
        p_token: service, p_company: e.company_id, p_clave: v.clave, p_dias: d, p_fecha: v.fecha,
        p_titulo: `${v.titulo}: ${d === 1 ? "vence mañana" : `vence en ${d} días`}`, p_texto: `${v.institucion} · ${v.detalle}`, p_link: "/empresa-al-dia#calendario",
      });
      if (ok === true) calendario++;
    }
  }
  await flushDeliveries(request.nextUrl.origin, true);
  return NextResponse.json({ ok: true, resultado: data, casos: casos ?? null, mes: mes ?? null, calendario });
}
