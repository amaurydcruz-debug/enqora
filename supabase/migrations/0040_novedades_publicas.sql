-- =====================================================================
-- ENQORA · 0040 · Novedades normativas verificadas en la consulta pública
-- El agente de Vigilancia normativa muestra, en la consulta por RUT, las novedades que el equipo ENQORA ya
-- verificó y marcó como visibles para clientes (las mismas que ve un cliente con cuenta). Solo datos
-- normativos públicos: título, resumen, organismo, fuente y fecha. Máximo 5, filtradas por institución.
-- Se puede ejecutar más de una vez.
-- =====================================================================
create or replace function public.public_regulatory_news(p_institutions text[] default null)
returns table (title text, summary text, institution text, source_url text, published_on date, reviewed_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select u.title, u.summary, u.institution, u.source_url, u.published_on, u.reviewed_at
  from public.regulatory_updates u
  where u.status in ('verificada', 'aplicada') and u.client_visible
    and (p_institutions is null or exists (
      select 1 from unnest(p_institutions) i where coalesce(u.institution, '') ilike '%' || i || '%'))
  order by coalesce(u.published_on, u.reviewed_at::date) desc nulls last
  limit 5
$$;
revoke execute on function public.public_regulatory_news(text[]) from public;
grant execute on function public.public_regulatory_news(text[]) to anon, authenticated;
