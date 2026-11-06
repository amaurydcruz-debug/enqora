"use server";

import { configurado, type Proveedor } from "@/lib/ai/gateway";
import { evaluar, type Modo, type ResultadoEvaluacion } from "@/lib/ai/evaluacion";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";

export type EstadoLaboratorio = { ok: true; resultado: ResultadoEvaluacion } | { ok: false; error: string } | null;

const PROVEEDORES: Proveedor[] = ["anthropic", "hf", "openai"];
const MODOS: Modo[] = ["solo_modelo", "con_conocimiento"];

// Laboratorio ENQORA BRAIN: evalúa un proveedor con el banco de pruebas (datos ficticios, respuestas del motor contable).
export async function evaluarModeloAction(_prev: EstadoLaboratorio, form: FormData): Promise<EstadoLaboratorio> {
  if (!isSupervisorRole(await myStaffRole())) return { ok: false, error: "Solo supervisión y administración pueden usar el laboratorio." };
  const proveedor = String(form.get("proveedor") ?? "") as Proveedor;
  const modo = String(form.get("modo") ?? "") as Modo;
  if (!PROVEEDORES.includes(proveedor) || !MODOS.includes(modo)) return { ok: false, error: "Proveedor o modo no válido." };
  if (!configurado(proveedor)) return { ok: false, error: "Ese proveedor no está configurado en Vercel." };
  try {
    return { ok: true, resultado: await evaluar(proveedor, modo) };
  } catch (e) {
    console.error("[ENQORA Laboratorio]", e instanceof Error ? e.message : e);
    return { ok: false, error: "La evaluación no pudo completarse. Intenta nuevamente." };
  }
}
