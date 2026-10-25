-- =====================================================================
-- ENQORA · Prueba del diagnóstico gratuito y onboarding (0010)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0010_diagnostico.sql.
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

grant execute on all functions in schema pg_temp to authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000010a1', 'ana10@prueba-enqora.cl',  'authenticated', 'authenticated'),  -- dueña empresa
  ('00000000-0000-4000-8000-0000000010c1', 'lola10@prueba-enqora.cl', 'authenticated', 'authenticated'),  -- solo lectura
  ('00000000-0000-4000-8000-0000000010b1', 'otro10@prueba-enqora.cl', 'authenticated', 'authenticated'),  -- otra empresa
  ('00000000-0000-4000-8000-0000000010f1', 'dir10@prueba-enqora.cl',  'authenticated', 'authenticated'),  -- director de operaciones
  ('00000000-0000-4000-8000-0000000010f2', 'cami10@prueba-enqora.cl', 'authenticated', 'authenticated'),  -- contadora responsable
  ('00000000-0000-4000-8000-0000000010f3', 'leo10@prueba-enqora.cl',  'authenticated', 'authenticated'),  -- contador NO asignado
  ('00000000-0000-4000-8000-0000000010f4', 'ia10@prueba-enqora.cl',   'authenticated', 'authenticated');  -- agente IA

insert into public.staff_members (user_id, role) values
  ('00000000-0000-4000-8000-0000000010f1', 'ops_director'),
  ('00000000-0000-4000-8000-0000000010f2', 'accountant_pro'),
  ('00000000-0000-4000-8000-0000000010f3', 'accountant_pro'),
  ('00000000-0000-4000-8000-0000000010f4', 'ai_agent')
on conflict (user_id) do update set role = excluded.role, active = true;

set local role authenticated;

select pg_temp.as_user('00000000-0000-4000-8000-0000000010a1');
select set_config('t.emp', public.create_company('76.086.428-5', 'Empresa Diez SpA')::text, true);
select set_config('t.tok', public.create_invitation(current_setting('t.emp')::uuid, 'lola10@prueba-enqora.cl', 'viewer'), true);
select pg_temp.as_user('00000000-0000-4000-8000-0000000010c1');
select set_config('request.jwt.claims', (current_setting('request.jwt.claims')::jsonb || '{"email":"lola10@prueba-enqora.cl"}')::text, true);
select public.accept_invitation(current_setting('t.tok'));

-- 1) Onboarding: opciones válidas, obligatorias y permisos
select pg_temp.as_user('00000000-0000-4000-8000-0000000010a1');
select pg_temp.check(pg_temp.fails(format($$select public.save_onboarding(%L, '{"etapa":"inventada"}')$$, current_setting('t.emp')),
  'ENQ_DATOS_INVALIDOS'), 'una opción que no existe se rechaza');
select pg_temp.check(pg_temp.fails(format($$select public.save_onboarding(%L, '{"clave_sii":"1234"}')$$, current_setting('t.emp')),
  'ENQ_DATOS_INVALIDOS'), 'una pregunta que no existe se rechaza (nunca se guardan claves)');
select pg_temp.check(pg_temp.fails(format($$select public.save_onboarding(%L, '{"preocupaciones":["marca","marca"]}')$$, current_setting('t.emp')),
  'ENQ_DATOS_INVALIDOS'), 'preocupaciones repetidas se rechazan');
select pg_temp.check(pg_temp.fails(format($$select public.start_free_diagnosis(%L, 'contabilidad', 'IVA atrasado')$$, current_setting('t.emp')),
  'ENQ_FALTA_ONBOARDING'), 'el diagnóstico gratuito exige el onboarding completo');
select pg_temp.check(public.save_onboarding(current_setting('t.emp')::uuid, '{"etapa":"operando"}') = false, 'respuestas parciales se guardan como incompletas');
select pg_temp.check(public.save_onboarding(current_setting('t.emp')::uuid,
  '{"etapa":"regularizar","actividad":"comercio","trabajadores":"1_5","ventas":"5m_25m","contabilidad":"nadie","documentos":"ambos","preocupaciones":["impuestos_atrasados","observaciones_sii"],"urgencia":"vence_pronto"}'),
  'el onboarding completo se marca como completo');
select pg_temp.check((select revision from public.company_onboarding where company_id = current_setting('t.emp')::uuid) = 2, 'cada guardado suma una revisión');

select pg_temp.as_user('00000000-0000-4000-8000-0000000010c1');
select pg_temp.check(pg_temp.fails(format($$select public.save_onboarding(%L, '{"etapa":"idea"}')$$, current_setting('t.emp')),
  'ENQ_SIN_PERMISO'), 'solo lectura NO edita el onboarding');
select pg_temp.check((select count(*) from public.company_onboarding) = 1, 'solo lectura sí ve las respuestas de su empresa');
select pg_temp.as_user('00000000-0000-4000-8000-0000000010b1');
select pg_temp.check((select count(*) from public.company_onboarding) = 0, 'otra empresa NO ve las respuestas');

