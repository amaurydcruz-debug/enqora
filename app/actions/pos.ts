"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbCode, dbMessage } from "@/lib/db-errors";
import type { DiaPOS } from "@/lib/pos";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Carga del resumen diario desde la exportación del POS (el navegador ya agrupó por día).
export async function cargarPosAction(companyId: string, dias: DiaPOS[], sistema: string, archivo: string): Promise<{ error?: string; ok?: string }> {
  if (!UUID.test(companyId) || !Array.isArray(dias) || !dias.length) return { error: "No hay días para cargar." };
  const supabase = await createClient();
  let total = 0;
  let n = 0;
  for (let i = 0; i < dias.length; i += 62) {
    const { data, error } = await supabase.rpc("pos_cargar_dias", { p_company: companyId, p_dias: dias.slice(i, i + 62), p_sistema: sistema.slice(0, 40) || "POS", p_archivo: archivo.slice(0, 200) });
    if (error) return { error: dbMessage(error) };
    total += Number((data as { total?: number })?.total ?? 0);
    n += Number((data as { dias?: number })?.dias ?? 0);
  }
  revalidatePath("/contabilidad");
  return { ok: `${n} día(s) cargados por un total de $${total.toLocaleString("es-CL")}.` };
}

export type ConectorState = { error?: string; clave?: string } | undefined;

// El dueño crea la clave del conector: se muestra UNA sola vez (ENQORA guarda solo su huella).
export async function crearConectorAction(_: ConectorState, form: FormData): Promise<ConectorState> {
  const company = String(form.get("company_id") ?? "");
  const nombre = String(form.get("nombre") ?? "").trim();
  const sistema = String(form.get("sistema") ?? "").trim();
  if (!UUID.test(company) || nombre.length < 2) return { error: "Ponle un nombre a la conexión (ej.: Caja 1)." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pos_crear_conector", { p_company: company, p_nombre: nombre, p_sistema: sistema || "Vania POS" });
  if (error || typeof data !== "string") return { error: dbMessage(error) };
  revalidatePath("/contabilidad/punto-de-venta");
  return { clave: data };
}

export async function revocarConectorAction(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) redirect("/contabilidad/punto-de-venta?error=ENQ_DATOS_INVALIDOS");
  const { error } = await (await createClient()).rpc("pos_revocar_conector", { p_id: id });
  revalidatePath("/contabilidad/punto-de-venta");
  redirect(`/contabilidad/punto-de-venta?${error ? `error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}` : "aviso=revocado"}`);
}
