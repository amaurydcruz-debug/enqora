"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { leerFactores } from "@/lib/certificado6";
import { dbCode } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const anioValido = (a: number) => Number.isInteger(a) && a >= 2020 && a <= 2100;

// La empresa emite el certificado: la base de datos suma las liquidaciones aprobadas y numera en forma correlativa.
export async function emitirCertificadoAction(form: FormData): Promise<void> {
  const id = txt(form, "trabajador");
  const anio = Number(txt(form, "anio"));
  const volver = (q: string): never => { revalidatePath("/remuneraciones/anual"); redirect(`/remuneraciones/anual?anio=${anioValido(anio) ? anio : ""}&${q}`); };
  if (!UUID.test(id) || !anioValido(anio)) volver("error=ENQ_DATOS_INVALIDOS");
  const { data, error } = await (await createClient()).rpc("rem_certificado_emitir", { p_trabajador: id, p_anio: anio });
  if (error || !data) volver(`error=${(error && dbCode(error)) ?? "ENQ_DATOS_INVALIDOS"}`);
  revalidatePath("/remuneraciones/anual");
  redirect(`/remuneraciones/certificado/${data as string}`);
}

// Equipo ENQORA: factores de actualización que publica el SII para el año comercial.
export async function guardarFactoresAction(form: FormData): Promise<void> {
  const anio = Number(txt(form, "anio"));
  const volver = (q: string): never => { revalidatePath("/mando/remuneraciones"); redirect(`/mando/remuneraciones?${q}#factores`); };
  const valores: Record<number, string> = {};
  for (let m = 1; m <= 12; m++) valores[m] = txt(form, `f${m}`);
  const factores = leerFactores(valores);
  if (!anioValido(anio) || !factores || txt(form, "fuente").length < 3) volver("error=ENQ_DATOS_INVALIDOS");
  const { error } = await (await createClient()).rpc("rem_factores_guardar", { p_anio: anio, p_factores: factores, p_fuente: txt(form, "fuente") });
  if (error) volver(`error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}`);
  volver("aviso=factores");
}
