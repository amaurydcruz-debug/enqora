-- =====================================================================
-- ENQORA · Prueba de agentes IA y módulos (0014)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0014_agentes_modulos.sql.
-- Usa datos ficticios y al final deshace todo (ROLLBACK). No llama a ninguna IA:
-- simula la respuesta del agente para probar permisos, propuestas y MIRROR.
-- Resultado esperado: una fila "TODAS LAS PRUEBAS OK".
-- =====================================================================

begin;
-- Desde 0022 el equipo (salvo Administradores) necesita un pase de jornada: en esta prueba se simula vigente.
alter table public.staff_members alter column access_until set default now() + interval '1 day';

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
  ('00000000-0000-4000-8000-0000000014a1', 'ana14@prueba-enqora.cl',  'authenticated', 'authenticated'),  -- dueña
  ('00000000-0000-4000-8000-0000000014f1', 'dir14@prueba-enqora.cl',  'authenticated', 'authenticated'),  -- director de operaciones
  ('00000000-0000-4000-8000-0000000014f2', 'cami14@prueba-enqora.cl', 'authenticated', 'authenticated'),  -- contadora asignada
  ('00000000-0000-4000-8000-0000000014f3', 'leo14@prueba-enqora.cl',  'authenticated', 'authenticated'),  -- contador NO asignado
  ('00000000-0000-4000-8000-0000000014f4', 'ia14@prueba-enqora.cl',   'authenticated', 'authenticated');  -- cuenta de agente IA

insert into public.staff_members (user_id, role) values
  ('00000000-0000-4000-8000-0000000014f1', 'ops_director'),
  ('00000000-0000-4000-8000-0000000014f2', 'accountant_pro'),
  ('00000000-0000-4000-8000-0000000014f3', 'accountant_pro'),
  ('00000000-0000-4000-8000-0000000014f4', 'ai_agent')
on conflict (user_id) do update set role = excluded.role, active = true;

set local role authenticated;

select pg_temp.as_user('00000000-0000-4000-8000-0000000014a1');
select set_config('t.emp', public.create_company('76.086.428-5', 'Empresa Catorce SpA')::text, true);
select set_config('t.caso', public.create_case(current_setting('t.emp')::uuid, 'formaliza', 'Formalizar mi negocio', 'Vendo por redes sociales sin iniciar actividades.')::text, true);

-- 1) Preguntas iniciales del módulo
select public.set_case_intake(current_setting('t.caso')::uuid, '{"actividad":"Venta de ropa","ventas_mensuales":"Hasta 2 millones"}'::jsonb);
select pg_temp.check((select intake ->> 'actividad' = 'Venta de ropa' from public.cases where id = current_setting('t.caso')::uuid),
  'la dueña guarda las respuestas iniciales');
select pg_temp.check(pg_temp.fails($q$select public.set_case_intake('$q$ || current_setting('t.caso') || $q$'::uuid, '{"Mala Clave":"x"}'::jsonb)$q$,
  'ENQ_DATOS_INVALIDOS'), 'claves inválidas se rechazan');
select pg_temp.check(pg_temp.fails($q$select public.set_case_intake('$q$ || current_setting('t.caso') || $q$'::uuid, '{"monto":5}'::jsonb)$q$,
  'ENQ_DATOS_INVALIDOS'), 'solo textos');

-- 2) El cliente no puede ejecutar agentes
select pg_temp.check(pg_temp.fails($q$select public.start_agent_run('$q$ || current_setting('t.caso') || $q$'::uuid, 'tributario')$q$,
  'ENQ_SIN_PERMISO'), 'el cliente no ejecuta agentes');

select pg_temp.as_user('00000000-0000-4000-8000-0000000014f1');
select public.assign_case(current_setting('t.caso')::uuid, '00000000-0000-4000-8000-0000000014f2', 'responsable');
select public.assign_case(current_setting('t.caso')::uuid, '00000000-0000-4000-8000-0000000014f4', 'agente_ia');

