import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { agentsEnabled, runAgent } from "@/lib/agents";
import { auditEnabled } from "@/lib/audit";
import { AGENTS, type AgentKey } from "@/lib/mirror";
import { dbMessage } from "@/lib/db-errors";
import { contextoParaAgente, buscarNormativa } from "@/lib/conocimiento-server";
import { computadorActivo, computadorDelCaso, copiarDocumentos, guardarComputador, guardarSalidas, habilidadesDelAgente } from "@/lib/computador";
import { createClient } from "@/lib/supabase/server";

// Ejecuta un agente IA sobre un caso (lo pide una persona del equipo con sesión y segundo factor).
// 1) start_agent_run valida permisos, registra el paso «trabajando» en MIRROR y entrega el contexto.
// 2) Se consulta la API de Claude (servidor → Anthropic; la clave nunca llega al navegador).
// 3) finish_agent_run guarda las propuestas para revisión humana.
// Con auditoría configurada (M15), las propuestas quedan «pendientes de auditoría» y el navegador
// pide la auditoría en una segunda llamada (/api/agentes/auditar). Con «correctionOf», el agente
// corrige una ejecución observada recibiendo las observaciones del auditor.
// Computador del enjambre (0096): el agente trabaja en su contenedor Linux del caso, con los documentos del
// expediente, sus habilidades y lectura de páginas oficiales; lo que crea vuelve al expediente como documento interno.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });

export async function POST(request: NextRequest) {
  // Solo desde la propia aplicación (protección CSRF además de la cookie SameSite).
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) return fail("Solicitud no permitida.", 403);
  if (!agentsEnabled()) return fail("Los agentes IA aún no están habilitados: falta configurar la clave de la API de Claude en Vercel.", 503);

  const body = (await request.json().catch(() => null)) as { caseId?: unknown; agent?: unknown; instruction?: unknown; correctionOf?: unknown } | null;
  const caseId = typeof body?.caseId === "string" && UUID_RE.test(body.caseId) ? body.caseId : null;
  const agent = typeof body?.agent === "string" && body.agent in AGENTS ? (body.agent as AgentKey) : null;
  const instruction = typeof body?.instruction === "string" ? body.instruction.trim().slice(0, 1000) : "";
  const parent = typeof body?.correctionOf === "string" && UUID_RE.test(body.correctionOf) ? body.correctionOf : null;
  if (!caseId || !agent) return fail("Datos no válidos.");

  const supabase = await createClient();
  let correction: string | null = null;
  if (parent) {
    const { data: brief, error: briefError } = await supabase.rpc("correction_brief", { p_run: parent });
    if (briefError) return fail(dbMessage(briefError), 409);
    correction = typeof brief === "string" ? brief : null;
  }
  const audit = auditEnabled();
  const { data: started, error } = await supabase.rpc("start_agent_run", {
    p_case: caseId, p_agent: agent, p_instruction: instruction || (parent ? "Corrección según auditoría" : null), p_audit: audit, p_parent: parent,
  });
  if (error || !started) {
    return fail(dbMessage(error), 409);
  }
  const { run, context } = started as { run: string; context: unknown };

  // Buscador legal: normas y rutas verificadas que se parecen al caso, con su cita. Si falla, el agente sigue sin ellas.
  const caso = (context as { caso?: { titulo?: string; servicio?: string; descripcion?: string } } | null)?.caso;
  const consulta = [instruction, caso?.titulo, caso?.servicio, caso?.descripcion].filter(Boolean).join(". ").slice(0, 480);
  const busqueda = consulta.length >= 3
    ? await Promise.race([buscarNormativa(consulta, 6, supabase), new Promise<null>((r) => setTimeout(() => r(null), 8_000))]).catch(() => null)
    : null;
  const fuentes = busqueda && !busqueda.error ? contextoParaAgente(busqueda.respaldo ? busqueda.resultados : []) : null;

  // Computador: contenedor del caso (si sigue vigente), habilidades del agente y documentos nuevos del expediente.
  const pcOn = computadorActivo();
  let pc: Parameters<typeof runAgent>[6] = null;
  let docsPrevios: string[] = [];
  let docsNuevos: string[] = [];
  if (pcOn) {
    try {
      const [comp, hab] = await Promise.all([computadorDelCaso(supabase, caseId, agent), habilidadesDelAgente(supabase, agent)]);
      const copia = await copiarDocumentos(supabase, caseId, comp.containerId ? comp.documentos : []);
      docsPrevios = comp.containerId ? comp.documentos : [];
      docsNuevos = copia.copiados;
      pc = { contenedor: comp.containerId, habilidades: hab.lista, nombresHabilidades: hab.nombres, archivos: copia.fileIds };
    } catch (e) {
      console.error("[ENQORA agentes] computador", e instanceof Error ? e.message : e);
      pc = null;
    }
  }

  const result = await runAgent(agent, context, instruction || null, AbortSignal.timeout(pc ? 240_000 : 48_000), correction, fuentes, pc);

  // El computador queda guardado para la próxima ejecución; lo que el agente creó pasa al expediente (interno).
  let entregables: string[] = [];
  if (result.contenedor?.id) {
    await guardarComputador(supabase, caseId, agent, result.contenedor.id, result.contenedor.expira,
      result.contenedor.id === pc?.contenedor ? [...docsPrevios, ...docsNuevos] : docsNuevos);
  }
  if (result.archivos?.length) {
    const { data: caso } = await supabase.from("cases").select("id, company_id").eq("id", caseId).maybeSingle();
    if (caso) entregables = await guardarSalidas(supabase, caso as { id: string; company_id: string }, agent, result.archivos);
  }
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
  return NextResponse.json({ ok: true, count, summary: result.summary, run, audit: audit && Number(count) > 0, entregables, computador: !!result.computador });
}
