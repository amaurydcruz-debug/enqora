-- =====================================================================
-- ENQORA · Prueba de mandatos, actuaciones y notificaciones (0012)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0012_mandatos_notificaciones.sql.
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
  ('00000000-0000-4000-8000-0000000012a1', 'ana12@prueba-enqora.cl',  'authenticated', 'authenticated'),  -- dueña
  ('00000000-0000-4000-8000-0000000012c1', 'lola12@prueba-enqora.cl', 'authenticated', 'authenticated'),  -- solo lectura
  ('00000000-0000-4000-8000-0000000012b1', 'otro12@prueba-enqora.cl', 'authenticated', 'authenticated'),  -- otra empresa
  ('00000000-0000-4000-8000-0000000012f0', 'adm12@prueba-enqora.cl',  'authenticated', 'authenticated'),  -- administrador ENQORA
  ('00000000-0000-4000-8000-0000000012f1', 'dir12@prueba-enqora.cl',  'authenticated', 'authenticated'),  -- director de operaciones
  ('00000000-0000-4000-8000-0000000012f2', 'cami12@prueba-enqora.cl', 'authenticated', 'authenticated'),  -- contadora responsable
  ('00000000-0000-4000-8000-0000000012f3', 'abo12@prueba-enqora.cl',  'authenticated', 'authenticated'),  -- abogado
  ('00000000-0000-4000-8000-0000000012f4', 'ia12@prueba-enqora.cl',   'authenticated', 'authenticated');  -- agente IA

insert into public.staff_members (user_id, role) values
  ('00000000-0000-4000-8000-0000000012f0', 'enqora_admin'),
  ('00000000-0000-4000-8000-0000000012f1', 'ops_director'),
  ('00000000-0000-4000-8000-0000000012f2', 'accountant_pro'),
  ('00000000-0000-4000-8000-0000000012f3', 'lawyer_pro'),
  ('00000000-0000-4000-8000-0000000012f4', 'ai_agent')
on conflict (user_id) do update set role = excluded.role, active = true;

set local role authenticated;

select pg_temp.as_user('00000000-0000-4000-8000-0000000012a1');
select set_config('t.emp', public.create_company('76.086.428-5', 'Empresa Doce SpA')::text, true);
select set_config('t.tok', public.create_invitation(current_setting('t.emp')::uuid, 'lola12@prueba-enqora.cl', 'viewer'), true);
select pg_temp.as_user('00000000-0000-4000-8000-0000000012c1');
select set_config('request.jwt.claims', (current_setting('request.jwt.claims')::jsonb || '{"email":"lola12@prueba-enqora.cl"}')::text, true);
select public.accept_invitation(current_setting('t.tok'));

-- 1) Notificaciones: una solicitud nueva avisa a la supervisión, no a quien la creó
select pg_temp.as_user('00000000-0000-4000-8000-0000000012a1');
select set_config('t.caso', public.create_case(current_setting('t.emp')::uuid, 'contabilidad', 'F29 rectificatorio', null)::text, true);
select pg_temp.check((select count(*) from public.notifications) = 0, 'quien crea la solicitud no se notifica a sí mismo');
select pg_temp.as_user('00000000-0000-4000-8000-0000000012f1');
select pg_temp.check((select count(*) from public.notifications where title like 'Nueva solicitud%') = 1, 'la dirección recibe la nueva solicitud');
select public.assign_case(current_setting('t.caso')::uuid, '00000000-0000-4000-8000-0000000012f2', 'responsable');
select public.assign_case(current_setting('t.caso')::uuid, '00000000-0000-4000-8000-0000000012f4', 'agente_ia');

-- 2) Comentario del equipo → la empresa; preferencias de correo
select pg_temp.as_user('00000000-0000-4000-8000-0000000012f2');
select public.add_case_comment(current_setting('t.caso')::uuid, 'Necesitamos la carpeta tributaria.', false);
select pg_temp.as_user('00000000-0000-4000-8000-0000000012a1');
select pg_temp.check((select count(*) from public.notifications where title like 'Nuevo mensaje del equipo%') = 1, 'la dueña recibe el mensaje del equipo');
select pg_temp.check(pg_temp.fails('select count(*) from public.notification_deliveries', 'permission denied'), 'los envíos no son visibles para el usuario');
select pg_temp.check(public.mark_notifications_read() >= 1, 'marcar como leídas');
select pg_temp.check((select count(*) from public.notifications where read_at is null) = 0, 'quedan leídas');
select pg_temp.check(pg_temp.fails($$select public.save_notification_preferences(true, true, '{}')$$, 'ENQ_TELEFONO_NO_VERIFICADO'),
  'WhatsApp exige un teléfono verificado');
