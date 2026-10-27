-- =====================================================================
-- ENQORA · Prueba del expediente de cumplimiento y calendario de obligaciones (0018)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0018_cumplimiento.sql.
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
  ('00000000-0000-4000-8000-0000000018a1', 'ana18@prueba-enqora.cl',  'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000018b1', 'otro18@prueba-enqora.cl', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000018f1', 'dir18@prueba-enqora.cl',  'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000018f2', 'cami18@prueba-enqora.cl', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000018f3', 'leo18@prueba-enqora.cl',  'authenticated', 'authenticated');
insert into public.staff_members (user_id, role) values
  ('00000000-0000-4000-8000-0000000018f1', 'ops_director'),
  ('00000000-0000-4000-8000-0000000018f2', 'accountant_pro'),
  ('00000000-0000-4000-8000-0000000018f3', 'accountant_pro')
on conflict (user_id) do update set role = excluded.role, active = true;

select pg_temp.check(has_function_privilege('anon', 'public.daily_run(text)', 'execute'), 'la tarea diaria sigue disponible sin sesión');

set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000018a1');
select set_config('t.emp', public.create_company('76.086.428-5', 'Cafetería Dieciocho SpA')::text, true);
select public.save_onboarding(current_setting('t.emp')::uuid, '{"etapa":"inicio","actividad":"gastronomia","trabajadores":"1_5"}'::jsonb);
select set_config('t.caso', public.create_case(current_setting('t.emp')::uuid, 'formaliza', 'Abrir la cafetería', null)::text, true);
select pg_temp.as_user('00000000-0000-4000-8000-0000000018f1');
select public.assign_case(current_setting('t.caso')::uuid, '00000000-0000-4000-8000-0000000018f2', 'responsable');

-- 1) Matriz: la carga el equipo del caso, no otro contador ni el cliente
select pg_temp.as_user('00000000-0000-4000-8000-0000000018f3');
select pg_temp.check(pg_temp.fails($q$select public.seed_compliance_items('$q$ || current_setting('t.emp') || $q$'::uuid, '[]'::jsonb)$q$,
  'ENQ_SIN_PERMISO'), 'un contador sin casos de la empresa no gestiona su matriz');
select pg_temp.as_user('00000000-0000-4000-8000-0000000018a1');
select pg_temp.check(pg_temp.fails($q$select public.seed_compliance_items('$q$ || current_setting('t.emp') || $q$'::uuid, '[]'::jsonb)$q$,
  'ENQ_SIN_PERMISO'), 'el cliente no edita la matriz');

select pg_temp.as_user('00000000-0000-4000-8000-0000000018f2');
select pg_temp.check(public.seed_compliance_items(current_setting('t.emp')::uuid, $j$[
  {"etapa":"local","institucion":"seremi_salud","tramite":"Autorización sanitaria de alimentos","cuando":"Si elabora alimentos","url":"https://www.chileatiende.gob.cl/fichas/172"},
  {"etapa":"local","institucion":"muni","tramite":"Patente municipal","responsable":"cliente"},
  {"etapa":"local","institucion":"muni","tramite":"Patente municipal"},
  {"etapa":"marte","institucion":"x","tramite":"Etapa inválida"}
]$j$::jsonb) = 2, 'carga 2 ítems: sin duplicados ni ítems mal formados');
select set_config('t.item', (select id from public.compliance_items where title like 'Autorización%')::text, true);

select pg_temp.check(pg_temp.fails($q$select public.update_compliance_item('$q$ || current_setting('t.item') || $q$'::uuid, '{"status":"obtenido"}'::jsonb)$q$,
  'ENQ_FALTA_EVIDENCIA'), 'no se marca obtenido sin evidencia');
select pg_temp.check(pg_temp.fails($q$select public.update_compliance_item('$q$ || current_setting('t.item') || $q$'::uuid, '{"status":"no_aplica"}'::jsonb)$q$,
  'ENQ_FALTA_OBSERVACION'), 'descartar exige motivo');

reset role;
insert into public.case_documents (id, case_id, company_id, storage_path, file_name, visibility, uploaded_by)
values ('00000000-0000-4000-8000-00000000d018', current_setting('t.caso')::uuid, current_setting('t.emp')::uuid,
        current_setting('t.emp') || '/x/resolucion.pdf', 'resolucion-sanitaria.pdf', 'cliente', '00000000-0000-4000-8000-0000000018f2');
