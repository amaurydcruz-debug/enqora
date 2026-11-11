-- =====================================================================
-- ENQORA · 0038 · Tarifas de prueba
-- Para probar la secuencia completa (cotizar, aceptar, cobrar) antes de definir los precios reales, una
-- tarifa puede marcarse como PRUEBA (sus notas empiezan con «[PRUEBA]»). Una tarifa de prueba:
--  - sirve para cotizar dentro de la plataforma;
--  - NO se publica en la portada ni en la consulta por RUT (Ley 19.496: no se anuncian precios que no son reales);
--  - no cuenta como «precio definido»: el asesor sigue investigando ese servicio con prioridad.
-- Se puede ejecutar más de una vez.
-- =====================================================================

create or replace function private.is_test_tariff(p_notes text) returns boolean
language sql immutable set search_path = '' as $$ select coalesce(p_notes, '') like '[PRUEBA]%' $$;

drop function if exists public.public_catalog();
create function public.public_catalog()
returns table (code text, module text, name text, summary text, unit text, requires_professional boolean, price_from integer,
               market_price integer, market_sources integer, market_consulted date, welcome_pct integer, welcome_months integer)
language sql stable security definer set search_path = '' as $$
  select s.code, s.module, s.name, s.summary, s.unit, s.requires_professional,
         case when private.is_test_tariff(t.notes) then null else t.base_price end,
         case when m.n >= p.min_references then m.median end,
         case when m.n >= p.min_references then m.n end,
         case when m.n >= p.min_references then m.last_consulted end,
         nullif(p.welcome_discount_pct, 0), case when p.welcome_discount_pct > 0 then nullif(p.welcome_months, 0) end
  from public.services s
  left join public.service_tariffs t on t.service_id = s.id and t.status = 'vigente'
  cross join private.pricing_policy p
  left join lateral private.market_median(s.id) m on true
  where s.active
  order by s.code
$$;
revoke execute on function public.public_catalog() from public;
grant execute on function public.public_catalog() to anon, authenticated;

create or replace function public.svc_services_for_research(p_token text, p_limit integer default 2)
returns table (id uuid, code text, name text, scope text, unit text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  return query
    select s.id, s.code, s.name, s.scope, s.unit from public.services s
    where s.active
       or not exists (select 1 from public.service_tariffs t where t.service_id = s.id and t.status = 'vigente' and not private.is_test_tariff(t.notes))
    order by
      (exists (select 1 from public.service_tariffs t where t.service_id = s.id and t.status = 'vigente' and not private.is_test_tariff(t.notes))) asc,
      (select count(*) from public.market_references r where r.service_id = s.id and r.status <> 'descartada') asc,
      (select max(r.consulted_on) from public.market_references r where r.service_id = s.id and r.status <> 'descartada') asc nulls first,
      s.code
    limit least(greatest(coalesce(p_limit, 2), 1), 5);
end
$$;