select public.save_notification_preferences(false, false, array['casos']);
select pg_temp.as_user('00000000-0000-4000-8000-0000000012c1');
select pg_temp.check((select count(*) from public.notifications) = 0, 'solo lectura no recibe avisos de propietario');
select pg_temp.as_user('00000000-0000-4000-8000-0000000012b1');
select pg_temp.check((select count(*) from public.notifications) = 0, 'otra empresa NO ve notificaciones ajenas');

-- 3) Verificación del teléfono (el código se guarda solo como hash)
select pg_temp.as_user('00000000-0000-4000-8000-0000000012a1');
select pg_temp.check(pg_temp.fails($$select public.start_phone_verification('+56 9 1234', repeat('a', 64))$$, 'ENQ_DATOS_INVALIDOS'),
  'el teléfono debe ser un celular chileno +569XXXXXXXX');
select public.start_phone_verification('+56912345678', encode(sha256(convert_to('482913', 'UTF8')), 'hex'));
select pg_temp.check(pg_temp.fails($$select public.confirm_phone_verification('000000')$$, 'ENQ_CODIGO_INCORRECTO'), 'un código incorrecto se rechaza');
select public.confirm_phone_verification('482913');
select pg_temp.check((select phone_verified_at is not null from public.notification_preferences), 'el teléfono queda verificado');
select public.save_notification_preferences(true, true, '{}');

-- 4) Mandato: el agente prepara pero no envía; la dueña acepta y sube; cuatro ojos al verificar
select pg_temp.as_user('00000000-0000-4000-8000-0000000012f4');
select pg_temp.check(pg_temp.fails(format($$select public.save_mandate(null, %L, '{"kind":"simple"}')$$, current_setting('t.emp')), 'ENQ_DATOS_INVALIDOS'),
  'un mandato sin instituciones se rechaza');
select set_config('t.man', public.save_mandate(null, current_setting('t.emp')::uuid, jsonb_build_object(
  'kind', 'simple', 'representative_name', 'Camila Fuentes, contadora ENQORA', 'representative_rut', '11.111.111-1',
  'institutions', jsonb_build_array('sii'), 'procedures', 'Presentar declaraciones F29 rectificatorias y consultar su estado.',
  'scope', 'Por el presente instrumento, la empresa confiere mandato a la representante para actuar ante el SII en los trámites indicados.',
  'valid_from', (now() at time zone 'America/Santiago')::date, 'valid_until', (now() at time zone 'America/Santiago')::date + 180,
  'case_id', current_setting('t.caso')))::text, true);
select pg_temp.check(pg_temp.fails(format($$select public.send_mandate(%L)$$, current_setting('t.man')), 'ENQ_SIN_PERMISO'),
  'un agente IA NO envía mandatos');
select pg_temp.as_user('00000000-0000-4000-8000-0000000012a1');
select pg_temp.check((select count(*) from public.mandates) = 0, 'el cliente no ve el borrador');
select pg_temp.as_user('00000000-0000-4000-8000-0000000012f3');
select public.send_mandate(current_setting('t.man')::uuid);
select pg_temp.as_user('00000000-0000-4000-8000-0000000012a1');
select pg_temp.check((select count(*) from public.notifications where category = 'mandatos') = 1, 'la dueña recibe el mandato');
select pg_temp.check(pg_temp.fails('select count(*) from public.notification_deliveries', 'permission denied'), 'sigue sin ver los envíos');
select pg_temp.check(pg_temp.fails(format($$select public.attach_mandate_document(%L, 'x', 'x.pdf')$$, current_setting('t.man')), 'ENQ_MANDATO_SIN_ACEPTAR'),
  'no se sube el documento sin aceptar antes');