select pg_temp.as_user('00000000-0000-4000-8000-0000000014f3');
select pg_temp.check(pg_temp.fails($q$select public.start_agent_run('$q$ || current_setting('t.caso') || $q$'::uuid, 'tributario')$q$,
  'ENQ_SIN_PERMISO'), 'un contador no asignado no ejecuta agentes');

select pg_temp.as_user('00000000-0000-4000-8000-0000000014f4');
select pg_temp.check(pg_temp.fails($q$select public.start_agent_run('$q$ || current_setting('t.caso') || $q$'::uuid, 'tributario')$q$,
  'ENQ_SIN_PERMISO'), 'una cuenta de agente IA no se autoejecuta');

-- 3) Ejecución real (simulada): contexto, paso en MIRROR, propuestas
select pg_temp.as_user('00000000-0000-4000-8000-0000000014f2');
select pg_temp.check(pg_temp.fails($q$select public.start_agent_run('$q$ || current_setting('t.caso') || $q$'::uuid, 'adivino')$q$,
  'ENQ_DATOS_INVALIDOS'), 'agente desconocido se rechaza');
select set_config('t.ctx', public.start_agent_run(current_setting('t.caso')::uuid, 'tributario', 'Revisa el régimen conveniente')::text, true);
select set_config('t.run', current_setting('t.ctx')::jsonb ->> 'run', true);
select pg_temp.check((current_setting('t.ctx')::jsonb #>> '{context,caso,respuestas_iniciales,actividad}') = 'Venta de ropa'
  and (current_setting('t.ctx')::jsonb #>> '{context,empresa,rut}') is not null, 'el contexto trae caso, respuestas y empresa');
select pg_temp.check((select s.status = 'trabajando' and s.visibility = 'cliente' from public.case_analysis_steps s
  join public.agent_runs r on r.step_id = s.id where r.id = current_setting('t.run')::uuid), 'MIRROR muestra al agente trabajando');
select pg_temp.check(pg_temp.fails($q$select public.start_agent_run('$q$ || current_setting('t.caso') || $q$'::uuid, 'tributario')$q$,
  'ENQ_AGENTE_OCUPADO'), 'no se lanza dos veces el mismo agente en paralelo');

select pg_temp.as_user('00000000-0000-4000-8000-0000000014f1');
select pg_temp.check(pg_temp.fails($q$select public.finish_agent_run('$q$ || current_setting('t.run') || $q$'::uuid, true, 'x', '[]'::jsonb)$q$,
  'ENQ_SIN_PERMISO'), 'solo quien pidió la ejecución la termina');

select pg_temp.as_user('00000000-0000-4000-8000-0000000014f2');
select pg_temp.check(public.finish_agent_run(current_setting('t.run')::uuid, true, 'Conviene evaluar régimen Pro Pyme.', $j$[
  {"kind":"paso","payload":{"etapa":"normativa","titulo":"Revisión del inicio de actividades","detalle":"Se revisan los requisitos del SII."}},
  {"kind":"hallazgo","payload":{"titulo":"Ventas sin inicio de actividades","situacion":"La empresa vende sin haber iniciado actividades ante el SII.",
    "normativa":"Código Tributario, art. 68.","fuentes":[{"titulo":"Código Tributario","articulo":"Art. 68","vigencia":"vigente","url":"https://www.bcn.cl/leychile/navegar?idNorma=6374"}],
    "nivel_riesgo":"alto","certeza":"media","falta":"Confirmar fecha de primeras ventas."}},
  {"kind":"tarea","payload":{"titulo":"Enviar boletas o comprobantes de ventas de los últimos 3 meses","para":"cliente"}},
  {"kind":"pregunta","payload":{"texto":"¿Desde qué mes vendes por redes sociales?"}},
  {"kind":"inventado","payload":{"x":1}}
]$j$::jsonb, 'claude-sonnet-5-5', 1200, 800, 1) = 4, 'se guardan 4 propuestas y se omite la mal formada');
select pg_temp.check((select s.status = 'revision' from public.case_analysis_steps s join public.agent_runs r on r.step_id = s.id
  where r.id = current_setting('t.run')::uuid), 'el paso queda en revisión del equipo');
select pg_temp.check(pg_temp.fails($q$select public.finish_agent_run('$q$ || current_setting('t.run') || $q$'::uuid, true, 'x', '[]'::jsonb)$q$,
  'ENQ_YA_DECIDIDA'), 'una ejecución terminada no se reescribe');

-- 4) El cliente no ve propuestas ni ejecuciones
select pg_temp.as_user('00000000-0000-4000-8000-0000000014a1');
select pg_temp.check((select count(*) from public.agent_proposals) = 0 and (select count(*) from public.agent_runs) = 0,
  'el cliente no ve las propuestas sin revisar');

-- 5) Aceptar y descartar
select pg_temp.as_user('00000000-0000-4000-8000-0000000014f4');
select pg_temp.check(pg_temp.fails($q$select public.decide_agent_proposal((select id from public.agent_proposals where kind = 'paso'), 'aceptar')$q$,
  'ENQ_SIN_PERMISO'), 'un agente IA no aprueba propuestas');

select pg_temp.as_user('00000000-0000-4000-8000-0000000014f2');
select public.decide_agent_proposal((select id from public.agent_proposals where kind = 'paso'), 'aceptar');
select pg_temp.check((select count(*) from public.case_analysis_steps where case_id = current_setting('t.caso')::uuid
  and title = 'Revisión del inicio de actividades' and status = 'completado' and agent = 'tributario') = 1, 'el paso aceptado aparece en MIRROR');
select public.decide_agent_proposal((select id from public.agent_proposals where kind = 'hallazgo'), 'aceptar');
select pg_temp.check((select count(*) from public.diagnosis_findings f join public.diagnoses d on d.id = f.diagnosis_id
  where d.case_id = current_setting('t.caso')::uuid and d.status = 'borrador' and f.risk_level = 'alto' and f.certainty = 'media'
  and jsonb_array_length(f.sources) = 1) = 1, 'la situación aceptada entra al borrador del diagnóstico');
select public.decide_agent_proposal((select id from public.agent_proposals where kind = 'tarea'), 'aceptar');
select pg_temp.check((select count(*) from public.case_tasks where case_id = current_setting('t.caso')::uuid and visibility = 'cliente'
  and title like 'Enviar boletas%') = 1, 'la tarea aceptada se crea');
select pg_temp.check(pg_temp.fails($q$select public.decide_agent_proposal((select id from public.agent_proposals where kind = 'tarea'), 'aceptar')$q$,
  'ENQ_YA_DECIDIDA'), 'no se decide dos veces');
select public.decide_agent_proposal((select id from public.agent_proposals where kind = 'pregunta'), 'descartar');
select pg_temp.check((select count(*) from public.case_events where case_id = current_setting('t.caso')::uuid
  and body like '¿Desde qué mes%') = 0, 'la pregunta descartada no llega al cliente');
select pg_temp.check((select s.status = 'completado' from public.case_analysis_steps s join public.agent_runs r on r.step_id = s.id
  where r.id = current_setting('t.run')::uuid), 'revisadas todas, el paso del agente queda completado');

-- 6) Una ejecución fallida no deja rastro en MIRROR
select set_config('t.run2', (public.start_agent_run(current_setting('t.caso')::uuid, 'legal') ->> 'run'), true);
select public.finish_agent_run(current_setting('t.run2')::uuid, false, null, null, null, null, null, null, 'timeout');
select pg_temp.check((select status = 'fallida' and step_id is null from public.agent_runs where id = current_setting('t.run2')::uuid),
  'la ejecución fallida queda registrada y sin paso visible');

select 'TODAS LAS PRUEBAS OK' as resultado;
rollback;
