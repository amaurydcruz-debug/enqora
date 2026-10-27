-- =====================================================================
-- ENQORA · Prueba de la optimización previa a la publicación (0015)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0015_publicacion.sql.
-- Usa datos ficticios y al final deshace todo (ROLLBACK).
-- Resultado esperado: una fila "TODAS LAS PRUEBAS OK".
-- =====================================================================

begin;

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

-- 1) Todas las claves foráneas hacia tablas de ENQORA tienen índice
select pg_temp.check(not exists (
  select 1 from pg_constraint c
  where c.contype = 'f' and array_length(c.conkey, 1) = 1
    and c.connamespace in ('public'::regnamespace, 'private'::regnamespace)
    and c.confrelid <> 'auth.users'::regclass
    and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])
), 'cada clave foránea tiene su índice');

-- 2) Limpieza: borra códigos vencidos y envíos antiguos terminados; conserva lo reciente
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000015a1', 'ana15@prueba-enqora.cl', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000015f1', 'admin15@prueba-enqora.cl', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000015f2', 'conta15@prueba-enqora.cl', 'authenticated', 'authenticated');
insert into public.staff_members (user_id, role) values
  ('00000000-0000-4000-8000-0000000015f1', 'enqora_admin'),
  ('00000000-0000-4000-8000-0000000015f2', 'accountant_pro')
on conflict (user_id) do update set role = excluded.role, active = true;

insert into private.phone_codes (user_id, phone, code_hash, expires_at) values
  ('00000000-0000-4000-8000-0000000015a1', '+56911111111', 'x', now() - interval '2 days'),
  ('00000000-0000-4000-8000-0000000015f2', '+56922222222', 'y', now() + interval '5 minutes');
insert into public.notifications (user_id, category, title, dedupe_key) values ('00000000-0000-4000-8000-0000000015a1', 'casos', 'Aviso de prueba', 'prueba-0015');
insert into public.notification_deliveries (notification_id, channel, status, created_at)
select max(id), 'email', 'enviado', now() - interval '200 days' from public.notifications union all
select max(id), 'email', 'enviado', now() - interval '10 days' from public.notifications;

select set_config('t.antes', (select count(*) from public.notification_deliveries)::text, true);
select private.housekeeping();
select pg_temp.check((select count(*) from private.phone_codes where user_id = '00000000-0000-4000-8000-0000000015a1') = 0
  and (select count(*) from private.phone_codes where user_id = '00000000-0000-4000-8000-0000000015f2') = 1,
  'se borra solo el código vencido');
select pg_temp.check((select count(*) from public.notification_deliveries) = current_setting('t.antes')::int - 1,
  'se archiva solo el envío de más de 180 días');

-- 3) Estado del sistema: solo supervisión
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000015f2');
select pg_temp.check(pg_temp.fails('select public.system_status()', 'ENQ_SIN_PERMISO'), 'un contador no ve el estado del sistema');
select pg_temp.as_user('00000000-0000-4000-8000-0000000015a1');
select pg_temp.check(pg_temp.fails('select public.system_status()', 'ENQ_SIN_PERMISO'), 'un cliente no ve el estado del sistema');
select pg_temp.as_user('00000000-0000-4000-8000-0000000015f1');
select set_config('t.st', public.system_status()::text, true);
select pg_temp.check((current_setting('t.st')::jsonb -> 'migraciones' ->> '0014')::boolean
  and (current_setting('t.st')::jsonb ->> 'administradores_activos')::int >= 1, 'el estado informa migraciones y administradores');
select pg_temp.check(pg_temp.fails('select private.housekeeping()', 'permission denied'), 'la limpieza no se ejecuta desde la aplicación');

select 'TODAS LAS PRUEBAS OK' as resultado;
rollback;
