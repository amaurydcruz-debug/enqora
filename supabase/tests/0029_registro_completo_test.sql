-- =====================================================================
-- ENQORA · Prueba de 0029 (Registro completo)
-- Ejecutar DESPUÉS de 0029_registro_completo.sql. Deshace todo al final (ROLLBACK).
-- Resultado esperado: «TODAS LAS PRUEBAS OK».
-- =====================================================================
begin;
create function pg_temp.check(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLÓ: %', msg; end if;
end $$;

insert into private.res_cargas (recurso, url, nombre, estado) values ('prueba-0029-a', 'https://datos.gob.cl/a.csv', 'Prueba A', 'completada')
on conflict (recurso) do update set estado = 'completada';
update private.res_cargas set estado = 'completada';
select pg_temp.check((public.res_registro('76086428-5') ->> 'completo')::boolean = true, 'todos los archivos completos: completo');

insert into private.res_cargas (recurso, url, nombre, estado) values ('prueba-0029-b', 'https://datos.gob.cl/b.csv', 'Prueba B', 'en_curso');
select pg_temp.check((public.res_registro('76086428-5') ->> 'completo')::boolean = false, 'un archivo en curso: no completo');
select pg_temp.check((public.res_registro('76086428-5') ->> 'cargado')::boolean = true, 'sigue habiendo archivos cargados');

select 'TODAS LAS PRUEBAS OK' as resultado;
rollback;
