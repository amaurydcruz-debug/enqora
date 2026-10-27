-- =====================================================================
-- ENQORA · Prueba de la auditoría independiente de agentes IA (0016)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0016_auditoria_ia.sql.
-- No llama a ninguna IA: simula la propuesta del agente y el resultado del auditor.
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

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000016a1', 'ana16@prueba-enqora.cl',  'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000016f1', 'dir16@prueba-enqora.cl',  'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000016f2', 'cami16@prueba-enqora.cl', 'authenticated', 'authenticated');
insert into public.staff_members (user_id, role) values
  ('00000000-0000-4000-8000-0000000016f1', 'ops_director'),
  ('00000000-0000-4000-8000-0000000016f2', 'accountant_pro')
on conflict (user_id) do update set role = excluded.role, active = true;

set local role authenticated;

select pg_temp.as_user('00000000-0000-4000-8000-0000000016a1');
select set_config('t.emp', public.create_company('76.086.428-5', 'Empresa Dieciséis SpA')::text, true);
select set_config('t.caso', public.create_case(current_setting('t.emp')::uuid, 'contabilidad', 'IVA atrasado', 'No declaramos el F29 de julio a septiembre.')::text, true);
select pg_temp.as_user('00000000-0000-4000-8000-0000000016f1');
select public.assign_case(current_setting('t.caso')::uuid, '00000000-0000-4000-8000-0000000016f2', 'responsable');

-- 1) Ejecución con auditoría pendiente
select pg_temp.as_user('00000000-0000-4000-8000-0000000016f2');
select set_config('t.run', public.start_agent_run(current_setting('t.caso')::uuid, 'tributario', null, true) ->> 'run', true);
select public.finish_agent_run(current_setting('t.run')::uuid, true, 'Tres F29 atrasados.', $j$[
  {"kind":"hallazgo","payload":{"titulo":"F29 de julio a septiembre sin declarar","situacion":"La empresa no declaró el IVA de tres meses.","nivel_riesgo":"alto","certeza":"media",
   "fuentes":[{"titulo":"Código Tributario","articulo":"Art. 97 N°2"}]}},
  {"kind":"tarea","payload":{"titulo":"Enviar el detalle del RCV de julio a septiembre","para":"cliente"}},
  {"kind":"pregunta","payload":{"texto":"¿Recibiste alguna notificación del SII?"}}
]$j$::jsonb, 'claude-sonnet-5-5', 100, 100, 0);
select pg_temp.check((select audit_status = 'pendiente' from public.agent_runs where id = current_setting('t.run')::uuid), 'la ejecución queda pendiente de auditoría');
select pg_temp.check(pg_temp.fails($q$select public.decide_agent_proposal((select id from public.agent_proposals where kind = 'tarea' and run_id = '$q$ || current_setting('t.run') || $q$'), 'aceptar')$q$,
  'ENQ_AUDITORIA_PENDIENTE'), 'no se acepta antes de la auditoría');

-- 2) Auditoría: tarea aprobada, situación a corregir, pregunta aprobada
select pg_temp.check((public.audit_input(current_setting('t.run')::uuid) -> 'propuestas') is not null, 'el auditor recibe las propuestas');
select public.save_agent_audit(current_setting('t.run')::uuid, true, 'corregir', 'La situación usa una tasa de interés derogada.',
  (select jsonb_agg(jsonb_build_object('id', id, 'veredicto', case when kind = 'hallazgo' then 'corregir' else 'aprobada' end,
     'gravedad', case when kind = 'hallazgo' then 'alta' else 'ninguna' end,
     'observaciones', case when kind = 'hallazgo' then '[{"tipo":"norma","detalle":"Usa 1,5% mensual; desde 2025 el interés es diario (art. 53).","correccion_sugerida":"Recalcular con la tasa diaria vigente."}]'::jsonb else '[]'::jsonb end))
   from public.agent_proposals where run_id = current_setting('t.run')::uuid),
  '[{"tipo":"calculo","ok":true,"detalle":"sin cálculos"}]'::jsonb, 'gpt-6-astra', 500, 200, 1);
select pg_temp.check((select audit_status = 'auditada' and audit_decision = 'corregir' from public.agent_runs where id = current_setting('t.run')::uuid),
  'la auditoría queda registrada en la ejecución');
select pg_temp.check((select count(*) from public.agent_audits where run_id = current_setting('t.run')::uuid and status = 'completada') = 1, 'el expediente de auditoría se guarda');

select public.decide_agent_proposal((select id from public.agent_proposals where kind = 'tarea' and run_id = current_setting('t.run')::uuid), 'aceptar');
select pg_temp.check((select status = 'aceptada' from public.agent_proposals where kind = 'tarea' and run_id = current_setting('t.run')::uuid), 'una propuesta aprobada se acepta');
select pg_temp.check(pg_temp.fails($q$select public.decide_agent_proposal((select id from public.agent_proposals where kind = 'hallazgo' and run_id = '$q$ || current_setting('t.run') || $q$'), 'aceptar')$q$,
  'ENQ_AUDITORIA_OBSERVADA'), 'una propuesta observada no se acepta sin supervisión');

