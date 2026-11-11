"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { after } from "next/server";
import type { PublicCompany } from "@/app/actions/public";
import { llamarHerramienta } from "@/lib/ai/gateway";
import { investigar } from "@/lib/cora/director";
import {
  distintas, evidenciasDe, informeReglas, MANUAL, preguntasDisponibles, promptInforme, promptTurno, TOOL_INFORME, TOOL_TURNO, turnoReglas,
  validarInforme, validarTurno, type Evidencia, type Informe, type Turno,
} from "@/lib/cora/estratega";
import { sanearHallazgos, type HallazgoWeb } from "@/lib/cora/web/hallazgos";
import { mercadoPublico, registroEmpresas } from "@/lib/cora/web/oficiales";
import { dbCode } from "@/lib/db-errors";
import { QUESTIONS, type Answer } from "@/lib/diagnostic-360";
import type { Catalog } from "@/lib/initial-report";
import { isValidRut, normalizeRut } from "@/lib/rut";
import { createClient } from "@/lib/supabase/server";

// Consulta Estratégica 360° (CORA). El servidor vuelve a obtener los datos públicos del RUT (nunca confía en
// hechos enviados por el navegador), arma el expediente y llama al estratega. Cada llamada cuenta en el
// límite de consultas por visitante de la base de datos. Nada se guarda.

// motivo: por qué se usó el motor de reglas (diagnóstico visible para el equipo y en los registros de Vercel).
// robot: estado del robot investigador en los portales oficiales para este RUT (ninguna, en_curso, lista).
type Origen = { origen: "ia" | "reglas"; motivo?: string; evidencias: Evidencia[]; web: HallazgoWeb[]; robot?: string };
export type CoraResult =
  | ({ ok: true; fase: "turno"; turno: Turno } & Origen)
  | ({ ok: true; fase: "informe"; informe: Informe } & Origen)
  | { ok: false; error: string };

const VALID: Answer[] = ["si", "no", "no_se", "ayuda", "na"];

export async function consultaCoraAction(input: { rut: string; respuestas: Record<string, string>; fase: "turno" | "informe" }): Promise<CoraResult> {
  try {
    const rut = normalizeRut(String(input?.rut ?? ""));
    if (!rut || !isValidRut(rut)) return { ok: false, error: "El RUT no es válido." };
    const respuestas: Record<string, Answer> = {};
    for (const q of QUESTIONS) {
      const v = input?.respuestas?.[q.id];
      if (typeof v === "string" && VALID.includes(v as Answer)) respuestas[q.id] = v as Answer;
    }

    const h = await headers();
    const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "desconocido";
    const client = createHash("sha256").update(`enqora-lookup:${ip}`).digest("hex").slice(0, 32);
    const supabase = await createClient({ headers: { "x-enqora-client": client } });
    const { data, error } = await supabase.rpc("lookup_public_company", { p_rut: rut });
    if (error) {
      if (dbCode(error) === "ENQ_DEMASIADAS_CONSULTAS") return { ok: false, error: "Hiciste muchas consultas seguidas. Intenta nuevamente en una hora." };
      return { ok: false, error: "No pudimos consultar las fuentes en este momento." };
    }
    const p = data as PublicCompany;
    if (p.estado !== "encontrada") return { ok: false, error: "Esta consulta estratégica está disponible para empresas encontradas en las fuentes públicas." };
    const { data: cat } = await supabase.rpc("public_catalog");
    const catalog = ((cat ?? []) as Catalog);

    // Resultados del bot investigador (INAPI, Registro de Empresas…) para este RUT, si existen.
    // Fuentes oficiales por vía legal (datos abiertos del Registro y API de Mercado Público) + resultados del bot.
    const [{ data: webRaw }, registro, compras] = await Promise.all([
      supabase.rpc("research_public_findings", { p_rut: rut }), registroEmpresas(supabase, rut), mercadoPublico(rut),
    ]);
    const oficiales = [registro, compras].filter((x): x is HallazgoWeb => !!x);
    // Primera vuelta de la consulta: si no hay investigación reciente en los portales, el robot sale solo.
    const robot = Object.keys(respuestas).length === 0 && input.fase === "turno" ? await lanzarRobot(supabase, rut, p.razon_social ?? null, h) : undefined;
    const web = [...oficiales, ...sanearHallazgos(webRaw).filter((w) => !oficiales.some((o) => o.portal === w.portal))];
    const exp = investigar(p, catalog, respuestas, new Date(), web);
    const ev = evidenciasDe(exp, respuestas);

    if (input.fase === "informe") {
      const necesidades = distintas(exp).map((n) => ({ id: n.id, necesidad: n.necesidad, evidencia: n.evidencia, servicio: n.servicio ? `${n.servicio.nombre}${n.servicio.disponible ? "" : " (próximamente)"}` : n.externa?.nombre ?? "ruta oficial" }));
      const ids = distintas(exp).map((n) => n.id);
      const ia = await estratega(promptInforme(ev, necesidades), TOOL_INFORME, (x) => !!validarInforme(x, ev, ids));
      const informe = ia.input ? validarInforme(ia.input, ev, ids) : null;
      const motivo = informe ? undefined : ia.motivo ?? "validador";
      if (motivo) console.error("[ENQORA CORA] informe por reglas:", motivo);
      return informe ? { ok: true, fase: "informe", informe, origen: "ia", evidencias: ev, web, robot } : { ok: true, fase: "informe", informe: informeReglas(exp, ev), origen: "reglas", motivo, evidencias: ev, web, robot };
    }

    const disp = preguntasDisponibles(exp, respuestas);
    const dispIds = disp.map((q) => q.id);
    const ia = await estratega(promptTurno(ev, disp.map((q) => ({ id: q.id, q: q.q })), respuestas), TOOL_TURNO, (x) => !!validarTurno(x, ev, dispIds));
    const turno = ia.input ? validarTurno(ia.input, ev, dispIds) : null;
    const motivo = turno ? undefined : ia.motivo ?? "validador";
    if (motivo) console.error("[ENQORA CORA] turno por reglas:", motivo);
    return turno ? { ok: true, fase: "turno", turno, origen: "ia", evidencias: ev, web, robot } : { ok: true, fase: "turno", turno: turnoReglas(exp, ev, respuestas), origen: "reglas", motivo, evidencias: ev, web, robot };
  } catch (e) {
    console.error("[ENQORA CORA]", e instanceof Error ? e.message : e);
    return { ok: false, error: "CORA no pudo completar la consulta. Intenta nuevamente." };
  }
}

