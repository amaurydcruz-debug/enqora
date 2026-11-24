-- 0090 · Buscador legal de ENQORA (etapa 2 de «Modelos libres para integrar»).
--
-- Un índice del conocimiento ya verificado de ENQORA (reglas con fuente y artículo, rutas de casos, obligaciones
-- laborales y publicaciones de ENQORA Informa) para responder con la norma exacta, o decir «no tengo fuente».
-- Búsqueda híbrida: por significado (vectores BGE-M3, MIT, calculados por el servidor) y por palabras
-- (texto completo en español de PostgreSQL), combinadas con fusión de rangos recíprocos (RRF).
-- Sin vectores (si el modelo no está disponible) el buscador sigue funcionando solo por palabras.
-- Los vectores se guardan como real[] para no depender de extensiones; con un corpus de miles de fragmentos
-- el cálculo directo es rápido. Si crece mucho, se migra a pgvector sin cambiar la interfaz.
-- Solo el equipo ENQORA consulta el índice; solo supervisión lo carga. Nada se borra: lo que sale de la
-- fuente queda inactivo.

create table if not exists public.conocimiento_fragmentos (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique check (clave ~ '^[a-z_]+:[A-Za-z0-9_.:-]{1,120}$'),
  origen text not null check (origen in ('regla', 'ruta', 'obligacion_laboral', 'informa')),
  titulo text not null check (char_length(titulo) between 3 and 300),
  articulo text check (char_length(articulo) <= 200),
  fuente text check (char_length(fuente) <= 300),
  url text check (url is null or (url ~ '^https://[^\s]+$' and char_length(url) <= 400)),
  vigencia text check (char_length(vigencia) <= 120),
  verificado date,
  departamento text check (char_length(departamento) <= 40),
  texto text not null check (char_length(texto) between 10 and 6000),
  huella text not null check (huella ~ '^[0-9a-f]{64}$'),
  embedding real[] check (embedding is null or array_length(embedding, 1) between 256 and 4096),
  modelo text check (char_length(modelo) <= 120),
  activo boolean not null default true,
  tsv tsvector generated always as (
    setweight(to_tsvector('spanish', coalesce(titulo, '') || ' ' || coalesce(articulo, '')), 'A') ||
    setweight(to_tsvector('spanish', texto), 'B')
  ) stored,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create index if not exists conocimiento_fragmentos_tsv_idx on public.conocimiento_fragmentos using gin (tsv);
create index if not exists conocimiento_fragmentos_origen_idx on public.conocimiento_fragmentos (origen, activo);

alter table public.conocimiento_fragmentos enable row level security;
revoke all on public.conocimiento_fragmentos from anon, authenticated;
grant select (id, clave, origen, titulo, articulo, fuente, url, vigencia, verificado, departamento, texto, huella, modelo, activo, actualizado)
  on public.conocimiento_fragmentos to authenticated;
drop policy if exists conocimiento_fragmentos_equipo on public.conocimiento_fragmentos;
create policy conocimiento_fragmentos_equipo on public.conocimiento_fragmentos for select to authenticated
  using (private.is_staff());

-- Similitud coseno entre dos vectores del mismo largo.
create or replace function private.coseno(a real[], b real[]) returns double precision
language sql immutable parallel safe set search_path = '' as $$
  select case when array_length(a, 1) is distinct from array_length(b, 1) then null
    else (select sum(x::double precision * y) / nullif(sqrt(sum(x::double precision * x)) * sqrt(sum(y::double precision * y)), 0)
          from unnest(a, b) as t(x, y)) end
$$;
revoke execute on function private.coseno(real[], real[]) from public, anon;

-- Carga (supervisión): inserta o actualiza fragmentos. Si un fragmento no cambió (misma huella) y no trae
-- vector nuevo, no se toca. «p_origenes»: orígenes que se están cargando completos; los fragmentos de esos
-- orígenes que no vienen en la carga quedan inactivos (no se borran).
create or replace function public.conocimiento_cargar(p jsonb, p_origenes text[] default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  f jsonb;
  v_nuevos int := 0;
  v_actualizados int := 0;
  v_iguales int := 0;
  v_inactivos int := 0;
  v_claves text[] := '{}';
  v_emb real[];
  v_prev record;
begin
  if not private.is_supervisor() then raise exception 'ENQ_SIN_PERMISO' using errcode = '42501'; end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 400 then raise exception 'ENQ_DATOS_INVALIDOS' using errcode = '22023'; end if;
  if exists (select 1 from unnest(p_origenes) o where o not in ('regla', 'ruta', 'obligacion_laboral', 'informa')) then
    raise exception 'ENQ_DATOS_INVALIDOS' using errcode = '22023';
  end if;

  for f in select * from jsonb_array_elements(p) loop
    v_emb := case when jsonb_typeof(f -> 'embedding') = 'array'
      then (select array_agg(x::real order by i) from jsonb_array_elements_text(f -> 'embedding') with ordinality as e(x, i)) end;
    v_claves := v_claves || (f ->> 'clave');
    select huella, embedding is not null as tiene, modelo, activo into v_prev from public.conocimiento_fragmentos where clave = f ->> 'clave';
    if not found then
      insert into public.conocimiento_fragmentos (clave, origen, titulo, articulo, fuente, url, vigencia, verificado, departamento, texto, huella, embedding, modelo)
      values (f ->> 'clave', f ->> 'origen', f ->> 'titulo', nullif(f ->> 'articulo', ''), nullif(f ->> 'fuente', ''), nullif(f ->> 'url', ''),
        nullif(f ->> 'vigencia', ''), nullif(f ->> 'verificado', '')::date, nullif(f ->> 'departamento', ''), f ->> 'texto', f ->> 'huella',
        v_emb, case when v_emb is not null then nullif(f ->> 'modelo', '') end);
      v_nuevos := v_nuevos + 1;
    elsif v_prev.huella = f ->> 'huella' and v_emb is null and v_prev.activo then
      v_iguales := v_iguales + 1;
    else
      update public.conocimiento_fragmentos set
        origen = f ->> 'origen', titulo = f ->> 'titulo', articulo = nullif(f ->> 'articulo', ''), fuente = nullif(f ->> 'fuente', ''),
        url = nullif(f ->> 'url', ''), vigencia = nullif(f ->> 'vigencia', ''), verificado = nullif(f ->> 'verificado', '')::date,
        departamento = nullif(f ->> 'departamento', ''), texto = f ->> 'texto', huella = f ->> 'huella', activo = true,
        -- Si el texto cambió y no viene vector nuevo, el vector viejo ya no corresponde: se quita.
        embedding = case when v_emb is not null then v_emb when v_prev.huella = f ->> 'huella' then embedding end,
        modelo = case when v_emb is not null then nullif(f ->> 'modelo', '') when v_prev.huella = f ->> 'huella' then modelo end,
        actualizado = now()
      where clave = f ->> 'clave';
      v_actualizados := v_actualizados + 1;
    end if;
  end loop;

  if cardinality(p_origenes) > 0 then
    update public.conocimiento_fragmentos set activo = false, actualizado = now()
    where origen = any (p_origenes) and activo and not (clave = any (v_claves));
    get diagnostics v_inactivos = row_count;
  end if;

  perform private.log_event(null, 'conocimiento.cargado', array_to_string(p_origenes, ','),
    jsonb_build_object('nuevos', v_nuevos, 'actualizados', v_actualizados, 'iguales', v_iguales, 'inactivos', v_inactivos));
  return jsonb_build_object('nuevos', v_nuevos, 'actualizados', v_actualizados, 'iguales', v_iguales, 'inactivos', v_inactivos);
end
$$;

-- Fragmentos que necesitan vector (para que el servidor los calcule por tandas).
create or replace function public.conocimiento_sin_vector(p_limite int default 40) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not private.is_supervisor() then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object('clave', clave, 'texto', titulo || coalesce(' · ' || articulo, '') || E'\n' || texto) order by clave)
    from (select clave, titulo, articulo, texto from public.conocimiento_fragmentos
          where activo and embedding is null order by clave limit least(greatest(p_limite, 1), 100)) s), '[]'::jsonb) end
