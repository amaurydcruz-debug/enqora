-- =====================================================================
-- ENQORA · Prueba de planes, suscripciones, cobros y pagos (0011)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0011_planes_pagos.sql.
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

grant execute on all functions in schema pg_temp to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000011a1', 'ana11@prueba-enqora.cl',  'authenticated', 'authenticated'),  -- dueña
  ('00000000-0000-4000-8000-0000000011c1', 'lola11@prueba-enqora.cl', 'authenticated', 'authenticated'),  -- solo lectura
  ('00000000-0000-4000-8000-0000000011b1', 'otro11@prueba-enqora.cl', 'authenticated', 'authenticated'),  -- otra empresa
  ('00000000-0000-4000-8000-0000000011f0', 'adm11@prueba-enqora.cl',  'authenticated', 'authenticated'),  -- administrador ENQORA
  ('00000000-0000-4000-8000-0000000011f1', 'dir11@prueba-enqora.cl',  'authenticated', 'authenticated'),  -- director de operaciones
  ('00000000-0000-4000-8000-0000000011f2', 'cami11@prueba-enqora.cl', 'authenticated', 'authenticated'),  -- contadora responsable
  ('00000000-0000-4000-8000-0000000011f4', 'ia11@prueba-enqora.cl',   'authenticated', 'authenticated');  -- agente IA

insert into public.staff_members (user_id, role) values
  ('00000000-0000-4000-8000-0000000011f0', 'enqora_admin'),
  ('00000000-0000-4000-8000-0000000011f1', 'ops_director'),
  ('00000000-0000-4000-8000-0000000011f2', 'accountant_pro'),
  ('00000000-0000-4000-8000-0000000011f4', 'ai_agent')
on conflict (user_id) do update set role = excluded.role, active = true;

set local role authenticated;

select pg_temp.as_user('00000000-0000-4000-8000-0000000011a1');
select set_config('t.emp', public.create_company('76.086.428-5', 'Empresa Once SpA')::text, true);
select set_config('t.tok', public.create_invitation(current_setting('t.emp')::uuid, 'lola11@prueba-enqora.cl', 'viewer'), true);
select pg_temp.as_user('00000000-0000-4000-8000-0000000011c1');
select set_config('request.jwt.claims', (current_setting('request.jwt.claims')::jsonb || '{"email":"lola11@prueba-enqora.cl"}')::text, true);
select public.accept_invitation(current_setting('t.tok'));
select pg_temp.as_user('00000000-0000-4000-8000-0000000011a1');
select set_config('t.caso', public.create_case(current_setting('t.emp')::uuid, 'contabilidad', 'Regularizar IVA', null)::text, true);
select pg_temp.as_user('00000000-0000-4000-8000-0000000011f1');
select public.assign_case(current_setting('t.caso')::uuid, '00000000-0000-4000-8000-0000000011f2', 'responsable');
select public.assign_case(current_setting('t.caso')::uuid, '00000000-0000-4000-8000-0000000011f4', 'agente_ia');

-- 1) Planes iniciales: existen, sin precio, inactivos y ocultos al cliente
select pg_temp.as_user('00000000-0000-4000-8000-0000000011a1');
select pg_temp.check((select count(*) from public.plans) = 0, 'el cliente NO ve planes inactivos');
select pg_temp.as_user('00000000-0000-4000-8000-0000000011f0');
select pg_temp.check((select count(*) from public.plans) >= 4, 'los planes iniciales existen');
select pg_temp.check((select count(*) from public.plan_prices) = 0, 'no hay precios precargados');
select set_config('t.plan', (select id from public.plans where code = 'CPR-01')::text, true);
select pg_temp.check(pg_temp.fails(format($$select public.set_plan_active(%L, true)$$, current_setting('t.plan')), 'ENQ_SIN_TARIFA'),
  'un plan sin precio vigente no se activa');

