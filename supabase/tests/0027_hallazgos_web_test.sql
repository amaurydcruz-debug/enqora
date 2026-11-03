-- =====================================================================
-- ENQORA · Prueba de hallazgos web (0027)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0027_hallazgos_web.sql.
-- Deshace todo al final (ROLLBACK). Resultado esperado: «TODAS LAS PRUEBAS OK».
-- =====================================================================
begin;
create function pg_temp.check(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLÓ: %', msg; end if;
end $$;

insert into public.research_runs (id, rut, razon_social, modo, status, finished_at)
values ('00000000-0000-4000-8000-0000000027a1', '76086428-5', 'Prueba SpA', 'investigacion', 'completada', now());
insert into public.research_evidence (run_id, portal, procedure_version, query, url, status, result, screenshot_path, detail)
values ('00000000-0000-4000-8000-0000000027a1', 'inapi', 'inapi-1', '{"titular":"Prueba SpA"}', 'https://buscadormarcas.inapi.cl', 'encontrado',
        '{"coincidencias_exactas":1,"tablas":[{"headers":["Marca","Titular"],"rows":[["PRUEBA","Prueba SpA"]]}]}', 'secreto/captura.png', '1 registro');

select pg_temp.check(jsonb_array_length(public.research_public_findings('76086428-5')) = 1, 'devuelve la última investigación completada');
select pg_temp.check((public.research_public_findings('76086428-5') -> 0 ->> 'estado') = 'encontrado', 'incluye el estado');
select pg_temp.check(position('secreto' in public.research_public_findings('76086428-5')::text) = 0, 'no expone la ruta de la captura');
select pg_temp.check(jsonb_array_length(public.research_public_findings('11111111-1')) = 0, 'RUT sin investigación: lista vacía');
select pg_temp.check(has_function_privilege('anon', 'public.research_public_findings(text)', 'execute'), 'la consulta pública puede leerlo');

select 'TODAS LAS PRUEBAS OK' as resultado;
rollback;
