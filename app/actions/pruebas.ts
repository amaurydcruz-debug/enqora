"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";

// Sala de pruebas (0095): crea la empresa ficticia si no existe y agrega 4 casos de prueba nuevos.
export async function prepararSalaPruebasAction() {
  if (!isSupervisorRole(await myStaffRole())) redirect("/mando/pruebas?error=ENQ_SIN_PERMISO");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sala_pruebas_preparar");
  revalidatePath("/mando/pruebas");
  if (error) {
    console.error("[ENQORA Sala de pruebas]", error.message);
    redirect(`/mando/pruebas?error=${/ENQ_[A-Z_]+/.exec(error.message)?.[0] ?? "ENQ_ERROR"}`);
  }
  const n = ((data as { casos?: unknown[] } | null)?.casos ?? []).length;
  redirect(`/mando/pruebas?aviso=preparada_${n}`);
}
