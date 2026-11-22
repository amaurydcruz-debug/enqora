import "server-only";
import { pendientesLaborales, type Pendiente } from "@/lib/pendientes-laborales";
import { todayCL } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/server";
import type { RegistroVacacion } from "@/lib/vacaciones";

// Reúne los datos de Remuneraciones y de los documentos laborales de la empresa y calcula los pendientes.
export async function cargarPendientesLaborales(companyId: string): Promise<Pendiente[]> {
  const supabase = await createClient();
  const hoy = todayCL();
  const y = Number(hoy.slice(0, 4));
  const [{ data: t }, { data: c }, { data: dl }, { data: l }, { data: f }, { data: v }, { data: ce }, { data: fe }] = await Promise.all([
    supabase.from("rem_trabajadores").select("id, nombre, activo, fecha_ingreso, fecha_baja").eq("company_id", companyId),
    supabase.from("rem_contratos").select("trabajador_id, tipo, estado, datos").eq("company_id", companyId).neq("estado", "anulado"),
    supabase.from("documentos_laborales").select("tipo, estado").eq("company_id", companyId).in("estado", ["aprobado", "observado", "en_revision"]),
    supabase.from("rem_liquidaciones").select("trabajador_id, periodo, estado, novedades").eq("company_id", companyId).gte("periodo", `${y - 1}-01`),
    supabase.from("rem_finiquitos").select("trabajador_id, estado").eq("company_id", companyId).neq("estado", "anulado"),
    supabase.from("rem_vacaciones").select("id, trabajador_id, tipo, desde, hasta, dias, nota, estado, creado, motivo_anulacion").eq("company_id", companyId),
    supabase.from("rem_certificados").select("trabajador_id, anio, estado").eq("company_id", companyId).eq("anio", y - 1),
    supabase.from("rem_feriados").select("fecha"),
  ]);
  return pendientesLaborales({
    hoy,
    trabajadores: (t ?? []) as { id: string; nombre: string; activo: boolean; fecha_ingreso: string; fecha_baja: string | null }[],
    contratos: (c ?? []) as { trabajador_id: string; tipo: string; estado: string; datos: Record<string, unknown> }[],
    documentos: (dl ?? []) as { tipo: string; estado: string }[],
    liquidaciones: ((l ?? []) as { trabajador_id: string; periodo: string; estado: string; novedades: { horas_extra?: number } | null }[])
      .map((x) => ({ trabajador_id: x.trabajador_id, periodo: x.periodo, estado: x.estado, horas_extra: Number(x.novedades?.horas_extra ?? 0) })),
    finiquitos: (f ?? []) as { trabajador_id: string; estado: string }[],
    vacaciones: (v ?? []) as RegistroVacacion[],
    certificados: (ce ?? []) as { trabajador_id: string; anio: number; estado: string }[],
    festivos: new Set(((fe ?? []) as { fecha: string }[]).map((x) => x.fecha)),
  });
}
