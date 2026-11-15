import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEPARTAMENTOS, planificar, type PlanInforma } from "@/lib/informa";
import { runWatch, type WatchGroup } from "@/lib/watch";

// Director IA de ENQORA Informa: planifica cada ronda del enjambre investigador.
// 1) Primero las investigaciones pedidas por la supervisión (bajo demanda).
// 2) Después, los departamentos que llevan más tiempo sin investigar (nunca dos veces el mismo en una ronda).
// Los agentes solo PROPONEN hallazgos como «detectado»: nada se publica sin verificación humana (0058).
export type RondaResultado = { ok: boolean; departamentos: string[]; encontrados: number; nuevos: number; error?: string };

export async function rondaInforma(supabase: SupabaseClient, service: string, signal: AbortSignal): Promise<RondaResultado> {
  const inicio = new Date().toISOString();
  const { data: planData, error: planError } = await supabase.rpc("svc_informa_plan", { p_token: service });
  if (planError) return { ok: false, departamentos: [], encontrados: 0, nuevos: 0, error: planError.message };
  const misiones = planificar((planData ?? { pedidas: [], ultimas: {} }) as PlanInforma);
  const grupos: WatchGroup[] = misiones.map((m) => ({ key: m.departamento, titulo: DEPARTAMENTOS[m.departamento].titulo, consulta: DEPARTAMENTOS[m.departamento].consulta, tema: m.tema }));
  const r = await runWatch(signal, new Date(), grupos);
  const { data, error } = await supabase.rpc("svc_informa_registrar", {
    p_token: service,
    p: { ok: r.ok, error: r.error ?? null, inicio, misiones: misiones.map((m) => ({ id: m.id ?? null, departamento: m.departamento, tema: m.tema, origen: m.origen })), items: r.items },
  });
  const titulos = misiones.map((m) => DEPARTAMENTOS[m.departamento].titulo);
  if (error) return { ok: false, departamentos: titulos, encontrados: r.items.length, nuevos: 0, error: error.message };
  const res = (data ?? {}) as { encontrados?: number; nuevos?: number };
  return { ok: r.ok, departamentos: titulos, encontrados: res.encontrados ?? 0, nuevos: res.nuevos ?? 0, error: r.error };
}
