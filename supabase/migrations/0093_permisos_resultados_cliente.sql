-- 0093 · Auditoría de seguridad: case_ratings y case_savings (0033) se crearon sin revocar los permisos que Supabase
-- da por defecto a toda tabla nueva de public (anon y authenticated con todos los privilegios). La seguridad por fila
-- ya impedía leer o escribir (solo hay política de lectura para authenticated), pero se deja el permiso mínimo:
-- solo lectura para authenticated; las escrituras siguen yendo por las funciones de 0033.

revoke all on public.case_ratings, public.case_savings from anon, authenticated;
grant select on public.case_ratings, public.case_savings to authenticated;
