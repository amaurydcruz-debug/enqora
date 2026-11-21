-- =====================================================================
-- ENQORA · 0068 · Contabilidad mensual · Etapa 3: ventas del punto de venta (POS)
-- Las ventas diarias del punto de venta llegan a ENQORA de dos formas:
--   1) Archivo: el cliente sube la exportación de su POS (CSV); el navegador la resume por día.
--   2) Conector: el POS (Vania POS primero, o cualquier otro) envía el resumen diario a /api/pos/ventas con una
--      clave de conexión que crea el dueño de la empresa (se muestra una sola vez; se guarda solo su huella).
-- Sirve para cruzar: ventas del POS vs. ventas declaradas en el Registro de Compras y Ventas (boletas y
-- facturas) y detectar diferencias antes de declarar el F29. Cada carga queda en la bitácora con sus totales.
-- Un mes aprobado o declarado no admite cambios. Se puede ejecutar más de una vez.
-- =====================================================================

create table if not exists private.pos_conectores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  nombre text not null check (char_length(nombre) between 2 and 80),
  sistema text not null check (char_length(sistema) between 2 and 40),
  prefijo text not null,
  clave_hash text not null unique,
  creado_por uuid references auth.users (id) on delete set null,
  creado timestamptz not null default now(),
  revocado timestamptz,
  revocado_por uuid references auth.users (id) on delete set null,
  ultimo_uso timestamptz
);
alter table private.pos_conectores enable row level security;

create table if not exists public.pos_dias (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  period date not null check (period = date_trunc('month', period)::date),
  fecha date not null,
  origen text not null check (origen in ('archivo', 'conector')),
  sistema text not null default 'POS' check (char_length(sistema) between 2 and 40),
  n_ventas integer not null default 0 check (n_ventas >= 0),
  total bigint not null check (total >= 0),
  neto bigint check (neto >= 0),
  iva bigint check (iva >= 0),
  exento bigint check (exento >= 0),
  efectivo bigint not null default 0 check (efectivo >= 0),
  debito bigint not null default 0 check (debito >= 0),
  credito bigint not null default 0 check (credito >= 0),
  transferencia bigint not null default 0 check (transferencia >= 0),
  otros bigint not null default 0 check (otros >= 0),
  archivo text check (char_length(archivo) <= 200),
  conector_id uuid,
  cargado_por uuid references auth.users (id) on delete set null,
  actualizado timestamptz not null default now(),
  unique (company_id, fecha, origen, sistema)
);
create index if not exists pos_dias_period_idx on public.pos_dias (company_id, period, fecha);
alter table public.pos_dias enable row level security;
revoke all on public.pos_dias from anon, authenticated;
grant select on public.pos_dias to authenticated;
drop policy if exists pos_dias_ver on public.pos_dias;
create policy pos_dias_ver on public.pos_dias for select to authenticated using (private.can_read_books(company_id));

