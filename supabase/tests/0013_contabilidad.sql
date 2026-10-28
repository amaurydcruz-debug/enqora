-- =====================================================================
-- ENQORA · Prueba de ENQORA CONTABILIDAD (0013)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0013_contabilidad.sql.
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
  ('00000000-0000-4000-8000-0000000013a1', 'ana13@prueba-enqora.cl',  'authenticated', 'authenticated'),  -- dueña
  ('00000000-0000-4000-8000-0000000013c1', 'lola13@prueba-enqora.cl', 'authenticated', 'authenticated'),  -- solo lectura
  ('00000000-0000-4000-8000-0000000013b1', 'otro13@prueba-enqora.cl', 'authenticated', 'authenticated'),  -- otra empresa
  ('00000000-0000-4000-8000-0000000013f1', 'dir13@prueba-enqora.cl',  'authenticated', 'authenticated'),  -- director de operaciones
  ('00000000-0000-4000-8000-0000000013f2', 'cami13@prueba-enqora.cl', 'authenticated', 'authenticated'),  -- contadora asignada
  ('00000000-0000-4000-8000-0000000013f3', 'leo13@prueba-enqora.cl',  'authenticated', 'authenticated');  -- contador NO asignado

insert into public.staff_members (user_id, role) values
  ('00000000-0000-4000-8000-0000000013f1', 'ops_director'),
  ('00000000-0000-4000-8000-0000000013f2', 'accountant_pro'),
  ('00000000-0000-4000-8000-0000000013f3', 'accountant_pro')
on conflict (user_id) do update set role = excluded.role, active = true;

set local role authenticated;

select pg_temp.as_user('00000000-0000-4000-8000-0000000013a1');
select set_config('t.emp', public.create_company('76.086.428-5', 'Empresa Trece SpA')::text, true);
select set_config('t.tok', public.create_invitation(current_setting('t.emp')::uuid, 'lola13@prueba-enqora.cl', 'viewer'), true);
select pg_temp.as_user('00000000-0000-4000-8000-0000000013c1');
select set_config('request.jwt.claims', (current_setting('request.jwt.claims')::jsonb || '{"email":"lola13@prueba-enqora.cl"}')::text, true);
select public.accept_invitation(current_setting('t.tok'));
select pg_temp.as_user('00000000-0000-4000-8000-0000000013a1');
select set_config('t.caso', public.create_case(current_setting('t.emp')::uuid, 'contabilidad', 'Contabilidad mensual', null)::text, true);
select pg_temp.as_user('00000000-0000-4000-8000-0000000013f1');
select public.assign_case(current_setting('t.caso')::uuid, '00000000-0000-4000-8000-0000000013f2', 'responsable');

