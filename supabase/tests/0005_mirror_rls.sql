-- =====================================================================
-- ENQORA · Prueba de ENQORA MIRROR
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0005_mirror.sql.
-- Usa datos ficticios y al final deshace todo (ROLLBACK).
-- Resultado esperado: una fila "TODAS LAS PRUEBAS OK".
-- =====================================================================

begin;
-- Desde 0022 el equipo (salvo Administradores) necesita un pase de jornada: en esta prueba se simula vigente.
alter table public.staff_members alter column access_until set default now() + interval '1 day';

create function pg_temp.check(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLÓ: %', msg; end if;
end $$;

create function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', uid, 'role', 'authenticated', 'aal', 'aal2',
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
  ('00000000-0000-4000-8000-0000000001a1', 'mira-ana@prueba-enqora.cl',  'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000001b1', 'mira-beto@prueba-enqora.cl', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000001f2', 'mira-cami@prueba-enqora.cl', 'authenticated', 'authenticated');
insert into public.staff_members (user_id, role) values ('00000000-0000-4000-8000-0000000001f2', 'accountant_pro');

set local role authenticated;

select pg_temp.as_user('00000000-0000-4000-8000-0000000001a1');
select set_config('t.emp', public.create_company('76.086.428-5', 'Mirror SpA')::text, true);
select set_config('t.caso', public.create_case(current_setting('t.emp')::uuid, 'contabilidad', 'Revisar IVA')::text, true);

-- Asignación directa (simula lo que hace la supervisión)
reset role;
insert into public.case_assignments (case_id, user_id, role_in_case)
values (current_setting('t.caso')::uuid, '00000000-0000-4000-8000-0000000001f2', 'responsable');
set local role authenticated;

-- 1) El cliente NO puede registrar pasos de análisis (no puede fingir avance)
select pg_temp.check(pg_temp.fails($$select public.log_analysis_step(current_setting('t.caso')::uuid, 'tributario', 'normativa', 'Falso avance')$$, 'ENQ_SIN_PERMISO'),
  'el cliente NO debe registrar pasos');

-- 2) La responsable registra pasos públicos e internos
select pg_temp.as_user('00000000-0000-4000-8000-0000000001f2');
select set_config('t.paso', public.log_analysis_step(current_setting('t.caso')::uuid, 'tributario', 'normativa', 'Revisión de normativa IVA', 'Art. 23 DL 825')::text, true);
select public.log_analysis_step(current_setting('t.caso')::uuid, 'contable', 'cruce', 'Borrador interno', null, 'trabajando', null, 'interno');
select public.update_analysis_step(current_setting('t.paso')::uuid, 'completado');

-- 3) El cliente ve el paso público y no el interno
select pg_temp.as_user('00000000-0000-4000-8000-0000000001a1');
select pg_temp.check((select count(*) from public.case_analysis_steps) = 1, 'el cliente debe ver solo el paso público');
select pg_temp.check((select status from public.case_analysis_steps limit 1) = 'completado', 'el paso debe quedar completado');

-- 4) Otra empresa no ve nada
select pg_temp.as_user('00000000-0000-4000-8000-0000000001b1');
select pg_temp.check((select count(*) from public.case_analysis_steps) = 0, 'otra empresa NO debe ver pasos');

-- 5) Valores fuera de catálogo se rechazan
select pg_temp.as_user('00000000-0000-4000-8000-0000000001f2');
select pg_temp.check(pg_temp.fails($$select public.log_analysis_step(current_setting('t.caso')::uuid, 'adivino', 'normativa', 'x y z')$$, 'check'),
  'un agente inexistente debe rechazarse');

reset role;
select 'TODAS LAS PRUEBAS OK' as resultado;

rollback;
