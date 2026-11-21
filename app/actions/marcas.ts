"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";

// Mando: dispara ahora la carga de marcas INAPI (la misma del cron diario). Solo supervisión.
export async function cargarMarcasAhoraAction(): Promise<void> {
  const role = await myStaffRole();
  if (!role || !isSupervisorRole(role)) redirect("/mando");
  const secret = process.env.CRON_SECRET;
  if (!secret) redirect("/mando/marcas-inapi?aviso=sin_secreto");
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? ""}`;
  // No se espera el resultado completo: la carga sigue encadenada en el servidor.
  await fetch(`${origin}/api/cron/marcas`, { headers: { authorization: `Bearer ${secret}` }, cache: "no-store", signal: AbortSignal.timeout(8_000) }).catch(() => undefined);
  redirect("/mando/marcas-inapi?aviso=iniciada");
}
