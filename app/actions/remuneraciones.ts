"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbCode } from "@/lib/db-errors";
import { CAUSALES, CCAFS, ISAPRES, JORNADAS_LRE } from "@/lib/rem-archivos";
import {
  AFPS, CLAVES_PARAMETROS, leerNovedades, leerParametros, liquidar, MOTOR_REM, MUTUALES, normalizarRut, periodoValido, type Trabajador,
} from "@/lib/remuneraciones";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const entero = (f: FormData, k: string) => { const v = txt(f, k).replace(/[.\s$]/g, ""); return v === "" ? 0 : Number(v); };
const decimal = (f: FormData, k: string) => { const v = txt(f, k).replace(/\s/g, "").replace(/\./g, "").replace(",", "."); return v === "" ? NaN : Number(v); };

function volver(periodo: string, q: string, ancla = ""): never {
  revalidatePath("/remuneraciones");
  redirect(`/remuneraciones?${periodoValido(periodo) ? `periodo=${periodo}&` : ""}${q}${ancla}`);
}
const error = (periodo: string, e: { message?: string; code?: string } | null, fallback = "ENQ_DATOS_INVALIDOS") =>
  volver(periodo, `error=${(e && dbCode(e)) ?? fallback}`);

export async function guardarMutualAction(form: FormData): Promise<void> {
  const company = txt(form, "empresa");
  const periodo = txt(form, "periodo");
  const mutual = txt(form, "mutual");
  const tasa = decimal(form, "tasa");
  const ccaf = Number(txt(form, "ccaf") || 0);
  const suc = txt(form, "sucursal") === "" ? null : Number(txt(form, "sucursal"));
  if (!UUID.test(company) || !MUTUALES.includes(mutual as (typeof MUTUALES)[number]) || !(tasa >= 0.9 && tasa <= 8) || !(ccaf in CCAFS)
      || (suc !== null && !(Number.isInteger(suc) && suc >= 1 && suc <= 999))) error(periodo, null);
  const { error: e } = await (await createClient()).rpc("rem_guardar_empresa", {
    p_company: company, p_mutual: mutual, p_tasa: tasa, p_ccaf: ccaf, p_sucursal: suc,
  });
  if (e) error(periodo, e);
  volver(periodo, "aviso=mutual");
}

export async function guardarTrabajadorAction(form: FormData): Promise<void> {
  const company = txt(form, "empresa");
  const periodo = txt(form, "periodo");
  const id = txt(form, "id");
  const rut = normalizarRut(txt(form, "rut"));
  if (!UUID.test(company) || (id && !UUID.test(id))) error(periodo, null);
  if (!id && !rut) error(periodo, null, "ENQ_RUT_INVALIDO");
  const salud = txt(form, "salud") === "isapre" ? "isapre" : "fonasa";
  const plan = decimal(form, "plan_isapre_uf");
  const afp = txt(form, "afp");
  const comuna = txt(form, "comuna");
  const jornadaLre = txt(form, "jornada_lre");
  const isapre = txt(form, "isapre");
  const sexo = txt(form, "sexo");
  if ((comuna && !/^\d{4,5}$/.test(comuna)) || (jornadaLre && !(Number(jornadaLre) in JORNADAS_LRE)) || (sexo && !["M", "F"].includes(sexo))
      || (salud === "isapre" && !(isapre in ISAPRES))
      || (["A", "B"].includes(txt(form, "apv_regimen")) && (!(entero(form, "apv_monto") > 0) || !AFPS.includes(txt(form, "apv_afp") as (typeof AFPS)[number])))) error(periodo, null);
  const datos = {
    rut, apellido_paterno: txt(form, "apellido_paterno").slice(0, 30), apellido_materno: txt(form, "apellido_materno").slice(0, 30),
    nombres: txt(form, "nombres").slice(0, 30), sexo, extranjero: txt(form, "extranjero") === "si", comuna, jornada_lre: jornadaLre,
    fun: salud === "isapre" ? txt(form, "fun").slice(0, 16) : "",
    apv_regimen: ["A", "B"].includes(txt(form, "apv_regimen")) ? txt(form, "apv_regimen") : "",
    apv_monto: ["A", "B"].includes(txt(form, "apv_regimen")) ? entero(form, "apv_monto") : "",
    apv_afp: ["A", "B"].includes(txt(form, "apv_regimen")) ? txt(form, "apv_afp") : "",
    apv_contrato: ["A", "B"].includes(txt(form, "apv_regimen")) ? txt(form, "apv_contrato").slice(0, 20) : "",
    apv_forma: ["A", "B"].includes(txt(form, "apv_regimen")) ? (txt(form, "apv_forma") === "2" ? 2 : 1) : "", cargo: txt(form, "cargo").slice(0, 80), fecha_ingreso: txt(form, "fecha_ingreso"),
    tipo_contrato: txt(form, "tipo_contrato"), sueldo_base: entero(form, "sueldo_base"), jornada_horas: decimal(form, "jornada_horas"),
    afp, salud, isapre: salud === "isapre" ? isapre : "", plan_isapre_uf: salud === "isapre" && Number.isFinite(plan) ? plan : "",
    colacion: entero(form, "colacion"), movilizacion: entero(form, "movilizacion"),
    gratificacion: txt(form, "gratificacion") === "ninguna" ? "ninguna" : "art50",
  };
  if (!AFPS.includes(afp as (typeof AFPS)[number]) || !/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha_ingreso) || !Number.isFinite(datos.sueldo_base)
      || !Number.isFinite(datos.jornada_horas) || (salud === "isapre" && datos.plan_isapre_uf === "")) error(periodo, null);
  const { error: e } = await (await createClient()).rpc("rem_guardar_trabajador", { p_company: company, p_id: id || null, p_datos: datos });
  if (e) error(periodo, e);
  volver(periodo, `aviso=${id ? "trabajador_editado" : "trabajador"}`);
}

