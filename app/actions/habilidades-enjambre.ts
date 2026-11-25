"use server";

import { revalidatePath } from "next/cache";
import { MODEL } from "@/lib/agents";
import { computadorActivo, probarComputador, sincronizarHabilidades, type PasoPrueba, type ResultadoSincronizar } from "@/lib/computador";
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

export type EstadoPrueba = { pasos: PasoPrueba[]; ms: number } | { error: string } | null;

// Prueba de punta a punta del computador del enjambre (supervisión). Datos ficticios; no toca casos.
export async function probarComputadorAction(_prev: EstadoPrueba, _form: FormData): Promise<EstadoPrueba> {
  if (!isSupervisorRole(await myStaffRole())) return { error: "Solo supervisión y administración pueden probar el computador." };
  try {
    return await probarComputador(await createClient(), MODEL());
  } catch (e) {
    console.error("[ENQORA enjambre] prueba", e instanceof Error ? e.message : e);
    return { error: "La prueba no se pudo completar. Intenta nuevamente." };
  }
}
