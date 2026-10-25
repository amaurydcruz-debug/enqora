-- =====================================================================
-- ENQORA · Prueba de aislamiento entre empresas (Etapa 2)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0002_empresas.sql.
-- Crea usuarios y empresas ficticios dentro de una transacción y al final
-- la deshace (ROLLBACK): no deja ningún dato en la base.
-- Resultado esperado: una fila final que dice "TODAS LAS PRUEBAS OK".
-- Si algo falla, se detiene con un mensaje "FALLÓ: ...".
-- =====================================================================

begin;

create function pg_temp.check(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLÓ: %', msg; end if;
end $$;

create function pg_temp.as_user(uid uuid, email text, aal text, mfa_age_minutes int default 1) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', uid, 'email', email, 'role', 'authenticated', 'aal', aal,
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

-- Usuarios ficticios: Ana (empresa A), Beto (empresa B), Carla (invitada a A)
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-00000000000a', 'ana@prueba-enqora.cl', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000000b', 'beto@prueba-enqora.cl', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000000c', 'carla@prueba-enqora.cl', 'authenticated', 'authenticated');

set local role authenticated;

-- 1) Sin segundo factor no se puede crear ni leer
select pg_temp.as_user('00000000-0000-4000-8000-00000000000a', 'ana@prueba-enqora.cl', 'aal1');
select pg_temp.check(pg_temp.fails($$select public.create_company('76.086.428-5', 'Empresa A SpA')$$, 'ENQ_MFA'),
  'crear empresa sin MFA debe fallar');

-- 2) Ana crea la empresa A; Beto crea la empresa B
select pg_temp.as_user('00000000-0000-4000-8000-00000000000a', 'ana@prueba-enqora.cl', 'aal2');
select pg_temp.check(pg_temp.fails($$select public.create_company('76.086.428-0', 'RUT malo')$$, 'ENQ_RUT_INVALIDO'),
  'RUT con dígito verificador incorrecto debe fallar');
select set_config('test.empresa_a', public.create_company('76.086.428-5', 'Empresa A SpA')::text, true);

select pg_temp.as_user('00000000-0000-4000-8000-00000000000b', 'beto@prueba-enqora.cl', 'aal2');
select set_config('test.empresa_b', public.create_company('11.111.111-1', 'Empresa B Ltda')::text, true);

-- 3) Aislamiento: Beto solo ve su empresa
select pg_temp.check((select count(*) from public.companies) = 1, 'Beto debe ver exactamente 1 empresa');
select pg_temp.check(not exists (select 1 from public.companies where id = current_setting('test.empresa_a')::uuid),
  'Beto NO debe ver la empresa A');
select pg_temp.check(not exists (select 1 from public.company_members where company_id = current_setting('test.empresa_a')::uuid),
  'Beto NO debe ver los miembros de A');
select pg_temp.check(not exists (select 1 from public.audit_events where company_id = current_setting('test.empresa_a')::uuid),
  'Beto NO debe ver la auditoría de A');
select pg_temp.check(not exists (select 1 from public.profiles where email = 'ana@prueba-enqora.cl'),
  'Beto NO debe ver el perfil de Ana');

-- 4) Beto no puede modificar A ni escribir directo en las tablas
select pg_temp.check(pg_temp.fails(format($$select public.update_company(%L, 'Hackeada')$$, current_setting('test.empresa_a')), 'ENQ_SIN_PERMISO'),
  'Beto NO debe poder editar A');
select pg_temp.check(pg_temp.fails(format($$insert into public.company_members (company_id, user_id, role) values (%L, %L, 'owner')$$,
  current_setting('test.empresa_a'), '00000000-0000-4000-8000-00000000000b'), 'permission denied'),
  'Beto NO debe poder agregarse a A con INSERT directo');
select pg_temp.check(pg_temp.fails(format($$update public.companies set legal_name = 'x' where id = %L$$, current_setting('test.empresa_a')), 'permission denied'),
  'UPDATE directo debe estar bloqueado');

-- 5) Invitar exige reautenticación reciente
select pg_temp.as_user('00000000-0000-4000-8000-00000000000a', 'ana@prueba-enqora.cl', 'aal2', 30);
select pg_temp.check(pg_temp.fails(format($$select public.create_invitation(%L, 'carla@prueba-enqora.cl', 'accountant')$$, current_setting('test.empresa_a')), 'ENQ_REAUTH'),
  'invitar con MFA de hace 30 min debe pedir reautenticación');

select pg_temp.as_user('00000000-0000-4000-8000-00000000000a', 'ana@prueba-enqora.cl', 'aal2', 1);
select set_config('test.token', public.create_invitation(current_setting('test.empresa_a')::uuid, 'carla@prueba-enqora.cl', 'accountant'), true);

-- 6) La invitación no sirve con otro correo
select pg_temp.as_user('00000000-0000-4000-8000-00000000000b', 'beto@prueba-enqora.cl', 'aal2');
select pg_temp.check((select status from public.invitation_preview(current_setting('test.token'))) = 'otro_correo',
  'Beto debe ver la invitación como de otro correo');
select pg_temp.check(pg_temp.fails(format($$select public.accept_invitation(%L)$$, current_setting('test.token')), 'ENQ_INVITACION_OTRO_CORREO'),
  'Beto NO debe poder aceptar la invitación de Carla');

-- 7) Carla acepta y queda como contadora: ve A, no B, no ve auditoría
select pg_temp.as_user('00000000-0000-4000-8000-00000000000c', 'carla@prueba-enqora.cl', 'aal2');
select pg_temp.check(public.accept_invitation(current_setting('test.token')) = current_setting('test.empresa_a')::uuid,
  'Carla debe poder aceptar su invitación');
select pg_temp.check((select count(*) from public.companies) = 1, 'Carla debe ver solo la empresa A');
select pg_temp.check((select count(*) from public.audit_events) = 0, 'una contadora NO debe ver la auditoría');
select pg_temp.check(pg_temp.fails(format($$select public.accept_invitation(%L)$$, current_setting('test.token')), 'ENQ_INVITACION_INVALIDA'),
  'la invitación no debe poder usarse dos veces');
select pg_temp.check(pg_temp.fails(format($$select public.change_member_role(%L, %L, 'owner')$$,
  current_setting('test.empresa_a'), '00000000-0000-4000-8000-00000000000c'), 'ENQ_SIN_PERMISO'),
  'una contadora NO debe poder ascenderse a propietaria');

-- 8) No se puede dejar la empresa sin propietario
select pg_temp.as_user('00000000-0000-4000-8000-00000000000a', 'ana@prueba-enqora.cl', 'aal2');
select pg_temp.check(pg_temp.fails(format($$select public.remove_member(%L, %L)$$,
  current_setting('test.empresa_a'), '00000000-0000-4000-8000-00000000000a'), 'ENQ_ULTIMO_PROPIETARIO'),
  'el único propietario NO debe poder salir');

-- 9) Ana ve la auditoría de su empresa
select pg_temp.check((select count(*) from public.audit_events where company_id = current_setting('test.empresa_a')::uuid) >= 3,
  'la propietaria debe ver los eventos de auditoría');

-- 10) Usuario anónimo no ve nada
reset role;
set local role anon;
select pg_temp.check(pg_temp.fails('select count(*) from public.companies', 'permission denied'),
  'un visitante anónimo NO debe poder leer empresas');

reset role;
select 'TODAS LAS PRUEBAS OK' as resultado;

rollback;
