"use server";

import { comoTexto, inspeccionar, type Inspeccion } from "@/lib/cora/inspector";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";

// fetch() resume los fallos de red como «fetch failed»: se agrega la causa real (certificado, DNS, conexión rechazada…).
function detalle(e: Error): string {
  const c = (e as { cause?: { code?: string; message?: string; cause?: { code?: string; message?: string } } }).cause;
  const partes = [c?.code, c?.message, c?.cause?.code, c?.cause?.message].filter(Boolean);
  return `${e.message === "fetch failed" ? "No se pudo conectar con la fuente" : e.message}${partes.length ? ` (${[...new Set(partes)].join(": ")})` : ""}`;
}

export type EstadoInspector = { ok: true; r: Inspeccion; texto: string } | { ok: false; error: string } | null;

// Inspector de fuentes: lee desde el servidor qué publica una fuente oficial de datos abiertos (solo lectura).
export async function inspeccionarFuenteAction(_prev: EstadoInspector, form: FormData): Promise<EstadoInspector> {
  if (!isSupervisorRole(await myStaffRole())) return { ok: false, error: "Solo supervisión y administración pueden usar el inspector." };
  try {
    const r = await inspeccionar(String(form.get("fuente") ?? ""));
    return { ok: true, r, texto: comoTexto(r) };
  } catch (e) {
    const m = e instanceof Error ? (e.name === "TimeoutError" || e.name === "AbortError" ? "La fuente no respondió a tiempo." : detalle(e)) : "Error inesperado";
    return { ok: false, error: m.slice(0, 300) };
  }
}
