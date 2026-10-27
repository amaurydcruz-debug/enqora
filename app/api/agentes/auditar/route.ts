import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { auditEnabled, runAudit, type AuditInput } from "@/lib/audit";
import { dbMessage } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";

// Auditoría independiente de una ejecución de agente (M15). La pide una persona del equipo del caso.
// 1) audit_input marca «auditando» y entrega propuestas y antecedentes.
// 2) Verificaciones deterministas + auditor OpenAI + reglas de aprobación (lib/audit.ts).
// 3) save_agent_audit guarda el expediente y bloquea o libera cada propuesta.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) return fail("Solicitud no permitida.", 403);
  if (!auditEnabled()) return fail("La auditoría independiente aún no está habilitada: falta configurar la clave de OpenAI en Vercel.", 503);

  const body = (await request.json().catch(() => null)) as { runId?: unknown } | null;
  const runId = typeof body?.runId === "string" && UUID_RE.test(body.runId) ? body.runId : null;
  if (!runId) return fail("Datos no válidos.");

  const supabase = await createClient();
  const { data: input, error } = await supabase.rpc("audit_input", { p_run: runId });
  if (error || !input) return fail(dbMessage(error), 409);

  const result = await runAudit(input as AuditInput, AbortSignal.timeout(50_000));
  const { error: saveError } = await supabase.rpc("save_agent_audit", {
    p_run: runId,
    p_ok: result.ok,
    p_decision: result.decision,
    p_summary: result.summary,
    p_verdicts: result.verdicts,
    p_checks: result.checks,
    p_auditor: result.auditor,
    p_input_tokens: result.inputTokens,
    p_output_tokens: result.outputTokens,
    p_web_searches: result.webSearches,
    p_error: result.error ?? null,
  });
  const { data: c } = await supabase.from("agent_runs").select("case_id").eq("id", runId).maybeSingle();
  const caseId = (c as { case_id?: string } | null)?.case_id;
  if (caseId) {
    revalidatePath(`/casos/${caseId}`);
    revalidatePath(`/casos/${caseId}/mirror`);
  }
  if (saveError) {
    console.error("[ENQORA auditoría] save", saveError.message);
    return fail("No se pudo guardar el resultado de la auditoría.", 500);
  }
  if (!result.ok) {
    console.error("[ENQORA auditoría]", result.error);
    return fail(`La auditoría no se completó (${result.error ?? "error"}). Puedes reintentarla.`, 502);
  }
  return NextResponse.json({ ok: true, decision: result.decision });
}
