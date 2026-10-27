-- =====================================================================
-- ENQORA · Registro de ejecuciones del conector con el SII
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0019_hoja_de_vida.sql.
-- Cada ejecución (automática o «Sincronizar ahora») deja su resultado, también cuando falla
-- antes de empezar una carga (por ejemplo, si el SII rechaza la descarga). Así siempre se ve el motivo.
-- =====================================================================

create table if not exists public.public_sync_runs (
  id bigserial primary key,
  ran_at timestamptz not null default now(),
  origin text not null default 'automatica' check (origin in ('automatica', 'manual')),
  result text not null check (result in ('al_dia', 'continua', 'completada', 'ocupado', 'error')),
  dataset text check (dataset in ('razon_social', 'actividades', 'empresas')),
  rows_loaded integer not null default 0 check (rows_loaded >= 0),
  cursor_line bigint,
  detail text check (char_length(detail) <= 500)
);
create index if not exists public_sync_runs_ran_idx on public.public_sync_runs (ran_at desc);

alter table public.public_sync_runs enable row level security;
revoke all on public.public_sync_runs from anon, authenticated;
revoke all on sequence public.public_sync_runs_id_seq from anon, authenticated;
grant select on public.public_sync_runs to authenticated;
drop policy if exists mfa_requerido on public.public_sync_runs;
drop policy if exists ejecuciones_equipo on public.public_sync_runs;
create policy mfa_requerido on public.public_sync_runs as restrictive for all to authenticated
  using (private.is_mfa()) with check (private.is_mfa());
create policy ejecuciones_equipo on public.public_sync_runs for select to authenticated using (private.is_staff());

create or replace function public.svc_log_public_sync(
  p_token text, p_origin text, p_result text, p_dataset text, p_rows integer, p_cursor bigint, p_detail text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  insert into public.public_sync_runs (origin, result, dataset, rows_loaded, cursor_line, detail)
  values (case when p_origin = 'manual' then 'manual' else 'automatica' end, p_result,
          case when p_dataset in ('razon_social', 'actividades', 'empresas') then p_dataset end,
          greatest(coalesce(p_rows, 0), 0), p_cursor, left(nullif(trim(coalesce(p_detail, '')), ''), 500));
  -- Se conservan las 200 más recientes.
  delete from public.public_sync_runs where id < (select min(id) from (select id from public.public_sync_runs order by id desc limit 200) r);
exception
  when check_violation then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

revoke execute on function public.svc_log_public_sync(text, text, text, text, integer, bigint, text) from public, anon;
grant execute on function public.svc_log_public_sync(text, text, text, text, integer, bigint, text) to anon, authenticated;

-- Reversión: drop function if exists public.svc_log_public_sync; drop table if exists public.public_sync_runs;
