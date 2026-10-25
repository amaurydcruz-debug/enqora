-- =====================================================================
-- ENQORA · 0009 · Puerta de entrada: consulta pública por RUT y catálogo público (M08)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0008_precios.sql.
--
-- Principios:
--  · Solo datos abiertos del SII sobre PERSONAS JURÍDICAS (nóminas publicadas en
--    https://www.sii.cl/sobre_el_sii/nominapersonasjuridicas.html). No hay datos de personas naturales.
--  · La consulta devuelve una sola empresa por RUT válido, con su fuente y la fecha de publicación,
--    y tiene un límite de consultas por cliente. Nadie puede listar la tabla.
--  · Los datos los carga el Administrador ENQORA desde /mando/datos-publicos (sin terminal).
--  · El SII advierte que sus nóminas son preliminares: ENQORA las muestra como «información pública
--    según el SII», nunca como un dato verificado.
-- =====================================================================

create table public.public_data_imports (
  id uuid primary key default gen_random_uuid(),
  dataset text not null check (dataset in ('razon_social', 'actividades')),
  source_url text not null check (source_url ~ '^https://' and char_length(source_url) <= 300),
  published_on date not null,
  file_name text check (char_length(file_name) <= 200),
  rows_received integer not null default 0,
  status text not null default 'en_curso' check (status in ('en_curso', 'completada', 'cancelada')),
  started_by uuid references auth.users (id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table public.public_companies (
  rut integer primary key check (rut > 0),
  dv text not null check (dv ~ '^[0-9K]$'),
  legal_name text not null check (char_length(legal_name) between 1 and 300),
  activity_start date,
  end_of_business date,
  import_id uuid references public.public_data_imports (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.public_company_activities (
  rut integer not null check (rut > 0),
  code text not null check (char_length(code) between 1 and 20),
  description text check (char_length(description) <= 300),
  import_id uuid references public.public_data_imports (id) on delete set null,
  primary key (rut, code)
);

create table public.public_lookups (
  id bigserial primary key,
  client text not null,
  created_at timestamptz not null default now()
);
create index public_lookups_client_idx on public.public_lookups (client, created_at desc);
create index public_lookups_created_idx on public.public_lookups (created_at);

alter table public.public_data_imports enable row level security;
alter table public.public_companies enable row level security;
alter table public.public_company_activities enable row level security;
alter table public.public_lookups enable row level security;

-- Nadie lee estas tablas directamente: solo a través de las funciones de abajo.
revoke all on public.public_data_imports, public.public_companies, public.public_company_activities,
  public.public_lookups from anon, authenticated;
revoke all on sequence public.public_lookups_id_seq from anon, authenticated;

-- El equipo ENQORA ve el historial de cargas.
grant select on public.public_data_imports to authenticated;
create policy mfa_requerido on public.public_data_imports as restrictive for all to authenticated
  using (private.is_mfa()) with check (private.is_mfa());
create policy cargas_equipo on public.public_data_imports for select to authenticated using (private.is_staff());

-- ---------------------------------------------------------------------
-- Carga de datos (Administrador ENQORA)
-- ---------------------------------------------------------------------

create or replace function public.start_public_import(p_dataset text, p_source_url text, p_published_on date, p_file_name text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
  v_id uuid;
begin
  if not private.is_staff(array['enqora_admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_published_on is null or p_published_on > (now() at time zone 'America/Santiago')::date then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  update public.public_data_imports set status = 'cancelada', finished_at = now()
  where dataset = p_dataset and status = 'en_curso';
  insert into public.public_data_imports (dataset, source_url, published_on, file_name, started_by)
  values (p_dataset, trim(p_source_url), p_published_on, nullif(trim(coalesce(p_file_name, '')), ''), v_uid)
  returning id into v_id;
  return v_id;
exception
  when check_violation then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

-- Recibe un lote (máximo 2.000 filas) ya interpretado por el navegador. Devuelve las filas aceptadas.
-- razon_social: [{rut, dv, legal_name, activity_start, end_of_business}]
-- actividades:  [{rut, code, description}]
create or replace function public.import_public_rows(p_import uuid, p_rows jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_imp public.public_data_imports;
  v_count integer := 0;
begin
  perform private.require_session();
  if not private.is_staff(array['enqora_admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  select * into v_imp from public.public_data_imports where id = p_import for update;
  if not found or v_imp.status <> 'en_curso' then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;

  if v_imp.dataset = 'razon_social' then
    insert into public.public_companies (rut, dv, legal_name, activity_start, end_of_business, import_id, updated_at)
    select x.rut, upper(x.dv), left(trim(x.legal_name), 300), x.activity_start, x.end_of_business, p_import, now()
    from jsonb_to_recordset(p_rows) as x(rut integer, dv text, legal_name text, activity_start date, end_of_business date)
    where x.rut > 0 and upper(coalesce(x.dv, '')) ~ '^[0-9K]$' and char_length(trim(coalesce(x.legal_name, ''))) > 0
      and private.rut_is_valid(x.rut::text || '-' || upper(x.dv))
    on conflict (rut) do update set
      dv = excluded.dv, legal_name = excluded.legal_name, activity_start = excluded.activity_start,
      end_of_business = excluded.end_of_business, import_id = excluded.import_id, updated_at = now();
    get diagnostics v_count = row_count;
  else
    insert into public.public_company_activities (rut, code, description, import_id)
    select x.rut, left(trim(x.code), 20), left(trim(x.description), 300), p_import
    from jsonb_to_recordset(p_rows) as x(rut integer, code text, description text)
    where x.rut > 0 and char_length(trim(coalesce(x.code, ''))) > 0
    on conflict (rut, code) do update set description = excluded.description, import_id = excluded.import_id;
    get diagnostics v_count = row_count;
  end if;

  update public.public_data_imports set rows_received = rows_received + v_count where id = p_import;
  return v_count;
exception
  when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
    raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

create or replace function public.finish_public_import(p_import uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_session();
  if not private.is_staff(array['enqora_admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_status not in ('completada', 'cancelada') then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  update public.public_data_imports set status = p_status, finished_at = now() where id = p_import and status = 'en_curso';
  if not found then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
end
$$;

-- Vacía un conjunto antes de cargar una publicación nueva completa (exige reautenticación).
create or replace function public.clear_public_dataset(p_dataset text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_session(true);
  if not private.is_staff(array['enqora_admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_dataset = 'razon_social' then
    delete from public.public_companies;
  elsif p_dataset = 'actividades' then
    delete from public.public_company_activities;
  else
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- Consulta pública por RUT (sin sesión)
-- ---------------------------------------------------------------------

create or replace function public.lookup_public_company(p_rut text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_clean text := upper(regexp_replace(coalesce(p_rut, ''), '[^0-9kK]', '', 'g'));
  v_body text;
  v_dv text;
  v_formatted text;
  v_client text;
  v_headers jsonb;
  v_recent integer;
  v_company public.public_companies;
  v_meta public.public_data_imports;
  v_acts jsonb;
begin
  -- Límite de consultas por cliente (30 por hora). Los datos son públicos; el límite evita el abuso.
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
  v_dv := right(v_clean, 1);
  v_formatted := v_body || '-' || v_dv;
  if not private.rut_is_valid(v_formatted) then raise exception 'ENQ_RUT_INVALIDO'; end if;

  select * into v_meta from public.public_data_imports
  where dataset = 'razon_social' and status = 'completada' order by published_on desc, finished_at desc limit 1;
  if not found then
    return jsonb_build_object('estado', 'sin_datos');
  end if;

  select * into v_company from public.public_companies where rut = v_body::integer;
  if not found then
    return jsonb_build_object('estado', 'no_encontrada', 'rut', v_formatted,
      'fuente', 'Servicio de Impuestos Internos · Nómina de Razón Social de contribuyentes personas jurídicas',
      'fuente_url', v_meta.source_url, 'publicada', v_meta.published_on);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('codigo', a.code, 'descripcion', a.description) order by a.code), '[]'::jsonb)
  into v_acts
  from (select code, description from public.public_company_activities where rut = v_company.rut order by code limit 6) a;

  return jsonb_build_object(
    'estado', 'encontrada',
    'rut', v_formatted,
    'razon_social', v_company.legal_name,
    'inicio_actividades', v_company.activity_start,
    'termino_giro', v_company.end_of_business,
    'actividades', v_acts,
    'fuente', 'Servicio de Impuestos Internos · Nómina de Razón Social de contribuyentes personas jurídicas',
    'fuente_url', v_meta.source_url,
    'publicada', v_meta.published_on);
end
$$;

-- Catálogo público: servicios activos y su tarifa base vigente («desde»), sin sesión.
create or replace function public.public_catalog()
returns table (code text, module text, name text, summary text, unit text, requires_professional boolean, price_from integer)
language sql stable security definer set search_path = '' as $$
  select s.code, s.module, s.name, s.summary, s.unit, s.requires_professional, t.base_price
  from public.services s
  left join public.service_tariffs t on t.service_id = s.id and t.status = 'vigente'
  where s.active
  order by s.code
$$;

revoke execute on function
  public.start_public_import(text, text, date, text), public.import_public_rows(uuid, jsonb),
  public.finish_public_import(uuid, text), public.clear_public_dataset(text),
  public.lookup_public_company(text), public.public_catalog()
from public, anon;

grant execute on function
  public.start_public_import(text, text, date, text), public.import_public_rows(uuid, jsonb),
  public.finish_public_import(uuid, text), public.clear_public_dataset(text)
to authenticated;

grant execute on function public.lookup_public_company(text), public.public_catalog() to anon, authenticated;

-- ---------------------------------------------------------------------
-- Reversión (solo si fuera necesario):
--   drop function if exists public.start_public_import, public.import_public_rows, public.finish_public_import,
--     public.clear_public_dataset, public.lookup_public_company, public.public_catalog cascade;
--   drop table if exists public.public_lookups, public.public_company_activities, public.public_companies,
--     public.public_data_imports cascade;
-- ---------------------------------------------------------------------
