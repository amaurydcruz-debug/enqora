-- =====================================================================
-- ENQORA · 0064 · Líneas de servicio y documentos del cliente
-- 1) Cada caso nuevo lleva en su folio la línea de servicio que pidió el cliente:
--    CON contabilidad · TRI impuestos y SII · CRE constitución · FOR formalización y patentes · BRA marcas ·
--    LEG legal · LAB laboral · GES gestión · CRC crecimiento · IDE idea de negocio · GEN consulta general.
--    Ejemplo: LAB-2026-00031. La numeración sigue siendo única y correlativa para todo ENQORA (misma secuencia);
--    los casos anteriores conservan su folio ENQ-… (nada se renumera).
--    Las solicitudes también muestran su línea: SOL-LAB-7KQ2XA.
-- 2) El cliente sube documentos (o fotos desde la cámara) a una solicitud que aún no es caso. Quedan en el
--    almacenamiento privado; cuando el equipo une la solicitud a un caso, pasan solos al expediente del caso y,
--    por la Bóveda (0059), quedan numerados (DOC-…) y trazables. Nada se borra.
-- Se puede ejecutar más de una vez.
-- =====================================================================

create or replace function private.linea_de_modulo(p_module text) returns text
language sql immutable set search_path = '' as $$
  select case p_module
    when 'contabilidad' then 'CON' when 'create' then 'CRE' when 'formaliza' then 'FOR' when 'brand' then 'BRA'
    when 'legal' then 'LEG' when 'gestion' then 'GES' when 'crece' then 'CRC' when 'idea' then 'IDE' else 'GEN' end
$$;

create or replace function private.linea_de_categoria(p_categoria text) returns text
language sql immutable set search_path = '' as $$
  select case p_categoria
    when 'contabilidad' then 'CON' when 'tributario' then 'TRI' when 'constitucion' then 'CRE' when 'formalizacion' then 'FOR'
    when 'marcas' then 'BRA' when 'profesionales' then 'LEG' when 'trabajador' then 'LAB' when 'empleador' then 'LAB'
    when 'gestion' then 'GES' when 'crecimiento' then 'CRC' else null end
$$;

