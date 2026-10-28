-- =====================================================================
-- ENQORA · Prueba del conector de fuentes oficiales y hoja de vida (0019)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0019_hoja_de_vida.sql.
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

-- Clave de servicio de prueba
update private.service_secrets set token_hash = encode(sha256(convert_to('clave-de-servicio-de-prueba-0019-xxxxxxxx', 'UTF8')), 'hex') where id;
insert into private.service_secrets (id, token_hash) select true, encode(sha256(convert_to('clave-de-servicio-de-prueba-0019-xxxxxxxx', 'UTF8')), 'hex')
where not exists (select 1 from private.service_secrets);
select set_config('t.tok', 'clave-de-servicio-de-prueba-0019-xxxxxxxx', true);

-- Datos anteriores fuera del camino (todo se deshace al final)
update public.public_data_imports set status = 'cancelada' where status in ('en_curso', 'completada');

select pg_temp.check(private.rut_dv(76086428) = '5' and private.rut_dv(11111111) = '1', 'dígito verificador');
select pg_temp.check(has_function_privilege('anon', 'public.svc_import_public_rows(text, uuid, jsonb, bigint, bigint)', 'execute'),
  'el sincronizador entrega sin sesión (con clave)');
select pg_temp.check(not has_function_privilege('anon', 'public.company_public_profile(uuid)', 'execute'), 'el perfil de empresa exige sesión');

-- 1) Sincronización automática
set local role anon;
select set_config('request.jwt.claims', '', true);
select pg_temp.check(pg_temp.fails($q$select public.svc_public_sync_state('mala')$q$, 'ENQ_CLAVE_SERVICIO'), 'sin clave no hay estado');
select pg_temp.check(pg_temp.fails($q$select public.svc_start_public_import(current_setting('t.tok'), 'razon_social', 'https://malicioso.cl/x.zip', now(), 'x')$q$,
  'ENQ_DATOS_INVALIDOS'), 'solo fuentes del SII');
select pg_temp.check((public.svc_public_sync_state(current_setting('t.tok')) -> 'razon_social' -> 'activa') = 'null'::jsonb, 'sin cargas activas');

select set_config('t.imp', public.svc_start_public_import(current_setting('t.tok'), 'razon_social',
  'https://www.sii.cl/estadisticas/nominas/PUB_NOMBRES_PJ.zip', '2026-08-15 10:00-04', 'PUB_NOMBRES_PJ.txt')::text, true);
select pg_temp.check(public.svc_import_public_rows(current_setting('t.tok'), current_setting('t.imp')::uuid, jsonb_build_array(
  jsonb_build_object('rut', 76086428, 'dv', '5', 'legal_name', 'CAFETERIA DIECINUEVE SPA', 'activity_start', '2019-03-01'),
  jsonb_build_object('rut', 76086428, 'dv', '5', 'legal_name', 'DUPLICADO EN EL LOTE'),
  jsonb_build_object('rut', 11111111, 'dv', '1', 'legal_name', 'ANTIGUA LIMITADA', 'activity_start', '2001-01-01', 'end_of_business', '2020-06-30'),
  jsonb_build_object('rut', 22222222, 'dv', '9', 'legal_name', 'DV MALO')
), 0, 4) = 2, 'carga 2 filas válidas y sin duplicar dentro del lote');
select pg_temp.check(pg_temp.fails($q$select public.svc_import_public_rows(current_setting('t.tok'), current_setting('t.imp')::uuid, '[]'::jsonb, 0, 4)$q$,
  'ENQ_CARGA_EN_CURSO'), 'un lote repetido (dos ejecuciones a la vez) se rechaza');
select pg_temp.check((public.svc_public_sync_state(current_setting('t.tok')) -> 'razon_social' -> 'activa' ->> 'cursor') = '4', 'el cursor avanza');
select public.svc_finish_public_import(current_setting('t.tok'), current_setting('t.imp')::uuid, 'completada');
reset role;
select pg_temp.check((select published_on = '2026-08-15' and rows_received = 2 from public.public_data_imports where id = current_setting('t.imp')::uuid),
  'fecha de publicación según la fuente');