set local role authenticated;
select public.update_compliance_item(current_setting('t.item')::uuid,
  '{"status":"obtenido","evidence_document_id":"00000000-0000-4000-8000-00000000d018","renewal_date":"2029-10-27","deadline_kind":"legal"}'::jsonb);
select pg_temp.check((select status = 'obtenido' and renewal_date = '2029-10-27' from public.compliance_items where id = current_setting('t.item')::uuid),
  'con evidencia queda obtenido y con fecha de renovación');

-- 2) Calendario de obligaciones
select pg_temp.as_user('00000000-0000-4000-8000-0000000018a1');
select pg_temp.check(public.generate_obligations(current_setting('t.emp')::uuid, 3) >= 5, 'el dueño genera F29, cotizaciones y F22');
select pg_temp.check(public.generate_obligations(current_setting('t.emp')::uuid, 3) = 0, 'no duplica');
select pg_temp.check((select bool_and(extract(day from due_date) in (20, 21, 22) or extract(isodow from due_date) = 1)
  from public.obligations where kind = 'f29'), 'F29 al día 20 o el lunes siguiente');
select pg_temp.check((select bool_and(extract(day from due_date) = 13) from public.obligations where kind = 'cotizaciones'),
  'cotizaciones electrónicas al día 13');
select pg_temp.check((select count(*) from public.obligations where kind = 'f22' and to_char(due_date, 'MM-DD') = '04-30') = 1, 'F22 el 30 de abril');

select set_config('t.ob', (select id from public.obligations where kind = 'f29' order by due_date limit 1)::text, true);
select pg_temp.check(pg_temp.fails($q$select public.set_obligation_status('$q$ || current_setting('t.ob') || $q$'::uuid, 'pagada')$q$,
  'ENQ_FALTA_EVIDENCIA'), 'pagada exige comprobante');
select public.set_obligation_status(current_setting('t.ob')::uuid, 'preparada');
select public.set_obligation_status(current_setting('t.ob')::uuid, 'presentada', '123456789');
select pg_temp.check((select status = 'presentada' and reference = '123456789' from public.obligations where id = current_setting('t.ob')::uuid),
  'presentada con su folio');

-- 3) Otra empresa no ve nada
select pg_temp.as_user('00000000-0000-4000-8000-0000000018b1');
select pg_temp.check((select count(*) from public.obligations) = 0 and (select count(*) from public.compliance_items) = 0, 'aislamiento entre empresas');

-- 4) F29 presentado en contabilidad marca la obligación
select pg_temp.as_user('00000000-0000-4000-8000-0000000018a1');
select set_config('t.per', (select period from public.obligations where kind = 'f29' and status = 'pendiente' order by due_date limit 1), true);
reset role;
insert into public.vat_returns (company_id, period, status)
values (current_setting('t.emp')::uuid, (current_setting('t.per') || '-01')::date, 'aprobado');
update public.vat_returns set status = 'presentado', presented_folio = '987654', presented_on = current_date
where company_id = current_setting('t.emp')::uuid and period = (current_setting('t.per') || '-01')::date;
select pg_temp.check((select status = 'presentada' and reference = '987654' from public.obligations
  where company_id = current_setting('t.emp')::uuid and kind = 'f29' and period = current_setting('t.per')), 'el F29 presentado actualiza el calendario');

-- 5) Alertas y vencimientos
update public.obligations set due_date = private.today_cl() + 7, status = 'pendiente' where id = (select id from public.obligations where kind = 'f22' and company_id = current_setting('t.emp')::uuid);
update public.obligations set due_date = private.today_cl() - 1 where id = (select id from public.obligations where kind = 'cotizaciones' and company_id = current_setting('t.emp')::uuid order by due_date limit 1);
select set_config('request.jwt.claims', '', true);  -- la tarea diaria corre sin usuario
select private.compliance_alerts();
select pg_temp.check((select count(*) from public.obligations where company_id = current_setting('t.emp')::uuid and status = 'vencida') = 1, 'vence lo atrasado');
select pg_temp.check((select count(*) from public.notifications where title like 'Vence en 7 días%' and company_id = current_setting('t.emp')::uuid) = 1, 'aviso 7 días antes');

select 'TODAS LAS PRUEBAS OK' as resultado;
rollback;
