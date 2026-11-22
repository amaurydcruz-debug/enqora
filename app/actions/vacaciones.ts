"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbCode } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const decimal = (f: FormData, k: string) => { const v = txt(f, k).replace(/\s/g, "").replace(",", "."); return v === "" ? NaN : Number(v); };

function volver(id: string, q: string): never {
  revalidatePath("/remuneraciones");
  redirect(`/remuneraciones?${q}#t-${UUID.test(id) ? id : ""}`);
}

// Registra días tomados, el saldo inicial o el feriado progresivo. Los días hábiles de un período los cuenta la base.
export async function registrarVacacionAction(form: FormData): Promise<void> {
  const id = txt(form, "trabajador");
  const tipo = txt(form, "tipo");
  const desde = txt(form, "desde");
  const hasta = txt(form, "hasta");
  if (!UUID.test(id) || !["tomado", "saldo_inicial", "progresivo"].includes(tipo) || !FECHA.test(desde) || (tipo === "tomado" && !FECHA.test(hasta)))
    volver(id, "error=ENQ_VACACION_FECHAS");
  const dias = tipo === "tomado" ? null : decimal(form, "dias");
  if (dias !== null && !Number.isFinite(dias)) volver(id, "error=ENQ_DATOS_INVALIDOS");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rem_vacacion_registrar", {
    p_trabajador: id, p_tipo: tipo, p_desde: desde, p_hasta: tipo === "tomado" ? hasta : null, p_dias: dias, p_nota: txt(form, "nota") || null,
  });
  if (error || !data) volver(id, `error=${(error && dbCode(error)) ?? "ENQ_DATOS_INVALIDOS"}`);
  if (tipo === "tomado") { revalidatePath("/remuneraciones"); redirect(`/remuneraciones/vacaciones/${data as string}`); }
  volver(id, "aviso=vacacion");
}

export async function anularVacacionAction(form: FormData): Promise<void> {
  const id = txt(form, "id");
  const trab = txt(form, "trabajador");
  if (!UUID.test(id)) volver(trab, "error=ENQ_DATOS_INVALIDOS");
  const { error } = await (await createClient()).rpc("rem_vacacion_anular", { p_id: id, p_motivo: txt(form, "motivo") });
  if (error) volver(trab, `error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}`);
  volver(trab, "aviso=vacacion_anulada");
}