$$;

-- Guardar vectores calculados (supervisión). Solo si el texto no cambió desde que se pidió (huella).
create or replace function public.conocimiento_guardar_vectores(p jsonb, p_modelo text) returns int
language plpgsql security definer set search_path = '' as $$
declare
  f jsonb;
  n int := 0;
  k int;
begin
  if not private.is_supervisor() then raise exception 'ENQ_SIN_PERMISO' using errcode = '42501'; end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 100 or char_length(coalesce(p_modelo, '')) not between 3 and 120 then
    raise exception 'ENQ_DATOS_INVALIDOS' using errcode = '22023';
  end if;
  for f in select * from jsonb_array_elements(p) loop
    update public.conocimiento_fragmentos set
      embedding = (select array_agg(x::real order by i) from jsonb_array_elements_text(f -> 'embedding') with ordinality as e(x, i)),
      modelo = p_modelo, actualizado = now()
    where clave = f ->> 'clave' and activo and embedding is null;
    get diagnostics k = row_count;
    n := n + k;
  end loop;
  return n;
end
$$;

-- Búsqueda híbrida (equipo ENQORA). «p_vector»: vector de la pregunta (opcional). Devuelve hasta p_k
-- fragmentos con su fuente, la coincidencia (significado, palabras o ambas) y el puntaje.
create or replace function public.conocimiento_buscar(p_texto text, p_vector real[] default null, p_k int default 8) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_q tsquery;
  v_k int := least(greatest(coalesce(p_k, 8), 1), 20);
  v_res jsonb;
  v_relajada boolean := false;
