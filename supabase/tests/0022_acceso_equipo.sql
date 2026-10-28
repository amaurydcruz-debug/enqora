-- =====================================================================
-- ENQORA · Prueba del acceso del equipo por pase de jornada (0022)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0022_acceso_equipo.sql.
-- Usa datos ficticios y al final deshace todo (ROLLBACK). Resultado esperado: «TODAS LAS PRUEBAS OK».
-- =====================================================================
begin;

create function pg_temp.check(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLÓ: %', msg; end if;
end $$;
create function pg_temp.as_user(uid uuid, mail text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', uid, 'email', mail, 'role', 'authenticated', 'aal', 'aal2',
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

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000022a1', 'admin22@prueba-enqora.cl', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000022b1', 'conta22@prueba-enqora.cl', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000022c1', 'otro22@prueba-enqora.cl',  'authenticated', 'authenticated');
insert into public.staff_members (user_id, role) values ('00000000-0000-4000-8000-0000000022a1', 'enqora_admin')
on conflict (user_id) do update set role = 'enqora_admin', active = true;

-- Pase para mañana (siempre dentro de plazo para generarlo) y uno para hoy con horario simulado.
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000022a1', 'admin22@prueba-enqora.cl');
select set_config('t.tok', public.create_team_pass('conta22@prueba-enqora.cl', 'accountant_pro', private.today_cl() + 1), true);
select pg_temp.check(pg_temp.fails($q$select public.create_team_pass('x@y.cl', 'enqora_admin', private.today_cl() + 1)$q$, 'ENQ_DATOS_INVALIDOS'),
  'un pase no puede dar rol de Administrador');
select pg_temp.check((select status from public.team_pass_preview(current_setting('t.tok'))) = 'aun_no', 'antes del horario no sirve');

-- Simula que la jornada está en curso
reset role;
update public.team_passes set valid_from = now() - interval '1 hour', valid_until = now() + interval '2 hours';
set local role authenticated;

select pg_temp.as_user('00000000-0000-4000-8000-0000000022c1', 'otro22@prueba-enqora.cl');
select pg_temp.check(pg_temp.fails($q$select public.accept_team_pass(current_setting('t.tok'))$q$, 'ENQ_INVITACION_OTRO_CORREO'),
  'otra cuenta no puede usar el pase');

select pg_temp.as_user('00000000-0000-4000-8000-0000000022b1', 'conta22@prueba-enqora.cl');
select pg_temp.check(not private.is_staff(), 'sin pase no hay acceso al equipo');
select public.accept_team_pass(current_setting('t.tok'));
select pg_temp.check(private.is_staff(array['accountant_pro']), 'con el pase tiene acceso de su rol');
select pg_temp.check(pg_temp.fails($q$select public.accept_team_pass(current_setting('t.tok'))$q$, 'ENQ_INVITACION_INVALIDA'),
  'el enlace es de un solo uso');

-- Fin de jornada: sin acceso
reset role;
update public.staff_members set access_until = now() - interval '1 second' where user_id = '00000000-0000-4000-8000-0000000022b1';
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000022b1', 'conta22@prueba-enqora.cl');
select pg_temp.check(not private.is_staff(), 'al terminar la jornada se pierde el acceso');

-- El Administrador nunca depende de un pase; los clientes no ven los pases
select pg_temp.as_user('00000000-0000-4000-8000-0000000022a1', 'admin22@prueba-enqora.cl');
select pg_temp.check(private.is_staff(array['enqora_admin']), 'el Administrador mantiene su acceso');
select pg_temp.check((select count(*) from public.team_overview() where email = 'conta22@prueba-enqora.cl' and not has_access) = 1, 'resumen del equipo');
select pg_temp.as_user('00000000-0000-4000-8000-0000000022c1', 'otro22@prueba-enqora.cl');
select pg_temp.check((select count(*) from public.team_passes) = 0, 'solo el Administrador ve los pases');
select pg_temp.check(pg_temp.fails($q$select public.create_team_pass('a@b.cl', 'field_agent')$q$, 'ENQ_SIN_PERMISO'), 'solo el Administrador genera pases');

select 'TODAS LAS PRUEBAS OK' as resultado;
rollback;
