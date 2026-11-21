"use server";

import { revalidatePath } from "next/cache";
import { dbMessage } from "@/lib/db-errors";
import { diagnosticar, perfilValido, PREGUNTAS, VERSION_DIAGNOSTICO, type Respuesta } from "@/lib/empresa-al-dia";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDS = new Set(PREGUNTAS.map((q) => q.id));

// Guarda una versión del diagnóstico. El resultado se recalcula aquí con las reglas fijas (no se confía en el navegador).
export async function guardarDiagnosticoAction(companyId: string, perfilRaw: unknown, respuestasRaw: unknown): Promise<{ error?: string; version?: number }> {
  const perfil = perfilValido(perfilRaw);
  if (!UUID.test(companyId) || !perfil) return { error: "Revisa los datos de tu empresa." };
  const respuestas: Record<string, Respuesta> = {};
  for (const [k, v] of Object.entries(respuestasRaw && typeof respuestasRaw === "object" ? respuestasRaw : {})) {
    if (IDS.has(k) && (v === "si" || v === "no" || v === "no_se")) respuestas[k] = v;
  }
  const resultado = diagnosticar(perfil, respuestas);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("guardar_diagnostico_empresa", {
    p_company: companyId, p_reglas: VERSION_DIAGNOSTICO, p_perfil: perfil, p_respuestas: respuestas, p_resultado: resultado, p_puntaje: resultado.puntaje,
  });
  if (error) return { error: dbMessage(error) };
  revalidatePath("/empresa-al-dia");
  revalidatePath("/panel");
  return { version: typeof data === "number" ? data : undefined };
}
