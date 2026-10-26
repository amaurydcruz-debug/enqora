-- =====================================================================
-- ENQORA · 0013 · ENQORA CONTABILIDAD (M12 / Etapa 10)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0002…0012.
--
-- Principios (ver docs/ENQORA-CONTABILIDAD.md):
--  · ENQORA no se conecta al SII ni usa claves: el cliente sube el detalle del Registro de
--    Compras y Ventas (RCV) que descarga del SII y las cartolas de su banco.
--  · Documentos por período, con RUT validado y sin duplicados.
--  · Conciliación bancaria: sugerencias por monto y fecha; siempre las confirma una persona.
--  · F29 preliminar con los códigos del formulario; lo que requiere criterio profesional se marca.
--    Flujo: borrador → revisión profesional (otra persona) → aprobado → presentado (folio SII).
--  · Un período declarado (F29 aprobado o presentado) no admite cambios en sus documentos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Acceso
-- ---------------------------------------------------------------------

-- Lee la contabilidad: miembros de la empresa y el equipo que trabaja sus casos.
create or replace function private.can_read_books(p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_member(p_company) or private.works_company(p_company)
$$;

-- Carga y concilia: Propietario, Administrador, Contador de la empresa o el equipo ENQORA (no agentes IA
-- para cerrar decisiones; sí para cargar y sugerir).
create or replace function private.can_book(p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_role(p_company, array['owner', 'admin', 'accountant']) or private.works_company(p_company)
$$;

create or replace function private.month_of(p_day date) returns date
language sql immutable set search_path = '' as $$
  select date_trunc('month', p_day)::date
$$;

-- Notas de crédito: restan.
create or replace function private.doc_sign(p_type smallint) returns integer
language sql immutable set search_path = '' as $$
  select case when p_type in (60, 61, 106, 112) then -1 else 1 end
$$;

-- ---------------------------------------------------------------------
-- 2. Tablas
-- ---------------------------------------------------------------------

create table public.acc_imports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  period date not null check (period = date_trunc('month', period)::date),
  kind text not null check (kind in ('compras', 'ventas', 'banco')),
  file_name text check (char_length(file_name) <= 200),
  rows_received integer not null default 0,
  rows_accepted integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index acc_imports_company_idx on public.acc_imports (company_id, period);

create table public.acc_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  period date not null check (period = date_trunc('month', period)::date),
  book text not null check (book in ('compra', 'venta')),
  doc_type smallint not null check (doc_type between 1 and 999),
  folio bigint not null check (folio >= 0),
  counterpart_rut text not null default '',
  counterpart_name text check (char_length(counterpart_name) <= 200),
  issue_date date,
  exempt bigint not null default 0,
  net bigint not null default 0,
  vat bigint not null default 0,                    -- débito (ventas) o IVA recuperable (compras)
  vat_non_recoverable bigint not null default 0,
  fixed_asset_vat bigint not null default 0,
  common_use_vat bigint not null default 0,
  other_taxes bigint not null default 0,
  total bigint not null,
  import_id uuid references public.acc_imports (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, book, doc_type, counterpart_rut, folio)
);
create index acc_documents_period_idx on public.acc_documents (company_id, period, book);

create table public.bank_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  period date not null check (period = date_trunc('month', period)::date),
  account_label text not null check (char_length(account_label) between 2 and 80),
  movement_date date not null,
  description text not null check (char_length(description) <= 300),
  amount bigint not null check (amount <> 0),       -- abono positivo, cargo negativo
  balance bigint,
  reference text check (char_length(reference) <= 80),
  import_id uuid references public.acc_imports (id) on delete set null,
  dedupe text not null,
  created_at timestamptz not null default now(),
  unique (company_id, dedupe)
);
create index bank_movements_period_idx on public.bank_movements (company_id, period, movement_date);

create table public.reconciliations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  movement_id uuid not null unique references public.bank_movements (id) on delete cascade,
  document_id uuid unique references public.acc_documents (id) on delete cascade,
  category text check (category in ('comision_bancaria', 'remuneraciones', 'impuestos', 'prestamo', 'traspaso',
                                    'aporte_retiro', 'otro')),
  note text check (char_length(note) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((document_id is not null) <> (category is not null))
);

