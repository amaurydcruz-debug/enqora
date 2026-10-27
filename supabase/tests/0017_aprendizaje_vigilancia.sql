-- =====================================================================
-- ENQORA · Prueba de aprendizaje de casos y vigilancia normativa (0017)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0017_aprendizaje_vigilancia.sql.
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

-- La tarea diaria y la vigilancia corren sin sesión (anon) con la clave de servicio.
select pg_temp.check(has_function_privilege('anon', 'public.daily_run(text)', 'execute'), 'la tarea diaria puede ejecutarse sin sesión');
select pg_temp.check(has_function_privilege('anon', 'public.ingest_regulatory_updates(text, jsonb)', 'execute'), 'la vigilancia puede entregar sin sesión');
select pg_temp.check(not has_function_privilege('anon', 'public.review_regulatory_update(uuid, text, text, boolean, text[], text[])', 'execute'), 'revisar novedades exige sesión');

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000017a1', 'ana17@prueba-enqora.cl',  'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000017f1', 'dir17@prueba-enqora.cl',  'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000017f2', 'adm17@prueba-enqora.cl',  'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000017f3', 'cami17@prueba-enqora.cl', 'authenticated', 'authenticated');
insert into public.staff_members (user_id, role) values
  ('00000000-0000-4000-8000-0000000017f1', 'ops_director'),
  ('00000000-0000-4000-8000-0000000017f2', 'enqora_admin'),
  ('00000000-0000-4000-8000-0000000017f3', 'accountant_pro')
on conflict (user_id) do update set role = excluded.role, active = true;

-- Clave de servicio de prueba
update private.service_secrets set token_hash = encode(sha256(convert_to('clave-de-servicio-de-prueba-0017-xxxxxxxx', 'UTF8')), 'hex') where id;
insert into private.service_secrets (id, token_hash) select true, encode(sha256(convert_to('clave-de-servicio-de-prueba-0017-xxxxxxxx', 'UTF8')), 'hex')
where not exists (select 1 from private.service_secrets);

set local role authenticated;

select pg_temp.as_user('00000000-0000-4000-8000-0000000017a1');
select set_config('t.emp', public.create_company('76.086.428-5', 'Panadería Diecisiete SpA')::text, true);
select public.save_onboarding(current_setting('t.emp')::uuid, '{"etapa":"operando","actividad":"gastronomia"}'::jsonb);
select set_config('t.caso', public.create_case(current_setting('t.emp')::uuid, 'formaliza', 'Patente y autorización sanitaria', 'Abrir el local.')::text, true);
select set_config('t.caso2', public.create_case(current_setting('t.emp')::uuid, 'formaliza', 'Segunda sucursal', 'Otro local.')::text, true);
select pg_temp.as_user('00000000-0000-4000-8000-0000000017f1');
select public.assign_case(current_setting('t.caso')::uuid, '00000000-0000-4000-8000-0000000017f3', 'responsable');
select public.assign_case(current_setting('t.caso2')::uuid, '00000000-0000-4000-8000-0000000017f3', 'responsable');

-- 1) Aprendizaje: solo con el caso resuelto, anónimo y aprobado por otra persona
select pg_temp.as_user('00000000-0000-4000-8000-0000000017f3');
select pg_temp.check(pg_temp.fails($q$select public.save_case_learning('$q$ || current_setting('t.caso') || $q$'::uuid,
  '{"problema":"Local sin autorización sanitaria","ruta":"Revisar uso de suelo, luego SEREMI y patente","resultado":"Patente obtenida"}'::jsonb)$q$,
  'ENQ_CASO_SIN_RESOLVER'), 'no se registra aprendizaje de un caso abierto');
reset role;
update public.cases set status = 'cerrado', closed_at = now(), result_summary = 'Patente y autorización sanitaria obtenidas.' where id = current_setting('t.caso')::uuid;
set local role authenticated;
select pg_temp.check(pg_temp.fails($q$select public.save_case_learning('$q$ || current_setting('t.caso') || $q$'::uuid,
  '{"problema":"Panadería Diecisiete SpA no tenía autorización","ruta":"Revisar uso de suelo, luego SEREMI y patente","resultado":"Patente obtenida"}'::jsonb)$q$,
  'ENQ_APRENDIZAJE_IDENTIFICA'), 'el aprendizaje no puede identificar a la empresa');
select pg_temp.check(pg_temp.fails($q$select public.save_case_learning('$q$ || current_setting('t.caso') || $q$'::uuid,
  '{"problema":"Empresa 76086428 sin autorización","ruta":"Revisar uso de suelo, luego SEREMI y patente","resultado":"Patente obtenida"}'::jsonb)$q$,
  'ENQ_APRENDIZAJE_IDENTIFICA'), 'tampoco su RUT');
select set_config('t.lec', public.save_case_learning(current_setting('t.caso')::uuid,
  '{"problema":"Local de alimentos sin autorización sanitaria ni patente","ruta":"1) certificado de informaciones previas, 2) autorización sanitaria SEREMI, 3) patente municipal","resultado":"Local habilitado en 6 semanas","funciono":"Verificar uso de suelo antes de remodelar","mejorar":"Pedir el plano del local desde el inicio"}'::jsonb)::text, true);
