-- =====================================================================
-- ENQORA · 0029 · Registro de Empresas: «completo»
-- La consulta pública distingue entre «ya hay archivos cargados» (cargado) y «todos los archivos están
-- cargados» (completo). Mientras falten años, CORA solo informa lo encontrado y nunca afirma que una
-- empresa no figura en el Registro. Se puede ejecutar más de una vez.
-- =====================================================================

create or replace function public.res_registro(p_rut text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  return jsonb_build_object(
    'cargado', exists (select 1 from private.res_cargas where estado = 'completada'),
    'completo', exists (select 1 from private.res_cargas where estado = 'completada')
                and not exists (select 1 from private.res_cargas where estado in ('pendiente', 'en_curso', 'error')),
    'archivos', (select count(*) from private.res_cargas where estado = 'completada'),
    'actualizado', (select max(actualizado) from private.res_cargas where estado = 'completada'),
    'actuaciones', coalesce((select jsonb_agg(jsonb_build_object('fecha', a.fecha, 'actuacion', a.actuacion, 'tipo_social', a.tipo_social,
      'capital', a.capital, 'comuna', a.comuna, 'region', a.region, 'razon_social', a.razon_social) order by a.fecha)
      from (select * from private.res_actuaciones where rut = p_rut order by fecha limit 30) a), '[]'::jsonb));
end
$$;

revoke execute on function public.res_registro(text) from public;
grant execute on function public.res_registro(text) to anon, authenticated;