-- 3) Corrección por el agente: reemplaza la versión anterior
select pg_temp.check(public.correction_brief(current_setting('t.run')::uuid) like '%art. 53%', 'el agente recibe las observaciones');
select set_config('t.run2', public.start_agent_run(current_setting('t.caso')::uuid, 'tributario', null, true, current_setting('t.run')::uuid) ->> 'run', true);
select pg_temp.check((select correction_round = 1 and parent_run_id = current_setting('t.run')::uuid from public.agent_runs where id = current_setting('t.run2')::uuid),
  'la corrección es la ronda 1 de la ejecución original');
select public.finish_agent_run(current_setting('t.run2')::uuid, true, 'Corregido.', $j$[
  {"kind":"hallazgo","payload":{"titulo":"F29 de julio a septiembre sin declarar","situacion":"La empresa no declaró el IVA de tres meses; intereses según art. 53 vigente.","nivel_riesgo":"alto","certeza":"media"}}
]$j$::jsonb);
select pg_temp.check((select status = 'reemplazada' from public.agent_proposals where kind = 'hallazgo' and run_id = current_setting('t.run')::uuid),
  'la versión anterior queda reemplazada');
select pg_temp.check((select status = 'pendiente' from public.agent_proposals where kind = 'pregunta' and run_id = current_setting('t.run')::uuid) is not true,
  'las pendientes anteriores no quedan sueltas');

-- 4) Escalamiento: solo la supervisión acepta, con fundamento
select public.audit_input(current_setting('t.run2')::uuid);
select public.save_agent_audit(current_setting('t.run2')::uuid, true, 'escalar', 'Discrepancia importante persistente.',
  (select jsonb_agg(jsonb_build_object('id', id, 'veredicto', 'escalar', 'gravedad', 'alta', 'observaciones', '[]'::jsonb))
   from public.agent_proposals where run_id = current_setting('t.run2')::uuid), '[]'::jsonb);
select pg_temp.check(pg_temp.fails($q$select public.decide_agent_proposal((select id from public.agent_proposals where run_id = '$q$ || current_setting('t.run2') || $q$'), 'aceptar')$q$,
  'ENQ_AUDITORIA_OBSERVADA'), 'la contadora no acepta una propuesta escalada');
select pg_temp.as_user('00000000-0000-4000-8000-0000000016f1');
select pg_temp.check(pg_temp.fails($q$select public.decide_agent_proposal((select id from public.agent_proposals where run_id = '$q$ || current_setting('t.run2') || $q$'), 'aceptar')$q$,
  'ENQ_FALTA_FUNDAMENTO'), 'la supervisión debe fundamentar');
select public.decide_agent_proposal((select id from public.agent_proposals where run_id = current_setting('t.run2')::uuid), 'aceptar', 'interno',
  'Revisé el art. 53 vigente y la circular 1/2025; el texto es correcto.');
select pg_temp.check((select override_by = '00000000-0000-4000-8000-0000000016f1' and status = 'aceptada' from public.agent_proposals
  where run_id = current_setting('t.run2')::uuid), 'queda registrado quién autorizó la excepción');

-- 5) Auditoría fallida y límites
select pg_temp.as_user('00000000-0000-4000-8000-0000000016f2');
select set_config('t.run3', public.start_agent_run(current_setting('t.caso')::uuid, 'contable', null, true) ->> 'run', true);
select public.finish_agent_run(current_setting('t.run3')::uuid, true, 'x', '[{"kind":"pregunta","payload":{"texto":"¿Tienes la cartola de julio?"}}]'::jsonb);
select public.audit_input(current_setting('t.run3')::uuid);
select public.save_agent_audit(current_setting('t.run3')::uuid, false, null, null, null, null, null, null, null, null, 'timeout');
select pg_temp.check((select audit_status = 'fallida' from public.agent_runs where id = current_setting('t.run3')::uuid), 'la auditoría fallida queda registrada');
select pg_temp.check(pg_temp.fails($q$select public.decide_agent_proposal((select id from public.agent_proposals where run_id = '$q$ || current_setting('t.run3') || $q$'), 'aceptar')$q$,
  'ENQ_AUDITORIA_PENDIENTE'), 'sin auditoría completa no se acepta');
select pg_temp.check(pg_temp.fails($q$select public.start_agent_run('$q$ || current_setting('t.caso') || $q$'::uuid, 'contable', null, true, '$q$ || current_setting('t.run3') || $q$'::uuid)$q$,
  'ENQ_SIN_CORRECCION'), 'no se corrige lo que la auditoría no observó');

-- 6) El cliente no ve el expediente de auditoría
select pg_temp.as_user('00000000-0000-4000-8000-0000000016a1');
select pg_temp.check((select count(*) from public.agent_audits) = 0, 'el cliente no ve las auditorías');
select pg_temp.check(pg_temp.fails('select public.audit_stats()', 'ENQ_SIN_PERMISO'), 'el cliente no ve los indicadores');

select 'TODAS LAS PRUEBAS OK' as resultado;
rollback;
