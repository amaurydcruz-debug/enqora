-- =====================================================================
-- ENQORA · Prueba de aprobaciones y autorizaciones (Etapa 5)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0006_aprobaciones.sql.
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

-- Personas ficticias
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000005a1', 'ana5@prueba-enqora.cl',  'authenticated', 'authenticated'),  -- dueña empresa
  ('00000000-0000-4000-8000-0000000005c1', 'lola5@prueba-enqora.cl', 'authenticated', 'authenticated'),  -- solo lectura
  ('00000000-0000-4000-8000-0000000005b1', 'beto5@prueba-enqora.cl', 'authenticated', 'authenticated'),  -- otra empresa
  ('00000000-0000-4000-8000-0000000005f1', 'dir5@prueba-enqora.cl',  'authenticated', 'authenticated'),  -- supervisión
  ('00000000-0000-4000-8000-0000000005f2', 'cami5@prueba-enqora.cl', 'authenticated', 'authenticated'),  -- contadora responsable
  ('00000000-0000-4000-8000-0000000005f3', 'pepe5@prueba-enqora.cl', 'authenticated', 'authenticated'),  -- abogado
  ('00000000-0000-4000-8000-0000000005f4', 'ia5@prueba-enqora.cl',   'authenticated', 'authenticated');  -- agente IA

-- Equipo ENQORA (directo, como lo haría el administrador)
insert into public.staff_members (user_id, role) values
  ('00000000-0000-4000-8000-0000000005f1', 'ops_director'),
  ('00000000-0000-4000-8000-0000000005f2', 'accountant_pro'),
  ('00000000-0000-4000-8000-0000000005f3', 'lawyer_pro'),
  ('00000000-0000-4000-8000-0000000005f4', 'ai_agent')
on conflict (user_id) do update set role = excluded.role, active = true;

set local role authenticated;

-- Empresa, miembro solo lectura y caso
select pg_temp.as_user('00000000-0000-4000-8000-0000000005a1');
select set_config('t.emp', public.create_company('76.086.428-5', 'Empresa Cinco SpA')::text, true);
select set_config('t.tok', public.create_invitation(current_setting('t.emp')::uuid, 'lola5@prueba-enqora.cl', 'viewer'), true);
select set_config('t.caso', public.create_case(current_setting('t.emp')::uuid, 'contabilidad', 'Regularizar IVA atrasado')::text, true);
select pg_temp.as_user('00000000-0000-4000-8000-0000000005c1');
select set_config('request.jwt.claims', (current_setting('request.jwt.claims')::jsonb || '{"email":"lola5@prueba-enqora.cl"}')::text, true);
select public.accept_invitation(current_setting('t.tok'));
select pg_temp.as_user('00000000-0000-4000-8000-0000000005b1');
select set_config('t.emp_b', public.create_company('11.111.111-1', 'Otra Ltda')::text, true);

-- Supervisión asigna: Cami responsable, Pepe apoyo, agente IA
select pg_temp.as_user('00000000-0000-4000-8000-0000000005f1');
select public.assign_case(current_setting('t.caso')::uuid, '00000000-0000-4000-8000-0000000005f2', 'responsable');
select public.assign_case(current_setting('t.caso')::uuid, '00000000-0000-4000-8000-0000000005f3', 'apoyo');
select public.assign_case(current_setting('t.caso')::uuid, '00000000-0000-4000-8000-0000000005f4', 'agente_ia');

-- 1) El agente IA propone un diagnóstico para revisión (puede solicitar)
select pg_temp.as_user('00000000-0000-4000-8000-0000000005f4');
select set_config('t.ap1', public.request_approval(current_setting('t.caso')::uuid, 'diagnostico',
  'Diagnóstico: 3 períodos de IVA sin declarar', 'Fundamento: RCV vs F29', 'responsable', 'autorizacion_cliente')::text, true);
select pg_temp.check((select status from public.cases where id = current_setting('t.caso')::uuid) = 'revision_profesional',
  'enviar un diagnóstico debe dejar el caso en revisión profesional');
select pg_temp.check(pg_temp.fails(format($$select public.decide_approval(%L, 'aprobar')$$, current_setting('t.ap1')), 'ENQ_SIN_PERMISO'),
  'el agente IA NO debe poder aprobar');
select pg_temp.check((select count(*) from public.approval_inbox()) = 0, 'el agente IA no tiene bandeja de aprobaciones');

