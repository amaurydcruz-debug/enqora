"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbCode } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// «Tu mes» (0066): el cliente aprueba el F29 ya revisado por un contador ENQORA. Queda la constancia con el monto.
export async function aprobarMiMesAction(form: FormData): Promise<void> {
  const id = String(form.get("return_id") ?? "");
  if (!UUID.test(id) || form.get("confirmo") !== "si") redirect("/panel?error=ENQ_CONFIRMA_MES#tu-mes");
  const supabase = await createClient();
  const { error } = await supabase.rpc("aprobar_mi_mes", { p_return: id });
  revalidatePath("/panel");
  redirect(error ? `/panel?error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}#tu-mes` : "/panel?aviso=mes_aprobado#tu-mes");
}

// El cliente tiene una duda: el F29 vuelve al borrador con su nota y el equipo recibe el aviso.
export async function observarMiMesAction(form: FormData): Promise<void> {
  const id = String(form.get("return_id") ?? "");
  const nota = String(form.get("nota") ?? "").trim().slice(0, 1000);
  if (!UUID.test(id) || nota.length < 5) redirect("/panel?error=ENQ_DATOS_INVALIDOS#tu-mes");
  const supabase = await createClient();
  const { error } = await supabase.rpc("observar_mi_mes", { p_return: id, p_nota: nota });
  revalidatePath("/panel");
  redirect(error ? `/panel?error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}#tu-mes` : "/panel?aviso=mes_observado#tu-mes");
}
