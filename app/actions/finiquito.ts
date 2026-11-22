"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbCode } from "@/lib/db-errors";
import { calcularFiniquito, MOTOR_FINIQUITO, textoFiniquito, validarDatosFiniquito } from "@/lib/finiquito";
import { CAUSALES } from "@/lib/rem-archivos";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const entero = (f: FormData, k: string) => { const v = txt(f, k).replace(/[.\s$]/g, ""); return v === "" ? 0 : Number(v); };
const decimal = (f: FormData, k: string) => { const v = txt(f, k).replace(/\s/g, "").replace(/\./g, "").replace(",", "."); return v === "" ? 0 : Number(v); };

function volver(q: string, ancla = ""): never {
  revalidatePath("/remuneraciones");
  redirect(`/remuneraciones?${q}${ancla}`);
}
function volverMando(q: string): never {
  revalidatePath("/mando/remuneraciones");
  redirect(`/mando/remuneraciones?${q}#finiquitos`);
}

// La empresa calcula la propuesta con sus datos y la envía a revisión del equipo ENQORA.
export async function calcularFiniquitoAction(form: FormData): Promise<void> {
  const id = txt(form, "trabajador");
  if (!UUID.test(id)) volver("error=ENQ_DATOS_INVALIDOS");
  const supabase = await createClient();
  const { data: t } = await supabase.from("rem_trabajadores")
    .select("id, company_id, rut, nombre, cargo, fecha_ingreso, fecha_baja, causal_termino").eq("id", id).maybeSingle();
  const trab = t as { id: string; company_id: string; rut: string; nombre: string; cargo: string | null; fecha_ingreso: string;
    fecha_baja: string | null; causal_termino: number | null } | null;
  if (!trab) volver("error=ENQ_DATOS_INVALIDOS");
  if (!trab.fecha_baja || !trab.causal_termino) volver("error=ENQ_FINIQUITO_SIN_BAJA", `#t-${id}`);
  const datos = validarDatosFiniquito({
    fecha_ingreso: trab.fecha_ingreso, fecha_termino: trab.fecha_baja, causal: trab.causal_termino,
    base_indemnizacion: entero(form, "base_indemnizacion"), base_feriado: entero(form, "base_feriado"),
    aviso_dado: txt(form, "aviso_dado") === "si", feriado_anual: decimal(form, "feriado_anual") || 15,
    dias_pendientes: decimal(form, "dias_pendientes"), uf: decimal(form, "uf"), aporte_afc: entero(form, "aporte_afc"),
    otros_haberes: entero(form, "otros_haberes"), otros_descuentos: entero(form, "otros_descuentos"), detalle_otros: txt(form, "detalle_otros"),
  });
  if (typeof datos === "string") volver("error=ENQ_FINIQUITO_DATOS", `#t-${id}`);
  const [{ data: emp }, { data: fer }] = await Promise.all([
    supabase.from("companies").select("legal_name, rut, address, commune").eq("id", trab.company_id).maybeSingle(),
    supabase.from("rem_feriados").select("fecha"),
  ]);
  const e = emp as { legal_name: string; rut: string; address: string | null; commune: string | null } | null;
  if (!e) volver("error=ENQ_DATOS_INVALIDOS");
  const festivos = new Set(((fer ?? []) as { fecha: string }[]).map((f) => f.fecha));
  const res = calcularFiniquito(datos, festivos);
  const contenido = textoFiniquito({
    empresa: e.legal_name, rut_empresa: e.rut, domicilio: [e.address, e.commune].filter(Boolean).join(", "),
    trabajador: trab.nombre, rut_trabajador: trab.rut, cargo: trab.cargo, causal_texto: CAUSALES[trab.causal_termino] ?? String(trab.causal_termino),
  }, datos, res);
  const { error: err } = await supabase.rpc("rem_finiquito_guardar", {
    p_trabajador: id, p_motor: MOTOR_FINIQUITO, p_datos: datos, p_detalle: res, p_contenido: contenido, p_total: res.total,
  });
  if (err) volver(`error=${dbCode(err) ?? "ENQ_DATOS_INVALIDOS"}`, `#t-${id}`);
  volver("aviso=finiquito", `#t-${id}`);
}

export async function anularFiniquitoAction(form: FormData): Promise<void> {
  const id = txt(form, "id");
  const desdeMando = txt(form, "origen") === "mando";
  if (!UUID.test(id)) (desdeMando ? volverMando : volver)("error=ENQ_DATOS_INVALIDOS");
  const { error: err } = await (await createClient()).rpc("rem_finiquito_anular", { p_id: id, p_motivo: txt(form, "motivo") });
  const q = err ? `error=${dbCode(err) ?? "ENQ_DATOS_INVALIDOS"}` : "aviso=finiquito_anulado";
  if (desdeMando) volverMando(q);
  volver(q);
}

// Revisión del equipo (contador o abogado de ENQORA).
export async function revisarFiniquitoAction(form: FormData): Promise<void> {
  const id = txt(form, "id");
  const decision = txt(form, "decision");
  if (!UUID.test(id) || !["aprobar", "observar"].includes(decision)) volverMando("error=ENQ_DATOS_INVALIDOS");
  if (decision === "aprobar" && form.get("confirmo") !== "si") volverMando("error=ENQ_CONFIRMA_REVISION");
  const { error: err } = await (await createClient()).rpc("rem_finiquito_revisar", {
    p_id: id, p_decision: decision, p_observacion: txt(form, "observacion") || null,
  });
  if (err) volverMando(`error=${dbCode(err) ?? "ENQ_DATOS_INVALIDOS"}`);
  volverMando(`aviso=finiquito_${decision === "aprobar" ? "aprobado" : "observado"}`);
}

export async function guardarFeriadoAction(form: FormData): Promise<void> {
  const fecha = txt(form, "fecha");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) volverMando("error=ENQ_DATOS_INVALIDOS");
  const { error: err } = await (await createClient()).rpc("rem_feriado_guardar", { p_fecha: fecha, p_nombre: txt(form, "nombre"), p_fuente: txt(form, "fuente") });
  if (err) volverMando(`error=${dbCode(err) ?? "ENQ_DATOS_INVALIDOS"}`);
  volverMando("aviso=feriado");
}

export async function quitarFeriadoAction(form: FormData): Promise<void> {
  const fecha = txt(form, "fecha");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) volverMando("error=ENQ_DATOS_INVALIDOS");
  const { error: err } = await (await createClient()).rpc("rem_feriado_quitar", { p_fecha: fecha, p_motivo: txt(form, "motivo") });
  if (err) volverMando(`error=${dbCode(err) ?? "ENQ_DATOS_INVALIDOS"}`);
  volverMando("aviso=feriado_quitado");
}