-- 2) El cliente NO ve aprobaciones internas
select pg_temp.as_user('00000000-0000-4000-8000-0000000005a1');
select pg_temp.check((select count(*) from public.approvals) = 0, 'el cliente NO debe ver aprobaciones internas');
select pg_temp.check((select count(*) from public.case_events where kind = 'aprobacion') = 0, 'el cliente NO debe ver eventos de aprobación');
select pg_temp.check(pg_temp.fails(format($$select public.decide_approval(%L, 'aprobar')$$, current_setting('t.ap1')), 'ENQ_SIN_PERMISO'),
  'el cliente NO debe poder aprobar');

-- 3) El abogado de apoyo no decide lo que le corresponde a la responsable
select pg_temp.as_user('00000000-0000-4000-8000-0000000005f3');
select pg_temp.check((select count(*) from public.approvals) = 1, 'el equipo asignado ve la aprobación');
select pg_temp.check(pg_temp.fails(format($$select public.decide_approval(%L, 'aprobar')$$, current_setting('t.ap1')), 'ENQ_SIN_PERMISO'),
  'el apoyo NO debe aprobar lo que corresponde al responsable');

-- 4) La responsable: sin reautenticación no decide; devolver exige observación; aprueba
select pg_temp.as_user('00000000-0000-4000-8000-0000000005f2', 30);
select pg_temp.check(pg_temp.fails(format($$select public.decide_approval(%L, 'aprobar')$$, current_setting('t.ap1')), 'ENQ_REAUTH'),
  'decidir debe exigir reautenticación');
select pg_temp.as_user('00000000-0000-4000-8000-0000000005f2');
select pg_temp.check((select count(*) from public.approval_inbox()) = 1, 'la responsable debe tener la aprobación en su bandeja');
select pg_temp.check(pg_temp.fails(format($$select public.decide_approval(%L, 'devolver', 'corto')$$, current_setting('t.ap1')), 'ENQ_FALTA_OBSERVACION'),
  'devolver sin observaciones debe fallar');
select public.decide_approval(current_setting('t.ap1')::uuid, 'aprobar', 'Revisado contra RCV');
select pg_temp.check((select status from public.approvals where id = current_setting('t.ap1')::uuid) = 'aprobada', 'debe quedar aprobada');
select pg_temp.check((select status from public.cases where id = current_setting('t.caso')::uuid) = 'autorizacion_cliente',
  'aprobar debe aplicar el estado indicado al caso');
select pg_temp.check(pg_temp.fails(format($$select public.decide_approval(%L, 'rechazar', 'no corresponde ahora')$$, current_setting('t.ap1')), 'ENQ_YA_DECIDIDA'),
  'una aprobación decidida no se vuelve a decidir');

-- 5) Cuatro ojos: la responsable no decide su propia solicitud
select set_config('t.ap2', public.request_approval(current_setting('t.caso')::uuid, 'precio',
  'Descuento del 20% por volumen', null, 'responsable', null, '{"monto": 120000}')::text, true);
select pg_temp.check(pg_temp.fails(format($$select public.decide_approval(%L, 'aprobar')$$, current_setting('t.ap2')), 'ENQ_CUATRO_OJOS'),
  'quien solicita NO debe aprobar su propia solicitud');
select pg_temp.check((select count(*) from public.approval_inbox()) = 0, 'la propia solicitud no aparece en la bandeja');
-- La supervisión la rechaza con observación
select pg_temp.as_user('00000000-0000-4000-8000-0000000005f1');
select public.decide_approval(current_setting('t.ap2')::uuid, 'rechazar', 'Sin respaldo de volumen comprometido');
select pg_temp.check((select status from public.approvals where id = current_setting('t.ap2')::uuid) = 'rechazada', 'debe quedar rechazada');

-- 6) Autorización del cliente: el agente IA no puede solicitarla; la responsable sí
select pg_temp.as_user('00000000-0000-4000-8000-0000000005f4');
select pg_temp.check(pg_temp.fails(format($$select public.request_client_authorization(%L, 'Presentar F29', 'Presentar F29 rectificatorios')$$, current_setting('t.caso')), 'ENQ_SIN_PERMISO'),
  'el agente IA NO debe solicitar autorizaciones al cliente');
select pg_temp.as_user('00000000-0000-4000-8000-0000000005f2');
select set_config('t.au1', public.request_client_authorization(current_setting('t.caso')::uuid,
  'Presentar F29 rectificatorios', 'Presentar los F29 rectificatorios de julio, agosto y septiembre 2026 ante el SII.',
  'Servicio de Impuestos Internos', ((now() at time zone 'America/Santiago')::date + 30))::text, true);
select pg_temp.check(pg_temp.fails(format($$select public.request_client_authorization(%L, 'Algo', 'Alcance suficiente', null, '2000-01-01')$$, current_setting('t.caso')), 'ENQ_DATOS_INVALIDOS'),
  'una autorización no puede nacer vencida');

