-- =====================================================================
-- ENQORA · 0067 · Contabilidad mensual · Etapa 2: «Registrar gasto» con foto, voz o texto
-- El cliente saca una foto de la boleta (o dicta o escribe el gasto). La IA propone los datos, el cliente los
-- confirma antes de guardar y el contador los revisa. Nada se borra: un gasto mal ingresado se «descarta» con su
-- motivo. La foto queda en el almacenamiento privado (expedientes, ruta gas/<empresa>/<archivo>).
-- Las facturas electrónicas ya llegan al Registro de Compras del SII: se marcan para no contarlas dos veces.
-- Se puede ejecutar más de una vez.
-- =====================================================================

create table if not exists public.gastos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  period date not null check (period = date_trunc('month', period)::date),
  fecha date not null,
  monto bigint not null check (monto > 0 and monto < 10000000000),
  iva bigint check (iva >= 0),
  descripcion text not null check (char_length(descripcion) between 2 and 300),
  categoria text not null check (categoria in ('mercaderia', 'insumos', 'arriendo', 'servicios_basicos', 'transporte', 'combustible',
    'alimentacion', 'honorarios', 'publicidad', 'equipos', 'mantencion', 'bancarios', 'impuestos', 'otros')),
  documento text not null check (documento in ('boleta', 'factura', 'boleta_honorarios', 'sin_documento', 'otro')),
  proveedor text check (char_length(proveedor) <= 160),
  folio text check (char_length(folio) <= 30),
  uso text not null default 'por_confirmar' check (uso in ('negocio', 'personal', 'por_confirmar')),
  origen text not null check (origen in ('foto', 'voz', 'texto')),
  storage_path text unique,
  lectura jsonb,                         -- lo que propuso la IA (trazabilidad: qué leyó y qué corrigió el cliente)
  estado text not null default 'registrado' check (estado in ('registrado', 'revisado', 'descartado')),
  nota text check (char_length(nota) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  revisado_por uuid references auth.users (id) on delete set null,
  revisado_at timestamptz
);
create index if not exists gastos_company_period_idx on public.gastos (company_id, period, fecha);
alter table public.gastos enable row level security;
revoke all on public.gastos from anon, authenticated;
grant select on public.gastos to authenticated;
drop policy if exists gastos_ver on public.gastos;
create policy gastos_ver on public.gastos for select to authenticated using (private.can_read_books(company_id));

-- Fotos de gastos: gas/<empresa>/<archivo>
create or replace function private.path_gasto(p_name text) returns uuid
language plpgsql immutable set search_path = '' as $$
declare
  parts text[] := string_to_array(coalesce(p_name, ''), '/');
begin
  if array_length(parts, 1) <> 3 or parts[1] <> 'gas' or parts[2] !~ '^[0-9a-f-]{36}$' or parts[3] = '' then return null; end if;
  return parts[2]::uuid;
end
$$;
drop policy if exists enqora_gasto_subir on storage.objects;
create policy enqora_gasto_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'expedientes' and private.is_mfa() and private.path_gasto(name) is not null and private.can_book(private.path_gasto(name)));
drop policy if exists enqora_gasto_leer on storage.objects;
create policy enqora_gasto_leer on storage.objects for select to authenticated
  using (bucket_id = 'expedientes' and private.is_mfa() and private.path_gasto(name) is not null and private.can_read_books(private.path_gasto(name)));

