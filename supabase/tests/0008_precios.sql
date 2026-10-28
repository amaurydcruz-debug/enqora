-- =====================================================================
-- ENQORA · Prueba del catálogo y motor de precios (0008)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0008_precios.sql.
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

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000008a1', 'ana8@prueba-enqora.cl',  'authenticated', 'authenticated'),  -- dueña empresa
  ('00000000-0000-4000-8000-0000000008c1', 'lola8@prueba-enqora.cl', 'authenticated', 'authenticated'),  -- solo lectura
  ('00000000-0000-4000-8000-0000000008f0', 'adm8@prueba-enqora.cl',  'authenticated', 'authenticated'),  -- administrador ENQORA
  ('00000000-0000-4000-8000-0000000008f1', 'dir8@prueba-enqora.cl',  'authenticated', 'authenticated'),  -- director de operaciones
  ('00000000-0000-4000-8000-0000000008f2', 'cami8@prueba-enqora.cl', 'authenticated', 'authenticated'),  -- contadora responsable
  ('00000000-0000-4000-8000-0000000008f4', 'ia8@prueba-enqora.cl',   'authenticated', 'authenticated');  -- agente IA

insert into public.staff_members (user_id, role) values
  ('00000000-0000-4000-8000-0000000008f0', 'enqora_admin'),
  ('00000000-0000-4000-8000-0000000008f1', 'ops_director'),
  ('00000000-0000-4000-8000-0000000008f2', 'accountant_pro'),
  ('00000000-0000-4000-8000-0000000008f4', 'ai_agent')
on conflict (user_id) do update set role = excluded.role, active = true;

set local role authenticated;

-- Empresa, lectora y caso
select pg_temp.as_user('00000000-0000-4000-8000-0000000008a1');
select set_config('t.emp', public.create_company('76.086.428-5', 'Empresa Ocho SpA')::text, true);
select set_config('t.tok', public.create_invitation(current_setting('t.emp')::uuid, 'lola8@prueba-enqora.cl', 'viewer'), true);
select set_config('t.caso', public.create_case(current_setting('t.emp')::uuid, 'contabilidad', 'IVA de septiembre')::text, true);
select pg_temp.as_user('00000000-0000-4000-8000-0000000008c1');
select set_config('request.jwt.claims', (current_setting('request.jwt.claims')::jsonb || '{"email":"lola8@prueba-enqora.cl"}')::text, true);
select public.accept_invitation(current_setting('t.tok'));

select pg_temp.as_user('00000000-0000-4000-8000-0000000008f1');
select public.assign_case(current_setting('t.caso')::uuid, '00000000-0000-4000-8000-0000000008f2', 'responsable');
select public.assign_case(current_setting('t.caso')::uuid, '00000000-0000-4000-8000-0000000008f4', 'agente_ia');

-- 1) Catálogo inicial: existe, sin precios y oculto al cliente
select pg_temp.as_user('00000000-0000-4000-8000-0000000008a1');
select pg_temp.check((select count(*) from public.services) = 0, 'el cliente NO debe ver servicios inactivos');
select pg_temp.as_user('00000000-0000-4000-8000-0000000008f0');
select pg_temp.check((select count(*) from public.services) >= 11, 'el catálogo inicial debe existir');
select pg_temp.check((select count(*) from public.service_tariffs) = 0, 'no debe haber ningún precio precargado');

-- 2) Solo el Administrador ENQORA edita el catálogo
select set_config('t.srv', (select id from public.services where code = 'CON-02')::text, true);
select pg_temp.as_user('00000000-0000-4000-8000-0000000008f2');
select pg_temp.check(pg_temp.fails(format($$select public.save_service(%L, 'CON-02', 'contabilidad', 'x', null, 'alcance suficiente', null, 'mes', false, true)$$,
  current_setting('t.srv')), 'ENQ_SIN_PERMISO'), 'la contadora NO debe editar el catálogo');
