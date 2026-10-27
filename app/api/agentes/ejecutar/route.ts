import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { agentsEnabled, runAgent } from "@/lib/agents";
import { AGENTS, type AgentKey } from "@/lib/mirror";
import { dbMessage } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";

// Ejecuta un agente IA sobre un caso (lo pide una persona del equipo con sesión y segundo factor).
// 1) start_agent_run valida permisos, registra el paso «trabajando» en MIRROR y entrega el contexto.
// 2) Se consulta la API de Claude (servidor → Anthropic; la clave nunca llega al navegador).
// 3) finish_agent_run guarda las propuestas para revisión humana.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });

export async function POST(request: NextRequest) {
  // Solo desde la propia aplicación (protección CSRF además de la cookie SameSite).
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) return fail("Solicitud no permitida.", 403);
  if (!agentsEnabled()) return fail("Los agentes IA aún no están habilitados: falta configurar la clave de la API de Claude en Vercel.", 503);

  const body = (await request.json().catch(() => null)) as { caseId?: unknown; agent?: unknown; instruction?: unknown } | null;
  const caseId = typeof body?.caseId === "string" && UUID_RE.test(body.caseId) ? body.caseId : null;
  const agent = typeof body?.agent === "string" && body.agent in AGENTS ? (body.agent as AgentKey) : null;
  const instruction = typeof body?.instruction === "string" ? body.instruction.trim().slice(0, 1000) : "";
  if (!caseId || !agent) return fail("Datos no válidos.");

  const supabase = await createClient();
  const { data: started, error } = await supabase.rpc("start_agent_run", { p_case: caseId, p_agent: agent, p_instruction: instruction || null });
  if (error || !started) {
    return fail(dbMessage(error), 409);
  }
  const { run, context } = started as { run: string; context: unknown };

  const result = await runAgent(agent, context, instruction || null, AbortSignal.timeout(52_000));
  const { data: count, error: finishError } = await supabase.rpc("finish_agent_run", {
    p_run: run,
    p_ok: result.ok,
    p_summary: result.summary,
    p_proposals: result.proposals,
    p_model: result.model,
    p_input_tokens: result.inputTokens,
    p_output_tokens: result.outputTokens,
    p_web_searches: result.webSearches,
    p_error: result.error ?? null,
  });
  revalidatePath(`/casos/${caseId}`);
  revalidatePath(`/casos/${caseId}/mirror`);

  if (finishError) {
    console.error("[ENQORA agentes] finish", finishError.message);
    return fail("No se pudo guardar el resultado del agente.", 500);
  }
  if (!result.ok) {
    console.error("[ENQORA agentes]", agent, result.error);
    return fail(`El agente no pudo completar el análisis (${result.error ?? "error"}). Intenta nuevamente.`, 502);
  }
  return NextResponse.json({ ok: true, count, summary: result.summary });
}
