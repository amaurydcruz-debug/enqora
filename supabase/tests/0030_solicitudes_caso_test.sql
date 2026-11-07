-- =====================================================================
-- ENQORA · Prueba de 0030 («Cuéntanos tu caso»)
-- Ejecutar DESPUÉS de 0030_solicitudes_caso.sql. Deshace todo al final (ROLLBACK).
-- Resultado esperado: «TODAS LAS PRUEBAS OK».
-- =====================================================================
begin;
create function pg_temp.check(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLÓ: %', msg; end if;
end $$;
create function pg_temp.falla(sql text, codigo text) returns boolean language plpgsql as $$
begin
  execute sql; return false;
exception when others then return sqlerrm like '%' || codigo || '%';
end $$;

select set_config('request.headers', '{"x-enqora-client":"prueba-0030"}', true);
set local role anon;
select pg_temp.check(public.crear_solicitud_caso('{"nombre":"Ana Pérez","canal":"whatsapp","contacto":"+56 9 1234 5678","relato":"Tengo la renta atrasada y necesito ayuda.","consentimiento":true,"rut":"77058311-K"}') is not null, 'crea solicitud por WhatsApp');
select pg_temp.check(pg_temp.falla($$select public.crear_solicitud_caso('{"nombre":"Ana","canal":"correo","contacto":"ana@x.cl","relato":"Necesito contabilidad mensual.","consentimiento":false}')$$, 'ENQ_SIN_CONSENTIMIENTO'), 'sin consentimiento se rechaza');
select pg_temp.check(pg_temp.falla($$select public.crear_solicitud_caso('{"nombre":"Ana","canal":"correo","contacto":"no-es-correo","relato":"Necesito contabilidad mensual.","consentimiento":true}')$$, 'ENQ_CONTACTO_INVALIDO'), 'correo inválido se rechaza');
select pg_temp.check(pg_temp.falla($$select public.solicitudes_caso_listar(null)$$, 'ENQ_SIN_PERMISO'), 'un visitante no ve la bandeja');
select public.crear_solicitud_caso('{"nombre":"Ana","canal":"correo","contacto":"ana@x.cl","relato":"Caso número dos de prueba.","consentimiento":true}');
select public.crear_solicitud_caso('{"nombre":"Ana","canal":"correo","contacto":"ana@x.cl","relato":"Caso número tres de prueba.","consentimiento":true}');
select public.crear_solicitud_caso('{"nombre":"Ana","canal":"correo","contacto":"ana@x.cl","relato":"Caso número cuatro de prueba.","consentimiento":true}');
select public.crear_solicitud_caso('{"nombre":"Ana","canal":"correo","contacto":"ana@x.cl","relato":"Caso número cinco de prueba.","consentimiento":true}');
select pg_temp.check(pg_temp.falla($$select public.crear_solicitud_caso('{"nombre":"Ana","canal":"correo","contacto":"ana@x.cl","relato":"Caso número seis de prueba.","consentimiento":true}')$$, 'ENQ_DEMASIADAS_CONSULTAS'), 'límite de 5 por hora');
reset role;
select pg_temp.check((select count(*) from private.solicitudes_caso where client = md5('enqora-caso:prueba-0030')) = 5, 'quedan 5 solicitudes guardadas');

select 'TODAS LAS PRUEBAS OK' as resultado;
rollback;