select pg_temp.as_user('00000000-0000-4000-8000-0000000008f4');
select pg_temp.check(pg_temp.fails(format($$select public.draft_tariff(%L, 1000, 1, 1, 1, 0, 0, 0, 1, 2, null, null, null)$$,
  current_setting('t.srv')), 'ENQ_SIN_PERMISO'), 'el agente IA NO debe crear tarifas');

select pg_temp.as_user('00000000-0000-4000-8000-0000000008f0');
select public.save_service(current_setting('t.srv')::uuid, 'CON-02', 'contabilidad', 'Declaración mensual de IVA (F29)',
  'Preparación del F29', 'Cuadratura del RCV y preparación del F29.', 'Presentación con tu autorización.', 'mes', false, true);
select pg_temp.check(pg_temp.fails($$select public.save_service(null, 'CON-02', 'contabilidad', 'Duplicado', null, 'alcance suficiente', null, 'mes', false, false)$$,
  'ENQ_CODIGO_DUPLICADO'), 'el código de servicio debe ser único');

-- 3) Tarifas versionadas: borrador → vigente (con reautenticación) → retirada
select set_config('t.tar1', public.draft_tariff(current_setting('t.srv')::uuid, 100000, 1.5, 2, 2.5, 15000, 20, 10,
  80000, 400000, 3, 'Contador', 'Primera versión')::text, true);
select pg_temp.check(pg_temp.fails(format($$select public.draft_tariff(%L, 1000, 2, 1.5, 1, 0, 0, 0, 1, 2, null, null, null)$$,
  current_setting('t.srv')), 'ENQ_DATOS_INVALIDOS'), 'los factores de complejidad deben ser crecientes');
select pg_temp.check(pg_temp.fails(format($$select public.draft_tariff(%L, 1000, 1, 1, 1, 0, 0, 0, 5, 2, null, null, null)$$,
  current_setting('t.srv')), 'ENQ_DATOS_INVALIDOS'), 'el máximo no puede ser menor que el mínimo');
select pg_temp.as_user('00000000-0000-4000-8000-0000000008f0', 30);
select pg_temp.check(pg_temp.fails(format($$select public.publish_tariff(%L)$$, current_setting('t.tar1')), 'ENQ_REAUTH'),
  'publicar una tarifa exige reautenticación reciente');
select pg_temp.as_user('00000000-0000-4000-8000-0000000008f1');
select pg_temp.check(pg_temp.fails(format($$select public.publish_tariff(%L)$$, current_setting('t.tar1')), 'ENQ_SIN_PERMISO'),
  'solo el Administrador ENQORA publica tarifas');
select pg_temp.as_user('00000000-0000-4000-8000-0000000008f0');
select public.publish_tariff(current_setting('t.tar1')::uuid);
select pg_temp.check((select status from public.service_tariffs where id = current_setting('t.tar1')::uuid) = 'vigente', 'la tarifa debe quedar vigente');

-- 4) El cliente ve el servicio activo y solo su tarifa vigente
select set_config('t.tar2', public.draft_tariff(current_setting('t.srv')::uuid, 120000, 1.5, 2, 2.5, 15000, 20, 10,
  80000, 400000, 3, 'Contador', 'Borrador v2')::text, true);
select pg_temp.as_user('00000000-0000-4000-8000-0000000008a1');
select pg_temp.check((select count(*) from public.services) = 1, 'el cliente ve solo el servicio activo');
select pg_temp.check((select count(*) from public.service_tariffs) = 1, 'el cliente NO ve borradores de tarifas');

-- 5) Cotización dentro de parámetros: cálculo exacto y envío automático
select pg_temp.as_user('00000000-0000-4000-8000-0000000008f2');
select pg_temp.check(pg_temp.fails(format($$select public.create_quote(%L, %L, 'media', 2, true, true, 5, 'corto', 0, null, null, 15)$$,
  current_setting('t.caso'), current_setting('t.srv')), 'ENQ_FALTA_MOTIVO_DESCUENTO'), 'un descuento exige motivo');