begin
  if not private.is_staff() then raise exception 'ENQ_SIN_PERMISO' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_texto, ''))) < 3 or char_length(p_texto) > 500 then raise exception 'ENQ_DATOS_INVALIDOS' using errcode = '22023'; end if;
  v_q := websearch_to_tsquery('spanish', p_texto);
  -- Si la búsqueda exige todas las palabras y no encuentra nada, se relaja a cualquiera de ellas.
  if not exists (select 1 from public.conocimiento_fragmentos where activo and tsv @@ v_q) then
    v_relajada := true;
    select to_tsquery('spanish', string_agg(lexema, ' | ')) into v_q
    from (select unnest(tsvector_to_array(to_tsvector('spanish', p_texto))) as lexema) l;
  end if;

  with por_vector as (
    select id, row_number() over (order by sim desc) as r, sim from (
      select id, private.coseno(embedding, p_vector) as sim from public.conocimiento_fragmentos
      where activo and embedding is not null and p_vector is not null and array_length(embedding, 1) = array_length(p_vector, 1)
    ) s where sim is not null order by sim desc limit 40
  ),
  por_texto as (
    select id, row_number() over (order by rk desc) as r, rk from (
      select id, ts_rank_cd(tsv, v_q) as rk from public.conocimiento_fragmentos where activo and v_q is not null and tsv @@ v_q
    ) s order by rk desc limit 40
  ),
  fusion as (
    select coalesce(v.id, t.id) as id,
      coalesce(1.0 / (60 + v.r), 0) + coalesce(1.0 / (60 + t.r), 0) as puntaje,
      v.sim, t.rk,
      case when v.id is not null and t.id is not null then 'ambas' when v.id is not null then 'significado' else 'palabras' end as coincidencia
    from por_vector v full join por_texto t on t.id = v.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'clave', f.clave, 'origen', f.origen, 'titulo', f.titulo, 'articulo', f.articulo, 'fuente', f.fuente, 'url', f.url,
      'vigencia', f.vigencia, 'verificado', f.verificado, 'departamento', f.departamento, 'texto', f.texto,
      'coincidencia', x.coincidencia, 'relajada', v_relajada and x.coincidencia <> 'significado', 'puntaje', round(x.puntaje::numeric, 5), 'similitud', round(x.sim::numeric, 3)
    ) order by x.puntaje desc), '[]'::jsonb)
  into v_res
  from (select * from fusion order by puntaje desc limit v_k) x
  join public.conocimiento_fragmentos f on f.id = x.id;
  return v_res;
end
$$;

-- Estado del índice para el Centro de Mando.
create or replace function public.conocimiento_estado() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not private.is_staff() then '{}'::jsonb else jsonb_build_object(
    'activos', (select count(*) from public.conocimiento_fragmentos where activo),
    'con_vector', (select count(*) from public.conocimiento_fragmentos where activo and embedding is not null),
    'inactivos', (select count(*) from public.conocimiento_fragmentos where not activo),
    'por_origen', coalesce((select jsonb_object_agg(origen, n) from (select origen, count(*) as n from public.conocimiento_fragmentos where activo group by origen) s), '{}'::jsonb),
    'modelos', coalesce((select jsonb_agg(distinct modelo) from public.conocimiento_fragmentos where activo and modelo is not null), '[]'::jsonb),
    'actualizado', (select max(actualizado) from public.conocimiento_fragmentos)
  ) end
$$;

revoke execute on function public.conocimiento_cargar(jsonb, text[]), public.conocimiento_sin_vector(int),
  public.conocimiento_guardar_vectores(jsonb, text), public.conocimiento_buscar(text, real[], int), public.conocimiento_estado() from public, anon;
grant execute on function public.conocimiento_cargar(jsonb, text[]), public.conocimiento_sin_vector(int),
  public.conocimiento_guardar_vectores(jsonb, text), public.conocimiento_buscar(text, real[], int), public.conocimiento_estado() to authenticated;
