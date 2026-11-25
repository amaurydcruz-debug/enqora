-- 0097 · Bitácora del computador del enjambre: por cada ejecución de un agente, qué comandos corrió en su
-- contenedor, qué archivos creó o editó, qué páginas oficiales leyó, qué buscó y qué calculó. Solo la ve el
-- equipo que puede trabajar el caso. Es inmutable: se guarda una vez por ejecución y no se edita ni se borra.

create table if not exists public.agente_bitacoras (
  run_id uuid primary key references public.agent_runs (id) on delete cascade,
  case_id uuid not null references public.cases (id) on delete cascade,
  entradas jsonb not null default '[]'::jsonb check (jsonb_typeof(entradas) = 'array' and jsonb_array_length(entradas) <= 100),
  archivos text[] not null default '{}' check (cardinality(archivos) <= 10),
  contenedor text check (contenedor is null or contenedor ~ '^[A-Za-z0-9_-]{6,120}$'),
  creado timestamptz not null default now()
);
create index if not exists agente_bitacoras_case_idx on public.agente_bitacoras (case_id, creado desc);
alter table public.agente_bitacoras enable row level security;
revoke all on public.agente_bitacoras from anon, authenticated;
grant select on public.agente_bitacoras to authenticated;
drop policy if exists agente_bitacoras_equipo on public.agente_bitacoras;
create policy agente_bitacoras_equipo on public.agente_bitacoras for select to authenticated using (private.can_work_case(case_id));

create or replace function public.agente_bitacora_guardar(p_run uuid, p_entradas jsonb, p_archivos text[], p_contenedor text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_case uuid;
begin
  select case_id into v_case from public.agent_runs where id = p_run;
  if v_case is null or not private.can_work_case(v_case) or private.is_staff(array['ai_agent']) then raise exception 'ENQ_SIN_PERMISO' using errcode = '42501'; end if;
  if jsonb_typeof(p_entradas) <> 'array' or jsonb_array_length(p_entradas) > 100 or octet_length(p_entradas::text) > 120000
     or cardinality(coalesce(p_archivos, '{}')) > 10 then
    raise exception 'ENQ_DATOS_INVALIDOS' using errcode = '22023';
  end if;
  insert into public.agente_bitacoras (run_id, case_id, entradas, archivos, contenedor)
  values (p_run, v_case, p_entradas, coalesce(p_archivos, '{}'), nullif(p_contenedor, ''))
  on conflict (run_id) do nothing;
end
$$;
revoke execute on function public.agente_bitacora_guardar(uuid, jsonb, text[], text) from public, anon;
grant execute on function public.agente_bitacora_guardar(uuid, jsonb, text[], text) to authenticated;
