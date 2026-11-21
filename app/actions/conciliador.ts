"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbCode } from "@/lib/db-errors";
import type { PreguntaPropuesta, Propuesta } from "@/lib/conciliador";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERIODO = /^\d{4}-\d{2}-01$/;
const ym = (p: string) => p.slice(0, 7);

// Una persona aplica las propuestas del conciliador que marcó. Cada una pasa por las mismas reglas de la base
// (monto exacto, sin duplicar) y el lote queda en la bitácora.
export async function aplicarPropuestasAction(companyId: string, period: string, items: Propuesta[]): Promise<{ ok?: string; error?: string }> {
  if (!UUID.test(companyId) || !PERIODO.test(period) || !Array.isArray(items) || !items.length) return { error: "Marca al menos una propuesta." };
  const supabase = await createClient();
  let ok = 0;
  const fallidas: string[] = [];
  for (const p of items.slice(0, 500)) {
    if (!UUID.test(p.movement_id)) continue;
    const { error } = p.tipo === "documento" && UUID.test(p.document_id)
      ? await supabase.rpc("reconcile", { p_movement: p.movement_id, p_document: p.document_id })
      : p.tipo === "categoria"
        ? await supabase.rpc("reconcile_other", { p_movement: p.movement_id, p_category: p.categoria, p_note: `Conciliador: ${p.motivo}`.slice(0, 300) })
        : { error: { message: "ENQ_DATOS_INVALIDOS" } };
    if (error) fallidas.push(dbCode(error) ?? "error");
    else ok++;
  }
  await supabase.rpc("registrar_conciliacion_agente", {
    p_company: companyId, p_period: period, p_aplicadas: ok,
    p_detalle: items.slice(0, 200).map((p) => ({ m: p.movement_id, t: p.tipo, c: p.certeza, motivo: p.motivo })),
  });
  revalidatePath(`/contabilidad/${ym(period)}`);
  return fallidas.length ? { ok: `${ok} aplicadas.`, error: `${fallidas.length} no se pudieron aplicar (ya conciliadas o el monto cambió).` } : { ok: `${ok} propuesta(s) aplicadas.` };
}

export async function enviarPreguntasAction(companyId: string, period: string, preguntas: PreguntaPropuesta[]): Promise<{ ok?: string; error?: string }> {
  if (!UUID.test(companyId) || !PERIODO.test(period) || !preguntas.length) return { error: "No hay preguntas para enviar." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crear_preguntas_mes", { p_company: companyId, p_period: period, p: preguntas.slice(0, 40) });
  if (error) return { error: dbCode(error) === "ENQ_SIN_PERMISO" ? "Solo el contador o el equipo ENQORA envía preguntas al cliente." : "No se pudieron enviar." };
  revalidatePath(`/contabilidad/${ym(period)}`);
  return { ok: `${Number(data ?? 0)} pregunta(s) enviadas al cliente.` };
}

const volverPeriodo = (form: FormData, q: string) => {
  const p = String(form.get("periodo") ?? "");
  const e = String(form.get("empresa") ?? "");
  redirect(`/contabilidad/${/^\d{4}-\d{2}$/.test(p) ? p : ""}?${UUID.test(e) ? `empresa=${e}&` : ""}${q}#conciliador`);
};

export async function aplicarPreguntaAction(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const categoria = String(form.get("categoria") ?? "") || null;
  if (!UUID.test(id)) volverPeriodo(form, "error=ENQ_DATOS_INVALIDOS");
  const { error } = await (await createClient()).rpc("aplicar_pregunta", { p_id: id, p_categoria: categoria });
  revalidatePath("/contabilidad");
  volverPeriodo(form, error ? `error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}` : "aviso=pregunta_aplicada");
}

export async function anularPreguntaAction(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) volverPeriodo(form, "error=ENQ_DATOS_INVALIDOS");
  const { error } = await (await createClient()).rpc("anular_pregunta", { p_id: id });
  revalidatePath("/contabilidad");
  volverPeriodo(form, error ? `error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}` : "aviso=pregunta_anulada");
}

// El cliente responde con un toque desde su inicio.
export async function responderPreguntaAction(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const respuesta = String(form.get("respuesta") ?? "");
  const nota = String(form.get("nota") ?? "").trim().slice(0, 500);
  if (!UUID.test(id) || !respuesta) redirect("/panel?error=ENQ_DATOS_INVALIDOS#preguntas");
  const { error } = await (await createClient()).rpc("responder_pregunta", { p_id: id, p_respuesta: respuesta, p_nota: nota || null });
  revalidatePath("/panel");
  redirect(error ? `/panel?error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}#preguntas` : "/panel?aviso=respuesta#preguntas");
}