-- 2) Diagnóstico gratuito: uno por empresa
select pg_temp.as_user('00000000-0000-4000-8000-0000000010a1');
select set_config('t.caso', public.start_free_diagnosis(current_setting('t.emp')::uuid, 'contabilidad',
  'IVA atrasado y observaciones del SII', 'Tengo tres meses sin declarar')::text, true);
select pg_temp.check((select origin from public.cases where id = current_setting('t.caso')::uuid) = 'diagnostico_gratuito', 'el caso queda marcado como diagnóstico gratuito');
select pg_temp.check(pg_temp.fails(format($$select public.start_free_diagnosis(%L, 'legal', 'Otro tema')$$, current_setting('t.emp')),
  'ENQ_DIAGNOSTICO_YA_USADO'), 'la primera consulta gratuita es una por empresa');

-- 3) Redacción: solo el equipo del caso
select pg_temp.check(pg_temp.fails(format($$select public.draft_diagnosis(%L)$$, current_setting('t.caso')), 'ENQ_SIN_PERMISO'),
  'el cliente NO redacta diagnósticos');
select pg_temp.as_user('00000000-0000-4000-8000-0000000010f1');
select public.assign_case(current_setting('t.caso')::uuid, '00000000-0000-4000-8000-0000000010f2', 'responsable');
select public.assign_case(current_setting('t.caso')::uuid, '00000000-0000-4000-8000-0000000010f4', 'agente_ia');
select pg_temp.as_user('00000000-0000-4000-8000-0000000010f3');
select pg_temp.check(pg_temp.fails(format($$select public.draft_diagnosis(%L)$$, current_setting('t.caso')), 'ENQ_SIN_PERMISO'),
  'un contador no asignado NO redacta');
select pg_temp.check((select count(*) from public.company_onboarding) = 0, 'un contador no asignado NO ve el onboarding');

select pg_temp.as_user('00000000-0000-4000-8000-0000000010f4');
select pg_temp.check((select count(*) from public.company_onboarding) = 1, 'el equipo asignado ve el onboarding de la empresa');
select set_config('t.diag', public.draft_diagnosis(current_setting('t.caso')::uuid)::text, true);
select pg_temp.check(public.draft_diagnosis(current_setting('t.caso')::uuid) = current_setting('t.diag')::uuid, 'solo hay un borrador abierto');
select pg_temp.check((select status from public.cases where id = current_setting('t.caso')::uuid) = 'diagnostico', 'el caso pasa a diagnóstico');
select pg_temp.check(pg_temp.fails(format($$select public.submit_diagnosis(%L)$$, current_setting('t.diag')), 'ENQ_DIAGNOSTICO_INCOMPLETO'),
  'un informe vacío no se envía');
select pg_temp.check(pg_temp.fails(format($$select public.save_finding(%L, null, '{"title":"IVA","situation":"Falta declarar tres períodos","risk_level":"alto","certainty":"media","sources":[{"titulo":"Ley IVA","url":"http://inseguro"}]}')$$,
  current_setting('t.diag')), 'ENQ_FUENTE_INVALIDA'), 'las fuentes deben usar https');
select pg_temp.check(pg_temp.fails(format($$select public.save_finding(%L, null, '{"title":"IVA","situation":"corto","risk_level":"alto","certainty":"media"}')$$,
  current_setting('t.diag')), 'ENQ_DATOS_INVALIDOS'), 'una situación sin descripción suficiente se rechaza');
select set_config('t.f1', public.save_finding(current_setting('t.diag')::uuid, null, jsonb_build_object(
  'title', 'Declaraciones de IVA pendientes',
  'situation', 'Según lo informado, los formularios 29 de julio a septiembre no se han presentado.',
  'obligations', 'Declarar y pagar el IVA mensualmente mediante el formulario 29.',
  'sources', jsonb_build_array(jsonb_build_object('titulo', 'D.L. 825, Ley sobre Impuesto a las Ventas y Servicios', 'articulo', 'Art. 64', 'vigencia', 'Vigente', 'url', 'https://www.bcn.cl/leychile/navegar?idNorma=6369')),
  'risk_level', 'alto', 'risk', 'Multas e intereses que aumentan cada mes.',
  'cost_min', 90000, 'cost_max', 150000, 'certainty', 'media',
  'missing', 'Carpeta tributaria y registro de compras y ventas.'))::text, true);
select pg_temp.check(pg_temp.fails(format($$select public.save_finding(%L, null, '{"title":"Costo","situation":"Situación de prueba larga","risk_level":"bajo","certainty":"alta","cost_min":500,"cost_max":100}')$$,
  current_setting('t.diag')), 'ENQ_DATOS_INVALIDOS'), 'el costo máximo no puede ser menor que el mínimo');
select public.save_diagnosis(current_setting('t.diag')::uuid, 'Tu empresa tiene declaraciones pendientes que conviene regularizar pronto.', 'media', 'Carpeta tributaria');

-- 4) El cliente no ve borradores
select pg_temp.as_user('00000000-0000-4000-8000-0000000010a1');
select pg_temp.check((select count(*) from public.diagnoses) = 0, 'el cliente NO ve el borrador');
select pg_temp.check((select count(*) from public.diagnosis_findings) = 0, 'el cliente NO ve las situaciones del borrador');