-- 2) Precios versionados: solo el Administrador, publicar con reautenticación
select pg_temp.as_user('00000000-0000-4000-8000-0000000011f2');
select pg_temp.check(pg_temp.fails(format($$select public.draft_plan_price(%L, 99000)$$, current_setting('t.plan')), 'ENQ_SIN_PERMISO'),
  'la contadora NO fija precios de planes');
select pg_temp.as_user('00000000-0000-4000-8000-0000000011f4');
select pg_temp.check(pg_temp.fails(format($$select public.draft_plan_price(%L, 99000)$$, current_setting('t.plan')), 'ENQ_SIN_PERMISO'),
  'el agente IA NO fija precios de planes');
select pg_temp.as_user('00000000-0000-4000-8000-0000000011f0');
select pg_temp.check(pg_temp.fails(format($$select public.draft_plan_price(%L, 0)$$, current_setting('t.plan')), 'ENQ_DATOS_INVALIDOS'),
  'el precio debe ser mayor que cero');
select set_config('t.pp1', public.draft_plan_price(current_setting('t.plan')::uuid, 99000, 'Primera versión')::text, true);
select pg_temp.as_user('00000000-0000-4000-8000-0000000011f0', 30);
select pg_temp.check(pg_temp.fails(format($$select public.publish_plan_price(%L)$$, current_setting('t.pp1')), 'ENQ_REAUTH'),
  'publicar un precio exige reautenticación');
select pg_temp.as_user('00000000-0000-4000-8000-0000000011f0');
select public.publish_plan_price(current_setting('t.pp1')::uuid);
select public.set_plan_active(current_setting('t.plan')::uuid, true);
select pg_temp.check(pg_temp.fails($$select public.save_plan(null, '{"code":"CPR-01","line":"plataforma","name":"Dup","scope":"Alcance suficiente"}')$$,
  'ENQ_CODIGO_DUPLICADO'), 'el código de plan es único');
select pg_temp.check(pg_temp.fails($$select public.save_plan(null, '{"code":"PLA-09","line":"plataforma","name":"Raro","scope":"Alcance suficiente","included_services":["NO-EXISTE"]}')$$,
  'ENQ_DATOS_INVALIDOS'), 'los servicios incluidos deben existir en el catálogo');

-- 3) El cliente ve el plan activo y solo su precio vigente
select set_config('t.pp2', public.draft_plan_price(current_setting('t.plan')::uuid, 120000, 'Borrador')::text, true);
select pg_temp.as_user('00000000-0000-4000-8000-0000000011a1');
select pg_temp.check((select count(*) from public.plans) = 1, 'el cliente ve el plan activo');
select pg_temp.check((select count(*) from public.plan_prices) = 1 and (select monthly_price from public.plan_prices) = 99000,
  'el cliente ve solo el precio vigente');

-- 4) Propuesta mensual: solo con el caso en verificación o cerrado; agente IA → aprobación
select pg_temp.as_user('00000000-0000-4000-8000-0000000011f2');
select pg_temp.check(pg_temp.fails(format($$select public.create_plan_proposal(%L, %L, '{"resolved":"Se declararon tres períodos","ongoing":"IVA mensual y renta anual"}')$$,
  current_setting('t.caso'), current_setting('t.plan')), 'ENQ_CASO_NO_CERRADO'), 'la propuesta mensual se hace al cerrar el caso');
reset role;
update public.cases set status = 'verificacion' where id = current_setting('t.caso')::uuid;
set local role authenticated;

select pg_temp.as_user('00000000-0000-4000-8000-0000000011f4');
select set_config('t.prop1', public.create_plan_proposal(current_setting('t.caso')::uuid, current_setting('t.plan')::uuid,
  '{"resolved":"Se declararon tres períodos de IVA pendientes","ongoing":"IVA mensual y renta anual"}')::text, true);
