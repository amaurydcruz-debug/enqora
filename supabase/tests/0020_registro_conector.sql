-- =====================================================================
-- ENQORA · Prueba del registro de ejecuciones del conector (0020)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0020_registro_conector.sql.
-- Deshace todo al final (ROLLBACK). Resultado esperado: «TODAS LAS PRUEBAS OK».
-- =====================================================================
begin;
insert into private.service_secrets (id) values (true) on conflict do nothing;
update private.service_secrets set token_hash = encode(sha256(convert_to('clave-de-servicio-de-prueba-0020-xxxxxxxx', 'UTF8')), 'hex') where id;
set local role anon;
select public.svc_log_public_sync('clave-de-servicio-de-prueba-0020-xxxxxxxx', 'manual', 'error', 'razon_social', 0, null, 'El SII respondió 403');
do $$ begin perform public.svc_log_public_sync('mala','manual','error',null,0,null,'x'); raise exception 'debió fallar'; exception when others then if sqlerrm not like '%ENQ_CLAVE_SERVICIO%' then raise; end if; end $$;
reset role;
select case when (select count(*) from public.public_sync_runs where detail like 'El SII%') = 1 then 'TODAS LAS PRUEBAS OK' else 'FALLÓ' end as resultado;
rollback;
