-- =====================================================================
-- ENQORA · 0077 · Marcas INAPI (datos abiertos de datos.gob.cl, licencia CC0)
-- Cada día ENQORA descarga los archivos de marcas que INAPI publica y guarda solo las marcas que pueden
-- impedir un registro nuevo: registradas vigentes (o dentro del período de renovación) y solicitudes en trámite.
-- Las denegadas, abandonadas, caducadas o vencidas se eliminan del índice cuando INAPI las informa así.
-- El cliente busca marcas parecidas a la suya (orientación; la decisión de presentar la revisa una persona).
-- Requiere la extensión pg_trgm (Supabase → Database → Extensions; esta migración intenta activarla).
-- Se puede ejecutar más de una vez.
-- =====================================================================

create extension if not exists pg_trgm with schema extensions;

create table if not exists public.inapi_marcas (
  clave text primary key,                        -- tipo-secuencia-serie-número de solicitud (ej.: M-A-1-1653980)
  solicitud bigint not null,
  registro bigint,
  nombre text not null check (char_length(nombre) between 1 and 300),
  nombre_norm text not null,
  clases smallint[] not null default '{}',
  titulares text,
  tipo_signo text,
  subtipo text,
  estado text not null,
  presentada date,
  registrada date,
  vence date,
  etiqueta text check (etiqueta is null or etiqueta ~ '^https://[a-z0-9.-]*inapi\.cl/'),
  actualizado_inapi date,
  cargado timestamptz not null default now()
);
create index if not exists inapi_marcas_trgm on public.inapi_marcas using gin (nombre_norm extensions.gin_trgm_ops);
create index if not exists inapi_marcas_clases on public.inapi_marcas using gin (clases);
alter table public.inapi_marcas enable row level security;
revoke all on public.inapi_marcas from anon, authenticated;

create table if not exists private.inapi_cargas (
  recurso text primary key,
  conjunto text not null,
  nombre text,
  url text not null,
  modificado text,
  cursor_filas int not null default 0,
  filas int not null default 0,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_curso', 'completada', 'error')),
  detalle text,
  actualizado timestamptz not null default now()
);

create table if not exists private.inapi_busquedas (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  texto text not null,
  clases smallint[],
  resultados int not null,
  creado timestamptz not null default now()
);
create index if not exists inapi_busquedas_idx on private.inapi_busquedas (user_id, creado desc);

