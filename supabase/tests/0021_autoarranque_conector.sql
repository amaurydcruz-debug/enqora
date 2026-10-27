-- =====================================================================
-- ENQORA · Prueba del arranque automático del conector (0021)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0021_autoarranque_conector.sql.
-- Deshace todo al final (ROLLBACK). Resultado esperado: «TODAS LAS PRUEBAS OK».
-- =====================================================================
begin;
insert into private.service_secrets (id) values (true) on conflict do nothing;
update private.service_secrets set token_hash = encode(sha256(convert_to('clave-de-servicio-de-prueba-0021-xxxxxxxx', 'UTF8')), 'hex') where id;
update private.sync_trigger set last_at = '-infinity';
set local role anon;
create temp table r as select
  public.svc_claim_sync_trigger('clave-de-servicio-de-prueba-0021-xxxxxxxx', 10) as primera,
  public.svc_claim_sync_trigger('clave-de-servicio-de-prueba-0021-xxxxxxxx', 10) as segunda;
reset role;
select case when (select primera and not segunda from r) then 'TODAS LAS PRUEBAS OK' else 'FALLÓ: la ventana de 10 minutos no funciona' end as resultado;
rollback;
