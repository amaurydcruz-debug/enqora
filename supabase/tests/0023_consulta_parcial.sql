-- ENQORA · Prueba de la consulta durante la primera carga (0023). Ejecutar DESPUÉS de 0023_consulta_parcial.sql.
-- Deshace todo al final (ROLLBACK). Resultado esperado: «TODAS LAS PRUEBAS OK».
begin;
update public.public_data_imports set status = 'cancelada' where status in ('en_curso', 'completada');
insert into public.public_data_imports (id, dataset, source_url, published_on, mode, status, rows_received)
values ('00000000-0000-4000-8000-000000002301', 'razon_social', 'https://www.sii.cl/x.zip', current_date, 'automatica', 'en_curso', 1);
insert into public.public_companies (rut, dv, legal_name) values (76086428, '5', 'PARCIAL SPA')
on conflict (rut) do update set legal_name = 'PARCIAL SPA';
select case
  when private.public_profile(76086428) ->> 'estado' = 'encontrada'
   and (private.public_profile(76086428) ->> 'carga_parcial')::boolean
   and private.public_profile(11111111) ->> 'estado' = 'sin_datos'
  then 'TODAS LAS PRUEBAS OK' else 'FALLÓ: la consulta parcial no responde como se espera' end as resultado;
rollback;