set local role anon;

select set_config('t.imp2', public.svc_start_public_import(current_setting('t.tok'), 'actividades',
  'https://www.sii.cl/estadisticas/nominas/PUB_NOM_ACTECOS.zip', '2026-08-15 10:00-04', null)::text, true);
select public.svc_import_public_rows(current_setting('t.tok'), current_setting('t.imp2')::uuid,
  '[{"rut":76086428,"code":"561000","description":"ACTIVIDADES DE RESTAURANTES"}]'::jsonb, 0, 1);
select public.svc_finish_public_import(current_setting('t.tok'), current_setting('t.imp2')::uuid, 'completada');

select set_config('t.imp3', public.svc_start_public_import(current_setting('t.tok'), 'empresas',
  'https://www.sii.cl/estadisticas/nominas/PUB_EMPRESAS_PJ_2020_A_2024.zip', '2025-11-15 10:00-03', null)::text, true);
select public.svc_import_public_rows(current_setting('t.tok'), current_setting('t.imp3')::uuid, $j$[
  {"rut":76086428,"year":2023,"sales_tranche":"4","workers":3,"rubro":"ALOJAMIENTO Y SERVICIO DE COMIDAS"},
  {"rut":76086428,"year":2024,"sales_tranche":"5","workers":4,"rubro":"ALOJAMIENTO Y SERVICIO DE COMIDAS","region":"REGION METROPOLITANA"}
]$j$::jsonb, 0, 2);
select public.svc_import_public_rows(current_setting('t.tok'), current_setting('t.imp3')::uuid,
  '[{"rut":76086428,"year":2021,"sales_tranche":"2","workers":1}]'::jsonb, 2, 3);
select public.svc_finish_public_import(current_setting('t.tok'), current_setting('t.imp3')::uuid, 'completada');
reset role;
select pg_temp.check((select commercial_year = 2024 and sales_tranche = '5' and workers = 4 from public.public_company_profiles where rut = 76086428),
  'se conserva el año comercial más reciente');

-- 2) Consulta pública enriquecida
set local role anon;
select set_config('t.r', public.lookup_public_company('76.086.428-5')::text, true);
select pg_temp.check((current_setting('t.r')::jsonb ->> 'estado') = 'encontrada'
  and (current_setting('t.r')::jsonb -> 'perfil' ->> 'tramo_ventas') = '5'
  and jsonb_array_length(current_setting('t.r')::jsonb -> 'fuentes') = 3
  and jsonb_array_length(current_setting('t.r')::jsonb -> 'senales') = 0, 'perfil completo sin señales');
select set_config('t.r', public.lookup_public_company('11.111.111-1')::text, true);
select pg_temp.check(exists (select 1 from jsonb_array_elements(current_setting('t.r')::jsonb -> 'senales') s where s ->> 'codigo' = 'termino_giro'),
  'señal de término de giro');
select pg_temp.check((public.lookup_public_company('12.345.678-5') ->> 'estado') = 'no_encontrada', 'RUT sin registro');
reset role;

-- 3) Hoja de vida tributaria
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000019a1', 'ana19@prueba-enqora.cl',  'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000019b1', 'otro19@prueba-enqora.cl', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000019f1', 'dir19@prueba-enqora.cl',  'authenticated', 'authenticated');
insert into public.staff_members (user_id, role) values ('00000000-0000-4000-8000-0000000019f1', 'ops_director')
on conflict (user_id) do update set role = excluded.role, active = true;

set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000019a1');
select set_config('t.emp', public.create_company('76.086.428-5', 'Cafetería Diecinueve SpA')::text, true);
select pg_temp.check((public.company_public_profile(current_setting('t.emp')::uuid) ->> 'razon_social') = 'CAFETERIA DIECINUEVE SPA',
  'la empresa ve su perfil público');