-- Núcleo común: valida y guarda los días (reemplaza el día si se vuelve a enviar) y deja la bitácora.
create or replace function private.pos_guardar_dias(p_company uuid, p_dias jsonb, p_origen text, p_sistema text, p_archivo text,
  p_conector uuid, p_usuario uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d jsonb;
  v_fecha date;
  v_hoy date := (now() at time zone 'America/Santiago')::date;
  v_n int := 0;
  v_total bigint := 0;
  v_sistema text := left(coalesce(nullif(btrim(p_sistema), ''), 'POS'), 40);
  v_periodos date[] := '{}';
begin
  if jsonb_typeof(p_dias) <> 'array' or jsonb_array_length(p_dias) = 0 or jsonb_array_length(p_dias) > 62 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  for d in select * from jsonb_array_elements(p_dias) loop
    begin
      v_fecha := (d ->> 'fecha')::date;
    exception when others then raise exception 'ENQ_DATOS_INVALIDOS';
    end;
    if v_fecha is null or v_fecha > v_hoy or v_fecha < v_hoy - 400 then raise exception 'ENQ_FECHA_GASTO'; end if;
    if exists (select 1 from public.vat_returns v where v.company_id = p_company and v.period = date_trunc('month', v_fecha)::date
               and v.status in ('aprobado', 'presentado')) then
      raise exception 'ENQ_PERIODO_CERRADO';
    end if;
    insert into public.pos_dias (company_id, period, fecha, origen, sistema, n_ventas, total, neto, iva, exento, efectivo, debito, credito,
      transferencia, otros, archivo, conector_id, cargado_por, actualizado)
    values (p_company, date_trunc('month', v_fecha)::date, v_fecha, p_origen, v_sistema,
      coalesce((d ->> 'n_ventas')::int, 0), round((d ->> 'total')::numeric)::bigint,
      round(nullif(d ->> 'neto', '')::numeric)::bigint, round(nullif(d ->> 'iva', '')::numeric)::bigint, round(nullif(d ->> 'exento', '')::numeric)::bigint,
      coalesce(round((d ->> 'efectivo')::numeric)::bigint, 0), coalesce(round((d ->> 'debito')::numeric)::bigint, 0),
      coalesce(round((d ->> 'credito')::numeric)::bigint, 0), coalesce(round((d ->> 'transferencia')::numeric)::bigint, 0),
      coalesce(round((d ->> 'otros')::numeric)::bigint, 0), left(p_archivo, 200), p_conector, p_usuario, now())
    on conflict (company_id, fecha, origen, sistema) do update set
      n_ventas = excluded.n_ventas, total = excluded.total, neto = excluded.neto, iva = excluded.iva, exento = excluded.exento,
      efectivo = excluded.efectivo, debito = excluded.debito, credito = excluded.credito, transferencia = excluded.transferencia,
      otros = excluded.otros, archivo = excluded.archivo, conector_id = excluded.conector_id, cargado_por = excluded.cargado_por, actualizado = now();
    v_n := v_n + 1;
    v_total := v_total + round((d ->> 'total')::numeric)::bigint;
    if not (date_trunc('month', v_fecha)::date = any (v_periodos)) then v_periodos := v_periodos || date_trunc('month', v_fecha)::date; end if;
  end loop;
  perform private.log_event(p_company, 'pos.cargado', v_sistema || ' · ' || v_n || ' día(s)',
    jsonb_build_object('origen', p_origen, 'sistema', v_sistema, 'dias', v_n, 'total', v_total, 'archivo', p_archivo, 'conector', p_conector));
  return jsonb_build_object('dias', v_n, 'total', v_total, 'periodos', to_jsonb(v_periodos));
exception
  when check_violation or invalid_text_representation or numeric_value_out_of_range then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

-- Carga desde archivo (el cliente o su contador).
create or replace function public.pos_cargar_dias(p_company uuid, p_dias jsonb, p_sistema text, p_archivo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
begin
  if not private.can_book(p_company) then raise exception 'ENQ_SIN_PERMISO'; end if;
  return private.pos_guardar_dias(p_company, p_dias, 'archivo', p_sistema, p_archivo, null, v_uid);
end
$$;

-- Carga por conector (la llama /api/pos/ventas con la clave del POS). Máximo 60 envíos por hora por conector.
create or replace function public.pos_api_cargar(p_clave text, p_dias jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_c private.pos_conectores;
begin
  if p_clave is null or p_clave !~ '^enq_pos_[0-9a-f]{48}$' then raise exception 'ENQ_SIN_PERMISO'; end if;
  select * into v_c from private.pos_conectores where clave_hash = encode(extensions.digest(p_clave, 'sha256'), 'hex') and revocado is null for update;
  if v_c.id is null then raise exception 'ENQ_SIN_PERMISO'; end if;
  if (select count(*) from public.audit_events e where e.company_id = v_c.company_id and e.action = 'pos.cargado'
      and e.created_at > now() - interval '1 hour' and e.metadata ->> 'conector' = v_c.id::text) >= 60 then
    raise exception 'ENQ_DEMASIADAS_CONSULTAS';
  end if;
  update private.pos_conectores set ultimo_uso = now() where id = v_c.id;
  return private.pos_guardar_dias(v_c.company_id, p_dias, 'conector', v_c.sistema, null, v_c.id, null);
end
$$;

-- Conectores: el dueño o administrador crea la clave (se muestra una sola vez), la lista y la revoca.
create or replace function public.pos_crear_conector(p_company uuid, p_nombre text, p_sistema text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_clave text := 'enq_pos_' || encode(extensions.gen_random_bytes(24), 'hex');
begin
  if not private.has_role(p_company, array['owner', 'admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if (select count(*) from private.pos_conectores where company_id = p_company and revocado is null) >= 5 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  insert into private.pos_conectores (company_id, nombre, sistema, prefijo, clave_hash, creado_por)
  values (p_company, left(btrim(p_nombre), 80), left(coalesce(nullif(btrim(p_sistema), ''), 'POS'), 40), left(v_clave, 14),
          encode(extensions.digest(v_clave, 'sha256'), 'hex'), v_uid);
  perform private.log_event(p_company, 'pos.conector_creado', left(btrim(p_nombre), 80), jsonb_build_object('sistema', p_sistema));
  return v_clave;
end
$$;

create or replace function public.pos_conectores(p_company uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_session();
  if not private.can_read_books(p_company) then raise exception 'ENQ_SIN_PERMISO'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre, 'sistema', c.sistema, 'prefijo', c.prefijo,
      'creado', c.creado, 'revocado', c.revocado, 'ultimo_uso', c.ultimo_uso) order by c.creado desc), '[]'::jsonb)
    from private.pos_conectores c where c.company_id = p_company);
end
$$;

create or replace function public.pos_revocar_conector(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_c private.pos_conectores;
begin
  select * into v_c from private.pos_conectores where id = p_id for update;
  if v_c.id is null or not private.has_role(v_c.company_id, array['owner', 'admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_c.revocado is not null then return; end if;
  update private.pos_conectores set revocado = now(), revocado_por = v_uid where id = p_id;
  perform private.log_event(v_c.company_id, 'pos.conector_revocado', v_c.nombre, jsonb_build_object('conector', p_id));
end
$$;

-- Cruce del mes: ventas del POS vs. ventas del Registro de Compras y Ventas (boletas y facturas).
-- Un día enviado por el conector prevalece sobre el archivo del mismo día.
create or replace function public.pos_resumen_mes(p_company uuid, p_period date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_period date := date_trunc('month', p_period)::date;
  r record;
  v_rcv bigint;
begin
  perform private.require_session();
  if not private.can_read_books(p_company) then raise exception 'ENQ_SIN_PERMISO'; end if;
  select count(distinct fecha) as dias, coalesce(sum(total), 0) as total, coalesce(sum(n_ventas), 0) as ventas,
         coalesce(sum(efectivo), 0) as efectivo, coalesce(sum(debito), 0) as debito, coalesce(sum(credito), 0) as credito,
         coalesce(sum(transferencia), 0) as transferencia, coalesce(sum(otros), 0) as otros, string_agg(distinct sistema, ', ') as sistemas,
         max(actualizado) as ultimo
    into r from public.pos_dias p
    where p.company_id = p_company and p.period = v_period
      -- Si un día llegó por conector, el archivo de ese mismo día no se suma (evita contarlo dos veces).
      and not (p.origen = 'archivo' and exists (select 1 from public.pos_dias c where c.company_id = p.company_id and c.fecha = p.fecha and c.origen = 'conector'));
  select coalesce(sum(d.total * private.doc_sign(d.doc_type)), 0) into v_rcv
    from public.acc_documents d where d.company_id = p_company and d.period = v_period and d.book = 'venta';
  return jsonb_build_object('periodo', v_period, 'dias', r.dias, 'total', r.total, 'ventas', r.ventas, 'efectivo', r.efectivo,
    'debito', r.debito, 'credito', r.credito, 'transferencia', r.transferencia, 'otros', r.otros, 'sistemas', r.sistemas,
    'ultimo', r.ultimo, 'rcv', v_rcv, 'diferencia', r.total - v_rcv,
    'diferencia_pct', case when r.total > 0 then round(100.0 * (r.total - v_rcv) / r.total, 1) end);
end
$$;

revoke execute on function private.pos_guardar_dias(uuid, jsonb, text, text, text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.pos_cargar_dias(uuid, jsonb, text, text), public.pos_crear_conector(uuid, text, text),
  public.pos_conectores(uuid), public.pos_revocar_conector(uuid), public.pos_resumen_mes(uuid, date) from public, anon;
grant execute on function public.pos_cargar_dias(uuid, jsonb, text, text), public.pos_crear_conector(uuid, text, text),
  public.pos_conectores(uuid), public.pos_revocar_conector(uuid), public.pos_resumen_mes(uuid, date) to authenticated;
revoke execute on function public.pos_api_cargar(text, jsonb) from public;
grant execute on function public.pos_api_cargar(text, jsonb) to anon, authenticated;