export async function bajaTrabajadorAction(form: FormData): Promise<void> {
  const periodo = txt(form, "periodo");
  const id = txt(form, "id");
  if (!UUID.test(id)) error(periodo, null);
  const causal = Number(txt(form, "causal"));
  if (!(causal in CAUSALES)) error(periodo, null);
  const { error: e } = await (await createClient()).rpc("rem_baja_trabajador", {
    p_id: id, p_fecha: txt(form, "fecha"), p_causal: causal, p_motivo: txt(form, "motivo"),
  });
  if (e) error(periodo, e);
  volver(periodo, "aviso=baja");
}

// Calcula en el servidor con los parámetros APROBADOS del mes y la tasa de la mutual; guarda un borrador.
export async function calcularLiquidacionAction(form: FormData): Promise<void> {
  const periodo = txt(form, "periodo");
  const id = txt(form, "trabajador");
  if (!UUID.test(id) || !periodoValido(periodo)) error(periodo, null);
  const nov = leerNovedades({
    dias_trabajados: txt(form, "dias") || 30, horas_extra: decimal(form, "horas_extra") || 0, bonos_imponibles: entero(form, "bonos"),
    anticipos: entero(form, "anticipos"), otros_descuentos: entero(form, "otros"),
  });
  if (!nov) error(periodo, null);
  const supabase = await createClient();
  const { data: t } = await supabase.from("rem_trabajadores").select("*").eq("id", id).eq("activo", true).maybeSingle();
  if (!t) error(periodo, null);
  const trab = t as Trabajador & { company_id: string; plan_isapre_uf: number | null };
  const [{ data: par }, { data: emp }] = await Promise.all([
    supabase.from("rem_parametros").select("id, valores").eq("periodo", periodo).eq("estado", "aprobado").maybeSingle(),
    supabase.from("rem_empresa").select("tasa_mutual").eq("company_id", trab.company_id).maybeSingle(),
  ]);
  const p = leerParametros((par as { valores?: unknown } | null)?.valores);
  if (!par || !p) error(periodo, null, "ENQ_SIN_PARAMETROS");
  if (!emp) error(periodo, null, "ENQ_SIN_MUTUAL");
  if (typeof p!.afp[trab.afp] !== "number") error(periodo, null, "ENQ_SIN_TASA_AFP");
  const ficha: Trabajador = { ...trab, sueldo_base: Number(trab.sueldo_base), jornada_horas: Number(trab.jornada_horas),
    plan_isapre_uf: trab.plan_isapre_uf == null ? null : Number(trab.plan_isapre_uf), colacion: Number(trab.colacion), movilizacion: Number(trab.movilizacion),
    apv_regimen: trab.apv_regimen ?? null, apv_monto: trab.apv_monto == null ? null : Number(trab.apv_monto) };
  const liq = liquidar(ficha, nov!, p!, Number((emp as { tasa_mutual: number }).tasa_mutual));
  const { error: e } = await supabase.rpc("rem_guardar_liquidacion", {
    p_trabajador: id, p_periodo: periodo, p_parametros: (par as { id: string }).id, p_motor: MOTOR_REM, p_novedades: nov,
    p_detalle: liq, p_imponible: liq.total_imponible, p_liquido: liq.liquido, p_costo: liq.costo_empresa,
  });
  if (e) error(periodo, e);
  volver(periodo, "aviso=calculada", `#t-${id}`);
}

