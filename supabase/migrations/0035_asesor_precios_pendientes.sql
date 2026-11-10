-- =====================================================================
-- ENQORA · 0035 · Asesor de precios: también investiga los servicios que esperan precio
-- Regla de ENQORA: el equipo investiga precios de mercado y sugiere; una persona define el precio.
-- Antes, la investigación automática solo tomaba servicios activos, pero un servicio nuevo no puede
-- activarse sin precio: nunca recibía sugerencia. Ahora entran también los servicios sin tarifa
-- vigente, y van primero los que tienen menos referencias. La frecuencia del cron no cambia.
-- Se puede ejecutar más de una vez.
-- =====================================================================

create or replace function public.svc_services_for_research(p_token text, p_limit integer default 2)
returns table (id uuid, code text, name text, scope text, unit text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  return query
    select s.id, s.code, s.name, s.scope, s.unit from public.services s
    where s.active
       or not exists (select 1 from public.service_tariffs t where t.service_id = s.id and t.status = 'vigente')
    order by
      -- 1) los que esperan precio (sin tarifa vigente) antes que los ya publicados
      (exists (select 1 from public.service_tariffs t where t.service_id = s.id and t.status = 'vigente')) asc,
      -- 2) los que tienen menos referencias útiles
      (select count(*) from public.market_references r where r.service_id = s.id and r.status <> 'descartada') asc,
      -- 3) la consulta más antigua
      (select max(r.consulted_on) from public.market_references r where r.service_id = s.id and r.status <> 'descartada') asc nulls first,
      s.code
    limit least(greatest(coalesce(p_limit, 2), 1), 5);
end
$$;
