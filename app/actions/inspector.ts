"use server";

import { comoTexto, inspeccionar, type Inspeccion } from "@/lib/cora/inspector";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";

export type EstadoInspector = { ok: true; r: Inspeccion; texto: string } | { ok: false; error: string } | null;

// Inspector de fuentes: lee desde el servidor qué publica una fuente oficial de datos abiertos (solo lectura).
export async function inspeccionarFuenteAction(_prev: EstadoInspector, form: FormData): Promise<EstadoInspector> {
  if (!isSupervisorRole(await myStaffRole())) return { ok: false, error: "Solo supervisión y administración pueden usar el inspector." };
  try {
    const r = await inspeccionar(String(form.get("fuente") ?? ""));
    return { ok: true, r, texto: comoTexto(r) };
  } catch (e) {
    const m = e instanceof Error ? (e.name === "TimeoutError" || e.name === "AbortError" ? "La fuente no respondió a tiempo." : e.message) : "Error inesperado";
    return { ok: false, error: m.slice(0, 300) };
  }
}