-- ---------- Funciones del cargador (clave de servicio) ----------
create or replace function public.svc_inapi_recurso(p_token text, p_recurso text, p_conjunto text, p_url text, p_nombre text, p_modificado text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  insert into private.inapi_cargas (recurso, conjunto, url, nombre, modificado)
  values (left(p_recurso, 80), left(p_conjunto, 80), left(p_url, 500), left(p_nombre, 120), left(p_modificado, 40))
  on conflict (recurso) do update set url = excluded.url, nombre = excluded.nombre, conjunto = excluded.conjunto,
    modificado = excluded.modificado,
    -- Si INAPI publicó una versión nueva del archivo, se vuelve a cargar desde el comienzo.
    estado = case when private.inapi_cargas.modificado is distinct from excluded.modificado then 'pendiente' else private.inapi_cargas.estado end,
    cursor_filas = case when private.inapi_cargas.modificado is distinct from excluded.modificado then 0 else private.inapi_cargas.cursor_filas end,
    actualizado = now();
end
$$;

create or replace function public.svc_inapi_estado(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  return coalesce((select jsonb_agg(to_jsonb(c) order by c.nombre desc) from private.inapi_cargas c), '[]'::jsonb);
end
$$;

-- Guarda un lote: las filas vigentes se insertan o actualizan (sin retroceder a una versión más antigua);
-- las que ya no son vigentes se eliminan del índice.
create or replace function public.svc_inapi_lote(p_token text, p_recurso text, p_filas jsonb, p_cursor int, p_estado text, p_detalle text)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  n int := 0;
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  if coalesce(jsonb_typeof(p_filas), '') <> 'array' or jsonb_array_length(p_filas) > 2000 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  with f as (
    select x ->> 'clave' as clave, (x ->> 'solicitud')::bigint as solicitud, nullif(x ->> 'registro', '')::bigint as registro,
           left(x ->> 'nombre', 300) as nombre, left(x ->> 'nombre_norm', 300) as nombre_norm,
           coalesce(array(select (e)::smallint from jsonb_array_elements_text(x -> 'clases') e where e ~ '^\d{1,2}$'), '{}') as clases,
           left(x ->> 'titulares', 500) as titulares, left(x ->> 'tipo_signo', 60) as tipo_signo, left(x ->> 'subtipo', 120) as subtipo,
           left(x ->> 'estado', 80) as estado, nullif(x ->> 'presentada', '')::date as presentada, nullif(x ->> 'registrada', '')::date as registrada,
           nullif(x ->> 'vence', '')::date as vence, nullif(x ->> 'etiqueta', '') as etiqueta, nullif(x ->> 'actualizado', '')::date as actualizado,
           coalesce((x ->> 'vigente')::boolean, false) as vigente
    from jsonb_array_elements(p_filas) x
    where x ->> 'clave' ~ '^[A-Z]{1,3}-[A-Z]{1,3}-\d{1,3}-\d{1,12}$'
  ), borrar as (
    delete from public.inapi_marcas m using f
    where m.clave = f.clave and not f.vigente and (m.actualizado_inapi is null or f.actualizado is null or f.actualizado >= m.actualizado_inapi)
    returning 1
  ), poner as (
    insert into public.inapi_marcas as m (clave, solicitud, registro, nombre, nombre_norm, clases, titulares, tipo_signo, subtipo, estado,
      presentada, registrada, vence, etiqueta, actualizado_inapi)
    select distinct on (clave) clave, solicitud, registro, nombre, nombre_norm, clases, titulares, tipo_signo, subtipo, estado,
      presentada, registrada, vence, case when etiqueta ~ '^https://[a-z0-9.-]*inapi\.cl/' then etiqueta end, actualizado
    from f where vigente and char_length(coalesce(nombre, '')) > 0
    order by clave, actualizado desc nulls last
    on conflict (clave) do update set solicitud = excluded.solicitud, registro = excluded.registro, nombre = excluded.nombre,
      nombre_norm = excluded.nombre_norm, clases = excluded.clases, titulares = excluded.titulares, tipo_signo = excluded.tipo_signo,
      subtipo = excluded.subtipo, estado = excluded.estado, presentada = excluded.presentada, registrada = excluded.registrada,
      vence = excluded.vence, etiqueta = excluded.etiqueta, actualizado_inapi = excluded.actualizado_inapi, cargado = now()
    where m.actualizado_inapi is null or excluded.actualizado_inapi is null or excluded.actualizado_inapi >= m.actualizado_inapi
    returning 1
  )
  select (select count(*) from poner) into n;
  update private.inapi_cargas set cursor_filas = greatest(0, p_cursor), filas = case when p_estado = 'completada' then greatest(p_cursor, filas) else filas end,
    estado = case when p_estado in ('en_curso', 'completada', 'error') then p_estado else estado end,
    detalle = left(p_detalle, 600), actualizado = now()
  where recurso = p_recurso;
  return n;
exception
  when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then
    raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

-- ---------- Búsqueda para clientes ----------
create or replace function private.inapi_norm(p text) returns text
language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(translate(lower(coalesce(p, '')), 'áéíóúüñàèìòùâêîôûäëïöç', 'aeiouunaeiouaeiouaeioc'), '[^a-z0-9]+', ' ', 'g'))
$$;

create or replace function public.buscar_marcas(p_texto text, p_clases smallint[] default null)
returns table (nombre text, similitud real, clases smallint[], estado text, registro bigint, solicitud bigint, titulares text,
  tipo_signo text, vence date, etiqueta text)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_q text := private.inapi_norm(left(p_texto, 120));
  n int;
begin
  if char_length(v_q) < 2 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if (select count(*) from private.inapi_busquedas b where b.user_id = v_uid and b.creado > now() - interval '1 hour') >= 60 then
    raise exception 'ENQ_DEMASIADAS_BUSQUEDAS';
  end if;
  perform set_config('pg_trgm.similarity_threshold', '0.3', true);
  return query
    select m.nombre, greatest(extensions.similarity(m.nombre_norm, v_q), extensions.word_similarity(v_q, m.nombre_norm))::real as similitud,
           m.clases, m.estado, m.registro, m.solicitud, m.titulares, m.tipo_signo, m.vence, m.etiqueta
    from public.inapi_marcas m
    where (m.nombre_norm operator(extensions.%) v_q or m.nombre_norm = v_q or m.nombre_norm like '%' || v_q || '%')
      and (p_clases is null or cardinality(p_clases) = 0 or m.clases && p_clases)
    order by (m.nombre_norm = v_q) desc, extensions.similarity(m.nombre_norm, v_q) desc, 2 desc, m.nombre
    limit 50;
  get diagnostics n = row_count;
  insert into private.inapi_busquedas (user_id, texto, clases, resultados) values (v_uid, left(p_texto, 120), p_clases, n);
end
$$;

-- Resumen para el equipo (Mando).
create or replace function public.inapi_resumen() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_staff(array['enqora_admin', 'ops_director', 'lawyer_pro']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  return jsonb_build_object(
    'marcas', (select count(*) from public.inapi_marcas),
    'ultima_carga', (select max(cargado) from public.inapi_marcas),
    'por_estado', coalesce((select jsonb_object_agg(estado, n) from (select estado, count(*) n from public.inapi_marcas group by estado) e), '{}'::jsonb),
    'cargas', coalesce((select jsonb_agg(jsonb_build_object('nombre', c.nombre, 'conjunto', c.conjunto, 'estado', c.estado, 'filas', c.filas,
        'cursor', c.cursor_filas, 'detalle', c.detalle, 'actualizado', c.actualizado) order by c.nombre desc) from private.inapi_cargas c), '[]'::jsonb),
    'busquedas_7d', (select count(*) from private.inapi_busquedas where creado > now() - interval '7 days'));
end
$$;

revoke all on private.inapi_cargas, private.inapi_busquedas from public, anon, authenticated;
revoke execute on function private.inapi_norm(text) from public, anon, authenticated;
revoke execute on function public.svc_inapi_recurso(text, text, text, text, text, text) from public, authenticated;
revoke execute on function public.svc_inapi_estado(text) from public, authenticated;
revoke execute on function public.svc_inapi_lote(text, text, jsonb, int, text, text) from public, authenticated;
grant execute on function public.svc_inapi_recurso(text, text, text, text, text, text) to anon;
grant execute on function public.svc_inapi_estado(text) to anon;
grant execute on function public.svc_inapi_lote(text, text, jsonb, int, text, text) to anon;
revoke execute on function public.buscar_marcas(text, smallint[]) from public, anon;
grant execute on function public.buscar_marcas(text, smallint[]) to authenticated;
revoke execute on function public.inapi_resumen() from public, anon;
grant execute on function public.inapi_resumen() to authenticated;
