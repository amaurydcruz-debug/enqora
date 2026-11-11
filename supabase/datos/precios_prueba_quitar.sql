-- =====================================================================
-- ENQORA · Quitar los precios de PRUEBA
-- Retira todas las tarifas de prueba vigentes. Esos servicios quedan sin precio hasta que ENQORA
-- publique su tarifa real. Las cotizaciones ya emitidas no cambian.
-- Ejecutar antes de atender clientes reales.
-- =====================================================================
update public.service_tariffs set status = 'retirada', retired_at = now()
where status = 'vigente' and notes like '[PRUEBA]%';

select count(*) as tarifas_de_prueba_vigentes
from public.service_tariffs where status = 'vigente' and notes like '[PRUEBA]%';