select pg_temp.check((select status from public.plan_proposals where id = current_setting('t.prop1')::uuid) = 'pendiente_aprobacion',
  'la propuesta de un agente IA pasa por aprobación');
select pg_temp.as_user('00000000-0000-4000-8000-0000000011a1');
select pg_temp.check((select count(*) from public.plan_proposals) = 0, 'el cliente NO ve propuestas sin aprobar');
select pg_temp.as_user('00000000-0000-4000-8000-0000000011f2');
select public.decide_approval((select approval_id from public.plan_proposals where id = current_setting('t.prop1')::uuid), 'aprobar');
select pg_temp.check((select status from public.plan_proposals where id = current_setting('t.prop1')::uuid) = 'enviada',
  'aprobada, la propuesta se envía al cliente');
select pg_temp.check(pg_temp.fails(format($$select public.create_plan_proposal(%L, %L, '{"resolved":"Otra propuesta larga","ongoing":"Obligaciones mensuales"}')$$,
  current_setting('t.caso'), current_setting('t.plan')), 'ENQ_PROPUESTA_ABIERTA'), 'una propuesta abierta por caso');

-- 5) El cliente acepta: suscripción pendiente de pago y primer cobro
select pg_temp.as_user('00000000-0000-4000-8000-0000000011c1');
select pg_temp.check((select count(*) from public.plan_proposals) = 1, 'la lectora ve la propuesta');
select pg_temp.check(pg_temp.fails(format($$select public.decide_plan_proposal(%L, 'aceptar')$$, current_setting('t.prop1')), 'ENQ_SIN_PERMISO'),
  'solo lectura NO acepta propuestas');
select pg_temp.check((select count(*) from public.charges) = 0, 'solo lectura NO ve los cobros');
select pg_temp.as_user('00000000-0000-4000-8000-0000000011a1', 30);
select pg_temp.check(pg_temp.fails(format($$select public.decide_plan_proposal(%L, 'aceptar')$$, current_setting('t.prop1')), 'ENQ_REAUTH'),
  'aceptar exige reautenticación');
select pg_temp.as_user('00000000-0000-4000-8000-0000000011a1');
select set_config('t.sub', public.decide_plan_proposal(current_setting('t.prop1')::uuid, 'aceptar')::text, true);
select pg_temp.check((select status = 'pendiente_pago' and monthly_price = 99000 from public.subscriptions
  where id = current_setting('t.sub')::uuid), 'la suscripción queda pendiente de pago con el precio aceptado');
select pg_temp.check((select evidence ->> 'precio_mensual' from public.plan_proposals where id = current_setting('t.prop1')::uuid) = '99000',
  'la aceptación guarda el precio con evidencia');
select set_config('t.cob1', (select id from public.charges where subscription_id = current_setting('t.sub')::uuid)::text, true);
select pg_temp.check((select amount = 99000 and folio like 'COB-%' and status = 'pendiente' from public.charges
  where id = current_setting('t.cob1')::uuid), 'el primer cobro tiene folio, monto y estado');
select pg_temp.check(pg_temp.fails(format($$select public.subscribe_plan(%L, %L)$$, current_setting('t.emp'), current_setting('t.plan')),
  'ENQ_SUSCRIPCION_ACTIVA'), 'una suscripción por línea');

-- 6) Transferencia informada → el Administrador confirma → suscripción activa
select pg_temp.check(pg_temp.fails(format($$select public.report_transfer(%L, 'x', current_date)$$, current_setting('t.cob1')), 'ENQ_DATOS_INVALIDOS'),
  'la transferencia necesita una referencia');
select set_config('t.pag1', public.report_transfer(current_setting('t.cob1')::uuid, 'TRX-778899', (now() at time zone 'America/Santiago')::date)::text, true);
select pg_temp.check((select status from public.charges where id = current_setting('t.cob1')::uuid) = 'en_revision', 'el cobro queda en revisión');
select pg_temp.check(pg_temp.fails(format($$select public.review_payment(%L, 'confirmar')$$, current_setting('t.pag1')), 'ENQ_SIN_PERMISO'),
  'el cliente NO confirma su propio pago');