-- Registrar un gasto (el cliente ya revisó lo que propuso la IA).
create or replace function public.registrar_gasto(p_company uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_fecha date;
  v_hoy date := (now() at time zone 'America/Santiago')::date;
  v_path text := nullif(btrim(coalesce(p ->> 'storage_path', '')), '');
  v_id uuid;
  v_period date;
begin
  if not private.can_book(p_company) or private.is_staff(array['ai_agent']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  begin
    v_fecha := (p ->> 'fecha')::date;
  exception when others then raise exception 'ENQ_DATOS_INVALIDOS';
  end;
  if v_fecha is null or v_fecha > v_hoy or v_fecha < v_hoy - 400 then raise exception 'ENQ_FECHA_GASTO'; end if;
  v_period := date_trunc('month', v_fecha)::date;
  -- Un mes ya declarado (F29 aprobado o presentado) no admite gastos nuevos sin que el contador lo reabra.
  if exists (select 1 from public.vat_returns v where v.company_id = p_company and v.period = v_period and v.status in ('aprobado', 'presentado')) then
    raise exception 'ENQ_PERIODO_CERRADO';
  end if;
  if v_path is not null and (private.path_gasto(v_path) is distinct from p_company
     or not exists (select 1 from storage.objects o where o.bucket_id = 'expedientes' and o.name = v_path)) then
    raise exception 'ENQ_ARCHIVO_NO_SUBIDO';
  end if;
  insert into public.gastos (company_id, period, fecha, monto, iva, descripcion, categoria, documento, proveedor, folio, uso, origen,
    storage_path, lectura, created_by)
  values (p_company, v_period, v_fecha, (p ->> 'monto')::bigint, nullif(p ->> 'iva', '')::bigint, btrim(p ->> 'descripcion'),
    coalesce(nullif(p ->> 'categoria', ''), 'otros'), coalesce(nullif(p ->> 'documento', ''), 'otro'),
    nullif(left(btrim(coalesce(p ->> 'proveedor', '')), 160), ''), nullif(left(btrim(coalesce(p ->> 'folio', '')), 30), ''),
    coalesce(nullif(p ->> 'uso', ''), 'por_confirmar'), coalesce(nullif(p ->> 'origen', ''), 'texto'), v_path,
    case when jsonb_typeof(p -> 'lectura') = 'object' then p -> 'lectura' end, v_uid)
  returning id into v_id;
  perform private.log_event(p_company, 'gasto.registrado', to_char(v_fecha, 'DD-MM-YYYY'), jsonb_build_object('gasto', v_id, 'monto', (p ->> 'monto')::bigint));
  return v_id;
exception
  when check_violation or invalid_text_representation or numeric_value_out_of_range then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

-- Un toque: ¿del negocio o personal?
create or replace function public.gasto_uso(p_id uuid, p_uso text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_g public.gastos;
begin
  perform private.require_session();
  select * into v_g from public.gastos where id = p_id for update;
  if v_g.id is null or not private.can_book(v_g.company_id) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_g.estado <> 'registrado' or p_uso not in ('negocio', 'personal') then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  update public.gastos set uso = p_uso where id = p_id;
end
$$;

-- Descartar (no se borra): queda con su motivo.
create or replace function public.gasto_descartar(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_g public.gastos;
begin
  perform private.require_session();
  select * into v_g from public.gastos where id = p_id for update;
  if v_g.id is null or not private.can_book(v_g.company_id) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_g.estado = 'descartado' then return; end if;
  if v_g.estado = 'revisado' and not private.works_company(v_g.company_id) then raise exception 'ENQ_PERIODO_CERRADO'; end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 3 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  update public.gastos set estado = 'descartado', nota = left(btrim(p_motivo), 500) where id = p_id;
  perform private.log_event(v_g.company_id, 'gasto.descartado', left(btrim(p_motivo), 200), jsonb_build_object('gasto', p_id));
end
$$;

-- Contador ENQORA: marca el gasto como revisado (con nota opcional).
create or replace function public.gasto_revisar(p_id uuid, p_nota text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_g public.gastos;
begin
  perform private.require_session();
  select * into v_g from public.gastos where id = p_id for update;
  if v_g.id is null or not private.works_company(v_g.company_id) or private.is_staff(array['ai_agent']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_g.estado <> 'registrado' then raise exception 'ENQ_YA_DECIDIDA'; end if;
  update public.gastos set estado = 'revisado', revisado_por = (select auth.uid()), revisado_at = now(),
    nota = coalesce(nullif(left(btrim(coalesce(p_nota, '')), 500), ''), nota) where id = p_id;
end
$$;

revoke execute on function private.path_gasto(text) from public, anon;
grant execute on function private.path_gasto(text) to authenticated;
revoke execute on function public.registrar_gasto(uuid, jsonb), public.gasto_uso(uuid, text), public.gasto_descartar(uuid, text),
  public.gasto_revisar(uuid, text) from public, anon;
grant execute on function public.registrar_gasto(uuid, jsonb), public.gasto_uso(uuid, text), public.gasto_descartar(uuid, text),
  public.gasto_revisar(uuid, text) to authenticated;
