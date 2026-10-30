-- =====================================================================
-- ENQORA · Prueba del asesor de precios (0024)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0024_asesor_precios.sql.
-- Usa datos ficticios y al final deshace todo (ROLLBACK). Resultado esperado: «TODAS LAS PRUEBAS OK».
-- =====================================================================
begin;
alter table public.staff_members alter column access_until set default now() + interval '1 day';

create function pg_temp.check(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLÓ: %', msg; end if;
end $$;
create function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', uid, 'role', 'authenticated', 'aal', 'aal2',
    'amr', json_build_array(json_build_object('method', 'totp', 'timestamp', extract(epoch from now() - interval '1 minute')::bigint))
  )::text, true);
end $$;
create function pg_temp.fails(sql text, expected text) returns boolean language plpgsql as $$
begin
  execute sql;
  return false;
exception when others then
  return sqlerrm like '%' || expected || '%';
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

insert into private.service_secrets (id) values (true) on conflict do nothing;
update private.service_secrets set token_hash = encode(sha256(convert_to('clave-de-servicio-de-prueba-0024-xxxxxxxx', 'UTF8')), 'hex') where id;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000024a1', 'admin24@prueba-enqora.cl', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000024c1', 'conta24@prueba-enqora.cl', 'authenticated', 'authenticated');
insert into public.staff_members (user_id, role) values
  ('00000000-0000-4000-8000-0000000024a1', 'enqora_admin'), ('00000000-0000-4000-8000-0000000024c1', 'accountant_pro')
on conflict (user_id) do update set role = excluded.role, active = true;
update private.pricing_policy set market_discount_pct = 40, min_references = 3 where id;
select set_config('t.srv', (select id::text from public.services where code = 'CON-04'), true);
update public.services set active = true where code = 'CON-04';

-- El agente entrega referencias (por verificar); se descartan las inválidas
set local role anon;
select pg_temp.check(public.svc_add_market_references('clave-de-servicio-de-prueba-0024-xxxxxxxx', current_setting('t.srv')::uuid, $j$[
  {"provider":"Proveedor A","url":"https://a.cl/precios","amount_min":50000,"unit":"trabajador","evidence":"Remuneraciones desde $50.000"},
  {"provider":"Proveedor B","url":"https://b.cl/precios","amount_min":60000,"amount_max":80000,"unit":"trabajador"},
  {"provider":"Proveedor C","url":"https://c.cl/precios","amount_min":90000,"unit":"trabajador"},
  {"provider":"Sin enlace seguro","url":"http://d.cl","amount_min":10000,"unit":"trabajador"},
  {"provider":"Monto absurdo","url":"https://e.cl","amount_min":5,"unit":"trabajador"}
]$j$::jsonb) = 3, 'solo 3 referencias válidas');
select pg_temp.check(pg_temp.fails($q$select public.svc_add_market_references('mala', current_setting('t.srv')::uuid, '[]'::jsonb)$q$, 'ENQ_CLAVE_SERVICIO'), 'exige clave');
reset role;

set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000024a1');
select pg_temp.check((public.price_advice(current_setting('t.srv')::uuid) ->> 'por_verificar')::int >= 3, 'quedan por verificar');
select pg_temp.check(pg_temp.fails($q$select public.draft_tariff_from_advice(current_setting('t.srv')::uuid)$q$, 'ENQ_SIN_REFERENCIAS'),
  'sin referencias verificadas no hay precio sugerido');

select pg_temp.as_user('00000000-0000-4000-8000-0000000024c1');
select pg_temp.check(pg_temp.fails($q$select public.review_market_reference((select id from public.market_references where provider = 'Proveedor A' limit 1), 'verificada')$q$,
  'ENQ_SIN_PERMISO'), 'un contador no verifica precios');

select pg_temp.as_user('00000000-0000-4000-8000-0000000024a1');
select public.review_market_reference(id, 'verificada') from public.market_references where provider in ('Proveedor A', 'Proveedor B', 'Proveedor C') and status = 'por_verificar';
-- mediana de 50.000 · 70.000 · 90.000 = 70.000; menos 40% = 42.000
select pg_temp.check((public.price_advice(current_setting('t.srv')::uuid) ->> 'sugerido')::int = 42000, 'precio sugerido = mediana − 40%');
select set_config('t.tar', public.draft_tariff_from_advice(current_setting('t.srv')::uuid)::text, true);
select pg_temp.check((select status = 'borrador' and base_price = 42000 from public.service_tariffs where id = current_setting('t.tar')::uuid),
  'crea un borrador (no publica)');
reset role;
select pg_temp.check((select market_price = 70000 and market_sources >= 3 from public.public_catalog() where code = 'CON-04'), 'catálogo público con precio de mercado');

select 'TODAS LAS PRUEBAS OK' as resultado;
rollback;