select pg_temp.as_user('00000000-0000-4000-8000-0000000011f2');
select pg_temp.check(pg_temp.fails(format($$select public.review_payment(%L, 'confirmar')$$, current_setting('t.pag1')), 'ENQ_SIN_PERMISO'),
  'la contadora NO confirma pagos');
select pg_temp.as_user('00000000-0000-4000-8000-0000000011f0');
select pg_temp.check(pg_temp.fails(format($$select public.review_payment(%L, 'rechazar', 'no')$$, current_setting('t.pag1')), 'ENQ_FALTA_OBSERVACION'),
  'rechazar un pago exige una observación');
select public.review_payment(current_setting('t.pag1')::uuid, 'confirmar');
select pg_temp.check((select status from public.charges where id = current_setting('t.cob1')::uuid) = 'pagado', 'el cobro queda pagado');
select pg_temp.check((select status = 'activa' and started_on = (now() at time zone 'America/Santiago')::date
  and paid_until = ((now() at time zone 'America/Santiago')::date + interval '1 month' - interval '1 day')::date
  from public.subscriptions where id = current_setting('t.sub')::uuid), 'la suscripción se activa por un mes desde el pago');

-- 7) Cotización aceptada → cobro automático
reset role;
select set_config('t.srv', (select id from public.services where code = 'CON-02')::text, true);
set local role authenticated;
select public.save_service(current_setting('t.srv')::uuid, 'CON-02', 'contabilidad', 'Declaración mensual de IVA (F29)',
  'Preparación del F29', 'Cuadratura del RCV y preparación del F29.', null, 'mes', false, true);
select public.publish_tariff(public.draft_tariff(current_setting('t.srv')::uuid, 100000, 1, 1, 1, 0, 0, 0, 50000, 200000, null, null, null));
select set_config('t.caso2', (select id from public.cases where id = current_setting('t.caso')::uuid)::text, true);
reset role;
update public.cases set status = 'en_ejecucion' where id = current_setting('t.caso')::uuid;
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000011f2');
select set_config('t.q', public.create_quote(current_setting('t.caso')::uuid, current_setting('t.srv')::uuid, 'simple', 1,
  false, false, 0, null, 0, null, null, 15)::text, true);
select pg_temp.as_user('00000000-0000-4000-8000-0000000011a1');
select public.decide_quote(current_setting('t.q')::uuid, 'aceptar');
select set_config('t.cob2', (select id from public.charges where quote_id = current_setting('t.q')::uuid)::text, true);
select pg_temp.check((select amount = 100000 and kind = 'cotizacion' from public.charges where id = current_setting('t.cob2')::uuid),
  'aceptar una cotización genera su cobro por el precio final');

-- 8) Pasarela: sin clave de servicio no se confirma nada; el monto debe coincidir
select set_config('t.gw', (public.start_gateway_payment(current_setting('t.cob2')::uuid) ->> 'pago'), true);
select public.gateway_attach(current_setting('t.gw')::uuid, 'tok_flow_1234567890', '991122');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.check(pg_temp.fails(format($$select public.gateway_settle('clave-falsa-clave-falsa-clave-falsa', %L, 2, 100000, 'CLP')$$,
  current_setting('t.gw')), 'ENQ_CLAVE_SERVICIO'), 'sin clave de servicio la pasarela no confirma');
