-- =====================================================================
-- ENQORA · 0079 · Revisión de marcas parecidas dentro del caso (línea Marcas, BRA)
-- Cuando un cliente pide registrar una marca, el equipo revisa UNA VEZ por caso el índice de marcas INAPI
-- (0077). El resultado queda congelado en el caso, visible solo para el equipo que trabaja el caso, y se anota
-- en la línea de tiempo como nota interna. El cliente no ve esta revisión.
-- Requiere la 0077. Se puede ejecutar más de una vez.
-- =====================================================================

create or replace function private.inapi_buscar(p_q text, p_clases smallint[])
returns table (nombre text, similitud real, clases smallint[], estado text, registro bigint, solicitud bigint, titulares text,
  tipo_signo text, vence date, etiqueta text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform set_config('pg_trgm.similarity_threshold', '0.3', true);
  return query
    select m.nombre, greatest(extensions.similarity(m.nombre_norm, p_q), extensions.word_similarity(p_q, m.nombre_norm))::real,
           m.clases, m.estado, m.registro, m.solicitud, m.titulares, m.tipo_signo, m.vence, m.etiqueta
    from public.inapi_marcas m
    where (m.nombre_norm operator(extensions.%) p_q or m.nombre_norm = p_q or m.nombre_norm like '%' || p_q || '%')
      and (p_clases is null or cardinality(p_clases) = 0 or m.clases && p_clases)
    order by (m.nombre_norm = p_q) desc, extensions.similarity(m.nombre_norm, p_q) desc, 2 desc, m.nombre
    limit 50;
end
$$;

create table if not exists public.caso_marcas (
  case_id uuid primary key references public.cases (id) on delete cascade,
  consulta text not null check (char_length(consulta) between 2 and 120),
  clases smallint[] not null default '{}',
  resultados jsonb not null,
  total int not null,
  indice_marcas int not null,
  hecho_por uuid references auth.users (id) on delete set null,
  hecho_at timestamptz not null default now()
);
alter table public.caso_marcas enable row level security;
revoke all on public.caso_marcas from anon, authenticated;
grant select on public.caso_marcas to authenticated;
drop policy if exists caso_marcas_equipo on public.caso_marcas;
create policy caso_marcas_equipo on public.caso_marcas for select to authenticated
  using (private.is_staff() and private.can_work_case(case_id));

create or replace function private.caso_marcas_inmutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.cases c where c.id = old.case_id) then return old; end if;
  raise exception 'ENQ_NO_SE_BORRA';
end
$$;
drop trigger if exists caso_marcas_inmutable on public.caso_marcas;
create trigger caso_marcas_inmutable before update or delete on public.caso_marcas
  for each row execute function private.caso_marcas_inmutable();

create or replace function public.caso_revisar_marcas(p_case uuid, p_texto text, p_clases smallint[] default null) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_q text := private.inapi_norm(left(p_texto, 120));
  v_res jsonb;
  v_n int;
  v_indice int;
begin
  if not private.is_staff(array['enqora_admin', 'ops_director', 'accountant_pro', 'lawyer_pro']) or not private.can_work_case(p_case) then
    raise exception 'ENQ_SIN_PERMISO';
  end if;
  if char_length(v_q) < 2 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if exists (select 1 from public.caso_marcas where case_id = p_case) then raise exception 'ENQ_MARCAS_YA_REVISADAS'; end if;
  select count(*) into v_indice from public.inapi_marcas;
  if v_indice = 0 then raise exception 'ENQ_INDICE_MARCAS_VACIO'; end if;
  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb), count(*) into v_res, v_n
    from private.inapi_buscar(v_q, case when cardinality(p_clases) > 0 then p_clases end) r;
  insert into public.caso_marcas (case_id, consulta, clases, resultados, total, indice_marcas, hecho_por)
  values (p_case, left(trim(p_texto), 120), coalesce(p_clases, '{}'), v_res, v_n, v_indice, v_uid);
  insert into private.inapi_busquedas (user_id, texto, clases, resultados) values (v_uid, left(p_texto, 120), p_clases, v_n);
  perform private.log_case(p_case, 'nota_interna',
    'Revisión de marcas parecidas en INAPI: ' || v_n || ' resultado(s) para «' || left(trim(p_texto), 120) || '»'
      || case when cardinality(p_clases) > 0 then ' en clases ' || array_to_string(p_clases, ', ') else '' end || '.',
    'interno', jsonb_build_object('total', v_n));
  return v_n;
end
$$;

revoke execute on function private.inapi_buscar(text, smallint[]) from public, anon, authenticated;
revoke execute on function private.caso_marcas_inmutable() from public, anon, authenticated;
revoke execute on function public.caso_revisar_marcas(uuid, text, smallint[]) from public, anon;
grant execute on function public.caso_revisar_marcas(uuid, text, smallint[]) to authenticated;
