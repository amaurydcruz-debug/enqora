"use server";

import { revalidatePath } from "next/cache";
import type { Resultado } from "@/lib/conocimiento-tipos";
import { buscarNormativa, indexarConocimiento, type ResultadoIndexar } from "@/lib/conocimiento-server";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";

export type EstadoBusqueda = { pregunta: string; resultados: Resultado[]; respaldo: boolean; porSignificado: boolean; error?: string } | null;

// Buscador legal (equipo ENQORA): la base exige que quien pregunta sea del equipo.
export async function buscarNormativaAction(_prev: EstadoBusqueda, form: FormData): Promise<EstadoBusqueda> {
  const pregunta = String(form.get("pregunta") ?? "").trim().slice(0, 500);
  if (pregunta.length < 3) return { pregunta, resultados: [], respaldo: false, porSignificado: false, error: "Escribe una pregunta de al menos 3 letras." };
  if (!(await myStaffRole())) return { pregunta, resultados: [], respaldo: false, porSignificado: false, error: "Solo el equipo ENQORA puede usar el buscador." };
  const r = await buscarNormativa(pregunta);
  return { pregunta, ...r, error: r.error ? "No pudimos buscar. Intenta nuevamente." : undefined };
}

export type EstadoIndexar = ({ ok: true } & ResultadoIndexar) | { ok: false; error: string } | null;

export async function indexarConocimientoAction(_prev: EstadoIndexar, _form: FormData): Promise<EstadoIndexar> {
  if (!isSupervisorRole(await myStaffRole())) return { ok: false, error: "Solo supervisión y administración pueden actualizar el índice." };
  try {
    const r = await indexarConocimiento();
    revalidatePath("/mando/buscador");
    if (r.error) {
      console.error("[ENQORA Buscador]", r.error);
      return { ok: false, error: /ENQ_SIN_PERMISO/.test(r.error) ? "Sin permiso: confirma tu segundo factor." : "No se pudo actualizar el índice. Intenta nuevamente." };
    }
    return { ok: true, ...r };
  } catch (e) {
    console.error("[ENQORA Buscador]", e instanceof Error ? e.message : e);
    return { ok: false, error: "No se pudo actualizar el índice. Intenta nuevamente." };
  }
}
