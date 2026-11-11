-- =====================================================================
-- ENQORA · Precios de PRUEBA (provisionales) para probar la secuencia completa
-- Requiere haber ejecutado antes 0038_precios_prueba.sql.
-- - Crea una tarifa de prueba de $10.000 por unidad (mín. $10.000, máx. $30.000) en cada servicio
--   que hoy NO tiene tarifa vigente. No toca las tarifas reales.
-- - El monto es un valor de prueba, igual para todos: NO es un precio definido ni una sugerencia de mercado.
-- - No se muestra en la portada ni en la consulta por RUT; sí permite cotizar dentro de la plataforma.
-- - No activa servicios: los servicios inactivos siguen sin poder cotizarse.
-- Para quitarlos: pegar_en_supabase_precios_prueba_quitar.sql
-- =====================================================================
insert into public.service_tariffs (service_id, version, status, base_price, min_price, max_price, notes, published_at)
select s.id,
       coalesce((select max(t.version) from public.service_tariffs t where t.service_id = s.id), 0) + 1,
       'vigente', 10000, 10000, 30000,
       '[PRUEBA] Precio provisional para probar la secuencia. No es un precio definido por ENQORA.', now()
from public.services s
where not exists (select 1 from public.service_tariffs t where t.service_id = s.id and t.status = 'vigente');

-- Resultado: servicios con tarifa de prueba
select s.code, s.name, s.active as activo, t.base_price as precio_prueba
from public.service_tariffs t join public.services s on s.id = t.service_id
where t.status = 'vigente' and t.notes like '[PRUEBA]%'
order by s.code;
