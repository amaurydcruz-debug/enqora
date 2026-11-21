-- =====================================================================
-- ENQORA · 0065 · Informe de ingreso («el análisis antes del médico»)
-- Cada solicitud llega al Centro de Mando con un informe consolidado del enjambre: qué pide el cliente,
-- hechos con su fuente y certeza, línea y especialista, plazos (texto fijo verificado), datos y documentos
-- faltantes, conflicto de interés, ruta sugerida, servicio del catálogo con su precio vigente, riesgos y un
-- borrador del mensaje al cliente. Nada sale al cliente sin que una persona del equipo lo apruebe.
-- Trazabilidad: cada informe es una versión nueva (nunca se sobrescribe ni se borra). La corrección del
-- profesional queda en su propia versión y alimenta el aprendizaje de la línea (sin nombres ni RUT).
-- Se puede ejecutar más de una vez.
-- =====================================================================

create table if not exists private.solicitud_informes (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references private.solicitudes_caso (id) on delete restrict,
  version int not null check (version >= 1),
  origen text not null check (origen in ('enjambre', 'reglas', 'correccion')),
  linea text,
  informe jsonb not null,
  fuentes jsonb not null default '[]'::jsonb,
  bitacora jsonb not null default '[]'::jsonb,
  modelo text,
  conflicto jsonb,
  correccion text check (char_length(correccion) <= 2000),
  creado_por uuid references auth.users (id) on delete set null,
  creado timestamptz not null default now(),
  unique (solicitud_id, version)
);
create index if not exists solicitud_informes_sol_idx on private.solicitud_informes (solicitud_id, version desc);
create index if not exists solicitud_informes_linea_idx on private.solicitud_informes (linea, creado desc) where origen = 'correccion';
alter table private.solicitud_informes enable row level security;

create or replace function private.informe_inmutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'ENQ_INFORME_INMUTABLE';
end
$$;
drop trigger if exists solicitud_informes_inmutable on private.solicitud_informes;
create trigger solicitud_informes_inmutable before update or delete on private.solicitud_informes
  for each row execute function private.informe_inmutable();

-- Conflicto de interés (determinístico, nunca lo decide la IA): ¿ENQORA ya atiende a la contraparte que
-- menciona el cliente, o tiene un caso donde este cliente es la contraparte? (partes de 0057)
create or replace function private.solicitud_conflicto(p_rut text, p_contraparte text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with k as (
    select private.clave_rut(p_rut) as rut_clave, private.clave_nombre(p_contraparte) as cp_clave
  )
  select jsonb_build_object(
    'cliente_es_contraparte', exists (select 1 from private.case_parties p, k where k.rut_clave is not null and p.contraparte_clave = k.rut_clave),
    'contraparte_es_cliente', exists (select 1 from private.case_parties p, k where k.cp_clave is not null
      and (p.cliente_nombre_clave = k.cp_clave)),
    'contraparte', nullif(btrim(coalesce(p_contraparte, '')), ''))
$$;

-- Guarda una versión del informe. Lo llama el servidor de ENQORA (clave de servicio) al llegar la solicitud,
-- o una persona del equipo al regenerarlo.
create or replace function public.solicitud_guardar_informe(p_token text, p_sol uuid, p_origen text, p_informe jsonb,
  p_fuentes jsonb, p_bitacora jsonb, p_modelo text, p_contraparte text default null) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_sol private.solicitudes_caso;
  v_version int;
begin
  if not (private.check_service_token(p_token) or private.is_staff()) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_origen not in ('enjambre', 'reglas') or jsonb_typeof(p_informe) <> 'object' then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if octet_length(p_informe::text) > 60000 or octet_length(coalesce(p_fuentes, '[]')::text) > 60000 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  select * into v_sol from private.solicitudes_caso where id = p_sol for update;
  if not found then raise exception 'ENQ_NO_ENCONTRADO'; end if;
  select coalesce(max(version), 0) + 1 into v_version from private.solicitud_informes where solicitud_id = p_sol;
  insert into private.solicitud_informes (solicitud_id, version, origen, linea, informe, fuentes, bitacora, modelo, conflicto, creado_por)
  values (p_sol, v_version, p_origen, v_sol.linea, p_informe, coalesce(p_fuentes, '[]'), coalesce(p_bitacora, '[]'), left(p_modelo, 80),
          private.solicitud_conflicto(v_sol.rut, left(p_contraparte, 160)), (select auth.uid()));
  return v_version;
end
$$;

-- Corrección del profesional: nueva versión con el informe corregido y qué cambió (alimenta el aprendizaje).
create or replace function public.solicitud_corregir_informe(p_sol uuid, p_informe jsonb, p_correccion text) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_prev private.solicitud_informes;
  v_version int;
begin
  perform private.require_session();
  if not private.is_staff() or private.is_staff(array['ai_agent']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if char_length(btrim(coalesce(p_correccion, ''))) < 10 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  select * into v_prev from private.solicitud_informes where solicitud_id = p_sol order by version desc limit 1 for update;
  if not found then raise exception 'ENQ_NO_ENCONTRADO'; end if;
  v_version := v_prev.version + 1;
  insert into private.solicitud_informes (solicitud_id, version, origen, linea, informe, fuentes, bitacora, modelo, conflicto, correccion, creado_por)
  values (p_sol, v_version, 'correccion', v_prev.linea,
          case when jsonb_typeof(p_informe) = 'object' then v_prev.informe || p_informe else v_prev.informe end,
          v_prev.fuentes, v_prev.bitacora, v_prev.modelo, v_prev.conflicto, btrim(p_correccion), (select auth.uid()));
  update private.solicitudes_caso set estado = case when estado = 'nueva' then 'en_revision' else estado end, actualizada = now() where id = p_sol;
  return v_version;
end
$$;

-- Equipo: último informe de varias solicitudes (Centro de Mando → Solicitudes) con el número de versiones.
create or replace function public.solicitudes_informes(p_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_staff() then raise exception 'ENQ_SIN_PERMISO'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('solicitud', i.solicitud_id, 'version', i.version, 'origen', i.origen,
      'informe', i.informe, 'fuentes', i.fuentes, 'bitacora', i.bitacora, 'modelo', i.modelo, 'conflicto', i.conflicto,
      'correccion', i.correccion, 'creado', i.creado)), '[]'::jsonb)
    from (select distinct on (solicitud_id) * from private.solicitud_informes
          where solicitud_id = any (coalesce(p_ids, '{}'::uuid[])) order by solicitud_id, version desc) i);
