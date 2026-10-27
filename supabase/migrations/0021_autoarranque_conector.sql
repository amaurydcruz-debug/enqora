-- =====================================================================
-- ENQORA · Arranque automático del conector desde la consulta por RUT
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0020_registro_conector.sql.
-- Si alguien consulta un RUT y aún no hay datos del SII, la propia consulta pone en marcha
-- el conector (como máximo una vez cada 10 minutos). Nadie tiene que pulsar nada.
-- =====================================================================

create table if not exists private.sync_trigger (
  id boolean primary key default true check (id),
  last_at timestamptz not null default '-infinity'
);
insert into private.sync_trigger (id) values (true) on conflict do nothing;

-- Devuelve true solo a la primera llamada dentro de la ventana: evita arrancar el conector muchas veces.
create or replace function public.svc_claim_sync_trigger(p_token text, p_minutes integer default 10) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  update private.sync_trigger set last_at = now()
  where id and last_at < now() - make_interval(mins => greatest(coalesce(p_minutes, 10), 1));
  return found;
end
$$;

revoke execute on function public.svc_claim_sync_trigger(text, integer) from public, anon;
grant execute on function public.svc_claim_sync_trigger(text, integer) to anon, authenticated;

-- Reversión: drop function if exists public.svc_claim_sync_trigger; drop table if exists private.sync_trigger;
