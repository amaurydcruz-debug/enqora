"use server";

import { origenInterno } from "@/lib/interno";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";

// Mando: dispara ahora la carga de marcas INAPI (la misma del cron diario). Solo supervisión.
export async function cargarMarcasAhoraAction(): Promise<void> {
  const role = await myStaffRole();
  if (!role || !isSupervisorRole(role)) redirect("/mando");
  const secret = process.env.CRON_SECRET;
  if (!secret) redirect("/mando/marcas-inapi?aviso=sin_secreto");
  const h = await headers();
  const origin = origenInterno(h);
  // No se espera el resultado completo: la carga sigue encadenada en el servidor.
  await fetch(`${origin}/api/cron/marcas`, { headers: { authorization: `Bearer ${secret}` }, cache: "no-store", signal: AbortSignal.timeout(8_000) }).catch(() => undefined);
  redirect("/mando/marcas-inapi?aviso=iniciada");
}

// Caso de la línea Marcas: revisión única de marcas parecidas (solo equipo).
export async function revisarMarcasCasoAction(form: FormData): Promise<void> {
  const caso = String(form.get("caso") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(caso)) redirect("/mando");
  const q = String(form.get("q") ?? "").trim().slice(0, 120);
  const clases = [...new Set(String(form.get("clases") ?? "").split(/[^\d]+/).filter(Boolean).map(Number).filter((n) => n >= 1 && n <= 45))];
  const { error } = await (await createClient()).rpc("caso_revisar_marcas", { p_case: caso, p_texto: q, p_clases: clases.length ? clases : null });
  const codigo = error ? /ENQ_[A-Z_]+/.exec(error.message)?.[0] ?? "ENQ_DATOS_INVALIDOS" : null;
  redirect(`/casos/${caso}?${codigo ? `error=${codigo}` : "aviso=marcas"}#marcas`);
}
