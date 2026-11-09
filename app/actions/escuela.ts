"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { configurado, type Proveedor } from "@/lib/ai/gateway";
import { leccionesPropuestas, rendirExamen, type ResultadoExamen } from "@/lib/ai/escuela";
import { createClient } from "@/lib/supabase/server";
import { dbCode } from "@/lib/db-errors";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";

export type EstadoEscuela =
  | { ok: true; resultado: ResultadoExamen; guardado: boolean; lecciones: number; memoria: number }
  | { ok: false; error: string }
  | null;

const PROVEEDORES: Proveedor[] = ["anthropic", "hf", "openai"];

// Escuela Tributaria (piloto): rinde el examen de misiones ficticias y lo compara con el agente individual.
export async function rendirExamenEscuelaAction(_prev: EstadoEscuela, form: FormData): Promise<EstadoEscuela> {
  if (!isSupervisorRole(await myStaffRole())) return { ok: false, error: "Solo supervisión y administración pueden usar la escuela." };
  const proveedor = String(form.get("proveedor") ?? "") as Proveedor;
  if (!PROVEEDORES.includes(proveedor) || !configurado(proveedor)) return { ok: false, error: "Ese proveedor no está configurado en Vercel." };

  const supabase = await createClient();
  // Memoria: solo estrategias aprobadas por una persona. Si la migración 0031 no está, la escuela trabaja sin memoria.
  const { data: aprobadas } = await supabase.rpc("escuela_estrategias_aprobadas");
  const memoria = Array.isArray(aprobadas) ? aprobadas.map(String) : [];

  let resultado: ResultadoExamen;
  try {
    resultado = await rendirExamen(proveedor, memoria);
  } catch (e) {
    console.error("[ENQORA Escuela]", e instanceof Error ? e.message : e);
    return { ok: false, error: "El examen no pudo completarse. Intenta nuevamente." };
  }

  const lecciones = leccionesPropuestas(resultado);
  const { error } = await supabase.rpc("escuela_registrar_examen", { p: { ...resultado, lecciones } });
  if (error) console.error("[ENQORA Escuela] no se guardó el examen:", error.message);
  revalidatePath("/mando/laboratorio");
  return { ok: true, resultado, guardado: !error, lecciones: error ? 0 : lecciones.length, memoria: memoria.length };
}

// Decisión humana sobre una estrategia propuesta por el tribunal.
export async function decidirEstrategiaAction(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const estado = String(fd.get("estado") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["aprobada", "descartada", "revertida"].includes(estado)) redirect("/mando/laboratorio");
  const supabase = await createClient();
  const { error } = await supabase.rpc("escuela_estrategia_decidir", {
    p_id: id, p_estado: estado, p_nota: String(fd.get("nota") ?? "").trim().slice(0, 500) || null,
  });
  revalidatePath("/mando/laboratorio");
  redirect(`/mando/laboratorio?${error ? `error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}` : `aviso=estrategia_${estado}`}#escuela`);
}
