-- =====================================================================
-- ENQORA · Prueba de la puerta de entrada (0009)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0009_puerta_entrada.sql.
-- Usa datos ficticios y al final deshace todo (ROLLBACK).
-- Resultado esperado: una fila "TODAS LAS PRUEBAS OK".
-- =====================================================================

begin;

create function pg_temp.check(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLÓ: %', msg; end if;
end $$;

create function pg_temp.as_user(uid uuid, mfa_age_minutes int default 1) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', uid, 'role', 'authenticated', 'aal', 'aal2',
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

grant execute on all functions in schema pg_temp to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000009f0', 'adm9@prueba-enqora.cl', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000009f2', 'cami9@prueba-enqora.cl', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000009a1', 'cliente9@prueba-enqora.cl', 'authenticated', 'authenticated');
insert into public.staff_members (user_id, role) values
  ('00000000-0000-4000-8000-0000000009f0', 'enqora_admin'),
  ('00000000-0000-4000-8000-0000000009f2', 'accountant_pro')
on conflict (user_id) do update set role = excluded.role, active = true;

-- 1) Visitante sin sesión: no puede leer tablas ni cargar datos
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.headers', '{"x-enqora-client":"visitante-1"}', true);
select pg_temp.check(pg_temp.fails('select count(*) from public.public_companies', 'permission denied'), 'anon NO lee la tabla de empresas');
select pg_temp.check(pg_temp.fails($$select public.start_public_import('razon_social', 'https://www.sii.cl', current_date, null)$$, 'permission denied'),
  'anon NO carga datos');
select pg_temp.check(pg_temp.fails($$select public.lookup_public_company('76.086.428-0')$$, 'ENQ_RUT_INVALIDO'), 'RUT inválido se rechaza');

-- 2) Solo el Administrador ENQORA carga (con reautenticación)
reset role;
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000009f2');
select pg_temp.check(pg_temp.fails($$select public.start_public_import('razon_social', 'https://www.sii.cl/x.zip', current_date, null)$$, 'ENQ_SIN_PERMISO'),
  'la contadora NO carga datos públicos');
select pg_temp.as_user('00000000-0000-4000-8000-0000000009f0', 30);
select pg_temp.check(pg_temp.fails($$select public.start_public_import('razon_social', 'https://www.sii.cl/x.zip', current_date, null)$$, 'ENQ_REAUTH'),
  'iniciar una carga exige reautenticación');
select pg_temp.as_user('00000000-0000-4000-8000-0000000009f0');
select set_config('t.imp', public.start_public_import('razon_social', 'https://www.sii.cl/estadisticas/nominas/PUB_NOMBRES_PJ.zip',
  current_date - 3, 'PUB_NOMBRES_PJ.txt')::text, true);
select pg_temp.check(public.import_public_rows(current_setting('t.imp')::uuid, '[
  {"rut": 76086428, "dv": "5", "legal_name": "Comercializadora Prueba SpA", "activity_start": "2015-03-02", "end_of_business": null},
  {"rut": 76086428, "dv": "0", "legal_name": "DV malo", "activity_start": null, "end_of_business": null},
  {"rut": 11111111, "dv": "1", "legal_name": "Sociedad Antigua Ltda", "activity_start": "1990-01-01", "end_of_business": "2020-12-31"}
]'::jsonb) = 2, 'se aceptan solo las filas con RUT válido');
select public.finish_public_import(current_setting('t.imp')::uuid, 'completada');
select set_config('t.imp2', public.start_public_import('actividades', 'https://www.sii.cl/estadisticas/nominas/PUB_NOM_ACTECOS.zip',
  current_date - 3, null)::text, true);
select public.import_public_rows(current_setting('t.imp2')::uuid, '[
  {"rut": 76086428, "code": "471100", "description": "Venta al por menor en comercios no especializados"},
  {"rut": 76086428, "code": "620200", "description": "Consultoría informática"}
]'::jsonb);
select public.finish_public_import(current_setting('t.imp2')::uuid, 'completada');

-- 3) El visitante consulta: una empresa por RUT, con fuente y fecha
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.check((select public.lookup_public_company('76.086.428-5') ->> 'estado') = 'encontrada', 'la empresa se encuentra');
select pg_temp.check((select public.lookup_public_company('76086428-5') ->> 'razon_social') = 'Comercializadora Prueba SpA', 'devuelve la razón social');
select pg_temp.check((select jsonb_array_length(public.lookup_public_company('760864285') -> 'actividades')) = 2, 'devuelve las actividades');
select pg_temp.check((select public.lookup_public_company('76.086.428-5') ->> 'fuente_url') like 'https://www.sii.cl/%', 'informa la fuente');
select pg_temp.check((select public.lookup_public_company('11.111.111-1') ->> 'termino_giro') = '2020-12-31', 'informa el término de giro');
select pg_temp.check((select public.lookup_public_company('12.345.678-5') ->> 'estado') = 'no_encontrada', 'un RUT que no está en la nómina no se encuentra');

-- 4) Límite de consultas por cliente
select set_config('request.headers', '{"x-enqora-client":"abusador"}', true);
do $$ begin for i in 1..30 loop perform public.lookup_public_company('76.086.428-5'); end loop; end $$;
select pg_temp.check(pg_temp.fails($$select public.lookup_public_company('76.086.428-5')$$, 'ENQ_DEMASIADAS_CONSULTAS'),
  'más de 30 consultas por hora se bloquean');
select set_config('request.headers', '{"x-enqora-client":"otro-visitante"}', true);
select pg_temp.check((select public.lookup_public_company('76.086.428-5') ->> 'estado') = 'encontrada', 'el límite es por cliente');

-- 5) Catálogo público: solo servicios activos, sin sesión
reset role;
select pg_temp.check((select count(*) from public.public_catalog()) = (select count(*) from public.services where active),
  'el catálogo público lista solo los servicios activos');

-- 6) Un cliente con sesión tampoco lee las tablas directamente
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000009a1');
select pg_temp.check(pg_temp.fails('select count(*) from public.public_companies', 'permission denied'), 'un cliente NO lee la tabla');
select pg_temp.check((select count(*) from public.public_data_imports) = 0, 'un cliente NO ve el historial de cargas');

select 'TODAS LAS PRUEBAS OK' as resultado;
rollback;