end
$$;

-- Lecciones de la línea: las últimas correcciones del equipo (solo el texto de la corrección).
create or replace function public.informe_lecciones(p_token text, p_linea text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (private.check_service_token(p_token) or private.is_staff()) then raise exception 'ENQ_SIN_PERMISO'; end if;
  return (select coalesce(jsonb_agg(c.correccion), '[]'::jsonb) from (
    select correccion from private.solicitud_informes where origen = 'correccion' and linea = upper(p_linea) and correccion is not null
    order by creado desc limit 6) c);
end
$$;

-- Datos de la solicitud para armar su informe (servidor con clave de servicio, o el equipo al regenerarlo).
-- Incluye solo los NOMBRES de los documentos que envió el cliente (su contenido lo revisa el profesional).
drop function if exists public.solicitud_para_informe(uuid);
create or replace function public.solicitud_para_informe(p_token text, p_sol uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (private.check_service_token(p_token) or private.is_staff()) then raise exception 'ENQ_SIN_PERMISO'; end if;
  return (select jsonb_build_object('id', s.id, 'relato', s.relato, 'analisis', s.analisis, 'rut', s.rut, 'razon_social', s.razon_social,
      'linea', s.linea, 'documentos', coalesce((select jsonb_agg(d.file_name order by d.created_at) from private.solicitud_documentos d where d.solicitud_id = s.id), '[]'::jsonb))
    from private.solicitudes_caso s where s.id = p_sol);
end
$$;

-- Solicitudes recientes (7 días) que aún no tienen informe: el cron las completa si el arranque inmediato falló.
create or replace function public.svc_solicitudes_sin_informe(p_token text, p_limit int default 3) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_SIN_PERMISO'; end if;
  return (select coalesce(jsonb_agg(s.id), '[]'::jsonb) from (
    select s.id from private.solicitudes_caso s
    where s.creada > now() - interval '7 days' and s.creada < now() - interval '3 minutes' and s.estado <> 'cerrada'
      and not exists (select 1 from private.solicitud_informes i where i.solicitud_id = s.id)
    order by s.creada limit least(greatest(coalesce(p_limit, 3), 1), 10)) s);
end
$$;

revoke execute on function private.informe_inmutable(), private.solicitud_conflicto(text, text) from public, anon, authenticated;
revoke execute on function public.solicitud_guardar_informe(text, uuid, text, jsonb, jsonb, jsonb, text, text),
  public.informe_lecciones(text, text), public.solicitud_para_informe(text, uuid), public.svc_solicitudes_sin_informe(text, int) from public;
grant execute on function public.solicitud_guardar_informe(text, uuid, text, jsonb, jsonb, jsonb, text, text),
  public.informe_lecciones(text, text), public.solicitud_para_informe(text, uuid), public.svc_solicitudes_sin_informe(text, int) to anon, authenticated;
revoke execute on function public.solicitud_corregir_informe(uuid, jsonb, text), public.solicitudes_informes(uuid[]) from public, anon;
grant execute on function public.solicitud_corregir_informe(uuid, jsonb, text), public.solicitudes_informes(uuid[]) to authenticated;