select set_config('t.q1', public.create_quote(current_setting('t.caso')::uuid, current_setting('t.srv')::uuid, 'media', 2,
  true, true, 10, 'Cliente con dos períodos simultáneos', 25000, 'Notaría', '50% al aceptar, 50% al entregar', 15)::text, true);
select pg_temp.check((select subtotal = 300000 and urgency_amount = 60000 and onsite_amount = 15000 and standard_price = 375000
  and discount_amount = 37500 and final_price = 337500 and external_costs = 25000 and within_range
  from public.quotes where id = current_setting('t.q1')::uuid), 'el cálculo debe coincidir: 337.500 + 25.000 de gastos externos');
select pg_temp.check((select status from public.quotes where id = current_setting('t.q1')::uuid) = 'enviada',
  'dentro de parámetros la cotización se envía sola');

-- 6) El cliente la ve; la lectora no decide; la dueña acepta con evidencia
select pg_temp.as_user('00000000-0000-4000-8000-0000000008c1');
select pg_temp.check((select count(*) from public.quotes) = 1, 'la lectora ve la cotización enviada');
select pg_temp.check(pg_temp.fails(format($$select public.decide_quote(%L, 'aceptar')$$, current_setting('t.q1')), 'ENQ_SIN_PERMISO'),
  'solo lectura NO acepta cotizaciones');
select pg_temp.as_user('00000000-0000-4000-8000-0000000008a1', 30);
select pg_temp.check(pg_temp.fails(format($$select public.decide_quote(%L, 'aceptar')$$, current_setting('t.q1')), 'ENQ_REAUTH'),
  'aceptar exige reautenticación reciente');
select pg_temp.as_user('00000000-0000-4000-8000-0000000008a1');
select public.decide_quote(current_setting('t.q1')::uuid, 'aceptar');
select pg_temp.check((select status = 'aceptada' and evidence ->> 'precio_final' = '337500' and (evidence ->> 'version_tarifa')::int = 1
  from public.quotes where id = current_setting('t.q1')::uuid), 'la aceptación guarda la versión y el precio aceptados');
select pg_temp.check(exists (select 1 from public.case_events where case_id = current_setting('t.caso')::uuid and kind = 'cotizacion'
  and metadata ->> 'accion' = 'aceptada'), 'la aceptación queda en el historial del caso');

-- 7) Descuento fuera de rango: va al Centro de Mando y el cliente no la ve hasta aprobarse
select pg_temp.as_user('00000000-0000-4000-8000-0000000008f2');
select set_config('t.q2', public.create_quote(current_setting('t.caso')::uuid, current_setting('t.srv')::uuid, 'simple', 1,
  false, false, 30, 'Excepción comercial solicitada', 0, null, null, 10)::text, true);
select pg_temp.check((select status = 'pendiente_aprobacion' and not within_range and approval_id is not null
  from public.quotes where id = current_setting('t.q2')::uuid), 'fuera de rango debe quedar pendiente de aprobación');
select pg_temp.check((select kind = 'excepcion' and approver_role = 'supervisor' and (payload ->> 'monto')::int = 70000
  from public.approvals where id = (select approval_id from public.quotes where id = current_setting('t.q2')::uuid)),
  'la excepción va a la supervisión con el monto propuesto');
select pg_temp.as_user('00000000-0000-4000-8000-0000000008a1');
select pg_temp.check((select count(*) from public.quotes where id = current_setting('t.q2')::uuid) = 0,
  'el cliente NO ve una cotización pendiente de aprobación');
select pg_temp.as_user('00000000-0000-4000-8000-0000000008f1');
select public.decide_approval((select approval_id from public.quotes where id = current_setting('t.q2')::uuid), 'aprobar');
select pg_temp.check((select status = 'enviada' and sent_at is not null from public.quotes where id = current_setting('t.q2')::uuid),
  'al aprobarse, la cotización se envía sola');