export async function aprobarLiquidacionAction(form: FormData): Promise<void> {
  const periodo = txt(form, "periodo");
  const id = txt(form, "id");
  if (!UUID.test(id) || form.get("confirmo") !== "si") error(periodo, null, "ENQ_CONFIRMA_LIQUIDACION");
  const { error: e } = await (await createClient()).rpc("rem_aprobar_liquidacion", { p_id: id });
  if (e) error(periodo, e);
  volver(periodo, "aviso=aprobada");
}

export async function anularLiquidacionAction(form: FormData): Promise<void> {
  const periodo = txt(form, "periodo");
  const id = txt(form, "id");
  if (!UUID.test(id)) error(periodo, null);
  const { error: e } = await (await createClient()).rpc("rem_anular_liquidacion", { p_id: id, p_motivo: txt(form, "motivo") });
  if (e) error(periodo, e);
  volver(periodo, "aviso=anulada");
}

// ---------- Equipo ENQORA: parámetros del mes ----------
function volverMando(q: string): never {
  revalidatePath("/mando/remuneraciones");
  redirect(`/mando/remuneraciones?${q}`);
}

export async function proponerParametrosAction(form: FormData): Promise<void> {
  const periodo = txt(form, "periodo");
  if (!periodoValido(periodo)) volverMando("error=ENQ_PARAMETROS_INVALIDOS");
  const valores: Record<string, unknown> = {};
  for (const { k } of CLAVES_PARAMETROS) valores[k] = decimal(form, k);
  const afp: Record<string, number> = {};
  for (const a of AFPS) { const v = decimal(form, `afp_${a}`); if (Number.isFinite(v)) afp[a] = v; }
  valores.afp = afp;
  const ccafSalud = decimal(form, "ccaf_salud");
  if (Number.isFinite(ccafSalud)) valores.ccaf_salud = ccafSalud;
  if (!leerParametros(valores)) volverMando("error=ENQ_PARAMETROS_INVALIDOS");
  const { error: e } = await (await createClient()).rpc("rem_proponer_parametros", {
    p_periodo: periodo, p_valores: valores, p_fuente: txt(form, "fuente"), p_observaciones: txt(form, "observaciones") || null,
  });
  if (e) volverMando(`error=${dbCode(e) ?? "ENQ_PARAMETROS_INVALIDOS"}`);
  volverMando(`aviso=propuesto&periodo=${periodo}`);
}

export async function decidirParametrosAction(form: FormData): Promise<void> {
  const id = txt(form, "id");
  const decision = txt(form, "decision");
  if (!UUID.test(id) || !["aprobar", "descartar"].includes(decision)) volverMando("error=ENQ_DATOS_INVALIDOS");
  if (decision === "aprobar" && form.get("confirmo") !== "si") volverMando("error=ENQ_CONFIRMA_PARAMETROS");
  const { error: e } = await (await createClient()).rpc(decision === "aprobar" ? "rem_aprobar_parametros" : "rem_descartar_parametros", { p_id: id });
  if (e) volverMando(`error=${dbCode(e) ?? "ENQ_DATOS_INVALIDOS"}`);
  volverMando(`aviso=${decision === "aprobar" ? "aprobado" : "descartado"}`);
}
