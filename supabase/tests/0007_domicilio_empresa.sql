-- =====================================================================
-- ENQORA · Prueba de 0007 (domicilio de la empresa)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0007_domicilio_empresa.sql.
-- Todo ocurre dentro de una transacción que se deshace (ROLLBACK).
-- Resultado esperado: una fila final que dice "TODAS LAS PRUEBAS OK".
-- =====================================================================

begin;

create function pg_temp.check(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLÓ: %', msg; end if;
end $$;

create function pg_temp.as_user(uid uuid, email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', uid, 'email', email, 'role', 'authenticated', 'aal', 'aal2',
    'amr', json_build_array(json_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint))
  )::text, true);
end $$;

create function pg_temp.fails(sql text, expected text) returns boolean language plpgsql as $$
begin
  execute sql;
  return false;
exception when others then
  return sqlerrm like '%' || expected || '%';
end $$;

grant execute on all functions in schema pg_temp to authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000007a1', 'dueno@prueba-enqora.cl', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000007b2', 'ajeno@prueba-enqora.cl', 'authenticated', 'authenticated');

set local role authenticated;

-- 1) La versión anterior de update_company ya no existe (sin sobrecargas ambiguas)
select pg_temp.check((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'update_company') = 1, 'debe existir una sola update_company');

-- 2) El propietario guarda domicilio y comuna
select pg_temp.as_user('00000000-0000-4000-8000-0000000007a1', 'dueno@prueba-enqora.cl');
select set_config('test.e', public.create_company('76.086.428-5', 'Empresa Domicilio SpA')::text, true);
select public.update_company(current_setting('test.e')::uuid, 'Empresa Domicilio SpA', 'Domicilio', 'Comercio',
  'pro_pyme_general', '  Av. Providencia 1234, of. 56  ', 'Providencia');
select pg_temp.check((select address from public.companies where id = current_setting('test.e')::uuid) = 'Av. Providencia 1234, of. 56',
  'el domicilio debe guardarse sin espacios sobrantes');
select pg_temp.check((select commune from public.companies where id = current_setting('test.e')::uuid) = 'Providencia',
  'la comuna debe guardarse');

-- 3) La llamada antigua (sin domicilio) sigue funcionando y limpia el domicilio
select public.update_company(current_setting('test.e')::uuid, 'Empresa Domicilio SpA', null, null, 'pro_pyme_general');
select pg_temp.check((select address is null from public.companies where id = current_setting('test.e')::uuid),
  'sin domicilio, el campo queda vacío');

-- 4) Validaciones y permisos
select pg_temp.check(pg_temp.fails(format($$select public.update_company(%L, 'Empresa', null, null, 'otro', repeat('x', 201))$$,
  current_setting('test.e')), 'ENQ_DATOS_INVALIDOS'), 'domicilio de más de 200 caracteres debe fallar');
select pg_temp.as_user('00000000-0000-4000-8000-0000000007b2', 'ajeno@prueba-enqora.cl');
select pg_temp.check(pg_temp.fails(format($$select public.update_company(%L, 'Hackeada', null, null, 'otro', 'Calle falsa 123')$$,
  current_setting('test.e')), 'ENQ_SIN_PERMISO'), 'un ajeno NO debe poder editar el domicilio');
select pg_temp.check(not exists (select 1 from public.companies where id = current_setting('test.e')::uuid),
  'un ajeno NO debe ver la empresa');

-- 5) Queda registro en la auditoría
select pg_temp.as_user('00000000-0000-4000-8000-0000000007a1', 'dueno@prueba-enqora.cl');
select pg_temp.check((select count(*) from public.audit_events where company_id = current_setting('test.e')::uuid
  and action = 'empresa.actualizada') = 2, 'cada edición debe quedar en la auditoría');

select 'TODAS LAS PRUEBAS OK' as resultado;
rollback;
