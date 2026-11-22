-- =====================================================================
-- ENQORA · 0078 · Búsqueda de marcas INAPI solo para el equipo ENQORA
-- Decisión del dueño: el índice de marcas es una herramienta interna de ENQORA (Centro de Mando). Los clientes
-- no lo consultan; quien quiera revisar o registrar su marca va al buscador oficial de INAPI.
-- Requiere la 0077. Se puede ejecutar más de una vez.
-- =====================================================================

create or replace function public.buscar_marcas(p_texto text, p_clases smallint[] default null)
returns table (nombre text, similitud real, clases smallint[], estado text, registro bigint, solicitud bigint, titulares text,
  tipo_signo text, vence date, etiqueta text)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_q text := private.inapi_norm(left(p_texto, 120));
  n int;
begin
  if not private.is_staff(array['enqora_admin', 'ops_director', 'accountant_pro', 'lawyer_pro']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if char_length(v_q) < 2 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if (select count(*) from private.inapi_busquedas b where b.user_id = v_uid and b.creado > now() - interval '1 hour') >= 300 then
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
revoke execute on function public.buscar_marcas(text, smallint[]) from public, anon;
grant execute on function public.buscar_marcas(text, smallint[]) to authenticated;
