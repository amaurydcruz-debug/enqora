"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import type { PublicCompany } from "@/app/actions/public";
import { investigar } from "@/lib/cora/director";
import {
  distintas, evidenciasDe, informeReglas, MANUAL, preguntasDisponibles, promptInforme, promptTurno, TOOL_INFORME, TOOL_TURNO, turnoReglas,
  validarInforme, validarTurno, type Informe, type Turno,
} from "@/lib/cora/estratega";
import { dbCode } from "@/lib/db-errors";
import { QUESTIONS, type Answer } from "@/lib/diagnostic-360";
import type { Catalog } from "@/lib/initial-report";
import { isValidRut, normalizeRut } from "@/lib/rut";
import { createClient } from "@/lib/supabase/server";

// Consulta Estratégica 360° (CORA). El servidor vuelve a obtener los datos públicos del RUT (nunca confía en
// hechos enviados por el navegador), arma el expediente y llama al estratega. Cada llamada cuenta en el
// límite de consultas por visitante de la base de datos. Nada se guarda.

export type CoraResult =
  | { ok: true; fase: "turno"; turno: Turno; origen: "ia" | "reglas" }
  | { ok: true; fase: "informe"; informe: Informe; origen: "ia" | "reglas" }
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

    const exp = investigar(p, catalog, respuestas);
    const ev = evidenciasDe(exp, respuestas);

    if (input.fase === "informe") {
      const necesidades = distintas(exp).map((n) => ({ id: n.id, necesidad: n.necesidad, evidencia: n.evidencia, servicio: n.servicio ? `${n.servicio.nombre}${n.servicio.disponible ? "" : " (próximamente)"}` : n.externa?.nombre ?? "ruta oficial" }));
      const raw = await askClaude(promptInforme(ev, necesidades), TOOL_INFORME);
      const informe = raw ? validarInforme(raw, ev, distintas(exp).map((n) => n.id)) : null;
      return informe ? { ok: true, fase: "informe", informe, origen: "ia" } : { ok: true, fase: "informe", informe: informeReglas(exp, ev), origen: "reglas" };
    }

    const disp = preguntasDisponibles(exp, respuestas);
    const raw = await askClaude(promptTurno(ev, disp.map((q) => ({ id: q.id, q: q.q })), respuestas), TOOL_TURNO);
    const turno = raw ? validarTurno(raw, ev, disp.map((q) => q.id)) : null;
    return turno ? { ok: true, fase: "turno", turno, origen: "ia" } : { ok: true, fase: "turno", turno: turnoReglas(exp, ev, respuestas), origen: "reglas" };
  } catch (e) {
    console.error("[ENQORA CORA]", e instanceof Error ? e.message : e);
    return { ok: false, error: "CORA no pudo completar la consulta. Intenta nuevamente." };
  }
}

type ApiResponse = { content?: { type: string; name?: string; input?: unknown }[] };

// Llamada al estratega con salida forzada a la herramienta. Sin clave o ante cualquier error: null (se usa el motor de reglas).
async function askClaude(prompt: string, tool: { name: string; description: string; input_schema: unknown }): Promise<unknown | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal: AbortSignal.timeout(25_000),
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5-5", max_tokens: 2500,
        system: `Eres CORA, el estratega de inteligencia empresarial de ENQORA (Chile). Tu trabajo es descubrir valor que el cliente aún no ve, a partir de evidencia.\n\n${MANUAL}\n\nResponde solo llamando a la herramienta ${tool.name}.`,
        tools: [tool], tool_choice: { type: "tool", name: tool.name },
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as ApiResponse;
    return data.content?.find((b) => b.type === "tool_use" && b.name === tool.name)?.input ?? null;
  } catch {
    return null;
  }
}
