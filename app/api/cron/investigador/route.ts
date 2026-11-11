import { after, NextResponse, type NextRequest } from "next/server";
import { ejecutarInvestigacion } from "@/lib/cora/web/investigador";
import { createClient } from "@/lib/supabase/server";

// Robot investigador automático: lo lanza una consulta pública de EMPRESA (nunca de persona natural).
// Autenticado con CRON_SECRET y escrito con la clave de servicio ENQORA (sin service_role). Solo toma la
// investigación si sigue en cola (svc_research_claim); los límites por RUT y por hora los aplica la base.
// Cada portal es un agente que trabaja en su propia pestaña, en paralelo.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const service = process.env.ENQORA_SERVICE_TOKEN;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ ok: false }, { status: 401 });
  const { run } = (await request.json().catch(() => ({}))) as { run?: string };
  if (!service || !run || !/^[0-9a-f-]{36}$/.test(run)) return NextResponse.json({ ok: false }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("svc_research_claim", { p_token: service, p_run: run });
  if (error || !data) return NextResponse.json({ ok: false }, { status: 409 });
  after(() => ejecutarInvestigacion(supabase, data as { id: string; rut: string; razon_social: string | null; modo: "investigacion" | "entorno" }, { token: service }));
  return NextResponse.json({ ok: true }, { status: 202 });
}
