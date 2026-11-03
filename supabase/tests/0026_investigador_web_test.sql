-- =====================================================================
-- ENQORA · Prueba del investigador web (0026)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0026_investigador_web.sql.
-- Deshace todo al final (ROLLBACK). Resultado esperado: «TODAS LAS PRUEBAS OK».
-- =====================================================================
begin;
create function pg_temp.check(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLÓ: %', msg; end if;
end $$;

select pg_temp.check((select count(*) = 2 from information_schema.tables where table_schema = 'public' and table_name in ('research_runs', 'research_evidence')), 'tablas creadas');
select pg_temp.check((select public = false from storage.buckets where id = 'cora-evidencias'), 'bucket privado');
select pg_temp.check((select relrowsecurity from pg_class where oid = 'public.research_runs'::regclass), 'RLS en investigaciones');
select pg_temp.check((select relrowsecurity from pg_class where oid = 'public.research_evidence'::regclass), 'RLS en evidencias');
select pg_temp.check(not has_table_privilege('anon', 'public.research_runs', 'select'), 'visitantes sin acceso');

insert into public.research_runs (id, rut, razon_social, modo, status) values ('00000000-0000-4000-8000-0000000026a1', '76086428-5', 'Prueba SpA', 'investigacion', 'en_curso');
insert into public.research_evidence (run_id, portal, procedure_version, query, url, status, result)
values ('00000000-0000-4000-8000-0000000026a1', 'inapi', 'inapi-1', '{"titular":"Prueba SpA"}', 'https://buscadormarcas.inapi.cl/Marca/BuscarMarca.aspx', 'sin_resultados', '{}');
select pg_temp.check((select count(*) = 1 from public.research_evidence where run_id = '00000000-0000-4000-8000-0000000026a1'), 'evidencia registrada');

-- Estado no válido: rechazado
do $$ begin
  insert into public.research_evidence (run_id, portal, procedure_version, query, url, status)
  values ('00000000-0000-4000-8000-0000000026a1', 'inapi', 'x', '{}', 'https://x', 'inventado');
  raise exception 'FALLÓ: aceptó un estado inválido';
exception when check_violation then null;
end $$;

select 'TODAS LAS PRUEBAS OK' as resultado;
rollback;
