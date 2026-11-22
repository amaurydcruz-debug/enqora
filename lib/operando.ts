import "server-only";
import { cookies } from "next/headers";
import { myStaffRole } from "@/lib/staff";

// Empresa que el equipo ENQORA está operando (Remuneraciones y Laboral son un servicio que presta ENQORA).
// Se fija desde el Centro de Mando (/mando/operar) y solo vale para personas del equipo con pase vigente; los permisos
// reales los aplica la base de datos (private.works_company / rem_puede).
export const OPERANDO_COOKIE = "enq_operando";
export const DESTINOS_OPERAR = ["/remuneraciones", "/remuneraciones/anual", "/laboral", "/laboral/reglamento", "/datos-personales"] as const;

export async function empresaOperadaId(): Promise<string | null> {
  const v = (await cookies()).get(OPERANDO_COOKIE)?.value ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(v)) return null;
  const rol = await myStaffRole();
  return rol && rol !== "ai_agent" ? v : null;
}
