-- =====================================================================
-- ENQORA · Prueba de Shield y Sentinel (Etapa 3)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0003_seguridad.sql.
-- Usa datos ficticios y al final deshace todo (ROLLBACK).
-- Resultado esperado: una fila "TODAS LAS PRUEBAS OK".
-- =====================================================================

begin;

create function pg_temp.check(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLÓ: %', msg; end if;
end $$;

create function pg_temp.as_user(uid uuid, sid uuid, aal text, mfa_age_minutes int default 1) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', uid, 'session_id', sid, 'role', 'authenticated', 'aal', aal,
    'amr', json_build_array(json_build_object(
      'method', 'totp',
      'timestamp', extract(epoch from now() - make_interval(mins => mfa_age_minutes))::bigint))
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
  ('00000000-0000-4000-8000-0000000000d1', 'dani@prueba-enqora.cl', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000e1', 'eva@prueba-enqora.cl', 'authenticated', 'authenticated');

-- Dani tiene tres sesiones abiertas (computador, teléfono, tablet); Eva una.
insert into auth.sessions (id, user_id, aal, user_agent, ip) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000d1', 'aal2', 'Chrome Windows', '200.1.1.1'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000d1', 'aal2', 'Safari iPhone', '200.1.1.2'),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000d1', 'aal2', 'Safari iPad', '200.1.1.3'),
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000e1', 'aal2', 'Firefox Linux', '190.1.1.1');

set local role authenticated;

-- 1) Primer ingreso de Dani: dispositivo nuevo pero sin alerta (es el primero)
select pg_temp.as_user('00000000-0000-4000-8000-0000000000d1', '10000000-0000-4000-8000-000000000001', 'aal2');
select pg_temp.check(public.register_login(repeat('a', 64), '200.1.1.1', 'Chrome Windows', 'Chrome en Windows') = false,
  'el primer dispositivo no debe generar alerta');
select pg_temp.check(public.register_login(repeat('a', 64), '200.1.1.1', 'Chrome Windows', 'Chrome en Windows') = false,
  'el mismo dispositivo no debe generar alerta');

-- 2) Ingreso desde un dispositivo distinto: alerta
select pg_temp.check(public.register_login(repeat('b', 64), '200.1.1.2', 'Safari iPhone', 'Safari en iPhone') = true,
  'un segundo dispositivo debe generar alerta');
select pg_temp.check((select count(*) from public.security_events where event = 'nuevo_dispositivo' and acknowledged_at is null) = 1,
  'debe existir 1 alerta pendiente');
select public.acknowledge_security_alerts();
select pg_temp.check((select count(*) from public.security_events where event = 'nuevo_dispositivo' and acknowledged_at is null) = 0,
  'la alerta debe quedar revisada');

-- 3) Sesiones: Dani ve solo las suyas y reconoce la actual
select pg_temp.check((select count(*) from public.my_sessions()) = 3, 'Dani debe ver sus 3 sesiones');
select pg_temp.check((select count(*) from public.my_sessions() where is_current) = 1, 'debe marcarse la sesión actual');

-- 4) Cerrar sesiones exige reautenticación reciente y no permite cerrar la actual
select pg_temp.as_user('00000000-0000-4000-8000-0000000000d1', '10000000-0000-4000-8000-000000000001', 'aal2', 30);
select pg_temp.check(pg_temp.fails($$select public.revoke_session('10000000-0000-4000-8000-000000000002')$$, 'ENQ_REAUTH'),
  'cerrar una sesión con MFA antiguo debe pedir reautenticación');
select pg_temp.as_user('00000000-0000-4000-8000-0000000000d1', '10000000-0000-4000-8000-000000000001', 'aal2', 1);
select pg_temp.check(pg_temp.fails($$select public.revoke_session('10000000-0000-4000-8000-000000000001')$$, 'ENQ_DATOS_INVALIDOS'),
  'no se debe poder cerrar la sesión actual por esta vía');
select pg_temp.check(pg_temp.fails($$select public.revoke_session('20000000-0000-4000-8000-000000000001')$$, 'ENQ_DATOS_INVALIDOS'),
  'Dani NO debe poder cerrar la sesión de Eva');
select public.revoke_session('10000000-0000-4000-8000-000000000002');
select pg_temp.check((select count(*) from public.my_sessions()) = 2, 'debe quedar 2 sesiones tras cerrar una');
select pg_temp.check(public.revoke_other_sessions() = 1, 'cerrar las demás debe cerrar 1');
select pg_temp.check((select count(*) from public.my_sessions()) = 1, 'solo debe quedar la sesión actual');

-- 5) Aislamiento: Eva no ve nada de Dani y su sesión sigue intacta
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e1', '20000000-0000-4000-8000-000000000001', 'aal2');
select pg_temp.check((select count(*) from public.security_events) = 0, 'Eva NO debe ver eventos de Dani');
select pg_temp.check((select count(*) from public.known_devices) = 0, 'Eva NO debe ver dispositivos de Dani');
select pg_temp.check((select count(*) from public.my_sessions()) = 1, 'la sesión de Eva debe seguir abierta');

-- 6) Sin segundo factor no se lee el registro; eventos inventados se rechazan
select pg_temp.as_user('00000000-0000-4000-8000-0000000000d1', '10000000-0000-4000-8000-000000000001', 'aal1');
select pg_temp.check((select count(*) from public.security_events) = 0, 'sin MFA no se debe leer el registro');
select pg_temp.check(pg_temp.fails($$select public.log_security_event('nuevo_dispositivo')$$, 'ENQ_DATOS_INVALIDOS'),
  'no se debe poder inventar una alerta de dispositivo');
select pg_temp.check(pg_temp.fails($$insert into public.security_events (user_id, event) values ('00000000-0000-4000-8000-0000000000d1', 'ingreso')$$, 'permission denied'),
  'INSERT directo debe estar bloqueado');

reset role;
select 'TODAS LAS PRUEBAS OK' as resultado;

rollback;
