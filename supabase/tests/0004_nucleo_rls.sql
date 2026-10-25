-- =====================================================================
-- ENQORA · Prueba del núcleo operativo (Etapa 4)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0004_nucleo.sql.
-- Usa datos ficticios y al final deshace todo (ROLLBACK).
-- Resultado esperado: una fila "TODAS LAS PRUEBAS OK".
-- =====================================================================

begin;

create function pg_temp.check(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLÓ: %', msg; end if;
end $$;

create function pg_temp.as_user(uid uuid, aal text default 'aal2', mfa_age_minutes int default 1) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', uid, 'role', 'authenticated', 'aal', aal,
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
  ('00000000-0000-4000-8000-0000000000a1', 'ana@prueba-enqora.cl',   'authenticated', 'authenticated'),  -- dueña empresa A
  ('00000000-0000-4000-8000-0000000000b1', 'beto@prueba-enqora.cl',  'authenticated', 'authenticated'),  -- dueño empresa B
  ('00000000-0000-4000-8000-0000000000c1', 'lola@prueba-enqora.cl',  'authenticated', 'authenticated'),  -- solo lectura en A
  ('00000000-0000-4000-8000-0000000000f1', 'dir@prueba-enqora.cl',   'authenticated', 'authenticated'),  -- Administrador ENQORA
  ('00000000-0000-4000-8000-0000000000f2', 'cami@prueba-enqora.cl',  'authenticated', 'authenticated'),  -- contadora ENQORA
  ('00000000-0000-4000-8000-0000000000f3', 'pepe@prueba-enqora.cl',  'authenticated', 'authenticated');  -- abogado ENQORA (sin asignar)

insert into storage.buckets (id, name) values ('expedientes', 'expedientes') on conflict do nothing;

-- Administrador ENQORA inicial (como en la instalación)
select pg_temp.check(private.bootstrap_enqora_admin('dir@prueba-enqora.cl') like 'Administrador%', 'debe crearse el primer administrador');

set local role authenticated;

-- Empresas
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
select set_config('t.emp_a', public.create_company('76.086.428-5', 'Empresa A SpA')::text, true);
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b1');
select set_config('t.emp_b', public.create_company('11.111.111-1', 'Empresa B Ltda')::text, true);

-- Lola entra a A como solo lectura
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
select set_config('t.tok', public.create_invitation(current_setting('t.emp_a')::uuid, 'lola@prueba-enqora.cl', 'viewer'), true);
select pg_temp.as_user('00000000-0000-4000-8000-0000000000c1');
select set_config('request.jwt.claims', (current_setting('request.jwt.claims')::jsonb || '{"email":"lola@prueba-enqora.cl"}')::text, true);
select public.accept_invitation(current_setting('t.tok'));

-- 1) Equipo: el administrador da de alta a Cami (contadora) y Pepe (abogado)
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f1', 'aal2', 30);
select pg_temp.check(pg_temp.fails($$select public.set_staff_role('cami@prueba-enqora.cl', 'accountant_pro')$$, 'ENQ_REAUTH'),
  'dar de alta equipo debe pedir reautenticación');
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f1');
select public.set_staff_role('cami@prueba-enqora.cl', 'accountant_pro');
select public.set_staff_role('pepe@prueba-enqora.cl', 'lawyer_pro');
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
select pg_temp.check(pg_temp.fails($$select public.set_staff_role('ana@prueba-enqora.cl', 'enqora_admin')$$, 'ENQ_SIN_PERMISO'),
  'un cliente NO debe poder hacerse parte del equipo');

-- 2) Ana crea un caso con folio
select set_config('t.caso', public.create_case(current_setting('t.emp_a')::uuid, 'contabilidad', 'Diferencia de IVA en septiembre', 'El F29 no cuadra con el RCV')::text, true);
select pg_temp.check((select folio from public.cases where id = current_setting('t.caso')::uuid) ~ '^ENQ-\d{4}-\d{5}$',
  'el caso debe tener folio ENQ-AAAA-NNNNN');

-- 3) Aislamiento: Beto y el abogado no asignado NO ven el caso
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b1');
select pg_temp.check((select count(*) from public.cases) = 0, 'Beto NO debe ver casos de A');
select pg_temp.check(pg_temp.fails(format($$select public.create_case(%L, 'general', 'Intruso')$$, current_setting('t.emp_a')), 'ENQ_SIN_PERMISO'),
  'Beto NO debe poder crear casos en A');
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f3');
select pg_temp.check((select count(*) from public.cases) = 0, 'el equipo NO asignado NO debe ver el caso');
select pg_temp.check((select count(*) from public.companies) = 0, 'el equipo NO asignado NO debe ver la empresa');

-- 4) El administrador ve todo y asigna a Cami como responsable
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f1');
select pg_temp.check((select count(*) from public.cases) = 1, 'el administrador debe ver el caso');
select public.assign_case(current_setting('t.caso')::uuid, '00000000-0000-4000-8000-0000000000f2', 'responsable');
select pg_temp.check(pg_temp.fails(format($$select public.assign_case(%L, %L, 'apoyo')$$, current_setting('t.caso'), '00000000-0000-4000-8000-0000000000b1'), 'ENQ_NO_ES_EQUIPO'),
  'NO se debe poder asignar a alguien que no es del equipo');