-- 8) Una propuesta del agente IA siempre pasa por aprobación
select pg_temp.as_user('00000000-0000-4000-8000-0000000008f4');
select set_config('t.q3', public.create_quote(current_setting('t.caso')::uuid, current_setting('t.srv')::uuid, 'simple', 1,
  false, false, 0, null, 0, null, null, 10)::text, true);
select pg_temp.check((select status = 'pendiente_aprobacion' and 'propuesta_de_agente' = any (review_reasons)
  from public.quotes where id = current_setting('t.q3')::uuid), 'la propuesta del agente debe revisarse');
select pg_temp.check(pg_temp.fails(format($$select public.decide_approval(%L, 'aprobar')$$,
  (select approval_id from public.quotes where id = current_setting('t.q3')::uuid)), 'ENQ_'),
  'el agente NO aprueba su propia propuesta');

-- 9) Rechazo en el Centro de Mando deja la cotización observada
select pg_temp.as_user('00000000-0000-4000-8000-0000000008f2');
select public.decide_approval((select approval_id from public.quotes where id = current_setting('t.q3')::uuid), 'rechazar',
  'El alcance no corresponde a lo pedido');
select pg_temp.check((select status from public.quotes where id = current_setting('t.q3')::uuid) = 'observada',
  'una propuesta rechazada queda observada');

-- 10) Anular y vencer
select public.cancel_quote(current_setting('t.q2')::uuid);
select pg_temp.check((select status from public.quotes where id = current_setting('t.q2')::uuid) = 'anulada', 'el equipo puede anular');
select set_config('t.q4', public.create_quote(current_setting('t.caso')::uuid, current_setting('t.srv')::uuid, 'simple', 1,
  false, false, 0, null, 0, null, null, 1)::text, true);
reset role;
update public.quotes set valid_until = current_date - 1 where id = current_setting('t.q4')::uuid;
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000008a1');
select pg_temp.check(pg_temp.fails(format($$select public.decide_quote(%L, 'aceptar')$$, current_setting('t.q4')), 'ENQ_COTIZACION_VENCIDA'),
  'una cotización vencida no se puede aceptar');

-- 11) Referencias de mercado: con fuente; al cliente solo las recientes
select pg_temp.as_user('00000000-0000-4000-8000-0000000008f4');
select public.add_market_reference(current_setting('t.srv')::uuid, 'Proveedor A', 'https://ejemplo.cl/precios', current_date - 10,
  'Plan básico', 30000, 60000, 'mes');
select public.add_market_reference(current_setting('t.srv')::uuid, 'Proveedor B', 'https://ejemplo.cl/antiguo', current_date - 400,
  null, 20000, null, 'mes');
select pg_temp.check(pg_temp.fails(format($$select public.add_market_reference(%L, 'Sin fuente', 'http://inseguro.cl', current_date, null, 1, null, 'mes')$$,
  current_setting('t.srv')), 'ENQ_DATOS_INVALIDOS'), 'la referencia exige un enlace https');
select pg_temp.as_user('00000000-0000-4000-8000-0000000008a1');
select pg_temp.check((select count(*) from public.market_references) = 1, 'el cliente NO ve referencias de más de 180 días');

-- 12) Una nueva versión publicada retira la anterior; la cotización aceptada conserva su versión
select pg_temp.as_user('00000000-0000-4000-8000-0000000008f0');
select public.publish_tariff(current_setting('t.tar2')::uuid);
select pg_temp.check((select status from public.service_tariffs where id = current_setting('t.tar1')::uuid) = 'retirada',
  'la versión anterior queda retirada');
select pg_temp.check((select tariff_version = 1 and final_price = 337500 from public.quotes where id = current_setting('t.q1')::uuid),
  'la cotización aceptada no cambia con la nueva tarifa');

select 'TODAS LAS PRUEBAS OK' as resultado;
rollback;