-- 7) Solo lectura y otras empresas no deciden; el equipo tampoco decide por el cliente
select pg_temp.check(pg_temp.fails(format($$select public.decide_client_authorization(%L, 'autorizar')$$, current_setting('t.au1')), 'ENQ_SIN_PERMISO'),
  'el equipo ENQORA NO debe autorizar en nombre del cliente');
select pg_temp.as_user('00000000-0000-4000-8000-0000000005c1');
select pg_temp.check((select count(*) from public.client_authorizations) = 1, 'solo lectura ve la autorización');
select pg_temp.check(pg_temp.fails(format($$select public.decide_client_authorization(%L, 'autorizar')$$, current_setting('t.au1')), 'ENQ_SIN_PERMISO'),
  'solo lectura NO debe autorizar');
select pg_temp.as_user('00000000-0000-4000-8000-0000000005b1');
select pg_temp.check((select count(*) from public.client_authorizations) = 0, 'otra empresa NO ve la autorización');

-- 8) La dueña autoriza: exige reautenticación, deja evidencia y pasa el caso a ejecución
select pg_temp.as_user('00000000-0000-4000-8000-0000000005a1', 30);
select pg_temp.check(pg_temp.fails(format($$select public.decide_client_authorization(%L, 'autorizar')$$, current_setting('t.au1')), 'ENQ_REAUTH'),
  'autorizar debe exigir reautenticación');
select pg_temp.as_user('00000000-0000-4000-8000-0000000005a1');
select public.decide_client_authorization(current_setting('t.au1')::uuid, 'autorizar');
select pg_temp.check((select status from public.client_authorizations where id = current_setting('t.au1')::uuid) = 'autorizada', 'debe quedar autorizada');
select pg_temp.check((select evidence ->> 'rol_en_empresa' from public.client_authorizations where id = current_setting('t.au1')::uuid) = 'owner',
  'la evidencia debe registrar el rol de quien autoriza');
select pg_temp.check((select status from public.cases where id = current_setting('t.caso')::uuid) = 'en_ejecucion',
  'con todas las autorizaciones otorgadas el caso pasa a ejecución');
select pg_temp.check((select count(*) from public.audit_events where action = 'autorizacion.autorizada') = 1,
  'la autorización queda en la auditoría de la empresa');

-- 9) Revocar detiene la ejecución
select public.revoke_client_authorization(current_setting('t.au1')::uuid, 'Prefiero revisarlo con mi contador');
select pg_temp.check((select status from public.client_authorizations where id = current_setting('t.au1')::uuid) = 'revocada', 'debe quedar revocada');
select pg_temp.check((select status from public.cases where id = current_setting('t.caso')::uuid) = 'devuelto',
  'revocar debe detener la ejecución del caso');

-- 10) Rechazo de una nueva solicitud y anulación por el equipo
select pg_temp.as_user('00000000-0000-4000-8000-0000000005f2');
select set_config('t.au2', public.request_client_authorization(current_setting('t.caso')::uuid,
  'Solicitar certificado', 'Solicitar certificado de deuda fiscal ante la TGR.')::text, true);
select set_config('t.au3', public.request_client_authorization(current_setting('t.caso')::uuid,
  'Solicitar giro', 'Solicitar giro de impuestos atrasados ante la TGR.')::text, true);
select public.cancel_client_authorization(current_setting('t.au3')::uuid);
select pg_temp.as_user('00000000-0000-4000-8000-0000000005a1');
select public.decide_client_authorization(current_setting('t.au2')::uuid, 'rechazar', 'Lo gestiono yo');
select pg_temp.check((select status from public.client_authorizations where id = current_setting('t.au2')::uuid) = 'rechazada', 'debe quedar rechazada');
select pg_temp.check((select status from public.client_authorizations where id = current_setting('t.au3')::uuid) = 'anulada', 'debe quedar anulada');

-- 11) Escritura directa prohibida (solo por funciones)
select pg_temp.check(pg_temp.fails(format($$update public.client_authorizations set status = 'autorizada' where id = %L$$, current_setting('t.au2')), 'permission denied'),
  'NO se debe poder modificar una autorización directamente');

-- 12) Anónimo no ve nada
reset role;
set local role anon;
select pg_temp.check(pg_temp.fails('select count(*) from public.approvals', 'permission denied'), 'anónimo NO debe leer aprobaciones');
select pg_temp.check(pg_temp.fails('select count(*) from public.client_authorizations', 'permission denied'), 'anónimo NO debe leer autorizaciones');

reset role;
select 'TODAS LAS PRUEBAS OK' as resultado;

rollback;