-- 5) Cami trabaja: nota interna, comentario, tarea y documento interno
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f2');
select pg_temp.check((select count(*) from public.cases) = 1, 'la responsable asignada debe ver el caso');
select pg_temp.check((select count(*) from public.companies) = 1, 'la responsable ve los datos básicos de la empresa del caso');
select pg_temp.check((select count(*) from public.company_members) = 0, 'el equipo NO ve los miembros de la empresa');
select pg_temp.check((select count(*) from public.audit_events) = 0, 'el equipo NO ve la auditoría de la empresa');
select public.add_case_comment(current_setting('t.caso')::uuid, 'Revisar factura 1234 del proveedor', true);
select public.add_case_comment(current_setting('t.caso')::uuid, 'Estamos revisando su caso', false);
select public.change_case_status(current_setting('t.caso')::uuid, 'en_investigacion');
select public.create_task(current_setting('t.caso')::uuid, 'Subir cartola bancaria de septiembre', '00000000-0000-4000-8000-0000000000a1', null, 'cliente');
insert into storage.objects (bucket_id, name) values ('expedientes', current_setting('t.emp_a') || '/' || current_setting('t.caso') || '/borrador.pdf');
select public.register_document(current_setting('t.caso')::uuid, current_setting('t.emp_a') || '/' || current_setting('t.caso') || '/borrador.pdf', 'borrador.pdf', 'application/pdf', 1000, 'interno');

-- 6) Ana ve lo público, no lo interno; sube un documento propio
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
select pg_temp.check((select count(*) from public.case_events where kind = 'nota_interna') = 0, 'el cliente NO debe ver notas internas');
select pg_temp.check((select count(*) from public.case_events where kind = 'comentario') = 1, 'el cliente debe ver el comentario');
select pg_temp.check((select count(*) from public.case_documents) = 0, 'el cliente NO debe ver documentos internos');
select pg_temp.check((select count(*) from public.case_tasks) = 1, 'el cliente debe ver su tarea');
insert into storage.objects (bucket_id, name) values ('expedientes', current_setting('t.emp_a') || '/' || current_setting('t.caso') || '/cartola.pdf');
select public.register_document(current_setting('t.caso')::uuid, current_setting('t.emp_a') || '/' || current_setting('t.caso') || '/cartola.pdf', 'cartola.pdf', 'application/pdf', 2000, 'interno');
select pg_temp.check((select visibility from public.case_documents where file_name = 'cartola.pdf') = 'cliente',
  'un documento subido por el cliente siempre queda visible para el cliente');
select pg_temp.check(pg_temp.fails($$select public.add_case_comment(current_setting('t.caso')::uuid, 'x', true)$$, 'ENQ_SIN_PERMISO'),
  'el cliente NO debe poder escribir notas internas');

-- 7) Beto no puede subir archivos al expediente de A
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b1');
select pg_temp.check(pg_temp.fails(format($$insert into storage.objects (bucket_id, name) values ('expedientes', %L)$$,
  current_setting('t.emp_a') || '/' || current_setting('t.caso') || '/malware.pdf'), 'row-level security'),
  'Beto NO debe poder subir archivos al caso de A');
select pg_temp.check((select count(*) from storage.objects) = 0, 'Beto NO debe ver archivos de A');

-- 8) Lola (solo lectura) ve, pero no comenta ni cancela
select pg_temp.as_user('00000000-0000-4000-8000-0000000000c1');
select pg_temp.check((select count(*) from public.cases) = 1, 'solo lectura debe ver el caso');
select pg_temp.check(pg_temp.fails($$select public.add_case_comment(current_setting('t.caso')::uuid, 'hola')$$, 'ENQ_SIN_PERMISO'),
  'solo lectura NO debe comentar');

-- 9) Cierre: exige responsable y resultado
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f2');
select pg_temp.check(pg_temp.fails($$select public.change_case_status(current_setting('t.caso')::uuid, 'cerrado', 'ok')$$, 'ENQ_CIERRE_SIN_RESULTADO'),
  'cerrar sin resultado debe fallar');
select public.change_case_status(current_setting('t.caso')::uuid, 'cerrado', 'Diferencia explicada por nota de crédito no registrada; F29 rectificado.');
select pg_temp.check(pg_temp.fails($$select public.add_case_comment(current_setting('t.caso')::uuid, 'algo más')$$, 'ENQ_SIN_PERMISO'),
  'un caso cerrado no admite nuevos aportes');

-- 10) El cliente puede cancelar una solicitud recién creada, no una en curso
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
select set_config('t.caso2', public.create_case(current_setting('t.emp_a')::uuid, 'legal', 'Revisar contrato de arriendo')::text, true);
select public.change_case_status(current_setting('t.caso2')::uuid, 'cancelado');
select pg_temp.check((select status from public.cases where id = current_setting('t.caso2')::uuid) = 'cancelado', 'debe quedar cancelado');

-- 11) Anónimo no ve nada
reset role;
set local role anon;
select pg_temp.check(pg_temp.fails('select count(*) from public.cases', 'permission denied'), 'anónimo NO debe leer casos');

reset role;
select 'TODAS LAS PRUEBAS OK' as resultado;

rollback;