// Llamada al estratega a través del ENQORA AI Gateway: usa el proveedor configurado (Claude por defecto) y, si
// falla o su respuesta no pasa el validador, prueba con el siguiente (p. ej., un modelo abierto en Hugging Face).
// Los datos de esta consulta son públicos (fuentes oficiales y respuestas del visitante sobre su empresa).
// Nunca lanza: devuelve la salida o el motivo del fallo (sin_proveedor, http_XXX, tiempo, sin_herramienta, validador, red).
async function estratega(prompt: string, tool: { name: string; description: string; input_schema: unknown }, validar: (x: unknown) => boolean): Promise<{ input: unknown | null; motivo?: string }> {
  const system = `Eres CORA, el estratega de inteligencia empresarial de ENQORA (Chile). Tu trabajo es descubrir valor que el cliente aún no ve, a partir de evidencia.\n\n${MANUAL}`;
  const r = await llamarHerramienta({ system, prompt, tool, datos: "publicos", maxTokens: 3000, timeoutMs: 45_000, validar });
  return { input: r.input, motivo: r.motivo };
}

// Encola la investigación en los portales (si corresponde) y la lanza en segundo plano. Devuelve el estado.
async function lanzarRobot(supabase: Awaited<ReturnType<typeof createClient>>, rut: string, razon: string | null, h: Headers): Promise<string> {
  const service = process.env.ENQORA_SERVICE_TOKEN;
  const secret = process.env.CRON_SECRET;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!service || !secret || !host) return "ninguna";
  const { data, error } = await supabase.rpc("svc_research_enqueue", { p_token: service, p_rut: rut, p_razon: razon });
  if (error || !data) return "ninguna";
  const r = data as { estado: string; id?: string };
  if (r.estado === "nueva" && r.id) {
    const proto = h.get("x-forwarded-proto") ?? "https";
    after(async () => {
      await fetch(`${proto}://${host}/api/cron/investigador`, {
        method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
        body: JSON.stringify({ run: r.id }), cache: "no-store", signal: AbortSignal.timeout(15_000),
      }).catch(() => undefined);
    });
    return "en_curso";
  }
  return r.estado === "en_curso" ? "en_curso" : r.estado === "reciente" ? "lista" : "ninguna";
}

// Consulta los resultados del robot para un RUT de empresa (la pantalla pregunta cada 20 s mientras trabaja).
export async function hallazgosRobotAction(rutIn: string): Promise<{ robot: string; web: HallazgoWeb[] }> {
  try {
    const rut = normalizeRut(String(rutIn ?? ""));
    if (!rut || !isValidRut(rut) || Number(rut.split("-")[0]) < 50_000_000) return { robot: "ninguna", web: [] };
    const supabase = await createClient();
    const [{ data: estado }, { data: raw }] = await Promise.all([
      supabase.rpc("research_public_status", { p_rut: rut }),
      supabase.rpc("research_public_findings", { p_rut: rut }),
    ]);
    return { robot: typeof estado === "string" ? estado : "ninguna", web: sanearHallazgos(raw) };
  } catch {
    return { robot: "ninguna", web: [] };
  }
}
