import "server-only";
import { faltantesArchivo, type EmpresaArchivo, type FichaArchivo, type FilaArchivo } from "@/lib/rem-archivos";
import type { Liquidacion, Novedades } from "@/lib/remuneraciones";
import { createClient } from "@/lib/supabase/server";

export type PreparacionArchivos = {
  filas: (FilaArchivo & { faltan: string[] })[]; empresa: EmpresaArchivo | null; faltanEmpresa: string[]; listo: boolean;
};

// Reúne las liquidaciones APROBADAS del mes con la ficha vigente de cada trabajador y revisa qué falta.
export async function prepararArchivos(companyId: string, periodo: string): Promise<PreparacionArchivos> {
  const supabase = await createClient();
  const [{ data: liqs }, { data: trabs }, { data: emp }, { data: par }] = await Promise.all([
    supabase.from("rem_liquidaciones").select("trabajador_id, novedades, detalle").eq("company_id", companyId).eq("periodo", periodo).eq("estado", "aprobada"),
    supabase.from("rem_trabajadores").select("id, rut, nombre, apellido_paterno, apellido_materno, nombres, sexo, extranjero, fecha_ingreso, fecha_baja, causal_termino, tipo_contrato, jornada_horas, jornada_lre, afp, salud, isapre, fun, plan_isapre_uf, comuna").eq("company_id", companyId),
    supabase.from("rem_empresa").select("mutual, tasa_mutual, mutual_sucursal, ccaf").eq("company_id", companyId).maybeSingle(),
    supabase.from("rem_parametros").select("valores").eq("periodo", periodo).eq("estado", "aprobado").maybeSingle(),
  ]);
  const porId = new Map(((trabs ?? []) as (FichaArchivo & { id: string })[]).map((t) => [t.id, t]));
  const empresa = emp ? { ...(emp as EmpresaArchivo), tasa_mutual: Number((emp as EmpresaArchivo).tasa_mutual) } : null;
  const ccafSalud = (par as { valores?: { ccaf_salud?: number } } | null)?.valores?.ccaf_salud ?? null;
  const filas = ((liqs ?? []) as { trabajador_id: string; novedades: Novedades; detalle: Liquidacion }[])
    .filter((l) => porId.has(l.trabajador_id))
    .map((l) => {
      const t = porId.get(l.trabajador_id)!;
      const fila: FilaArchivo = {
        ficha: { ...t, jornada_horas: Number(t.jornada_horas), plan_isapre_uf: t.plan_isapre_uf == null ? null : Number(t.plan_isapre_uf) },
        dias: Number(l.novedades?.dias_trabajados ?? 30), montos: l.detalle?.montos ?? null, ccaf_salud: ccafSalud,
      };
      return { ...fila, faltan: faltantesArchivo(fila, empresa) };
    })
    .sort((a, b) => a.ficha.rut.localeCompare(b.ficha.rut));
  const faltanEmpresa = empresa ? [] : ["mutual de la empresa"];
  return { filas, empresa, faltanEmpresa, listo: filas.length > 0 && !!empresa && filas.every((f) => f.faltan.length === 0) };
}