create table public.vat_returns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  period date not null check (period = date_trunc('month', period)::date),
  version integer not null default 1,
  status text not null default 'borrador' check (status in ('borrador', 'en_revision', 'aprobado', 'presentado', 'anulado')),
  figures jsonb not null default '{}'::jsonb,
  debit bigint not null default 0,                  -- cód. 538
  credit bigint not null default 0,                 -- cód. 537 (incluye remanente anterior)
  prev_remanente bigint not null default 0 check (prev_remanente >= 0),   -- cód. 504
  iva_determinado bigint not null default 0,        -- cód. 89
  remanente_siguiente bigint not null default 0,    -- cód. 77
  ppm_base bigint not null default 0,               -- cód. 563
  ppm_rate numeric(5, 2) not null default 0 check (ppm_rate between 0 and 30),  -- cód. 115
  ppm bigint not null default 0,                    -- cód. 62
  retenciones bigint not null default 0 check (retenciones >= 0),         -- cód. 151
  total_pagar bigint not null default 0,            -- cód. 91 (referencial)
  flags text[] not null default '{}',
  note text check (char_length(note) <= 1000),
  prepared_by uuid references auth.users (id) on delete set null,
  prepared_at timestamptz not null default now(),
  submitted_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 1000),
  presented_folio text check (char_length(presented_folio) <= 40),
  presented_on date,
  presented_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index vat_returns_one_live on public.vat_returns (company_id, period) where status <> 'anulado';

-- Un período con F29 aprobado o presentado queda cerrado para cambios.
create or replace function private.period_locked(p_company uuid, p_period date) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.vat_returns v where v.company_id = p_company and v.period = p_period
                 and v.status in ('aprobado', 'presentado'))
$$;

-- ---------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------

alter table public.acc_imports enable row level security;
alter table public.acc_documents enable row level security;
alter table public.bank_movements enable row level security;
alter table public.reconciliations enable row level security;
alter table public.vat_returns enable row level security;

revoke all on public.acc_imports, public.acc_documents, public.bank_movements, public.reconciliations, public.vat_returns
  from anon, authenticated;
grant select on public.acc_imports, public.acc_documents, public.bank_movements, public.reconciliations, public.vat_returns
  to authenticated;

create policy mfa_requerido on public.acc_imports as restrictive for all to authenticated using (private.is_mfa()) with check (private.is_mfa());
create policy mfa_requerido on public.acc_documents as restrictive for all to authenticated using (private.is_mfa()) with check (private.is_mfa());
create policy mfa_requerido on public.bank_movements as restrictive for all to authenticated using (private.is_mfa()) with check (private.is_mfa());
create policy mfa_requerido on public.reconciliations as restrictive for all to authenticated using (private.is_mfa()) with check (private.is_mfa());
create policy mfa_requerido on public.vat_returns as restrictive for all to authenticated using (private.is_mfa()) with check (private.is_mfa());

create policy cargas_visibles on public.acc_imports for select to authenticated using (private.can_read_books(company_id));
create policy documentos_contables_visibles on public.acc_documents for select to authenticated using (private.can_read_books(company_id));
create policy movimientos_visibles on public.bank_movements for select to authenticated using (private.can_read_books(company_id));
create policy conciliaciones_visibles on public.reconciliations for select to authenticated using (private.can_read_books(company_id));
create policy f29_visibles on public.vat_returns for select to authenticated using (private.can_read_books(company_id));

-- ---------------------------------------------------------------------
-- 4. Carga de documentos (RCV) y cartolas
-- ---------------------------------------------------------------------