select pg_temp.check(pg_temp.fails(format($$select public.accept_mandate(%L, 'Ana Rojas', '12.345.678-0', 'Representante legal')$$, current_setting('t.man')),
  'ENQ_RUT_INVALIDO'), 'el RUT de quien firma debe ser válido');
select public.accept_mandate(current_setting('t.man')::uuid, 'Ana Rojas', '12.345.678-5', 'Representante legal');
select pg_temp.as_user('00000000-0000-4000-8000-0000000012c1');
select pg_temp.check((select count(*) from public.mandates) = 0, 'solo lectura no ve los mandatos');
select pg_temp.check(pg_temp.fails(format($$select public.accept_mandate(%L, 'Lola', '12.345.678-5', 'Otra')$$, current_setting('t.man')), 'ENQ_SIN_PERMISO'),
  'solo lectura no acepta mandatos');

reset role;
select set_config('t.path', current_setting('t.emp') || '/' || current_setting('t.man') || '/mandato-firmado.pdf', true);
insert into storage.objects (bucket_id, name) values ('mandatos', current_setting('t.path'));
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000012a1');
select public.attach_mandate_document(current_setting('t.man')::uuid, current_setting('t.path'), 'mandato-firmado.pdf');
select pg_temp.check((select status from public.mandates where id = current_setting('t.man')::uuid) = 'en_verificacion', 'queda en verificación');

select pg_temp.as_user('00000000-0000-4000-8000-0000000012f2');
select pg_temp.check(pg_temp.fails(format($$select public.verify_mandate(%L, 'aprobar', '{}')$$, current_setting('t.man')), 'ENQ_SIN_PERMISO'),
  'la contadora NO verifica mandatos');
select pg_temp.as_user('00000000-0000-4000-8000-0000000012f3');
select pg_temp.check((select count(*) from public.notifications where title like 'Mandato firmado%') = 1, 'el abogado recibe el mandato para verificar');
select pg_temp.check(pg_temp.fails(format($$select public.verify_mandate(%L, 'aprobar', '{"identidad_firmante":true}')$$, current_setting('t.man')),
  'ENQ_VERIFICACION_INCOMPLETA'), 'aprobar exige la lista de chequeo completa');
select pg_temp.check(pg_temp.fails(format($$select public.verify_mandate(%L, 'observar', '{}', 'corto')$$, current_setting('t.man')),
  'ENQ_FALTA_OBSERVACION'), 'observar exige un motivo');
select public.verify_mandate(current_setting('t.man')::uuid, 'aprobar',
  '{"identidad_firmante":true,"representacion_legal":true,"documento_coincide":true,"requisitos_institucion":true}', 'Escritura revisada');
select pg_temp.check((select status from public.mandates where id = current_setting('t.man')::uuid) = 'vigente', 'el mandato queda vigente');

-- 5) Actuación: exige mandato vigente que cubra la institución y autorización vigente del caso
select pg_temp.as_user('00000000-0000-4000-8000-0000000012f4');
select set_config('t.act', public.plan_action(current_setting('t.caso')::uuid, 'sii', 'Presentar F29 rectificatorio de septiembre', null,
  current_setting('t.man')::uuid, null)::text, true);
select pg_temp.check(pg_temp.fails(format($$select public.verify_action(%L)$$, current_setting('t.act')), 'ENQ_SIN_PERMISO'),
  'un agente IA NO verifica actuaciones');
select pg_temp.as_user('00000000-0000-4000-8000-0000000012f2');
select pg_temp.check(pg_temp.fails(format($$select public.verify_action(%L)$$, current_setting('t.act')), 'ENQ_SIN_AUTORIZACION_VIGENTE'),
  'sin autorización del cliente no se habilita');
select set_config('t.aut', public.request_client_authorization(current_setting('t.caso')::uuid, 'Presentar F29 rectificatorio',
  'Presentar ante el SII el F29 rectificatorio de septiembre.', 'Servicio de Impuestos Internos', null)::text, true);
select pg_temp.as_user('00000000-0000-4000-8000-0000000012a1');
select public.decide_client_authorization(current_setting('t.aut')::uuid, 'autorizar');
select pg_temp.as_user('00000000-0000-4000-8000-0000000012f2');
select set_config('t.act2', public.plan_action(current_setting('t.caso')::uuid, 'tgr', 'Pagar giro en Tesorería', null,
  current_setting('t.man')::uuid, current_setting('t.aut')::uuid)::text, true);