-- Crear caso: misma regla de permisos que antes; el folio lleva la línea (p_linea, o la del área).
drop function if exists public.create_case(uuid, text, text, text);
create or replace function public.create_case(
  p_company uuid, p_module text, p_title text, p_description text default null, p_linea text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_id uuid;
  v_folio text;
  v_module text := coalesce(nullif(p_module, ''), 'general');
  v_linea text := case when upper(coalesce(p_linea, '')) in ('CON', 'TRI', 'CRE', 'FOR', 'BRA', 'LEG', 'LAB', 'GES', 'CRC', 'IDE', 'GEN')
                       then upper(p_linea) else private.linea_de_modulo(v_module) end;
begin
  if not private.has_role(p_company, array['owner', 'admin', 'accountant']) and not private.is_supervisor() then
    raise exception 'ENQ_SIN_PERMISO';
  end if;
  if char_length(trim(coalesce(p_title, ''))) < 3 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;

  v_folio := v_linea || '-' || to_char(now() at time zone 'America/Santiago', 'YYYY') || '-'
             || lpad(nextval('public.case_folio_seq')::text, 5, '0');

  insert into public.cases (folio, company_id, module, title, description, created_by)
  values (v_folio, p_company, v_module, trim(p_title), nullif(trim(coalesce(p_description, '')), ''), v_uid)
  returning id into v_id;

  perform private.log_case(v_id, 'creado', null, 'cliente');
  perform private.log_event(p_company, 'caso.creado', v_folio);
  return v_id;
end
$$;
revoke execute on function public.create_case(uuid, text, text, text, text) from public, anon;
grant execute on function public.create_case(uuid, text, text, text, text) to authenticated;

-- Solicitudes: línea y código con la línea (SOL-LAB-7KQ2XA).
alter table private.solicitudes_caso add column if not exists linea text;

create or replace function private.on_solicitud_referencia() returns trigger
language plpgsql set search_path = '' as $$
declare
  a text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
begin
  if new.linea is null then
    new.linea := coalesce(private.linea_de_categoria(new.analisis -> 'categorias' ->> 0), 'GEN');
  end if;
  if new.referencia is null then
    loop
      c := 'SOL-' || new.linea || '-' || (select string_agg(substr(a, 1 + floor(random() * 32)::int, 1), '') from generate_series(1, 6));
      exit when not exists (select 1 from private.solicitudes_caso where referencia = c);
    end loop;
    new.referencia := c;
  end if;
  return new;
end
$$;
update private.solicitudes_caso set linea = coalesce(private.linea_de_categoria(analisis -> 'categorias' ->> 0), 'GEN') where linea is null;

-- ---------------------------------------------------------------------
-- Documentos del cliente en una solicitud (antes de que sea caso)
-- Ruta en el almacenamiento «expedientes»: sol/<id de la solicitud>/<archivo>
-- ---------------------------------------------------------------------
create table if not exists private.solicitud_documentos (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references private.solicitudes_caso (id) on delete restrict,
  user_id uuid references auth.users (id) on delete set null,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 20971520),
  case_document_id uuid references public.case_documents (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists solicitud_documentos_sol_idx on private.solicitud_documentos (solicitud_id, created_at);
alter table private.solicitud_documentos enable row level security;

-- ¿La ruta es de una solicitud de quien sube (o el equipo puede verla)?
create or replace function private.path_solicitud(p_name text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  parts text[] := string_to_array(coalesce(p_name, ''), '/');
begin
  if array_length(parts, 1) <> 3 or parts[1] <> 'sol' or parts[2] !~ '^[0-9a-f-]{36}$' or parts[3] = '' then return null; end if;
  return parts[2]::uuid;
end
$$;

create or replace function private.solicitud_es_mia(p_sol uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.solicitudes_caso s where s.id = p_sol and s.user_id = (select auth.uid()))
$$;

drop policy if exists enqora_solicitud_subir on storage.objects;
create policy enqora_solicitud_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'expedientes' and private.is_mfa() and private.path_solicitud(name) is not null
    and private.solicitud_es_mia(private.path_solicitud(name)));
drop policy if exists enqora_solicitud_leer on storage.objects;
create policy enqora_solicitud_leer on storage.objects for select to authenticated
  using (bucket_id = 'expedientes' and private.is_mfa() and private.path_solicitud(name) is not null
    and (private.solicitud_es_mia(private.path_solicitud(name)) or private.is_staff()));

-- El cliente registra el archivo que subió a su solicitud.
create or replace function public.solicitud_registrar_documento(p_sol uuid, p_path text, p_name text, p_mime text, p_size bigint) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_id uuid;
begin
  if not private.solicitud_es_mia(p_sol) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if private.path_solicitud(p_path) is distinct from p_sol then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'expedientes' and o.name = p_path) then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if (select count(*) from private.solicitud_documentos where solicitud_id = p_sol) >= 30 then raise exception 'ENQ_DEMASIADOS_DOCUMENTOS'; end if;
  insert into private.solicitud_documentos (solicitud_id, user_id, storage_path, file_name, mime_type, size_bytes)
  values (p_sol, v_uid, p_path, left(coalesce(nullif(trim(p_name), ''), 'documento'), 200), left(p_mime, 100), p_size)
  on conflict (storage_path) do nothing
  returning id into v_id;
  update private.solicitudes_caso set actualizada = now() where id = p_sol;
  -- Si la solicitud ya está unida a un caso, el archivo pasa directo al expediente.
  perform private.solicitud_docs_a_caso(p_sol);
  return v_id;
end
$$;

-- Documentos de una solicitud: para quien la envió y para el equipo.
create or replace function public.solicitud_documentos(p_sol uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'nombre', d.file_name, 'tipo', d.mime_type, 'tamano', d.size_bytes,
    'fecha', d.created_at, 'path', d.storage_path, 'en_caso', d.case_document_id is not null) order by d.created_at), '[]'::jsonb)
  from private.solicitud_documentos d
  where d.solicitud_id = p_sol and (private.solicitud_es_mia(p_sol) or private.is_staff())
