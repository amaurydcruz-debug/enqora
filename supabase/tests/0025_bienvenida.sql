-- =====================================================================
-- ENQORA · Prueba del descuento de bienvenida (0025)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0025_bienvenida.sql.
-- Deshace todo al final (ROLLBACK). Resultado esperado: «TODAS LAS PRUEBAS OK».
-- =====================================================================
begin;
create function pg_temp.check(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLÓ: %', msg; end if;
end $$;

update private.pricing_policy set welcome_discount_pct = 40, welcome_months = 6 where id;
insert into auth.users (id, email, aud, role) values ('00000000-0000-4000-8000-0000000025a1', 'cliente25@prueba-enqora.cl', 'authenticated', 'authenticated');
insert into public.companies (id, rut, legal_name) values ('00000000-0000-4000-8000-0000000025c1', '76086428-5', 'Bienvenida SpA');

-- Primer cobro: comienza el beneficio y aplica −40%
select private.new_charge('00000000-0000-4000-8000-0000000025c1', 'cotizacion', 'Servicio de prueba', 100000, private.today_cl() + 5);
select pg_temp.check((select amount = 60000 and list_amount = 100000 and discount_pct = 40 from public.charges
  where company_id = '00000000-0000-4000-8000-0000000025c1'), 'primer cobro con 40% de descuento');
select pg_temp.check((select welcome_until = (private.today_cl() + interval '6 months')::date from public.companies
  where id = '00000000-0000-4000-8000-0000000025c1'), 'beneficio por 6 meses desde el primer cobro');

-- Un período posterior al beneficio se cobra a precio normal
select private.new_charge('00000000-0000-4000-8000-0000000025c1', 'suscripcion', 'Plan de prueba · mes 7', 50000, private.today_cl() + 200,
  null, null, null, (private.today_cl() + interval '7 months')::date, (private.today_cl() + interval '8 months')::date);
select pg_temp.check((select amount = 50000 and list_amount is null from public.charges
  where company_id = '00000000-0000-4000-8000-0000000025c1' and description like 'Plan de prueba%'), 'después de 6 meses, precio normal');

select 'TODAS LAS PRUEBAS OK' as resultado;
rollback;