select pg_temp.as_user('00000000-0000-4000-8000-0000000012f1');
select pg_temp.check(pg_temp.fails(format($$select public.verify_action(%L)$$, current_setting('t.act2')), 'ENQ_SIN_MANDATO_VIGENTE'),
  'un mandato que no cubre la institución no habilita');
reset role;
update public.case_actions set authorization_id = current_setting('t.aut')::uuid where id = current_setting('t.act')::uuid;
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000012f2');
select pg_temp.check((public.verify_action(current_setting('t.act')::uuid) ->> 'mandato_vigente')::boolean, 'mandato y autorización vigentes habilitan');
select pg_temp.check(pg_temp.fails(format($$select public.execute_action(%L, true, 'corto')$$, current_setting('t.act')), 'ENQ_FALTA_OBSERVACION'),
  'ejecutar exige registrar el resultado');

-- La dueña revoca el mandato antes de ejecutar: ya no se puede ejecutar
select pg_temp.as_user('00000000-0000-4000-8000-0000000012a1', 30);
select pg_temp.check(pg_temp.fails(format($$select public.revoke_mandate(%L, 'Cambio de asesor')$$, current_setting('t.man')), 'ENQ_REAUTH'),
  'revocar exige reautenticación');
select pg_temp.as_user('00000000-0000-4000-8000-0000000012a1');
select public.revoke_mandate(current_setting('t.man')::uuid, 'Cambio de asesor');
select pg_temp.as_user('00000000-0000-4000-8000-0000000012f2');
select pg_temp.check((select status from public.case_actions where id = current_setting('t.act')::uuid) = 'planificada',
  'la actuación verificada vuelve a planificada al revocarse el mandato');
select pg_temp.check(pg_temp.fails(format($$select public.execute_action(%L, true, 'Presentado con folio 123456')$$, current_setting('t.act')),
  'ENQ_ACTUACION_NO_VERIFICADA'), 'sin verificación vigente no se ejecuta');
select pg_temp.as_user('00000000-0000-4000-8000-0000000012a1');
select pg_temp.check((select count(*) from public.case_actions) = 2, 'el cliente ve las actuaciones de su caso');

-- 6) Envío: solo con la clave de servicio; el destinatario y el canal salen de la base
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.check(pg_temp.fails($$select * from public.claim_deliveries('clave-falsa-clave-falsa-clave-falsa', 10)$$, 'ENQ_CLAVE_SERVICIO'),
  'sin clave de servicio no se leen los envíos');
reset role;
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000012f0');
select set_config('t.key', public.rotate_service_token(), true);
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
create temp table envios on commit drop as select * from public.claim_deliveries(current_setting('t.key'), 50);
select pg_temp.check((select count(*) from envios where channel = 'whatsapp' and recipient = '+56912345678') >= 1, 'WhatsApp va al teléfono verificado');
select pg_temp.check((select count(*) from envios where channel = 'email' and recipient = 'ana12@prueba-enqora.cl' and title like 'Nuevo mensaje%') = 1,
  'el aviso creado antes de cambiar las preferencias conserva su envío por correo');
select pg_temp.check((select count(*) from public.claim_deliveries(current_setting('t.key'), 50)) = 0, 'un envío tomado no se toma dos veces');
select public.finish_delivery(current_setting('t.key'), (select id from envios limit 1), true);
reset role;
select pg_temp.check((select status from public.notification_deliveries where id = (select id from envios limit 1)) = 'enviado', 'queda enviado');

-- 7) Tarea diaria: mandatos vencidos
update public.mandates set status = 'vigente', valid_until = (now() at time zone 'America/Santiago')::date - 1,
  valid_from = (now() at time zone 'America/Santiago')::date - 10
where id = current_setting('t.man')::uuid;
select pg_temp.check((public.daily_run(current_setting('t.key')) ->> 'mandatos_vencidos')::int = 1, 'la tarea diaria vence los mandatos');

select 'TODAS LAS PRUEBAS OK' as resultado;
rollback;