$$;

-- Equipo: documentos de varias solicitudes a la vez (Centro de Mando → Solicitudes).
create or replace function public.solicitudes_documentos_equipo(p_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_staff() then raise exception 'ENQ_SIN_PERMISO'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('solicitud', d.solicitud_id, 'id', d.id, 'nombre', d.file_name, 'tipo', d.mime_type,
      'tamano', d.size_bytes, 'fecha', d.created_at, 'path', d.storage_path, 'en_caso', d.case_document_id is not null) order by d.created_at), '[]'::jsonb)
    from private.solicitud_documentos d where d.solicitud_id = any (coalesce(p_ids, '{}'::uuid[])));
end
$$;

-- Al unir la solicitud a un caso, sus archivos pasan al expediente (y la Bóveda los numera).
create or replace function private.solicitud_docs_a_caso(p_sol uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_case uuid;
  v_company uuid;
  d record;
  v_doc uuid;
begin
  select s.case_id, c.company_id into v_case, v_company from private.solicitudes_caso s join public.cases c on c.id = s.case_id where s.id = p_sol;
  if v_case is null then return; end if;
  for d in select * from private.solicitud_documentos where solicitud_id = p_sol and case_document_id is null order by created_at loop
    insert into public.case_documents (case_id, company_id, storage_path, file_name, mime_type, size_bytes, visibility, uploaded_by)
    values (v_case, v_company, d.storage_path, d.file_name, d.mime_type, d.size_bytes, 'cliente', d.user_id)
    returning id into v_doc;
    update private.solicitud_documentos set case_document_id = v_doc where id = d.id;
  end loop;
end
$$;

create or replace function private.on_solicitud_caso() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.case_id is not null and new.case_id is distinct from old.case_id then perform private.solicitud_docs_a_caso(new.id); end if;
  return new;
end
$$;
drop trigger if exists solicitudes_caso_docs on private.solicitudes_caso;
create trigger solicitudes_caso_docs after update of case_id on private.solicitudes_caso for each row execute function private.on_solicitud_caso();

-- Mis solicitudes (0063) ahora incluye la línea y cuántos documentos tiene.
create or replace function public.mis_solicitudes() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'codigo', s.referencia, 'linea', s.linea, 'estado', s.estado, 'creada', s.creada,
      'areas', coalesce(s.analisis -> 'categorias', '[]'::jsonb),
      'resumen', left(coalesce(s.analisis ->> 'resumen', ''), 240),
      'documentos', (select count(*) from private.solicitud_documentos d where d.solicitud_id = s.id),
      'caso', c.id, 'folio', c.folio)
    order by s.creada desc), '[]'::jsonb)
  from (select * from private.solicitudes_caso where user_id = (select auth.uid()) order by creada desc limit 20) s
  left join public.cases c on c.id = s.case_id
$$;

revoke execute on function private.linea_de_modulo(text), private.linea_de_categoria(text), private.path_solicitud(text),
  private.solicitud_docs_a_caso(uuid), private.on_solicitud_caso() from public, anon, authenticated;
grant execute on function private.path_solicitud(text), private.solicitud_es_mia(uuid) to authenticated;
revoke execute on function public.solicitud_registrar_documento(uuid, text, text, text, bigint), public.solicitud_documentos(uuid),
  public.solicitudes_documentos_equipo(uuid[]), public.mis_solicitudes() from public, anon;
grant execute on function public.solicitud_registrar_documento(uuid, text, text, text, bigint), public.solicitud_documentos(uuid),
  public.solicitudes_documentos_equipo(uuid[]), public.mis_solicitudes() to authenticated;