-- 5) Revisión profesional: el agente envía, no aprueba; cuatro ojos
select pg_temp.as_user('00000000-0000-4000-8000-0000000010f4');
select set_config('t.apr', public.submit_diagnosis(current_setting('t.diag')::uuid)::text, true);
select pg_temp.check((select status from public.cases where id = current_setting('t.caso')::uuid) = 'revision_profesional', 'el caso queda en revisión profesional');
select pg_temp.check(pg_temp.fails(format($$select public.save_finding(%L, %L, '{"title":"x"}')$$, current_setting('t.diag'), current_setting('t.f1')),
  'ENQ_DIAGNOSTICO_NO_EDITABLE'), 'en revisión el informe no se edita');
select pg_temp.check(pg_temp.fails(format($$select public.decide_approval(%L, 'aprobar')$$, current_setting('t.apr')), 'ENQ_SIN_PERMISO'),
  'el agente IA NO aprueba diagnósticos');

-- Devuelto con observaciones → vuelve a borrador
select pg_temp.as_user('00000000-0000-4000-8000-0000000010f2');
select public.decide_approval(current_setting('t.apr')::uuid, 'devolver', 'Agrega la fuente del artículo 97 sobre multas.');
select pg_temp.check((select status from public.diagnoses where id = current_setting('t.diag')::uuid) = 'borrador', 'devuelto vuelve a borrador');
select pg_temp.check((select review_note from public.diagnoses where id = current_setting('t.diag')::uuid) like 'Agrega la fuente%', 'la observación queda en el borrador');

select pg_temp.as_user('00000000-0000-4000-8000-0000000010f4');
select set_config('t.apr2', public.submit_diagnosis(current_setting('t.diag')::uuid)::text, true);
select pg_temp.as_user('00000000-0000-4000-8000-0000000010f2');
select public.decide_approval(current_setting('t.apr2')::uuid, 'aprobar');
select pg_temp.check((select status from public.diagnoses where id = current_setting('t.diag')::uuid) = 'publicado', 'aprobado se publica');
select pg_temp.check((select status from public.cases where id = current_setting('t.caso')::uuid) = 'esperando_cliente', 'el caso espera la respuesta del cliente');

-- 6) El cliente ve el informe publicado y pide cotizar
select pg_temp.as_user('00000000-0000-4000-8000-0000000010a1');
select pg_temp.check((select count(*) from public.diagnoses where status = 'publicado') = 1, 'el cliente ve el informe publicado');
select pg_temp.check((select count(*) from public.diagnosis_findings) = 1, 'el cliente ve sus situaciones');
select pg_temp.check((select published_by from public.diagnoses) = '00000000-0000-4000-8000-0000000010f2', 'queda quién lo aprobó');
select public.request_finding_quote(current_setting('t.f1')::uuid);
select pg_temp.check(pg_temp.fails(format($$select public.request_finding_quote(%L)$$, current_setting('t.f1')), 'ENQ_YA_SOLICITADA'),
  'la cotización de una situación se pide una vez');
select pg_temp.as_user('00000000-0000-4000-8000-0000000010c1');
select pg_temp.check(pg_temp.fails(format($$select public.request_finding_quote(%L)$$, current_setting('t.f1')), 'ENQ_SIN_PERMISO'),
  'solo lectura NO pide cotizaciones');
select pg_temp.as_user('00000000-0000-4000-8000-0000000010b1');
select pg_temp.check((select count(*) from public.diagnoses) = 0, 'otra empresa NO ve el informe');

-- 7) Nueva versión: copia las situaciones y reemplaza a la anterior al aprobarse
select pg_temp.as_user('00000000-0000-4000-8000-0000000010f2');
select pg_temp.check((select count(*) from public.case_tasks where case_id = current_setting('t.caso')::uuid and title like 'Cotizar:%') = 1,
  'la solicitud de cotización crea una tarea para el equipo');
select set_config('t.diag2', public.draft_diagnosis(current_setting('t.caso')::uuid)::text, true);
select pg_temp.check((select version from public.diagnoses where id = current_setting('t.diag2')::uuid) = 2, 'la nueva versión es la 2');
select pg_temp.check((select count(*) from public.diagnosis_findings where diagnosis_id = current_setting('t.diag2')::uuid) = 1, 'la nueva versión copia las situaciones');
select set_config('t.apr3', public.submit_diagnosis(current_setting('t.diag2')::uuid)::text, true);
select pg_temp.as_user('00000000-0000-4000-8000-0000000010f1');
select public.decide_approval(current_setting('t.apr3')::uuid, 'aprobar');
select pg_temp.check((select status from public.diagnoses where id = current_setting('t.diag')::uuid) = 'reemplazado', 'la versión anterior queda reemplazada');
select pg_temp.as_user('00000000-0000-4000-8000-0000000010a1');
select pg_temp.check((select version from public.diagnoses) = 2, 'el cliente ve solo la versión vigente');

select 'TODAS LAS PRUEBAS OK' as resultado;
rollback;