-- p_rows (máx. 2000): [{doc_type, folio, rut, name, date, exempt, net, vat, vat_nr, fixed_vat, common_vat, other, total}]
-- Upsert por (libro, tipo, RUT, folio): volver a subir el mismo archivo no duplica.
create or replace function public.import_documents(p_company uuid, p_period date, p_book text, p_rows jsonb, p_file_name text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_period date := private.month_of(p_period);
  v_import uuid;
  r jsonb;
  v_rut text;
  v_type smallint;
  v_ok integer := 0;
  v_skip integer := 0;
begin
  if not private.can_book(p_company) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_book not in ('compra', 'venta') or p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  if private.period_locked(p_company, v_period) then raise exception 'ENQ_PERIODO_DECLARADO'; end if;

  insert into public.acc_imports (company_id, period, kind, file_name, rows_received, created_by)
  values (p_company, v_period, case p_book when 'compra' then 'compras' else 'ventas' end, left(p_file_name, 200),
          jsonb_array_length(p_rows), v_uid)
  returning id into v_import;

  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      v_type := (r ->> 'doc_type')::smallint;
      v_rut := private.normalize_rut(r ->> 'rut');
      -- Boletas y resúmenes pueden venir sin RUT del receptor.
      if v_rut is null or not private.rut_is_valid(v_rut) then
        if v_type in (35, 38, 39, 41, 48) and coalesce(r ->> 'rut', '') !~ '[1-9]' then v_rut := ''; else v_skip := v_skip + 1; continue; end if;
      end if;
      insert into public.acc_documents (company_id, period, book, doc_type, folio, counterpart_rut, counterpart_name, issue_date,
        exempt, net, vat, vat_non_recoverable, fixed_asset_vat, common_use_vat, other_taxes, total, import_id)
      values (p_company, v_period, p_book, v_type, (r ->> 'folio')::bigint, v_rut, left(nullif(trim(r ->> 'name'), ''), 200),
        nullif(r ->> 'date', '')::date,
        coalesce((r ->> 'exempt')::bigint, 0), coalesce((r ->> 'net')::bigint, 0), coalesce((r ->> 'vat')::bigint, 0),
        coalesce((r ->> 'vat_nr')::bigint, 0), coalesce((r ->> 'fixed_vat')::bigint, 0), coalesce((r ->> 'common_vat')::bigint, 0),
        coalesce((r ->> 'other')::bigint, 0), (r ->> 'total')::bigint, v_import)
      on conflict (company_id, book, doc_type, counterpart_rut, folio) do update set
        period = excluded.period, counterpart_name = excluded.counterpart_name, issue_date = excluded.issue_date,
        exempt = excluded.exempt, net = excluded.net, vat = excluded.vat, vat_non_recoverable = excluded.vat_non_recoverable,
        fixed_asset_vat = excluded.fixed_asset_vat, common_use_vat = excluded.common_use_vat, other_taxes = excluded.other_taxes,
        total = excluded.total, import_id = excluded.import_id
      where not private.period_locked(p_company, public.acc_documents.period);
      v_ok := v_ok + 1;
    exception
      when invalid_text_representation or numeric_value_out_of_range or not_null_violation or check_violation
           or invalid_datetime_format or datetime_field_overflow then
        v_skip := v_skip + 1;
    end;
  end loop;

  update public.acc_imports set rows_accepted = v_ok where id = v_import;
  return jsonb_build_object('aceptadas', v_ok, 'descartadas', v_skip, 'carga', v_import);
end
$$;

-- Vacía un libro del período (para volver a cargarlo). No toca documentos conciliados.
create or replace function public.clear_book(p_company uuid, p_period date, p_book text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_n integer;
begin
  perform private.require_session();
  if not private.can_book(p_company) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if private.period_locked(p_company, private.month_of(p_period)) then raise exception 'ENQ_PERIODO_DECLARADO'; end if;
  delete from public.acc_documents d where d.company_id = p_company and d.period = private.month_of(p_period) and d.book = p_book
    and not exists (select 1 from public.reconciliations r where r.document_id = d.id);
  get diagnostics v_n = row_count;
  return v_n;
end
$$;

-- p_rows (máx. 2000): [{date, description, amount, balance, reference}]. Solo fechas del período.
create or replace function public.import_bank(p_company uuid, p_period date, p_account text, p_rows jsonb, p_file_name text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_period date := private.month_of(p_period);
  v_import uuid;
  r jsonb;
  v_date date;
  v_amount bigint;
  v_desc text;
  v_ok integer := 0;
  v_skip integer := 0;
  v_dup integer := 0;
begin
  if not private.can_book(p_company) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000
     or char_length(trim(coalesce(p_account, ''))) not between 2 and 80 then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  insert into public.acc_imports (company_id, period, kind, file_name, rows_received, created_by)
  values (p_company, v_period, 'banco', left(p_file_name, 200), jsonb_array_length(p_rows), v_uid)
  returning id into v_import;

  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      v_date := (r ->> 'date')::date;
      v_amount := (r ->> 'amount')::bigint;
      v_desc := left(trim(coalesce(r ->> 'description', '')), 300);
      if v_date is null or private.month_of(v_date) <> v_period or v_amount is null or v_amount = 0 then
        v_skip := v_skip + 1; continue;
      end if;
      insert into public.bank_movements (company_id, period, account_label, movement_date, description, amount, balance, reference,
        import_id, dedupe)
      values (p_company, v_period, trim(p_account), v_date, v_desc, v_amount, nullif(r ->> 'balance', '')::bigint,
        left(nullif(trim(r ->> 'reference'), ''), 80), v_import,
        md5(trim(p_account) || '|' || v_date || '|' || v_amount || '|' || v_desc || '|' || coalesce(r ->> 'balance', '')))
      on conflict (company_id, dedupe) do nothing;
      if found then v_ok := v_ok + 1; else v_dup := v_dup + 1; end if;
    exception
      when invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format or datetime_field_overflow then
        v_skip := v_skip + 1;
    end;
  end loop;
  update public.acc_imports set rows_accepted = v_ok where id = v_import;
  return jsonb_build_object('aceptadas', v_ok, 'repetidas', v_dup, 'descartadas', v_skip, 'carga', v_import);
end
$$;

create or replace function public.clear_bank(p_company uuid, p_period date, p_account text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_n integer;
begin
  perform private.require_session();
  if not private.can_book(p_company) then raise exception 'ENQ_SIN_PERMISO'; end if;
  delete from public.bank_movements m where m.company_id = p_company and m.period = private.month_of(p_period)
    and m.account_label = trim(p_account) and not exists (select 1 from public.reconciliations r where r.movement_id = m.id);
  get diagnostics v_n = row_count;
  return v_n;
end
$$;

-- ---------------------------------------------------------------------
-- 5. Conciliación
-- ---------------------------------------------------------------------

-- Sugerencias: mismo monto (cargo = compra, abono = venta), fecha cercana; el RUT en la glosa suma puntaje.
-- Cada movimiento y cada documento aparece una sola vez (el de mejor puntaje).
create or replace function public.match_suggestions(p_company uuid, p_period date)
returns table (movement_id uuid, document_id uuid, score integer, days integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_read_books(p_company) then raise exception 'ENQ_SIN_PERMISO'; end if;
  return query
  with cand as (
    select m.id as mid, d.id as did,
      (case when d.counterpart_rut <> '' and regexp_replace(m.description, '[^0-9]', '', 'g')
                 like '%' || split_part(d.counterpart_rut, '-', 1) || '%' then 3 else 0 end
       + case when abs(m.movement_date - coalesce(d.issue_date, m.movement_date)) <= 10 then 2 else 0 end
       + case when m.description ilike '%' || d.folio::text || '%' then 1 else 0 end) as sc,
      abs(m.movement_date - coalesce(d.issue_date, m.movement_date)) as dd
    from public.bank_movements m
    join public.acc_documents d on d.company_id = m.company_id
      and ((d.book = 'compra' and m.amount = -(private.doc_sign(d.doc_type) * d.total))
        or (d.book = 'venta' and m.amount = private.doc_sign(d.doc_type) * d.total))
      and abs(m.movement_date - coalesce(d.issue_date, m.movement_date)) <= 60
    where m.company_id = p_company and m.period = private.month_of(p_period)
      and not exists (select 1 from public.reconciliations r where r.movement_id = m.id)
      and not exists (select 1 from public.reconciliations r where r.document_id = d.id)
  ), best_m as (
    select distinct on (mid) mid, did, sc, dd from cand order by mid, sc desc, dd asc
  )
  select distinct on (b.did) b.mid, b.did, b.sc, b.dd from best_m b order by b.did, b.sc desc, b.dd asc;
end
$$;

create or replace function public.reconcile(p_movement uuid, p_document uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_m public.bank_movements;
  v_d public.acc_documents;
  v_id uuid;
begin
  select * into v_m from public.bank_movements where id = p_movement;
  select * into v_d from public.acc_documents where id = p_document;
  if v_m.id is null or v_d.id is null or v_m.company_id <> v_d.company_id or not private.can_book(v_m.company_id) then
    raise exception 'ENQ_SIN_PERMISO';
  end if;
  if not ((v_d.book = 'compra' and v_m.amount = -(private.doc_sign(v_d.doc_type) * v_d.total))
          or (v_d.book = 'venta' and v_m.amount = private.doc_sign(v_d.doc_type) * v_d.total)) then
    raise exception 'ENQ_MONTO_NO_COINCIDE';
  end if;
  insert into public.reconciliations (company_id, movement_id, document_id, created_by)
  values (v_m.company_id, p_movement, p_document, v_uid)
  returning id into v_id;
  return v_id;
exception
  when unique_violation then raise exception 'ENQ_YA_CONCILIADO';
end
$$;

create or replace function public.reconcile_other(p_movement uuid, p_category text, p_note text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_m public.bank_movements;
  v_id uuid;
begin
  select * into v_m from public.bank_movements where id = p_movement;
  if v_m.id is null or not private.can_book(v_m.company_id) then raise exception 'ENQ_SIN_PERMISO'; end if;
  insert into public.reconciliations (company_id, movement_id, category, note, created_by)
  values (v_m.company_id, p_movement, p_category, nullif(trim(coalesce(p_note, '')), ''), v_uid)
  returning id into v_id;
  return v_id;
exception
  when unique_violation then raise exception 'ENQ_YA_CONCILIADO';
  when check_violation then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

create or replace function public.unreconcile(p_reconciliation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid;
begin
  perform private.require_session();
  select company_id into v_company from public.reconciliations where id = p_reconciliation;
  if v_company is null or not private.can_book(v_company) then raise exception 'ENQ_SIN_PERMISO'; end if;
  delete from public.reconciliations where id = p_reconciliation;
end
$$;

-- ---------------------------------------------------------------------
-- 6. IVA y F29
-- ---------------------------------------------------------------------

-- Cifras del período a partir de los documentos cargados (vista previa, no guarda nada).
create or replace function public.vat_figures(p_company uuid, p_period date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_period date := private.month_of(p_period);
  v jsonb;
  v_flags text[] := '{}';
begin
  if not private.can_read_books(p_company) then raise exception 'ENQ_SIN_PERMISO'; end if;
  with d as (select * from public.acc_documents where company_id = p_company and period = v_period)
  select jsonb_build_object(
    'ventas_facturas_cantidad', (select count(*) from d where book = 'venta' and doc_type in (29, 30, 33)),       -- cód. 503
    'ventas_facturas_iva', (select coalesce(sum(vat), 0) from d where book = 'venta' and doc_type in (29, 30, 33)), -- cód. 502
    'ventas_boletas_cantidad', (select count(*) from d where book = 'venta' and doc_type in (35, 39, 48)),
    'ventas_boletas_iva', (select coalesce(sum(vat), 0) from d where book = 'venta' and doc_type in (35, 39, 48)),
    'ventas_nd_cantidad', (select count(*) from d where book = 'venta' and doc_type in (55, 56)),
    'ventas_nd_iva', (select coalesce(sum(vat), 0) from d where book = 'venta' and doc_type in (55, 56)),
    'ventas_nc_cantidad', (select count(*) from d where book = 'venta' and doc_type in (60, 61)),                 -- cód. 509
    'ventas_nc_iva', (select coalesce(sum(vat), 0) from d where book = 'venta' and doc_type in (60, 61)),         -- cód. 510
    'ventas_exentas', (select coalesce(sum(private.doc_sign(doc_type) * exempt), 0) from d where book = 'venta'),
    'ventas_exportacion', (select coalesce(sum(private.doc_sign(doc_type) * total), 0) from d where book = 'venta' and doc_type in (110, 111, 112)),
    'ventas_netas', (select coalesce(sum(private.doc_sign(doc_type) * (net + exempt)), 0) from d where book = 'venta'),
    'compras_facturas_cantidad', (select count(*) from d where book = 'compra' and doc_type in (30, 33, 45, 46)),  -- cód. 519
    'compras_facturas_iva', (select coalesce(sum(vat), 0) from d where book = 'compra' and doc_type in (30, 33, 45, 46)), -- cód. 520
    'compras_nd_cantidad', (select count(*) from d where book = 'compra' and doc_type in (55, 56)),
    'compras_nd_iva', (select coalesce(sum(vat), 0) from d where book = 'compra' and doc_type in (55, 56)),
    'compras_nc_cantidad', (select count(*) from d where book = 'compra' and doc_type in (60, 61)),               -- cód. 527
    'compras_nc_iva', (select coalesce(sum(vat), 0) from d where book = 'compra' and doc_type in (60, 61)),       -- cód. 528
    'compras_iva_no_recuperable', (select coalesce(sum(vat_non_recoverable), 0) from d where book = 'compra'),
    'compras_iva_activo_fijo', (select coalesce(sum(fixed_asset_vat), 0) from d where book = 'compra'),
    'compras_iva_uso_comun', (select coalesce(sum(common_use_vat), 0) from d where book = 'compra'),
    'otros_impuestos', (select coalesce(sum(other_taxes), 0) from d),
    'facturas_compra_46', (select count(*) from d where doc_type = 46),
    'otros_tipos', (select count(*) from d where doc_type not in (29, 30, 32, 33, 34, 35, 38, 39, 41, 45, 46, 48, 55, 56, 60, 61, 110, 111, 112)),
    'documentos', (select count(*) from d)
  ) into v;

  if (v ->> 'facturas_compra_46')::int > 0 then v_flags := array_append(v_flags, 'facturas_de_compra'); end if;
  if (v ->> 'compras_iva_activo_fijo')::bigint > 0 then v_flags := array_append(v_flags, 'iva_activo_fijo'); end if;
  if (v ->> 'compras_iva_uso_comun')::bigint > 0 then v_flags := array_append(v_flags, 'iva_uso_comun'); end if;
  if (v ->> 'otros_impuestos')::bigint > 0 then v_flags := array_append(v_flags, 'otros_impuestos'); end if;
  if (v ->> 'ventas_exportacion')::bigint <> 0 then v_flags := array_append(v_flags, 'exportaciones'); end if;
  if (v ->> 'otros_tipos')::int > 0 then v_flags := array_append(v_flags, 'otros_documentos'); end if;

  return v || jsonb_build_object(
    'debito', (v ->> 'ventas_facturas_iva')::bigint + (v ->> 'ventas_boletas_iva')::bigint + (v ->> 'ventas_nd_iva')::bigint
              - (v ->> 'ventas_nc_iva')::bigint,
    'credito', (v ->> 'compras_facturas_iva')::bigint + (v ->> 'compras_nd_iva')::bigint - (v ->> 'compras_nc_iva')::bigint,
    'alertas', to_jsonb(v_flags));
end
$$;

-- Guarda (o actualiza) el borrador del F29 del período con los datos que aporta la persona.
create or replace function public.save_vat_draft(p_company uuid, p_period date, p_prev_remanente bigint, p_ppm_rate numeric,
  p_retenciones bigint, p_note text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_period date := private.month_of(p_period);
  v_f jsonb;
  v_v public.vat_returns;
  v_debit bigint;
  v_credit bigint;
  v_det bigint;
  v_rem bigint := 0;
  v_base bigint;
  v_ppm bigint;
  v_flags text[];
  v_id uuid;
begin
  if not private.can_book(p_company) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if coalesce(p_prev_remanente, 0) < 0 or coalesce(p_retenciones, 0) < 0 or coalesce(p_ppm_rate, 0) not between 0 and 30
     or char_length(coalesce(p_note, '')) > 1000 then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  select * into v_v from public.vat_returns where company_id = p_company and period = v_period and status <> 'anulado' for update;
  if v_v.id is not null and v_v.status <> 'borrador' then raise exception 'ENQ_F29_NO_EDITABLE'; end if;

  v_f := public.vat_figures(p_company, v_period);
  v_debit := (v_f ->> 'debito')::bigint;
  v_credit := (v_f ->> 'credito')::bigint + coalesce(p_prev_remanente, 0);
  v_det := v_debit - v_credit;
  if v_det < 0 then v_rem := -v_det; v_det := 0; end if;
  v_base := greatest((v_f ->> 'ventas_netas')::bigint, 0);
  v_ppm := round(v_base * coalesce(p_ppm_rate, 0) / 100.0);
  select coalesce(array_agg(x), '{}') into v_flags from jsonb_array_elements_text(v_f -> 'alertas') x;
  if coalesce(p_prev_remanente, 0) > 0 then v_flags := array_append(v_flags, 'remanente_reajuste_utm'); end if;
  if coalesce(p_ppm_rate, 0) = 0 and v_base > 0 then v_flags := array_append(v_flags, 'ppm_sin_tasa'); end if;

  if v_v.id is null then
    insert into public.vat_returns (company_id, period, version, figures, debit, credit, prev_remanente, iva_determinado,
      remanente_siguiente, ppm_base, ppm_rate, ppm, retenciones, total_pagar, flags, note, prepared_by)
    values (p_company, v_period,
      (select coalesce(max(version), 0) + 1 from public.vat_returns where company_id = p_company and period = v_period),
      v_f, v_debit, v_credit, coalesce(p_prev_remanente, 0), v_det, v_rem, v_base, coalesce(p_ppm_rate, 0), v_ppm,
      coalesce(p_retenciones, 0), v_det + v_ppm + coalesce(p_retenciones, 0), v_flags, nullif(trim(coalesce(p_note, '')), ''), v_uid)
    returning id into v_id;
  else
    update public.vat_returns set figures = v_f, debit = v_debit, credit = v_credit, prev_remanente = coalesce(p_prev_remanente, 0),
      iva_determinado = v_det, remanente_siguiente = v_rem, ppm_base = v_base, ppm_rate = coalesce(p_ppm_rate, 0), ppm = v_ppm,
      retenciones = coalesce(p_retenciones, 0), total_pagar = v_det + v_ppm + coalesce(p_retenciones, 0), flags = v_flags,
      note = nullif(trim(coalesce(p_note, '')), ''), prepared_by = v_uid, prepared_at = now(), decision_note = null
    where id = v_v.id
    returning id into v_id;
  end if;
  return v_id;
end
$$;

create or replace function public.submit_vat(p_return uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_v public.vat_returns;
  v_users uuid[];
begin
  perform private.require_session();
  select * into v_v from public.vat_returns where id = p_return for update;
  if v_v.id is null or not private.can_book(v_v.company_id) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_v.status <> 'borrador' then raise exception 'ENQ_F29_NO_EDITABLE'; end if;
  update public.vat_returns set status = 'en_revision', submitted_at = now() where id = p_return;
  select coalesce(array_agg(distinct a.user_id), '{}') into v_users
  from public.case_assignments a join public.cases c on c.id = a.case_id
  join public.staff_members s on s.user_id = a.user_id and s.active and s.role in ('accountant_pro', 'enqora_admin', 'ops_director')
  where c.company_id = v_v.company_id;
  if cardinality(v_users) = 0 then v_users := private.staff_users(array['accountant_pro', 'ops_director']); end if;
  perform private.notify(v_users, v_v.company_id, null, 'equipo', 'F29 por revisar · ' || to_char(v_v.period, 'MM-YYYY'),
    'Borrador preparado con los documentos cargados.', '/contabilidad/' || to_char(v_v.period, 'YYYY-MM') || '?empresa=' || v_v.company_id || '#f29',
    'vat:' || v_v.id || ':revision:' || extract(epoch from now())::bigint);
end
$$;

-- Revisión profesional: contador ENQORA o supervisión, con reautenticación, distinto de quien lo preparó.
create or replace function public.decide_vat(p_return uuid, p_decision text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
  v_v public.vat_returns;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select * into v_v from public.vat_returns where id = p_return for update;
  if v_v.id is null or not private.is_staff(array['accountant_pro', 'enqora_admin', 'ops_director'])
     or not private.works_company(v_v.company_id) then
    raise exception 'ENQ_SIN_PERMISO';
  end if;
  if v_v.status <> 'en_revision' then raise exception 'ENQ_YA_DECIDIDA'; end if;
  if v_v.prepared_by = v_uid then raise exception 'ENQ_CUATRO_OJOS'; end if;
  if p_decision = 'aprobar' then
    update public.vat_returns set status = 'aprobado', decided_by = v_uid, decided_at = now(), decision_note = v_note where id = p_return;
  elsif p_decision = 'devolver' then
    if char_length(coalesce(v_note, '')) < 10 then raise exception 'ENQ_FALTA_OBSERVACION'; end if;
    update public.vat_returns set status = 'borrador', decided_by = v_uid, decided_at = now(), decision_note = left(v_note, 1000)
    where id = p_return;
  else
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  perform private.notify(private.company_users(v_v.company_id, array['owner', 'admin', 'accountant']) || coalesce(array[v_v.prepared_by], '{}'),
    v_v.company_id, null, 'casos',
    case p_decision when 'aprobar' then 'F29 revisado y aprobado · ' else 'F29 devuelto con observaciones · ' end || to_char(v_v.period, 'MM-YYYY'),
    coalesce(v_note, ''), '/contabilidad/' || to_char(v_v.period, 'YYYY-MM') || '#f29',
    'vat:' || v_v.id || ':' || p_decision || ':' || extract(epoch from now())::bigint);
end
$$;

-- Registrar la presentación ante el SII (folio y fecha). ENQORA no presenta: la presenta la empresa,
-- o el equipo con mandato vigente (ver trámites del M11).
create or replace function public.register_vat_presented(p_return uuid, p_folio text, p_presented_on date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
  v_v public.vat_returns;
begin
  select * into v_v from public.vat_returns where id = p_return for update;
  if v_v.id is null or not (private.has_role(v_v.company_id, array['owner', 'admin', 'accountant'])
                            or (private.works_company(v_v.company_id) and not private.is_staff(array['ai_agent']))) then
    raise exception 'ENQ_SIN_PERMISO';
  end if;
  if v_v.status not in ('borrador', 'aprobado') then raise exception 'ENQ_F29_NO_EDITABLE'; end if;
  if char_length(trim(coalesce(p_folio, ''))) not between 3 and 40 or p_presented_on is null
     or p_presented_on > (now() at time zone 'America/Santiago')::date or p_presented_on < v_v.period then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  update public.vat_returns set status = 'presentado', presented_folio = trim(p_folio), presented_on = p_presented_on,
    presented_by = v_uid, flags = case when v_v.status = 'borrador' then array_append(flags, 'sin_revision_profesional') else flags end
  where id = p_return;
  perform private.log_event(v_v.company_id, 'f29.presentado', to_char(v_v.period, 'MM-YYYY'),
    jsonb_build_object('f29', p_return, 'folio', trim(p_folio)));
end
$$;

create or replace function public.void_vat(p_return uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_v public.vat_returns;
begin
  perform private.require_session();
  select * into v_v from public.vat_returns where id = p_return for update;
  if v_v.id is null or not private.can_book(v_v.company_id) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_v.status = 'presentado' then raise exception 'ENQ_F29_NO_EDITABLE'; end if;
  update public.vat_returns set status = 'anulado' where id = p_return;
end
$$;

-- ---------------------------------------------------------------------
-- 7. Permisos de ejecución
-- ---------------------------------------------------------------------

revoke execute on function private.can_read_books(uuid), private.can_book(uuid), private.month_of(date),
  private.period_locked(uuid, date), private.doc_sign(smallint)
from public, anon;
grant execute on function private.can_read_books(uuid), private.can_book(uuid), private.month_of(date),
  private.period_locked(uuid, date), private.doc_sign(smallint) to authenticated;

revoke execute on function
  public.import_documents(uuid, date, text, jsonb, text), public.clear_book(uuid, date, text),
  public.import_bank(uuid, date, text, jsonb, text), public.clear_bank(uuid, date, text),
  public.match_suggestions(uuid, date), public.reconcile(uuid, uuid), public.reconcile_other(uuid, text, text),
  public.unreconcile(uuid), public.vat_figures(uuid, date), public.save_vat_draft(uuid, date, bigint, numeric, bigint, text),
  public.submit_vat(uuid), public.decide_vat(uuid, text, text), public.register_vat_presented(uuid, text, date), public.void_vat(uuid)
from public, anon;

grant execute on function
  public.import_documents(uuid, date, text, jsonb, text), public.clear_book(uuid, date, text),
  public.import_bank(uuid, date, text, jsonb, text), public.clear_bank(uuid, date, text),
  public.match_suggestions(uuid, date), public.reconcile(uuid, uuid), public.reconcile_other(uuid, text, text),
  public.unreconcile(uuid), public.vat_figures(uuid, date), public.save_vat_draft(uuid, date, bigint, numeric, bigint, text),
  public.submit_vat(uuid), public.decide_vat(uuid, text, text), public.register_vat_presented(uuid, text, date), public.void_vat(uuid)
to authenticated;

-- ---------------------------------------------------------------------
-- Reversión (solo si fuera necesario):
--   drop table if exists public.reconciliations, public.bank_movements, public.acc_documents, public.acc_imports,
--     public.vat_returns cascade;
--   (y las funciones creadas en esta migración)
-- ---------------------------------------------------------------------
