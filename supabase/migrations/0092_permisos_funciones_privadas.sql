-- 0092 · Auditoría de seguridad: funciones del esquema private que quedaron ejecutables por PUBLIC (y por tanto
-- por anon) porque se crearon sin revocar el permiso por defecto. anon no tiene acceso al esquema private, así que
-- no eran invocables desde la API; igual se cierra (mínimo privilegio). authenticated y service_role conservan la
-- ejecución, porque las políticas de seguridad por fila y otras funciones las usan con el rol de quien consulta.
-- Las funciones de disparadores (triggers) no se tocan: no se pueden llamar directamente.
-- Idempotente: se puede ejecutar más de una vez.

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as firma
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.prorettype <> 'trigger'::regtype
      and has_function_privilege('anon', p.oid, 'execute')
  loop
    execute format('revoke execute on function %s from public, anon', f.firma);
    execute format('grant execute on function %s to authenticated', f.firma);
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f.firma);
    end if;
  end loop;
end
$$;
