-- =====================================================================
-- ENQORA · Prueba de fuentes oficiales (0028)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0028_fuentes_oficiales.sql.
-- Deshace todo al final (ROLLBACK). Resultado esperado: «TODAS LAS PRUEBAS OK».
-- =====================================================================
begin;
create function pg_temp.check(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLÓ: %', msg; end if;
end $$;

-- Clave de servicio de prueba
select set_config('enqora.test_token', 'prueba-0028-clave-de-servicio-' || gen_random_uuid(), true);
update private.service_secrets set token_hash = encode(sha256(convert_to(current_setting('enqora.test_token'), 'UTF8')), 'hex') where id;

select public.svc_res_recurso(current_setting('enqora.test_token'), 'res-2024', 'https://datos.gob.cl/x.csv', 'Constituciones 2024', 'v1');
select pg_temp.check(public.svc_res_lote(current_setting('enqora.test_token'), 'res-2024',
  '[{"rut":"76086428-5","razon_social":"PRUEBA SPA","fecha":"2024-05-02","actuacion":"Constitución","tipo_social":"SpA","capital":1000000,"comuna":"Santiago","region":"RM"},
    {"rut":"no-es-rut","razon_social":"X"}]'::jsonb, 1200, 'en_curso', null) = 1, 'carga solo filas con RUT válido');
select pg_temp.check((public.res_registro('76086428-5') -> 'actuaciones' -> 0 ->> 'tipo_social') = 'SpA', 'la consulta pública lee la constitución');
select pg_temp.check((public.res_registro('76086428-5') ->> 'cargado')::boolean = false, 'sin archivos completos: no se afirma ausencia');
select pg_temp.check((select cursor_bytes = 1200 and filas = 1 from private.res_cargas where recurso = 'res-2024'), 'avance registrado');
select public.svc_res_recurso(current_setting('enqora.test_token'), 'res-2024', 'https://datos.gob.cl/x.csv', 'Constituciones 2024', 'v2');
select pg_temp.check((select cursor_bytes = 0 and estado = 'pendiente' from private.res_cargas where recurso = 'res-2024'), 'archivo nuevo: se recarga desde el inicio');
do $$ begin
  perform public.svc_res_estado('clave-falsa');
  raise exception 'FALLÓ: aceptó una clave falsa';
exception when others then if sqlerrm not like '%ENQ_CLAVE_SERVICIO%' then raise; end if;
end $$;
select pg_temp.check((select 'image/jpeg' = any(allowed_mime_types) from storage.buckets where id = 'cora-evidencias'), 'capturas JPG permitidas');

select 'TODAS LAS PRUEBAS OK' as resultado;
rollback;
