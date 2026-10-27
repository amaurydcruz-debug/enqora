-- =====================================================================
-- ENQORA · M18 · Conector de fuentes oficiales y hoja de vida de la empresa
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0018_cumplimiento.sql.
--
-- 1) Sincronización automática de las nóminas públicas del SII (personas jurídicas):
--    razón social, actividades económicas y nómina de empresas (tramo de ventas, trabajadores,
--    rubro, tipo de contribuyente). La ejecuta el servidor con la clave de servicio; nadie
--    descarga ni sube archivos a mano.
-- 2) Perfil público enriquecido con señales objetivas (término de giro, sin actividades vigentes…).
-- 3) Hoja de vida tributaria: la empresa sube su Carpeta Tributaria Electrónica (la genera ella
--    misma en sii.cl con su clave; ENQORA nunca pide ni guarda claves) y ENQORA la analiza.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Cargas automáticas
-- ---------------------------------------------------------------------
alter table public.public_data_imports drop constraint if exists public_data_imports_dataset_check;
alter table public.public_data_imports add constraint public_data_imports_dataset_check
  check (dataset in ('razon_social', 'actividades', 'empresas'));

alter table public.public_data_imports
  add column if not exists mode text not null default 'manual' check (mode in ('manual', 'automatica')),
  add column if not exists cursor_line bigint not null default 0 check (cursor_line >= 0),
  add column if not exists heartbeat_at timestamptz,
  add column if not exists source_modified timestamptz,
  add column if not exists last_error text check (char_length(last_error) <= 500);

create index if not exists public_data_imports_dataset_idx on public.public_data_imports (dataset, status, finished_at desc);