select pg_temp.check(pg_temp.fails($$select public.billing_run(null)$$, 'ENQ_AUTH'), 'la facturación sin clave exige sesión');
select pg_temp.check(pg_temp.fails('select count(*) from public.charges', 'permission denied'), 'anon NO lee cobros');
reset role;
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000011f2');
select pg_temp.check(pg_temp.fails($$select public.rotate_service_token()$$, 'ENQ_SIN_PERMISO'), 'solo el Administrador genera la clave');
select pg_temp.as_user('00000000-0000-4000-8000-0000000011f0');
select set_config('t.key', public.rotate_service_token(), true);
select pg_temp.check((select (public.billing_status() ->> 'clave_configurada')::boolean), 'la clave queda configurada (solo su hash)');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.check(public.gateway_settle(current_setting('t.key'), current_setting('t.gw')::uuid, 2, 1000, 'CLP') = 'monto_invalido',
  'un monto distinto no paga el cobro');
reset role;
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000011a1');
select pg_temp.check((select status from public.charges where id = current_setting('t.cob2')::uuid) = 'pendiente', 'el cobro sigue pendiente');
select set_config('t.gw2', (public.start_gateway_payment(current_setting('t.cob2')::uuid) ->> 'pago'), true);
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.check(public.gateway_settle(current_setting('t.key'), current_setting('t.gw2')::uuid, 1, 100000, 'CLP') = 'pendiente',
  'pendiente en la pasarela no cambia nada');
select pg_temp.check(public.gateway_settle(current_setting('t.key'), current_setting('t.gw2')::uuid, 2, 100000, 'CLP', '991133', 'Webpay') = 'pagado',
  'pagado en la pasarela paga el cobro');
select pg_temp.check(public.gateway_settle(current_setting('t.key'), current_setting('t.gw2')::uuid, 2, 100000, 'CLP') = 'pagado',
  'la confirmación es idempotente');
reset role;
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000011a1');
select pg_temp.check((select status from public.charges where id = current_setting('t.cob2')::uuid) = 'pagado', 'el cobro de la cotización queda pagado');
select pg_temp.check(exists (select 1 from public.case_events where case_id = current_setting('t.caso')::uuid and kind = 'pago'),
  'el pago queda en el historial del caso');
select pg_temp.check(pg_temp.fails(format($$select public.start_gateway_payment(%L)$$, current_setting('t.cob2')), 'ENQ_COBRO_NO_PAGABLE'),
  'un cobro pagado no se vuelve a pagar');

-- 9) Facturación diaria: renovación 5 días antes y vencimiento
reset role;
update public.subscriptions set paid_until = (now() at time zone 'America/Santiago')::date + 3 where id = current_setting('t.sub')::uuid;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.check((public.billing_run(current_setting('t.key')) ->> 'renovaciones')::int = 1, 'se genera el cobro del próximo período');
select pg_temp.check((public.billing_run(current_setting('t.key')) ->> 'renovaciones')::int = 0, 'la facturación es idempotente');
reset role;
update public.subscriptions set paid_until = (now() at time zone 'America/Santiago')::date - 7 where id = current_setting('t.sub')::uuid;
select public.billing_run(current_setting('t.key'));
select pg_temp.check((select status from public.subscriptions where id = current_setting('t.sub')::uuid) = 'vencida',
  'sin pago del período siguiente la suscripción vence');
set local role authenticated;

-- 10) Cancelación y aislamiento
select pg_temp.as_user('00000000-0000-4000-8000-0000000011a1');
select pg_temp.check(public.cancel_subscription(current_setting('t.sub')::uuid, 'Cambio de proveedor') = 'cancelada',
  'una suscripción vencida se cancela de inmediato');
select pg_temp.check(not exists (select 1 from public.charges where subscription_id = current_setting('t.sub')::uuid and status in ('pendiente', 'vencido')),
  'sus cobros abiertos se anulan');
select pg_temp.as_user('00000000-0000-4000-8000-0000000011b1');
select pg_temp.check((select count(*) from public.charges) = 0 and (select count(*) from public.subscriptions) = 0
  and (select count(*) from public.payments) = 0, 'otra empresa NO ve cobros, pagos ni suscripciones');

select 'TODAS LAS PRUEBAS OK' as resultado;
rollback;
