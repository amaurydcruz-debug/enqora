-- =====================================================================
-- ENQORA · Fuentes oficiales para CORA (vía legal, sin CAPTCHA)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0027_hallazgos_web.sql.
--
-- 1. Registro de Empresas y Sociedades por DATOS ABIERTOS (datos.gob.cl): tablas privadas con las
--    actuaciones publicadas (constitución, modificación, disolución…) y el avance de cada archivo.
--    Las carga el conector del servidor con la clave de servicio, como las nóminas del SII.
-- 2. Búsqueda asistida (INAPI u otro portal con CAPTCHA): el equipo registra el resultado y su captura
--    (PNG o JPG). Los hallazgos públicos toman la evidencia MÁS RECIENTE de cada portal.
-- No modifica tablas existentes (solo amplía el tipo de archivo permitido del bucket de evidencias).
-- =====================================================================

-- 1. Registro de Empresas y Sociedades (datos abiertos)
create table if not exists private.res_actuaciones (
  rut text not null,
  razon_social text,
  fecha date,
  actuacion text,
  tipo_social text,
  capital numeric,
  comuna text,
  region text,
  recurso text not null,
  primary key (rut, fecha, actuacion, recurso)
);
create index if not exists res_actuaciones_rut_idx on private.res_actuaciones (rut);

create table if not exists private.res_cargas (
  recurso text primary key,
  url text not null,
  nombre text,
  modificado text,
  cursor_bytes bigint not null default 0,
  filas integer not null default 0,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_curso', 'completada', 'error')),
  detalle text,
  actualizado timestamptz not null default now()
);

create or replace function public.svc_res_estado(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  return coalesce((select jsonb_agg(to_jsonb(c) order by c.recurso) from private.res_cargas c), '[]'::jsonb);
end
$$;

create or replace function public.svc_res_recurso(p_token text, p_recurso text, p_url text, p_nombre text, p_modificado text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  insert into private.res_cargas (recurso, url, nombre, modificado) values (left(p_recurso, 120), left(p_url, 500), left(p_nombre, 200), left(p_modificado, 60))
  on conflict (recurso) do update set url = excluded.url, nombre = excluded.nombre,
    -- Si el archivo cambió, se vuelve a cargar desde el inicio.
    cursor_bytes = case when private.res_cargas.modificado is distinct from excluded.modificado then 0 else private.res_cargas.cursor_bytes end,
    estado = case when private.res_cargas.modificado is distinct from excluded.modificado then 'pendiente' else private.res_cargas.estado end,
    modificado = excluded.modificado, actualizado = now();
end
$$;

create or replace function public.svc_res_lote(p_token text, p_recurso text, p_rows jsonb, p_cursor bigint, p_estado text, p_detalle text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_n integer := 0;
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  if p_estado not in ('en_curso', 'completada', 'error') then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if jsonb_typeof(p_rows) = 'array' and jsonb_array_length(p_rows) > 0 then
    if jsonb_array_length(p_rows) > 2000 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
    insert into private.res_actuaciones (rut, razon_social, fecha, actuacion, tipo_social, capital, comuna, region, recurso)
    select x.rut, left(x.razon_social, 200), x.fecha, left(x.actuacion, 120), left(x.tipo_social, 120), x.capital, left(x.comuna, 80), left(x.region, 80), p_recurso
    from jsonb_to_recordset(p_rows) as x(rut text, razon_social text, fecha date, actuacion text, tipo_social text, capital numeric, comuna text, region text)
    where x.rut ~ '^[1-9][0-9]{6,7}-[0-9K]$'
    on conflict do nothing;
    get diagnostics v_n = row_count;
  end if;
  update private.res_cargas set cursor_bytes = greatest(cursor_bytes, p_cursor), filas = filas + v_n, estado = p_estado,
    detalle = left(p_detalle, 1000), actualizado = now()
  where recurso = p_recurso;
  return v_n;
exception
  when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

-- Consulta pública: actuaciones de una empresa en el Registro (datos abiertos del Estado sobre personas jurídicas).
-- «cargado» indica si ya hay archivos completos: sin carga, la ausencia de resultados no significa nada.
create or replace function public.res_registro(p_rut text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'cargado', exists (select 1 from private.res_cargas where estado = 'completada'),
    'archivos', (select count(*) from private.res_cargas where estado = 'completada'),
    'actualizado', (select max(actualizado) from private.res_cargas where estado = 'completada'),
    'actuaciones', coalesce((select jsonb_agg(jsonb_build_object('fecha', a.fecha, 'actuacion', a.actuacion, 'tipo_social', a.tipo_social,
      'capital', a.capital, 'comuna', a.comuna, 'region', a.region, 'razon_social', a.razon_social) order by a.fecha)
      from (select * from private.res_actuaciones where rut = p_rut order by fecha limit 30) a), '[]'::jsonb))
$$;

-- Estado de la carga para el Centro de Mando (equipo ENQORA).
create or replace function public.res_cargas_estado() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_staff() then raise exception 'ENQ_SIN_PERMISO'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('recurso', c.recurso, 'nombre', c.nombre, 'filas', c.filas, 'estado', c.estado,
    'detalle', c.detalle, 'actualizado', c.actualizado) order by c.recurso) from private.res_cargas c), '[]'::jsonb);
end
$$;

revoke execute on function public.svc_res_estado(text), public.svc_res_recurso(text, text, text, text, text),
  public.svc_res_lote(text, text, jsonb, bigint, text, text), public.res_registro(text), public.res_cargas_estado() from public;
grant execute on function public.svc_res_estado(text), public.svc_res_recurso(text, text, text, text, text),
  public.svc_res_lote(text, text, jsonb, bigint, text, text), public.res_registro(text) to anon, authenticated;
grant execute on function public.res_cargas_estado() to authenticated;

-- 2. Búsqueda asistida: capturas PNG o JPG
update storage.buckets set allowed_mime_types = array['image/png', 'image/jpeg'] where id = 'cora-evidencias';

-- Hallazgos públicos: la evidencia más reciente de cada portal (una búsqueda asistida reemplaza a un «bloqueado»).
create or replace function public.research_public_findings(p_rut text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with ultima as (
    select r.id from public.research_runs r
    where r.rut = p_rut and r.modo = 'investigacion' and r.status = 'completada' and r.finished_at > now() - interval '30 days'
    order by r.finished_at desc limit 1
  ), ev as (
    select distinct on (e.portal) e.* from public.research_evidence e join ultima u on u.id = e.run_id
    order by e.portal, e.consulted_at desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'portal', e.portal, 'estado', e.status, 'consultado', e.consulted_at, 'url', e.url, 'detalle', e.detail,
    'version', e.procedure_version,
    'coincidencias', e.result -> 'coincidencias_exactas',
    'tabla', case when jsonb_typeof(e.result -> 'tablas') = 'array' and jsonb_array_length(e.result -> 'tablas') > 0
                  then jsonb_build_object('headers', e.result -> 'tablas' -> 0 -> 'headers',
                                          'rows', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
                                                     select x from jsonb_array_elements(e.result -> 'tablas' -> 0 -> 'rows') with ordinality as t(x, n) where n <= 8) s))
             end
  ) order by e.consulted_at), '[]'::jsonb)
  from ev e
$$;
