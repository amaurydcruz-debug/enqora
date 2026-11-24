-- 0091 · Buscador legal para el servidor: el informe de ingreso lo genera el servidor con su token de servicio
-- (ENQORA_SERVICE_TOKEN), sin sesión de una persona. Misma búsqueda que 0090, con un parámetro opcional p_token.
-- Requiere 0090.

drop function if exists public.conocimiento_buscar(text, real[], int);

-- Búsqueda híbrida (equipo ENQORA, o el servidor con su token de servicio). «p_vector»: vector de la pregunta (opcional). Devuelve hasta p_k
-- fragmentos con su fuente, la coincidencia (significado, palabras o ambas) y el puntaje.
create or replace function public.conocimiento_buscar(p_texto text, p_vector real[] default null, p_k int default 8, p_token text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_q tsquery;
  v_k int := least(greatest(coalesce(p_k, 8), 1), 20);
  v_res jsonb;
  v_relajada boolean := false;
begin
  if not (private.is_staff() or private.check_service_token(p_token)) then raise exception 'ENQ_SIN_PERMISO' using errcode = '42501'; end if;
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

revoke execute on function public.conocimiento_buscar(text, real[], int, text) from public;
grant execute on function public.conocimiento_buscar(text, real[], int, text) to anon, authenticated;
