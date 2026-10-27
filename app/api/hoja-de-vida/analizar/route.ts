import { NextResponse, type NextRequest } from "next/server";
import { createClient, currentUser } from "@/lib/supabase/server";
import { buildFindings, extractTaxFolder } from "@/lib/tax-record";

// Analiza una Carpeta Tributaria Electrónica ya subida y registrada.
// El acceso se valida con la sesión de la persona (RLS); el resultado lo guarda el servidor con
// la clave de servicio, para que nadie pueda escribir un análisis a mano.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const service = process.env.ENQORA_SERVICE_TOKEN;
  if (!service) return NextResponse.json({ error: "Falta configurar ENQORA_SERVICE_TOKEN en Vercel." }, { status: 503 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Tu sesión expiró. Ingresa nuevamente." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { record?: string };
  if (!body.record || !UUID_RE.test(body.record)) return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 });

  const supabase = await createClient();
  const { data: rec } = await supabase.from("tax_records").select("id, company_id, document_path, status, created_at").eq("id", body.record).maybeSingle();
  const record = rec as { id: string; company_id: string; document_path: string; status: string; created_at: string } | null;
  if (!record) return NextResponse.json({ error: "No tienes acceso a esta carpeta." }, { status: 404 });
  if (record.status === "lista") return NextResponse.json({ ok: true });
  if (record.status === "analizando" && Date.now() - new Date(record.created_at).getTime() < 5 * 60_000) return NextResponse.json({ error: "La carpeta ya se está analizando." }, { status: 409 });

  const { data: co } = await supabase.from("companies").select("rut").eq("id", record.company_id).maybeSingle();
  const companyRut = (co as { rut: string } | null)?.rut ?? null;

  const fail = async (msg: string, status = 502) => {
    await supabase.rpc("svc_tax_record_status", { p_token: service, p_record: record.id, p_status: "error", p_error: msg });
    return NextResponse.json({ error: msg }, { status });
  };

  await supabase.rpc("svc_tax_record_status", { p_token: service, p_record: record.id, p_status: "analizando", p_error: null });
  const { data: file, error: dlErr } = await supabase.storage.from("carpetas").download(record.document_path);
  if (dlErr || !file) return fail("No pudimos abrir el archivo subido. Súbelo nuevamente.", 404);
  const bytes = await file.arrayBuffer();
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") return fail("El archivo no es un PDF válido.", 400);

  try {
    const extract = await extractTaxFolder(bytes, AbortSignal.timeout(50_000));
    const findings = buildFindings(extract, companyRut);
    const { error } = await supabase.rpc("svc_save_tax_record", {
      p_token: service,
      p_record: record.id,
      p_data: {
        rut: extract.rut, tipo_carpeta: extract.tipo_carpeta, emitida: extract.emitida, vigente_hasta: extract.vigente_hasta,
        resumen: extract, hallazgos: findings,
      },
    });
    if (error) return fail("No pudimos guardar el análisis. Intenta nuevamente.", 500);
    return NextResponse.json({ ok: true, hallazgos: findings.length });
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    return fail(name === "TimeoutError" || name === "AbortError"
      ? "La lectura tardó demasiado. Intenta nuevamente en unos minutos."
      : e instanceof Error ? e.message.slice(0, 280) : "No pudimos analizar la carpeta.");
  }
}
