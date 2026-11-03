-- =====================================================================
-- ENQORA · Hallazgos del investigador web para la consulta pública (CORA)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0026_investigador_web.sql.
--
-- Entrega al orquestador CORA el resultado de la última investigación COMPLETADA del bot para un RUT
-- (últimos 30 días): portal, estado, fecha, URL, detalle y las primeras filas extraídas. Son datos públicos
-- de portales oficiales sobre una empresa. No expone capturas, quién la pidió ni datos internos.
-- No modifica tablas existentes.
-- =====================================================================

create or replace function public.research_public_findings(p_rut text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with ultima as (
    select r.id from public.research_runs r
    where r.rut = p_rut and r.modo = 'investigacion' and r.status = 'completada' and r.finished_at > now() - interval '30 days'
    order by r.finished_at desc limit 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'portal', e.portal, 'estado', e.status, 'consultado', e.consulted_at, 'url', e.url, 'detalle', e.detail,
    'version', e.procedure_version,
    'coincidencias', e.result -> 'coincidencias_exactas',
    'tabla', case when jsonb_typeof(e.result -> 'tablas') = 'array' and jsonb_array_length(e.result -> 'tablas') > 0
                  then jsonb_build_object('headers', e.result -> 'tablas' -> 0 -> 'headers',
                                          'rows', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
                                                     select x from jsonb_array_elements(e.result -> 'tablas' -> 0 -> 'rows') with ordinality as t(x, n) where n <= 8) s))
             end
  ) order by e.consulted_at), '[]'::jsonb)
  from public.research_evidence e join ultima u on u.id = e.run_id
$$;

revoke execute on function public.research_public_findings(text) from public;
grant execute on function public.research_public_findings(text) to anon, authenticated;