select pg_temp.check(pg_temp.fails($q$select public.decide_case_learning('$q$ || current_setting('t.lec') || $q$'::uuid, true)$q$,
  'ENQ_SIN_PERMISO'), 'quien no es supervisión no aprueba');
select pg_temp.as_user('00000000-0000-4000-8000-0000000017f1');
select public.decide_case_learning(current_setting('t.lec')::uuid, true, 'Ruta correcta y anónima.');
select pg_temp.check((select status = 'aprobado' and rubro = 'gastronomia' from public.case_learnings where id = current_setting('t.lec')::uuid),
  'el aprendizaje queda aprobado con su rubro');

-- 2) El siguiente caso del mismo servicio lo recibe el agente
select pg_temp.as_user('00000000-0000-4000-8000-0000000017f3');
select set_config('t.ctx', public.start_agent_run(current_setting('t.caso2')::uuid, 'legal') ::text, true);
select pg_temp.check(jsonb_array_length(current_setting('t.ctx')::jsonb #> '{context,aprendizajes}') = 1
  and (current_setting('t.ctx')::jsonb #>> '{context,aprendizajes,0,funciono}') like 'Verificar uso de suelo%', 'el agente aprende del caso anterior');
select pg_temp.check((current_setting('t.ctx')::jsonb #> '{context,aprendizajes}')::text not like '%Diecisiete%', 'sin datos de la empresa');

-- 3) Vigilancia normativa
reset role;
select pg_temp.check(pg_temp.fails($q$select public.ingest_regulatory_updates('mala', '[]'::jsonb)$q$, 'ENQ_CLAVE_SERVICIO'), 'sin clave de servicio no se entrega');
select pg_temp.check(public.ingest_regulatory_updates('clave-de-servicio-de-prueba-0017-xxxxxxxx', $j$[
  {"titulo":"Nueva convocatoria Capital Semilla","resumen":"Sercotec abre convocatoria para emprendedores de la región.","institucion":"Sercotec","tipo":"beneficio","url":"https://www.sercotec.cl/convocatoria","publicado":"2026-10-20","modulos":["idea","crece"],"rubros":["gastronomia"]},
  {"titulo":"Nueva convocatoria Capital Semilla","resumen":"Duplicada.","institucion":"Sercotec","tipo":"beneficio","url":"https://www.sercotec.cl/convocatoria"},
  {"titulo":"Sin enlace","resumen":"No trae fuente oficial https.","tipo":"ley","url":"http://inseguro.cl"},
  {"titulo":"Circular sobre IVA","resumen":"El SII imparte instrucciones sobre documentos electrónicos.","institucion":"SII","tipo":"circular","url":"https://www.sii.cl/normativa/circular","modulos":["contabilidad","formaliza"]}
]$j$::jsonb) = 2, 'se guardan 2 novedades válidas, sin duplicados ni fuentes inseguras');
set local role authenticated;

select pg_temp.as_user('00000000-0000-4000-8000-0000000017a1');
select pg_temp.check((select count(*) from public.regulatory_updates) = 0, 'el cliente no ve novedades sin verificar');

select pg_temp.as_user('00000000-0000-4000-8000-0000000017f3');
select pg_temp.check(pg_temp.fails($q$select public.review_regulatory_update((select id from public.regulatory_updates where kind = 'beneficio'), 'verificada')$q$,
  'ENQ_SIN_PERMISO'), 'solo la supervisión verifica');
select pg_temp.as_user('00000000-0000-4000-8000-0000000017f2');
select pg_temp.check(pg_temp.fails($q$select public.review_regulatory_update((select id from public.regulatory_updates where kind = 'circular'), 'descartada')$q$,
  'ENQ_FALTA_OBSERVACION'), 'descartar exige motivo');
select pg_temp.check(public.review_regulatory_update((select id from public.regulatory_updates where kind = 'beneficio'), 'verificada',
  'Bases revisadas en sercotec.cl.', true) = 1, 'se avisa a las empresas del rubro');
select public.review_regulatory_update((select id from public.regulatory_updates where kind = 'circular'), 'verificada', 'Revisada.', false);

select pg_temp.as_user('00000000-0000-4000-8000-0000000017a1');
select pg_temp.check((select count(*) from public.regulatory_updates) = 1, 'el cliente ve solo la novedad verificada y visible');
select pg_temp.check((select count(*) from public.notifications where link = '/panel#novedades') = 1, 'el dueño recibió el aviso');
select pg_temp.check((select count(*) from public.case_learnings) = 0, 'el cliente no ve los aprendizajes internos');

-- 4) Las novedades verificadas llegan al agente
select pg_temp.as_user('00000000-0000-4000-8000-0000000017f3');
select pg_temp.check((public.start_agent_run(current_setting('t.caso2')::uuid, 'tributario') #> '{context,novedades_verificadas}')::text like '%Circular sobre IVA%',
  'el agente recibe la circular verificada del módulo');
select pg_temp.check(jsonb_array_length(public.route_metrics()) = 9, 'métricas por ruta para el equipo');

select 'TODAS LAS PRUEBAS OK' as resultado;
rollback;
