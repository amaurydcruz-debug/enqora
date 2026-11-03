import { after, NextResponse, type NextRequest } from "next/server";
import { ejecutarInvestigacion } from "@/lib/cora/web/investigador";
import { myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";

// CORA Web Research Agent: ejecuta una investigación en la nube (Vercel), independiente de la pantalla
// de quien la pidió. Responde de inmediato (202) y sigue trabajando con after() hasta 300 s.
// Piloto: solo el equipo ENQORA, con su sesión (las evidencias y capturas quedan con sus permisos).
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const role = await myStaffRole();
  if (!role) return NextResponse.json({ ok: false }, { status: 403 });
  const { run } = (await request.json().catch(() => ({}))) as { run?: string };
  if (!run || !/^[0-9a-f-]{36}$/.test(run)) return NextResponse.json({ ok: false }, { status: 400 });
  const supabase = await createClient();
  const { data } = await supabase.from("research_runs").select("id, rut, razon_social, modo, status").eq("id", run).maybeSingle();
  if (!data || data.status !== "en_cola") return NextResponse.json({ ok: false }, { status: 409 });
  after(() => ejecutarInvestigacion(supabase, data as { id: string; rut: string; razon_social: string | null; modo: "investigacion" | "entorno" }));
  return NextResponse.json({ ok: true }, { status: 202 });
}