-- 1) Carga del RCV: valida RUT, descarta lo inválido y no duplica
select pg_temp.as_user('00000000-0000-4000-8000-0000000013a1');
select pg_temp.check((public.import_documents(current_setting('t.emp')::uuid, '2026-09-15', 'venta', '[
  {"doc_type":33,"folio":101,"rut":"11.111.111-1","name":"Cliente Uno","date":"2026-09-03","net":1000000,"vat":190000,"total":1190000},
  {"doc_type":33,"folio":102,"rut":"12.345.678-5","name":"Cliente Dos","date":"2026-09-10","net":500000,"vat":95000,"total":595000},
  {"doc_type":61,"folio":7,"rut":"11.111.111-1","name":"Cliente Uno","date":"2026-09-20","net":100000,"vat":19000,"total":119000},
  {"doc_type":39,"folio":5001,"rut":"","date":"2026-09-30","net":200000,"vat":38000,"total":238000},
  {"doc_type":33,"folio":103,"rut":"12.345.678-0","name":"RUT malo","net":1,"vat":1,"total":2}
]'::jsonb, 'RCV_VENTA_202609.csv') ->> 'aceptadas')::int = 4, 'se aceptan 4 ventas y se descarta el RUT inválido');
select public.import_documents(current_setting('t.emp')::uuid, '2026-09-01', 'venta',
  '[{"doc_type":33,"folio":101,"rut":"11111111-1","name":"Cliente Uno","date":"2026-09-03","net":1000000,"vat":190000,"total":1190000}]'::jsonb);
select pg_temp.check((select count(*) from public.acc_documents where book = 'venta') = 4, 'volver a subir el mismo documento no lo duplica');
select public.import_documents(current_setting('t.emp')::uuid, '2026-09-01', 'compra', '[
  {"doc_type":33,"folio":9001,"rut":"77.123.456-9","name":"Proveedor SpA","date":"2026-09-05","net":400000,"vat":76000,"total":476000},
  {"doc_type":33,"folio":9002,"rut":"77.123.456-9","name":"Proveedor SpA","date":"2026-09-12","net":100000,"vat":19000,"total":119000,"fixed_vat":19000},
  {"doc_type":61,"folio":12,"rut":"77.123.456-9","name":"Proveedor SpA","date":"2026-09-18","net":50000,"vat":9500,"total":59500}
]'::jsonb);

select pg_temp.as_user('00000000-0000-4000-8000-0000000013c1');
select pg_temp.check((select count(*) from public.acc_documents) = 7, 'solo lectura ve los documentos de su empresa');
select pg_temp.check(pg_temp.fails(format($$select public.import_documents(%L, '2026-09-01', 'venta', '[]')$$, current_setting('t.emp')), 'ENQ_SIN_PERMISO'),
  'solo lectura NO carga documentos');
select pg_temp.as_user('00000000-0000-4000-8000-0000000013b1');
select pg_temp.check((select count(*) from public.acc_documents) = 0, 'otra empresa NO ve la contabilidad');
select pg_temp.as_user('00000000-0000-4000-8000-0000000013f3');
select pg_temp.check((select count(*) from public.acc_documents) = 0, 'un contador no asignado NO ve la contabilidad');
select pg_temp.as_user('00000000-0000-4000-8000-0000000013f2');
select pg_temp.check((select count(*) from public.acc_documents) = 7, 'la contadora asignada ve la contabilidad');

-- 2) Cifras del IVA: débito, crédito, notas de crédito y alertas
select pg_temp.check((select (f ->> 'debito')::bigint = 190000 + 95000 + 38000 - 19000
  and (f ->> 'credito')::bigint = 76000 + 19000 - 9500
  and (f ->> 'ventas_facturas_cantidad')::int = 2 and (f ->> 'ventas_nc_iva')::bigint = 19000
  and (f ->> 'ventas_netas')::bigint = 1000000 + 500000 + 200000 - 100000
  and f -> 'alertas' ? 'iva_activo_fijo'
  from (select public.vat_figures(current_setting('t.emp')::uuid, '2026-09-01') as f) x), 'el cálculo del IVA coincide');

-- 3) Banco y conciliación: sugerencia por monto y fecha, confirmación de una persona
select pg_temp.as_user('00000000-0000-4000-8000-0000000013a1');
select pg_temp.check((public.import_bank(current_setting('t.emp')::uuid, '2026-09-01', 'Banco Estado CC 123', '[
  {"date":"2026-09-04","description":"TRANSF DE 11111111-1 CLIENTE UNO","amount":1190000,"balance":3190000},
  {"date":"2026-09-06","description":"PAGO PROVEEDOR 77123456","amount":-476000,"balance":2714000},
  {"date":"2026-09-30","description":"COMISION MANTENCION","amount":-4500,"balance":2709500},
  {"date":"2026-10-01","description":"FUERA DEL PERIODO","amount":-1000}
]'::jsonb, 'cartola.csv') ->> 'aceptadas')::int = 3, 'se aceptan los movimientos del período');
select pg_temp.check((public.import_bank(current_setting('t.emp')::uuid, '2026-09-01', 'Banco Estado CC 123',
  '[{"date":"2026-09-04","description":"TRANSF DE 11111111-1 CLIENTE UNO","amount":1190000,"balance":3190000}]'::jsonb) ->> 'repetidas')::int = 1,
  'una cartola repetida no duplica movimientos');
select pg_temp.check((select count(*) from public.match_suggestions(current_setting('t.emp')::uuid, '2026-09-01')) = 2,
  'se sugieren las dos coincidencias por monto');
select public.reconcile(m.movement_id, m.document_id) from public.match_suggestions(current_setting('t.emp')::uuid, '2026-09-01') m;
select pg_temp.check((select count(*) from public.reconciliations where document_id is not null) = 2, 'las sugerencias quedan conciliadas');
select pg_temp.check(pg_temp.fails(format($$select public.reconcile(%L, %L)$$,
  (select id from public.bank_movements where description like 'COMISION%'),
  (select id from public.acc_documents where folio = 102)), 'ENQ_MONTO_NO_COINCIDE'), 'un monto distinto no se concilia');
select public.reconcile_other((select id from public.bank_movements where description like 'COMISION%'), 'comision_bancaria', null);
select pg_temp.check((select count(*) from public.match_suggestions(current_setting('t.emp')::uuid, '2026-09-01')) = 0, 'no quedan sugerencias');

-- 4) F29: borrador → revisión profesional (cuatro ojos) → aprobado → presentado; período cerrado
select set_config('t.f29', public.save_vat_draft(current_setting('t.emp')::uuid, '2026-09-01', 20000, 0.25, 50000, 'Primer borrador')::text, true);
select pg_temp.check((select debit = 304000 and credit = 85500 + 20000 and iva_determinado = 304000 - 105500
  and ppm = round(1600000 * 0.25 / 100.0) and total_pagar = 198500 + 4000 + 50000
  and 'remanente_reajuste_utm' = any (flags) from public.vat_returns where id = current_setting('t.f29')::uuid), 'el borrador del F29 calcula los códigos');
select public.submit_vat(current_setting('t.f29')::uuid);
select pg_temp.check(pg_temp.fails(format($$select public.decide_vat(%L, 'aprobar')$$, current_setting('t.f29')), 'ENQ_SIN_PERMISO'),
  'el cliente NO aprueba su propio F29');
select pg_temp.as_user('00000000-0000-4000-8000-0000000013f2');
select pg_temp.check((select count(*) from public.notifications where title like 'F29 por revisar%') = 1, 'la contadora recibe el F29 por revisar');
select pg_temp.check(pg_temp.fails(format($$select public.decide_vat(%L, 'devolver', 'corto')$$, current_setting('t.f29')), 'ENQ_FALTA_OBSERVACION'),
  'devolver exige una observación');
select public.decide_vat(current_setting('t.f29')::uuid, 'aprobar', 'Revisado contra RCV');
select pg_temp.check((select status from public.vat_returns where id = current_setting('t.f29')::uuid) = 'aprobado', 'el F29 queda aprobado');
select pg_temp.as_user('00000000-0000-4000-8000-0000000013a1');
select pg_temp.check(pg_temp.fails(format($$select public.import_documents(%L, '2026-09-01', 'venta', '[]')$$, current_setting('t.emp')),
  'ENQ_PERIODO_DECLARADO'), 'un período aprobado no admite nuevos documentos');
select public.register_vat_presented(current_setting('t.f29')::uuid, '8812345678', '2026-10-20');
select pg_temp.check((select status = 'presentado' and presented_folio = '8812345678' from public.vat_returns
  where id = current_setting('t.f29')::uuid), 'la presentación queda registrada con su folio');

-- 5) Sin revisión profesional queda marcado
select public.import_documents(current_setting('t.emp')::uuid, '2026-10-01', 'venta',
  '[{"doc_type":33,"folio":201,"rut":"11111111-1","date":"2026-10-03","net":100000,"vat":19000,"total":119000}]'::jsonb);
select set_config('t.f29b', public.save_vat_draft(current_setting('t.emp')::uuid, '2026-10-01', 0, 0.25, 0)::text, true);
select public.register_vat_presented(current_setting('t.f29b')::uuid, '99887766', (now() at time zone 'America/Santiago')::date);
select pg_temp.check((select 'sin_revision_profesional' = any (flags) from public.vat_returns where id = current_setting('t.f29b')::uuid),
  'presentado sin revisión queda marcado');

select 'TODAS LAS PRUEBAS OK' as resultado;
rollback;
