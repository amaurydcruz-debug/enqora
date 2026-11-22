"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbCode } from "@/lib/db-errors";
import {
  avisosContrato, PLANTILLA_CONTRATO_VERSION, textoAnexo, textoContrato, textoPactoHE, validarAnexo, validarContrato, validarPactoHE, type FichaContrato,
} from "@/lib/plantilla-contrato";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function volver(id: string, q: string): never {
  revalidatePath("/remuneraciones");
  redirect(`/remuneraciones?${q}#t-${UUID.test(id) ? id : ""}`);
}
function volverMando(q: string): never {
  revalidatePath("/mando/laboral");
  redirect(`/mando/laboral?${q}#contratos`);
}

async function contexto(id: string) {
  const supabase = await createClient();
  const { data: t } = await supabase.from("rem_trabajadores")
    .select("id, company_id, nombre, rut, cargo, fecha_ingreso, tipo_contrato, sueldo_base, jornada_horas, colacion, movilizacion, gratificacion, activo").eq("id", id).maybeSingle();
  const trab = t as (FichaContrato & { id: string; company_id: string; activo: boolean }) | null;
  if (!trab) return null;
  const [{ data: e }, { data: par }] = await Promise.all([
    supabase.from("companies").select("legal_name, rut, address, commune").eq("id", trab.company_id).maybeSingle(),
    supabase.from("rem_parametros").select("valores").eq("estado", "aprobado").order("periodo", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const emp = e as { legal_name: string; rut: string; address: string | null; commune: string | null } | null;
  if (!emp) return null;
  const ficha: FichaContrato = { ...trab, sueldo_base: Number(trab.sueldo_base), jornada_horas: Number(trab.jornada_horas),
    colacion: Number(trab.colacion), movilizacion: Number(trab.movilizacion) };
  return {
    supabase, ficha, empresa: { nombre: emp.legal_name, rut: emp.rut, domicilio: [emp.address, emp.commune].filter(Boolean).join(", ") },
    imm: (par as { valores?: { imm?: number } } | null)?.valores?.imm ?? null,
  };
}

// La empresa arma el borrador del contrato desde la ficha y lo envía a revisión del abogado.
export async function guardarContratoAction(form: FormData): Promise<void> {
  const id = txt(form, "trabajador");
  if (!UUID.test(id)) volver(id, "error=ENQ_DATOS_INVALIDOS");
  const ctx = await contexto(id);
  if (!ctx) volver(id, "error=ENQ_DATOS_INVALIDOS");
  const campos = ["ciudad", "fecha", "nacionalidad", "fecha_nacimiento", "domicilio_trabajador", "email_trabajador", "representante", "rut_representante",
    "email_empleador", "funciones", "lugar", "distribucion", "plazo_hasta", "obra", "forma_pago", "dia_pago", "especies", "procedencia", "otros_pactos"] as const;
  const d = validarContrato(Object.fromEntries(campos.map((k) => [k, txt(form, k)])), ctx.ficha);
  if (typeof d === "string") volver(id, "error=ENQ_CONTRATO_DATOS");
  const { error } = await ctx.supabase.rpc("rem_contrato_guardar", {
    p_trabajador: id, p_tipo: "contrato", p_plantilla: PLANTILLA_CONTRATO_VERSION, p_datos: d,
    p_contenido: textoContrato(d, ctx.ficha, ctx.empresa), p_avisos: avisosContrato(d, ctx.ficha, ctx.imm),
  });
  if (error) volver(id, `error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}`);
  volver(id, "aviso=contrato");
}

export async function guardarAnexoAction(form: FormData): Promise<void> {
  const id = txt(form, "trabajador");
  const reemplaza = txt(form, "reemplaza");
  if (!UUID.test(id) || (reemplaza && !UUID.test(reemplaza))) volver(id, "error=ENQ_DATOS_INVALIDOS");
  const ctx = await contexto(id);
  if (!ctx) volver(id, "error=ENQ_DATOS_INVALIDOS");
  const d = validarAnexo({ ciudad: txt(form, "ciudad"), fecha: txt(form, "fecha"), materia: txt(form, "materia"), vigencia: txt(form, "vigencia"),
    texto: String(form.get("texto") ?? ""), representante: txt(form, "representante") });
  if (typeof d === "string") volver(id, "error=ENQ_CONTRATO_DATOS");
  // El número se conoce después de guardar: el texto usa el siguiente número disponible (o el del anexo que reemplaza).
  const { data: prev } = await ctx.supabase.from("rem_contratos").select("id, numero_anexo").eq("trabajador_id", id).eq("tipo", "anexo");
  const filas = (prev ?? []) as { id: string; numero_anexo: number }[];
  const numero = reemplaza ? filas.find((f) => f.id === reemplaza)?.numero_anexo ?? 0 : filas.reduce((m, f) => Math.max(m, f.numero_anexo), 0) + 1;
  if (!numero) volver(id, "error=ENQ_DATOS_INVALIDOS");
  const { error } = await ctx.supabase.rpc("rem_contrato_guardar", {
    p_trabajador: id, p_tipo: "anexo", p_plantilla: PLANTILLA_CONTRATO_VERSION, p_datos: d,
    p_contenido: textoAnexo(d, ctx.ficha, ctx.empresa, numero), p_avisos: [], p_reemplaza: reemplaza || null,
  });
  if (error) volver(id, `error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}`);
  volver(id, "aviso=anexo");
}

export async function guardarPactoAction(form: FormData): Promise<void> {
  const id = txt(form, "trabajador");
  const reemplaza = txt(form, "reemplaza");
  if (!UUID.test(id) || (reemplaza && !UUID.test(reemplaza))) volver(id, "error=ENQ_DATOS_INVALIDOS");
  const ctx = await contexto(id);
  if (!ctx) volver(id, "error=ENQ_DATOS_INVALIDOS");
  const d = validarPactoHE({ ciudad: txt(form, "ciudad"), fecha: txt(form, "fecha"), desde: txt(form, "desde"), hasta: txt(form, "hasta"),
    horas_dia: txt(form, "horas_dia"), motivo: txt(form, "motivo"), compensacion: txt(form, "compensacion"), representante: txt(form, "representante") }, ctx.ficha.fecha_ingreso);
  if (typeof d === "string") volver(id, "error=ENQ_PACTO_HE_FECHAS");
  const { error } = await ctx.supabase.rpc("rem_contrato_guardar", {
    p_trabajador: id, p_tipo: "pacto_he", p_plantilla: PLANTILLA_CONTRATO_VERSION, p_datos: d,
    p_contenido: textoPactoHE(d, ctx.ficha, ctx.empresa), p_avisos: [], p_reemplaza: reemplaza || null,
  });
  if (error) volver(id, `error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}`);
  volver(id, "aviso=pacto");
}

export async function anularContratoAction(form: FormData): Promise<void> {
  const id = txt(form, "id");
  const trab = txt(form, "trabajador");
  const mando = txt(form, "origen") === "mando";
  if (!UUID.test(id)) (mando ? volverMando : (q: string) => volver(trab, q))("error=ENQ_DATOS_INVALIDOS");
  const { error } = await (await createClient()).rpc("rem_contrato_anular", { p_id: id, p_motivo: txt(form, "motivo") });
  const q = error ? `error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}` : "aviso=contrato_anulado";
  if (mando) volverMando(q);
  volver(trab, q);
}

// Abogado de ENQORA: aprobar u observar.
export async function revisarContratoAction(form: FormData): Promise<void> {
  const id = txt(form, "id");
  const decision = txt(form, "decision");
  if (!UUID.test(id) || !["aprobar", "observar"].includes(decision)) volverMando("error=ENQ_DATOS_INVALIDOS");
  if (decision === "aprobar" && form.get("confirmo") !== "si") volverMando("error=ENQ_CONFIRMA_REVISION");
  const { error } = await (await createClient()).rpc("rem_contrato_revisar", { p_id: id, p_decision: decision, p_observacion: txt(form, "observacion") || null });
  if (error) volverMando(`error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}`);
  volverMando(`aviso=contrato_${decision}`);
}