select pg_temp.as_user('00000000-0000-4000-8000-0000000019b1');
select pg_temp.check(pg_temp.fails($q$select public.company_public_profile(current_setting('t.emp')::uuid)$q$, 'ENQ_SIN_PERMISO'), 'otra persona no');

select pg_temp.as_user('00000000-0000-4000-8000-0000000019a1');
select pg_temp.check(pg_temp.fails($q$select public.register_tax_record(current_setting('t.emp')::uuid, current_setting('t.emp') || '/no-existe.pdf', 'x.pdf')$q$,
  'ENQ_ARCHIVO_NO_SUBIDO'), 'exige el archivo subido');
insert into storage.objects (bucket_id, name) values ('carpetas', current_setting('t.emp') || '/cte.pdf');
select pg_temp.as_user('00000000-0000-4000-8000-0000000019b1');
select pg_temp.check(pg_temp.fails($q$insert into storage.objects (bucket_id, name) values ('carpetas', current_setting('t.emp') || '/intruso.pdf')$q$,
  'row-level security'), 'otra persona no sube carpetas a esta empresa');
select pg_temp.check(pg_temp.fails($q$select public.register_tax_record(current_setting('t.emp')::uuid, current_setting('t.emp') || '/cte.pdf', 'x.pdf')$q$,
  'ENQ_SIN_PERMISO'), 'otra persona no registra');
select pg_temp.as_user('00000000-0000-4000-8000-0000000019a1');
select set_config('t.rec', public.register_tax_record(current_setting('t.emp')::uuid, current_setting('t.emp') || '/cte.pdf', 'carpeta.pdf')::text, true);

select pg_temp.check(pg_temp.fails($q$select public.svc_save_tax_record('mala', current_setting('t.rec')::uuid, '{}'::jsonb)$q$, 'ENQ_CLAVE_SERVICIO'),
  'el análisis solo lo guarda el servidor');
select public.svc_tax_record_status(current_setting('t.tok'), current_setting('t.rec')::uuid, 'analizando');
select public.svc_save_tax_record(current_setting('t.tok'), current_setting('t.rec')::uuid, $j${
  "rut": "76.086.428-5", "tipo_carpeta": "Personalizada", "emitida": "2026-10-20", "vigente_hasta": "2027-01-18",
  "resumen": {"f29": [{"periodo": "2026-08", "estado": "sin_declaracion"}]},
  "hallazgos": [{"codigo": "f29_sin_declarar", "gravedad": "alta", "titulo": "F29 sin declarar", "servicio": "contabilidad"}]
}$j$::jsonb);
select pg_temp.check((select status = 'lista' and rut_matches and valid_until = '2027-01-18' from public.tax_records where id = current_setting('t.rec')::uuid),
  'análisis guardado y RUT verificado');
select pg_temp.check((select count(*) from public.tax_records) = 1, 'el dueño ve su hoja de vida');
select pg_temp.as_user('00000000-0000-4000-8000-0000000019b1');
select pg_temp.check((select count(*) from public.tax_records) = 0, 'aislamiento entre empresas');

select pg_temp.as_user('00000000-0000-4000-8000-0000000019a1');
select pg_temp.check(pg_temp.fails($q$select public.review_tax_record(current_setting('t.rec')::uuid, 'Revisado por el cliente mismo')$q$,
  'ENQ_SIN_PERMISO'), 'el cliente no marca su propia revisión');
select pg_temp.as_user('00000000-0000-4000-8000-0000000019f1');
select public.review_tax_record(current_setting('t.rec')::uuid, 'Revisado: el F29 de agosto debe regularizarse.');
reset role;
select pg_temp.check((select count(*) from public.notifications where title = 'Tu hoja de vida tributaria fue revisada'
  and user_id = '00000000-0000-4000-8000-0000000019a1') = 1, 'el cliente recibe el aviso de revisión');

select 'TODAS LAS PRUEBAS OK' as resultado;
rollback;