-- Nómina de empresas: se guarda solo el año comercial más reciente de cada RUT.
create table if not exists public.public_company_profiles (
  rut integer primary key check (rut > 0),
  commercial_year smallint not null check (commercial_year between 1990 and 2100),
  sales_tranche text check (char_length(sales_tranche) <= 60),
  workers integer check (workers >= 0),
  region text check (char_length(region) <= 80),
  rubro text check (char_length(rubro) <= 200),
  subrubro text check (char_length(subrubro) <= 200),
  main_activity text check (char_length(main_activity) <= 300),
  end_type text check (char_length(end_type) <= 120),
  contributor_type text check (char_length(contributor_type) <= 120),
  contributor_subtype text check (char_length(contributor_subtype) <= 120),
  equity_tranche text check (char_length(equity_tranche) <= 60),
  import_id uuid references public.public_data_imports (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists public_company_profiles_import_idx on public.public_company_profiles (import_id);
alter table public.public_company_profiles enable row level security;
revoke all on public.public_company_profiles from anon, authenticated;

-- Inserción común para la carga manual (Centro de Mando) y la automática.
create or replace function private.ingest_public_rows(p_import uuid, p_dataset text, p_rows jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer := 0;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;

  if p_dataset = 'razon_social' then
    insert into public.public_companies (rut, dv, legal_name, activity_start, end_of_business, import_id, updated_at)
    select distinct on (x.rut) x.rut, upper(x.dv), left(trim(x.legal_name), 300), x.activity_start, x.end_of_business, p_import, now()
    from jsonb_to_recordset(p_rows) as x(rut integer, dv text, legal_name text, activity_start date, end_of_business date)
    where x.rut > 0 and upper(coalesce(x.dv, '')) ~ '^[0-9K]$' and char_length(trim(coalesce(x.legal_name, ''))) > 0
      and private.rut_is_valid(x.rut::text || '-' || upper(x.dv))
    order by x.rut
    on conflict (rut) do update set
      dv = excluded.dv, legal_name = excluded.legal_name, activity_start = excluded.activity_start,
      end_of_business = excluded.end_of_business, import_id = excluded.import_id, updated_at = now();
    get diagnostics v_count = row_count;
  elsif p_dataset = 'actividades' then
    insert into public.public_company_activities (rut, code, description, import_id)
    select distinct on (x.rut, left(trim(x.code), 20)) x.rut, left(trim(x.code), 20), left(trim(x.description), 300), p_import
    from jsonb_to_recordset(p_rows) as x(rut integer, code text, description text)
    where x.rut > 0 and char_length(trim(coalesce(x.code, ''))) > 0
    order by x.rut, left(trim(x.code), 20)
    on conflict (rut, code) do update set description = excluded.description, import_id = excluded.import_id;
    get diagnostics v_count = row_count;
  elsif p_dataset = 'empresas' then
    insert into public.public_company_profiles (rut, commercial_year, sales_tranche, workers, region, rubro, subrubro, main_activity,
      end_type, contributor_type, contributor_subtype, equity_tranche, import_id, updated_at)
    select distinct on (x.rut) x.rut, x.year, left(trim(x.sales_tranche), 60), greatest(x.workers, 0), left(trim(x.region), 80),
      left(trim(x.rubro), 200), left(trim(x.subrubro), 200), left(trim(x.main_activity), 300), left(trim(x.end_type), 120),
      left(trim(x.contributor_type), 120), left(trim(x.contributor_subtype), 120), left(trim(x.equity_tranche), 60), p_import, now()
    from jsonb_to_recordset(p_rows) as x(rut integer, year smallint, sales_tranche text, workers integer, region text, rubro text,
      subrubro text, main_activity text, end_type text, contributor_type text, contributor_subtype text, equity_tranche text)
    where x.rut > 0 and x.year between 1990 and 2100
    order by x.rut, x.year desc
    on conflict (rut) do update set
      commercial_year = excluded.commercial_year, sales_tranche = excluded.sales_tranche, workers = excluded.workers,
      region = excluded.region, rubro = excluded.rubro, subrubro = excluded.subrubro, main_activity = excluded.main_activity,
      end_type = excluded.end_type, contributor_type = excluded.contributor_type, contributor_subtype = excluded.contributor_subtype,
      equity_tranche = excluded.equity_tranche, import_id = excluded.import_id, updated_at = now()
    where excluded.commercial_year >= public.public_company_profiles.commercial_year;
    get diagnostics v_count = row_count;
  else
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  return v_count;
exception
  when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
    raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

-- La carga manual sigue igual para el Administrador, ahora usando la inserción común.
create or replace function public.import_public_rows(p_import uuid, p_rows jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_imp public.public_data_imports;
  v_count integer;
begin
  perform private.require_session();
  if not private.is_staff(array['enqora_admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  select * into v_imp from public.public_data_imports where id = p_import for update;
  if not found or v_imp.status <> 'en_curso' or v_imp.mode <> 'manual' then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  v_count := private.ingest_public_rows(p_import, v_imp.dataset, p_rows);
  update public.public_data_imports set rows_received = rows_received + v_count where id = p_import;
  return v_count;
end
$$;

-- Estado para el sincronizador: carga en curso y última completada de cada conjunto.
create or replace function public.svc_public_sync_state(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_out jsonb := '{}'::jsonb;
  v_ds text;
  v_act public.public_data_imports;
  v_last public.public_data_imports;
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  foreach v_ds in array array['razon_social', 'actividades', 'empresas'] loop
    select * into v_act from public.public_data_imports where dataset = v_ds and status = 'en_curso' order by started_at desc limit 1;
    select * into v_last from public.public_data_imports where dataset = v_ds and status = 'completada'
      order by finished_at desc nulls last limit 1;
    v_out := v_out || jsonb_build_object(v_ds, jsonb_build_object(
      'activa', case when v_act.id is null then null else jsonb_build_object(
        'id', v_act.id, 'modo', v_act.mode, 'cursor', v_act.cursor_line, 'fuente', v_act.source_url,
        'modificado', v_act.source_modified, 'latido', v_act.heartbeat_at, 'inicio', v_act.started_at) end,
      'ultima', case when v_last.id is null then null else jsonb_build_object(
        'id', v_last.id, 'modificado', v_last.source_modified, 'publicada', v_last.published_on, 'termino', v_last.finished_at,
        'filas', v_last.rows_received) end));
  end loop;
  return v_out;
end
$$;

create or replace function public.svc_start_public_import(p_token text, p_dataset text, p_source_url text, p_modified timestamptz, p_file_name text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_pub date := least(coalesce((p_modified at time zone 'America/Santiago')::date, private.today_cl()), private.today_cl());
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  if p_dataset not in ('razon_social', 'actividades', 'empresas') or p_source_url !~ '^https://www\.sii\.cl/' then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  update public.public_data_imports set status = 'cancelada', finished_at = now(),
    last_error = coalesce(last_error, 'Reemplazada por una carga nueva')
  where dataset = p_dataset and status = 'en_curso';
  insert into public.public_data_imports (dataset, source_url, published_on, file_name, mode, source_modified, heartbeat_at)
  values (p_dataset, p_source_url, v_pub, left(nullif(trim(coalesce(p_file_name, '')), ''), 200), 'automatica', p_modified, now())
  returning id into v_id;
  return v_id;
end
$$;

-- p_from: línea donde empieza el lote (debe ser el cursor actual: evita lotes duplicados si dos
-- ejecuciones coinciden); p_to: línea siguiente al lote.
create or replace function public.svc_import_public_rows(p_token text, p_import uuid, p_rows jsonb, p_from bigint, p_to bigint)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_imp public.public_data_imports;
  v_count integer;
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  select * into v_imp from public.public_data_imports where id = p_import for update;
  if not found or v_imp.status <> 'en_curso' or v_imp.mode <> 'automatica' then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if p_from is distinct from v_imp.cursor_line or p_to < p_from then raise exception 'ENQ_CARGA_EN_CURSO'; end if;
  v_count := private.ingest_public_rows(p_import, v_imp.dataset, p_rows);
  update public.public_data_imports
  set rows_received = rows_received + v_count, cursor_line = p_to, heartbeat_at = now()
  where id = p_import;
  return v_count;
end
$$;

create or replace function public.svc_finish_public_import(p_token text, p_import uuid, p_status text, p_error text default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  if p_status not in ('completada', 'cancelada') then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  update public.public_data_imports
  set status = p_status, finished_at = now(), heartbeat_at = now(), last_error = left(nullif(trim(coalesce(p_error, '')), ''), 500)
  where id = p_import and status = 'en_curso' and mode = 'automatica';
  if not found then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
end
$$;

-- Registra un intento fallido sin cerrar la carga (se reintenta en la siguiente ejecución).
create or replace function public.svc_public_import_error(p_token text, p_import uuid, p_error text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  update public.public_data_imports set last_error = left(trim(coalesce(p_error, 'Error')), 500), heartbeat_at = null
  where id = p_import and status = 'en_curso';
end
$$;

-- ---------------------------------------------------------------------
-- 2. Perfil público con señales objetivas
-- ---------------------------------------------------------------------
create or replace function private.public_profile(p_rut integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_company public.public_companies;
  v_prof public.public_company_profiles;
  v_meta public.public_data_imports;
  v_meta_acts public.public_data_imports;
  v_meta_emp public.public_data_imports;
  v_acts jsonb;
  v_nacts integer;
  v_senales jsonb := '[]'::jsonb;
  v_fuentes jsonb := '[]'::jsonb;
  v_formatted text;
begin
  select * into v_meta from public.public_data_imports
  where dataset = 'razon_social' and status = 'completada' order by published_on desc, finished_at desc limit 1;
  if not found then return jsonb_build_object('estado', 'sin_datos'); end if;
  select * into v_meta_acts from public.public_data_imports
  where dataset = 'actividades' and status = 'completada' order by published_on desc, finished_at desc limit 1;
  select * into v_meta_emp from public.public_data_imports
  where dataset = 'empresas' and status = 'completada' order by published_on desc, finished_at desc limit 1;

  v_fuentes := v_fuentes || jsonb_build_array(jsonb_build_object('nombre', 'Nómina de razón social de personas jurídicas (SII)',
    'url', v_meta.source_url, 'publicada', v_meta.published_on));
  if v_meta_acts.id is not null then
    v_fuentes := v_fuentes || jsonb_build_array(jsonb_build_object('nombre', 'Nómina de actividades económicas (SII)',
      'url', v_meta_acts.source_url, 'publicada', v_meta_acts.published_on));
  end if;
  if v_meta_emp.id is not null then
    v_fuentes := v_fuentes || jsonb_build_array(jsonb_build_object('nombre', 'Nómina de empresas personas jurídicas (SII)',
      'url', v_meta_emp.source_url, 'publicada', v_meta_emp.published_on));
  end if;

  select * into v_company from public.public_companies where rut = p_rut;
  if not found then
    return jsonb_build_object('estado', 'no_encontrada', 'rut', p_rut::text || '-' || private.rut_dv(p_rut),
      'fuente', 'Servicio de Impuestos Internos · Nómina de Razón Social de contribuyentes personas jurídicas',
      'fuente_url', v_meta.source_url, 'publicada', v_meta.published_on, 'fuentes', v_fuentes);
  end if;
  v_formatted := v_company.rut::text || '-' || v_company.dv;

  select count(*)::integer into v_nacts from public.public_company_activities where rut = p_rut;
  select coalesce(jsonb_agg(jsonb_build_object('codigo', a.code, 'descripcion', a.description) order by a.code), '[]'::jsonb)
  into v_acts
  from (select code, description from public.public_company_activities where rut = p_rut order by code limit 8) a;
  select * into v_prof from public.public_company_profiles where rut = p_rut;

  -- Señales: solo hechos que constan en las nóminas, sin conclusiones.
  if v_company.end_of_business is not null then
    v_senales := v_senales || jsonb_build_array(jsonb_build_object('codigo', 'termino_giro', 'gravedad', 'alta', 'fecha', v_company.end_of_business));
  end if;
  if v_meta_acts.id is not null and v_nacts = 0 and v_company.end_of_business is null then
    v_senales := v_senales || jsonb_build_array(jsonb_build_object('codigo', 'sin_actividades', 'gravedad', 'media'));
  end if;
  if v_prof.rut is not null then
    if v_prof.sales_tranche ~* 'sin' or v_prof.sales_tranche ~ '^\s*1\s*$' then
      v_senales := v_senales || jsonb_build_array(jsonb_build_object('codigo', 'sin_ventas_informadas', 'gravedad', 'media', 'anio', v_prof.commercial_year));
    end if;
    if v_prof.commercial_year < extract(year from private.today_cl())::integer - 3 and v_company.end_of_business is null then
      v_senales := v_senales || jsonb_build_array(jsonb_build_object('codigo', 'sin_informacion_reciente', 'gravedad', 'media', 'anio', v_prof.commercial_year));
    end if;
  elsif v_meta_emp.id is not null and v_company.end_of_business is null then
    v_senales := v_senales || jsonb_build_array(jsonb_build_object('codigo', 'sin_registro_empresas', 'gravedad', 'baja'));
  end if;

  return jsonb_build_object(
    'estado', 'encontrada',
    'rut', v_formatted,
    'razon_social', v_company.legal_name,
    'inicio_actividades', v_company.activity_start,
    'termino_giro', v_company.end_of_business,
    'actividades', v_acts,
    'total_actividades', v_nacts,
    'perfil', case when v_prof.rut is null then null else jsonb_build_object(
      'anio_comercial', v_prof.commercial_year, 'tramo_ventas', v_prof.sales_tranche, 'trabajadores', v_prof.workers,
      'region', v_prof.region, 'rubro', v_prof.rubro, 'subrubro', v_prof.subrubro, 'actividad_principal', v_prof.main_activity,
      'tipo_termino', v_prof.end_type, 'tipo_contribuyente', v_prof.contributor_type, 'subtipo_contribuyente', v_prof.contributor_subtype,
      'tramo_capital', v_prof.equity_tranche) end,
    'senales', v_senales,
    'fuente', 'Servicio de Impuestos Internos · Nómina de Razón Social de contribuyentes personas jurídicas',
    'fuente_url', v_meta.source_url,
    'publicada', v_meta.published_on,
    'fuentes', v_fuentes);
end
$$;

-- Dígito verificador (módulo 11).
create or replace function private.rut_dv(p_rut integer) returns text
language plpgsql immutable set search_path = '' as $$
declare
  v_sum integer := 0;
  v_mul integer := 2;
  v_n bigint := p_rut;
  v_r integer;
begin
  while v_n > 0 loop
    v_sum := v_sum + (v_n % 10)::integer * v_mul;
    v_n := v_n / 10;
    v_mul := case when v_mul = 7 then 2 else v_mul + 1 end;
  end loop;
  v_r := 11 - (v_sum % 11);
  return case v_r when 11 then '0' when 10 then 'K' else v_r::text end;
end
$$;

-- Consulta pública (página principal): mismo límite por visitante que antes, ahora con perfil y señales.
create or replace function public.lookup_public_company(p_rut text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_clean text := upper(regexp_replace(coalesce(p_rut, ''), '[^0-9kK]', '', 'g'));
  v_body text;
  v_client text;
  v_headers jsonb;
  v_recent integer;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then v_headers := null;
  end;
  v_client := coalesce(v_headers ->> 'x-enqora-client', v_headers ->> 'cf-connecting-ip',
                       split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1), 'desconocido');
  v_client := md5('enqora:' || v_client);
  select count(*) into v_recent from public.public_lookups where client = v_client and created_at > now() - interval '1 hour';
  if v_recent >= 30 then raise exception 'ENQ_DEMASIADAS_CONSULTAS'; end if;
  delete from public.public_lookups where created_at < now() - interval '2 days';
  insert into public.public_lookups (client) values (v_client);

  if char_length(v_clean) < 8 or char_length(v_clean) > 9 then raise exception 'ENQ_RUT_INVALIDO'; end if;
  v_body := ltrim(left(v_clean, char_length(v_clean) - 1), '0');
  if not private.rut_is_valid(v_body || '-' || right(v_clean, 1)) then raise exception 'ENQ_RUT_INVALIDO'; end if;
  return private.public_profile(v_body::integer);
end
$$;

-- Perfil público de una empresa registrada (sin límite: es la propia empresa o su equipo).
create or replace function public.company_public_profile(p_company uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_rut text;
begin
  perform private.require_session();
  if not private.can_see_compliance(p_company) then raise exception 'ENQ_SIN_PERMISO'; end if;
  select regexp_replace(split_part(rut, '-', 1), '[^0-9]', '', 'g') into v_rut from public.companies where id = p_company;
  if coalesce(v_rut, '') = '' then return jsonb_build_object('estado', 'sin_datos'); end if;
  return private.public_profile(v_rut::integer);
end
$$;

-- ---------------------------------------------------------------------
-- 3. Hoja de vida tributaria (Carpeta Tributaria Electrónica)
-- ---------------------------------------------------------------------
create table if not exists public.tax_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  document_path text not null unique check (char_length(document_path) <= 300),
  file_name text not null check (char_length(file_name) between 1 and 200),
  status text not null default 'subida' check (status in ('subida', 'analizando', 'lista', 'error')),
  folder_kind text check (char_length(folder_kind) <= 120),
  issued_on date,
  valid_until date,
  document_rut text check (char_length(document_rut) <= 12),
  rut_matches boolean,
  summary jsonb not null default '{}'::jsonb,
  findings jsonb not null default '[]'::jsonb check (jsonb_typeof(findings) = 'array'),
  error text check (char_length(error) <= 300),
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  analyzed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (char_length(review_note) <= 1000)
);
create index if not exists tax_records_company_idx on public.tax_records (company_id, created_at desc);
create index if not exists tax_records_uploaded_idx on public.tax_records (uploaded_by);
create index if not exists tax_records_reviewed_idx on public.tax_records (reviewed_by);

alter table public.tax_records enable row level security;
revoke all on public.tax_records from anon, authenticated;
grant select on public.tax_records to authenticated;
drop policy if exists mfa_requerido on public.tax_records;
drop policy if exists hoja_vida_ver on public.tax_records;
create policy mfa_requerido on public.tax_records as restrictive for all to authenticated
  using (private.is_mfa()) with check (private.is_mfa());
create policy hoja_vida_ver on public.tax_records for select to authenticated using (private.can_see_compliance(company_id));

create or replace function private.path_company(p_name text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when others then
  return null;
end
$$;

create or replace function private.can_upload_tax_record(p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_company is not null and (private.has_role(p_company, array['owner', 'admin']) or private.can_manage_compliance(p_company))
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('carpetas', 'carpetas', false, 20971520, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists enqora_carpetas_subir on storage.objects;
create policy enqora_carpetas_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'carpetas' and private.is_mfa() and private.can_upload_tax_record(private.path_company(name)));

drop policy if exists enqora_carpetas_leer on storage.objects;
create policy enqora_carpetas_leer on storage.objects for select to authenticated
  using (
    bucket_id = 'carpetas' and private.is_mfa()
    and exists (select 1 from public.tax_records r where r.document_path = storage.objects.name and private.can_see_compliance(r.company_id))
  );

create or replace function public.register_tax_record(p_company uuid, p_path text, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_id uuid;
begin
  if not private.can_upload_tax_record(p_company) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_path is null or p_path not like p_company::text || '/%' or lower(p_path) !~ '\.pdf$' then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'carpetas' and o.name = p_path) then
    raise exception 'ENQ_ARCHIVO_NO_SUBIDO';
  end if;
  -- Cada análisis usa IA: máximo 10 carpetas por empresa al día.
  if (select count(*) from public.tax_records where company_id = p_company and created_at > now() - interval '1 day') >= 10 then
    raise exception 'ENQ_DEMASIADAS_CONSULTAS';
  end if;
  insert into public.tax_records (company_id, document_path, file_name, uploaded_by)
  values (p_company, p_path, left(coalesce(nullif(trim(p_name), ''), 'carpeta-tributaria.pdf'), 200), v_uid)
  returning id into v_id;
  return v_id;
end
$$;

create or replace function public.svc_tax_record_status(p_token text, p_record uuid, p_status text, p_error text default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  if p_status not in ('analizando', 'error') then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  update public.tax_records set status = p_status, error = case when p_status = 'error' then left(coalesce(p_error, 'Error'), 300) end
  where id = p_record and status <> 'lista';
end
$$;

-- Guarda el análisis. Los hallazgos los calcula el servidor con reglas fijas sobre lo extraído.
create or replace function public.svc_save_tax_record(p_token text, p_record uuid, p_data jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_rec public.tax_records;
  v_company_rut text;
  v_doc_rut text := upper(regexp_replace(coalesce(p_data ->> 'rut', ''), '[^0-9kK]', '', 'g'));
  v_findings jsonb := coalesce(p_data -> 'hallazgos', '[]'::jsonb);
  v_high integer;
  v_users uuid[];
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  if jsonb_typeof(v_findings) <> 'array' or jsonb_array_length(v_findings) > 30
     or jsonb_typeof(coalesce(p_data -> 'resumen', '{}'::jsonb)) <> 'object' or octet_length(p_data::text) > 200000 then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  select * into v_rec from public.tax_records where id = p_record for update;
  if not found then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  select upper(regexp_replace(rut, '[^0-9kK]', '', 'g')) into v_company_rut from public.companies where id = v_rec.company_id;

  update public.tax_records set
    status = 'lista', error = null, analyzed_at = now(),
    folder_kind = left(nullif(trim(coalesce(p_data ->> 'tipo_carpeta', '')), ''), 120),
    issued_on = case when p_data ->> 'emitida' ~ '^\d{4}-\d{2}-\d{2}$' then (p_data ->> 'emitida')::date end,
    valid_until = case when p_data ->> 'vigente_hasta' ~ '^\d{4}-\d{2}-\d{2}$' then (p_data ->> 'vigente_hasta')::date end,
    document_rut = nullif(left(v_doc_rut, 12), ''),
    rut_matches = case when v_doc_rut = '' then null else ltrim(v_doc_rut, '0') = ltrim(v_company_rut, '0') end,
    summary = coalesce(p_data -> 'resumen', '{}'::jsonb),
    findings = v_findings,
    reviewed_by = null, reviewed_at = null, review_note = null
  where id = p_record;

  -- Aviso a quien supervisa cuando hay situaciones de prioridad alta (para ofrecer solución).
  select count(*) into v_high from jsonb_array_elements(v_findings) f where f ->> 'gravedad' = 'alta';
  if v_high > 0 then
    select coalesce(array_agg(s.user_id), '{}') into v_users from public.staff_members s
    where s.active and s.role in ('ops_director', 'enqora_admin');
    perform private.notify(v_users, v_rec.company_id, null, 'casos',
      'Hoja de vida con situaciones prioritarias',
      v_high::text || ' situación(es) de prioridad alta en la carpeta tributaria subida por un cliente.',
      '/empresas/' || v_rec.company_id::text || '/hoja-de-vida', 'hoja-vida:' || p_record::text);
  end if;
exception
  when invalid_datetime_format or datetime_field_overflow then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

create or replace function public.review_tax_record(p_record uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_rec public.tax_records;
begin
  select * into v_rec from public.tax_records where id = p_record for update;
  if not found or not private.can_manage_compliance(v_rec.company_id) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_rec.status <> 'lista' then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if char_length(trim(coalesce(p_note, ''))) < 10 then raise exception 'ENQ_FALTA_OBSERVACION'; end if;
  update public.tax_records set reviewed_by = v_uid, reviewed_at = now(), review_note = left(trim(p_note), 1000) where id = p_record;
  perform private.notify(
    array(select m.user_id from public.company_members m where m.company_id = v_rec.company_id and m.role in ('owner', 'admin')),
    v_rec.company_id, null, 'casos', 'Tu hoja de vida tributaria fue revisada',
    'El equipo ENQORA revisó el análisis de tu carpeta tributaria y dejó una observación.',
    '/empresas/' || v_rec.company_id::text || '/hoja-de-vida', 'hoja-vida-revisada:' || p_record::text);
end
$$;

-- ---------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------
revoke execute on function private.ingest_public_rows(uuid, text, jsonb), private.public_profile(integer), private.rut_dv(integer),
  private.path_company(text), private.can_upload_tax_record(uuid)
from public, anon;
grant execute on function private.path_company(text), private.can_upload_tax_record(uuid) to authenticated;

revoke execute on function
  public.svc_public_sync_state(text), public.svc_start_public_import(text, text, text, timestamptz, text),
  public.svc_import_public_rows(text, uuid, jsonb, bigint, bigint), public.svc_finish_public_import(text, uuid, text, text),
  public.svc_public_import_error(text, uuid, text), public.company_public_profile(uuid),
  public.register_tax_record(uuid, text, text), public.svc_tax_record_status(text, uuid, text, text),
  public.svc_save_tax_record(text, uuid, jsonb), public.review_tax_record(uuid, text)
from public, anon;

-- Las funciones svc_* validan la clave de servicio (el servidor las llama sin sesión, igual que la tarea diaria).
grant execute on function
  public.svc_public_sync_state(text), public.svc_start_public_import(text, text, text, timestamptz, text),
  public.svc_import_public_rows(text, uuid, jsonb, bigint, bigint), public.svc_finish_public_import(text, uuid, text, text),
  public.svc_public_import_error(text, uuid, text), public.svc_tax_record_status(text, uuid, text, text),
  public.svc_save_tax_record(text, uuid, jsonb)
to anon, authenticated;
grant execute on function public.company_public_profile(uuid), public.register_tax_record(uuid, text, text),
  public.review_tax_record(uuid, text)
to authenticated;
grant execute on function public.lookup_public_company(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Reversión (solo si fuera necesario):
--   drop function if exists public.svc_public_sync_state, public.svc_start_public_import, public.svc_import_public_rows,
--     public.svc_finish_public_import, public.svc_public_import_error, public.company_public_profile, public.register_tax_record,
--     public.svc_tax_record_status, public.svc_save_tax_record, public.review_tax_record, private.ingest_public_rows,
--     private.public_profile, private.rut_dv, private.path_company, private.can_upload_tax_record cascade;
--   drop table if exists public.tax_records, public.public_company_profiles cascade;
--   (y volver a ejecutar las funciones import_public_rows y lookup_public_company de 0009)
-- ---------------------------------------------------------------------
