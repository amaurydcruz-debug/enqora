"use server";

import { revalidatePath } from "next/cache";
import { computadorActivo, sincronizarHabilidades, type ResultadoSincronizar } from "@/lib/computador";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";

export type EstadoSincronizar = { ok: true; resultado: ResultadoSincronizar } | { ok: false; error: string } | null;

// Sube a la API de Claude las habilidades del enjambre que cambiaron (supervisión).
export async function sincronizarHabilidadesAction(_prev: EstadoSincronizar, _form: FormData): Promise<EstadoSincronizar> {
  if (!isSupervisorRole(await myStaffRole())) return { ok: false, error: "Solo supervisión y administración pueden actualizar las habilidades." };
  if (!computadorActivo()) return { ok: false, error: "Falta ANTHROPIC_API_KEY en Vercel, o el computador está apagado (ENQORA_COMPUTADOR=off)." };
  try {
    const resultado = await sincronizarHabilidades(await createClient());
    revalidatePath("/mando/enjambre");
    return { ok: true, resultado };
  } catch (e) {
    console.error("[ENQORA enjambre]", e instanceof Error ? e.message : e);
    return { ok: false, error: "No se pudieron subir las habilidades. Intenta nuevamente." };
  }
}
