-- =====================================================================
-- ENQORA · 0011 · Planes, suscripciones, cobros y pagos (M10 / Etapa 8)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0002…0010.
--
-- Principios (ver docs/ENQORA-PLANES-PAGOS.md y docs/ENQORA-COMERCIAL.md):
--  · Planes por línea (ENQORA Plataforma y ENQORA Contabilidad Profesional) con precio mensual
--    versionado. Solo el Administrador ENQORA publica precios (con reautenticación). Se crean
--    inactivos y sin precio: nada de precios inventados.
--  · Propuesta mensual al cerrar un caso: basada en el expediente real (qué se resolvió, qué
--    continúa, qué podría volver a fallar). Si la redacta un agente IA, pasa por aprobación.
--  · Cada cotización aceptada y cada período de suscripción genera un cobro con folio.
--  · Pagos: transferencia (el cliente la informa y el Administrador la confirma) o pasarela en
--    línea (Flow). La pasarela confirma con una clave de servicio cuyo hash vive en la base;
--    nunca se usa la clave service_role.
--  · Comprobante de pago interno: no reemplaza la boleta o factura electrónica.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Historial del caso
-- ---------------------------------------------------------------------

alter table public.case_events drop constraint if exists case_events_kind_check;
alter table public.case_events add constraint case_events_kind_check check (kind in (
  'creado', 'estado', 'comentario', 'nota_interna', 'documento', 'asignacion', 'tarea', 'prioridad',
  'aprobacion', 'autorizacion', 'cotizacion', 'diagnostico', 'plan', 'pago'
));

-- ---------------------------------------------------------------------
-- 2. Tablas
-- ---------------------------------------------------------------------

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z]{2,5}-[0-9]{2}$'),
  line text not null check (line in ('plataforma', 'contabilidad_profesional')),
  name text not null check (char_length(name) between 3 and 120),
  summary text check (char_length(summary) <= 400),
  scope text not null check (char_length(scope) between 10 and 4000),     -- qué incluye
  exclusions text check (char_length(exclusions) <= 2000),               -- qué no incluye
  limit_documents integer check (limit_documents >= 0),                  -- documentos al mes (null = sin límite definido)
  limit_operations integer check (limit_operations >= 0),                -- operaciones al mes
  limit_workers integer check (limit_workers >= 0),                      -- trabajadores
  included_services text[] not null default '{}',                        -- códigos del catálogo
  renewal_terms text check (char_length(renewal_terms) <= 1000),
  cancellation_terms text check (char_length(cancellation_terms) <= 1000),
  position smallint not null default 1 check (position between 1 and 99),
  active boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.plan_prices (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  version integer not null check (version >= 1),
  status text not null default 'borrador' check (status in ('borrador', 'vigente', 'retirada')),
  monthly_price integer not null check (monthly_price > 0),              -- CLP, IVA incluido si corresponde
  notes text check (char_length(notes) <= 1000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  published_by uuid references auth.users (id) on delete set null,
  published_at timestamptz,
  retired_at timestamptz,
  unique (plan_id, version)
);
create unique index plan_prices_one_live on public.plan_prices (plan_id) where status = 'vigente';
create unique index plan_prices_one_draft on public.plan_prices (plan_id) where status = 'borrador';

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  plan_id uuid not null references public.plans (id),
  plan_price_id uuid not null references public.plan_prices (id),
  plan_code text not null,
  plan_name text not null,
  line text not null,
  monthly_price integer not null check (monthly_price > 0),
  status text not null default 'pendiente_pago' check (status in ('pendiente_pago', 'activa', 'vencida', 'cancelada')),
  started_on date,
  paid_until date,                                                       -- último día pagado (incluido)
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  cancel_reason text check (char_length(cancel_reason) <= 500),
  proposal_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index subscriptions_one_per_line on public.subscriptions (company_id, line) where status <> 'cancelada';

create table public.plan_proposals (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  plan_id uuid not null references public.plans (id),
  plan_price_id uuid not null references public.plan_prices (id),
  plan_code text not null,
  plan_name text not null,
  monthly_price integer not null,
  resolved text not null check (char_length(resolved) between 10 and 4000),     -- qué se resolvió
  ongoing text not null check (char_length(ongoing) between 10 and 4000),       -- obligaciones que continúan
  next_month text check (char_length(next_month) <= 2000),                      -- qué toca el próximo mes
  risks text check (char_length(risks) <= 2000),                                -- qué podría volver a fallar
  benefit text check (char_length(benefit) <= 2000),                            -- por qué conviene frente a contratar por separado
  valid_until date not null,
  status text not null default 'enviada' check (status in (
    'pendiente_aprobacion', 'observada', 'enviada', 'aceptada', 'rechazada', 'vencida', 'anulada'
  )),
  approval_id uuid references public.approvals (id) on delete set null,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 1000),
  evidence jsonb not null default '{}'::jsonb
);
create index plan_proposals_case_idx on public.plan_proposals (case_id, created_at desc);
alter table public.subscriptions add constraint subscriptions_proposal_fk
  foreign key (proposal_id) references public.plan_proposals (id) on delete set null;

create sequence public.charge_folio_seq;

create table public.charges (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique,
  company_id uuid not null references public.companies (id) on delete cascade,
  kind text not null check (kind in ('cotizacion', 'suscripcion')),
  quote_id uuid references public.quotes (id) on delete set null,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  case_id uuid references public.cases (id) on delete set null,
  description text not null check (char_length(description) between 3 and 300),
  amount integer not null check (amount > 0),
  currency text not null default 'CLP' check (currency = 'CLP'),
  period_start date,
  period_end date,
  status text not null default 'pendiente' check (status in ('pendiente', 'en_revision', 'pagado', 'vencido', 'anulado')),
  due_date date not null,
  paid_at timestamptz,
  void_reason text check (char_length(void_reason) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind = 'cotizacion' or quote_id is null),
  check (kind = 'suscripcion' or subscription_id is null),
  check (period_end is null or period_end >= period_start)
);
create index charges_company_idx on public.charges (company_id, created_at desc);
create index charges_status_idx on public.charges (status, due_date);
create unique index charges_one_per_quote on public.charges (quote_id) where quote_id is not null and status <> 'anulado';
create unique index charges_one_per_period on public.charges (subscription_id, period_start)
  where subscription_id is not null and status <> 'anulado';

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  charge_id uuid not null references public.charges (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  method text not null check (method in ('transferencia', 'pasarela', 'otro')),
  provider text check (provider in ('flow')),
  provider_ref text check (char_length(provider_ref) <= 200),            -- token de la pasarela
  provider_order text check (char_length(provider_order) <= 60),         -- número de orden de la pasarela
  media text check (char_length(media) <= 60),                           -- medio informado por la pasarela
  amount integer not null check (amount > 0),
  status text not null check (status in ('iniciado', 'informado', 'confirmado', 'rechazado', 'anulado')),
  reference text check (char_length(reference) <= 120),                 -- n° de transferencia u operación
  paid_on date,
  duplicate boolean not null default false,                              -- el cobro ya estaba pagado: requiere devolución
  reported_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  review_note text check (char_length(review_note) <= 1000)
);
create index payments_charge_idx on public.payments (charge_id, created_at desc);
create index payments_review_idx on public.payments (status) where status = 'informado';

-- Datos de transferencia que ven los clientes (no son secretos).
create table public.billing_settings (
  id boolean primary key default true check (id),
  bank_name text check (char_length(bank_name) <= 80),
  account_type text check (char_length(account_type) <= 40),
  account_number text check (char_length(account_number) <= 40),
  holder_name text check (char_length(holder_name) <= 120),
  holder_rut text check (char_length(holder_rut) <= 12),
  notify_email text check (char_length(notify_email) <= 160),
  transfer_note text check (char_length(transfer_note) <= 500),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.billing_settings (id) values (true) on conflict do nothing;

-- Clave de servicio: solo se guarda su hash. La usan la pasarela y la facturación diaria.
create table private.service_secrets (
  id boolean primary key default true check (id),
  token_hash text,
  rotated_by uuid,
  rotated_at timestamptz
);
insert into private.service_secrets (id) values (true) on conflict do nothing;

-- ---------------------------------------------------------------------
-- 3. Funciones auxiliares
-- ---------------------------------------------------------------------

create or replace function private.today_cl() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Santiago')::date
$$;

create or replace function private.is_billing_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_staff(array['enqora_admin', 'ops_director'])
$$;

-- Quién ve la facturación de una empresa.
create or replace function private.can_see_billing(p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_role(p_company, array['owner', 'admin', 'accountant']) or private.is_billing_staff()
$$;

create or replace function private.check_service_token(p_token text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_token is not null and char_length(p_token) >= 32 and exists (
    select 1 from private.service_secrets s
    where s.token_hash is not null and s.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  )
$$;

create or replace function private.new_charge(
  p_company uuid, p_kind text, p_description text, p_amount integer, p_due date,
  p_quote uuid default null, p_subscription uuid default null, p_case uuid default null,
  p_period_start date default null, p_period_end date default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  insert into public.charges (folio, company_id, kind, quote_id, subscription_id, case_id, description, amount,
    period_start, period_end, due_date, created_by)
  values ('COB-' || to_char(private.today_cl(), 'YYYY') || '-' || lpad(nextval('public.charge_folio_seq')::text, 5, '0'),
    p_company, p_kind, p_quote, p_subscription, p_case, left(p_description, 300), p_amount,
    p_period_start, p_period_end, p_due, (select auth.uid()))
  returning id into v_id;
  perform private.log_event(p_company, 'cobro.creado', left(p_description, 300),
    jsonb_build_object('cobro', v_id, 'monto', p_amount, 'tipo', p_kind));
  return v_id;
end
$$;

-- Crea la suscripción (pendiente de pago) y su primer cobro.
create or replace function private.create_subscription(p_company uuid, p_plan uuid, p_proposal uuid default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_plan public.plans;
  v_price public.plan_prices;
  v_id uuid;
  v_today date := private.today_cl();
begin
  select * into v_plan from public.plans where id = p_plan;
  select * into v_price from public.plan_prices where plan_id = p_plan and status = 'vigente';
  if v_plan.id is null or not v_plan.active or v_price.id is null then raise exception 'ENQ_PLAN_NO_DISPONIBLE'; end if;
  if exists (select 1 from public.subscriptions where company_id = p_company and line = v_plan.line and status <> 'cancelada') then
    raise exception 'ENQ_SUSCRIPCION_ACTIVA';
  end if;

  insert into public.subscriptions (company_id, plan_id, plan_price_id, plan_code, plan_name, line, monthly_price,
    proposal_id, created_by)
  values (p_company, v_plan.id, v_price.id, v_plan.code, v_plan.name, v_plan.line, v_price.monthly_price,
    p_proposal, (select auth.uid()))
  returning id into v_id;

  perform private.new_charge(p_company, 'suscripcion', 'Plan ' || v_plan.name || ' · primer mes', v_price.monthly_price,
    v_today + 5, null, v_id, null, v_today, (v_today + interval '1 month' - interval '1 day')::date);
  perform private.log_event(p_company, 'suscripcion.creada', v_plan.name,
    jsonb_build_object('suscripcion', v_id, 'plan', v_plan.code, 'precio', v_price.monthly_price));
  return v_id;
end
$$;

-- Registra un pago como confirmado y aplica su efecto (cobro pagado, suscripción al día).
create or replace function private.settle_payment(p_payment uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_p public.payments;
  v_c public.charges;
  v_s public.subscriptions;
  v_today date := private.today_cl();
  v_start date;
  v_end date;
begin
  select * into v_p from public.payments where id = p_payment for update;
  if v_p.status = 'confirmado' then return 'ya_confirmado'; end if;
  select * into v_c from public.charges where id = v_p.charge_id for update;

  if v_c.status in ('pagado', 'anulado') then
    update public.payments set status = 'confirmado', duplicate = true, confirmed_by = (select auth.uid()), confirmed_at = now(),
      review_note = coalesce(review_note, 'El cobro ya estaba ' || v_c.status || ': corresponde revisar una devolución.')
    where id = p_payment;
    perform private.log_event(v_c.company_id, 'pago.duplicado', v_c.folio, jsonb_build_object('pago', p_payment, 'monto', v_p.amount));
    return 'duplicado';
  end if;

  update public.payments set status = 'confirmado', confirmed_by = (select auth.uid()), confirmed_at = now(),
    paid_on = coalesce(paid_on, v_today)
  where id = p_payment;
  update public.charges set status = 'pagado', paid_at = now(), updated_at = now() where id = v_c.id;
  -- Otros intentos abiertos del mismo cobro quedan anulados.
  update public.payments set status = 'anulado' where charge_id = v_c.id and id <> p_payment and status in ('iniciado', 'informado');

  if v_c.kind = 'suscripcion' and v_c.subscription_id is not null then
    select * into v_s from public.subscriptions where id = v_c.subscription_id for update;
    if v_s.status = 'pendiente_pago' then
      -- El primer período corre desde el pago.
      v_start := v_today;
      v_end := (v_today + interval '1 month' - interval '1 day')::date;
      update public.charges set period_start = v_start, period_end = v_end where id = v_c.id;
      update public.subscriptions set status = 'activa', started_on = v_start, paid_until = v_end, updated_at = now()
      where id = v_s.id;
    elsif v_s.status <> 'cancelada' then
      update public.subscriptions set status = 'activa', paid_until = greatest(coalesce(paid_until, v_c.period_end), v_c.period_end),
        updated_at = now()
      where id = v_s.id;
    end if;
  end if;

  if v_c.case_id is not null then
    perform private.log_case(v_c.case_id, 'pago', v_c.description, 'cliente',
      jsonb_build_object('accion', 'pagado', 'cobro', v_c.id, 'folio', v_c.folio, 'monto', v_c.amount));
  end if;
  perform private.log_event(v_c.company_id, 'pago.confirmado', v_c.folio,
    jsonb_build_object('pago', p_payment, 'cobro', v_c.id, 'monto', v_p.amount, 'medio', v_p.method));
  return 'pagado';
end
$$;

-- ---------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------

alter table public.plans enable row level security;
alter table public.plan_prices enable row level security;
alter table public.subscriptions enable row level security;
alter table public.plan_proposals enable row level security;
alter table public.charges enable row level security;
alter table public.payments enable row level security;
alter table public.billing_settings enable row level security;

revoke all on public.plans, public.plan_prices, public.subscriptions, public.plan_proposals, public.charges,
  public.payments, public.billing_settings from anon, authenticated;
grant select on public.plans, public.plan_prices, public.subscriptions, public.plan_proposals, public.charges,
  public.payments, public.billing_settings to authenticated;
revoke all on private.service_secrets from public, anon, authenticated;

create policy mfa_requerido on public.plans as restrictive for all to authenticated using (private.is_mfa()) with check (private.is_mfa());
create policy mfa_requerido on public.plan_prices as restrictive for all to authenticated using (private.is_mfa()) with check (private.is_mfa());
create policy mfa_requerido on public.subscriptions as restrictive for all to authenticated using (private.is_mfa()) with check (private.is_mfa());
create policy mfa_requerido on public.plan_proposals as restrictive for all to authenticated using (private.is_mfa()) with check (private.is_mfa());
create policy mfa_requerido on public.charges as restrictive for all to authenticated using (private.is_mfa()) with check (private.is_mfa());
create policy mfa_requerido on public.payments as restrictive for all to authenticated using (private.is_mfa()) with check (private.is_mfa());
create policy mfa_requerido on public.billing_settings as restrictive for all to authenticated using (private.is_mfa()) with check (private.is_mfa());

create policy planes_visibles on public.plans for select to authenticated using (active or private.is_staff());
create policy precios_plan_visibles on public.plan_prices for select to authenticated
  using (private.is_staff() or (status = 'vigente' and exists (select 1 from public.plans p where p.id = plan_id and p.active)));
create policy suscripciones_visibles on public.subscriptions for select to authenticated
  using (private.is_member(company_id) or private.is_billing_staff() or private.works_company(company_id));
create policy propuestas_visibles on public.plan_proposals for select to authenticated
  using (private.can_work_case(case_id)
         or (status not in ('pendiente_aprobacion', 'observada') and private.can_see_case(case_id)));
create policy cobros_visibles on public.charges for select to authenticated using (private.can_see_billing(company_id));
create policy pagos_visibles on public.payments for select to authenticated using (private.can_see_billing(company_id));
create policy datos_transferencia on public.billing_settings for select to authenticated using (true);

-- ---------------------------------------------------------------------
-- 5. Catálogo de planes (Administrador ENQORA)
-- ---------------------------------------------------------------------

-- p_data: code, line, name, summary, scope, exclusions, limit_documents, limit_operations, limit_workers,
-- included_services[], renewal_terms, cancellation_terms, position. No activa el plan (ver set_plan_active).
create or replace function public.save_plan(p_plan uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_id uuid := p_plan;
  v_services text[];
begin
  if not private.is_staff(array['enqora_admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if jsonb_typeof(coalesce(p_data -> 'included_services', '[]'::jsonb)) <> 'array' then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  select coalesce(array_agg(distinct x), '{}') into v_services
  from jsonb_array_elements_text(coalesce(p_data -> 'included_services', '[]'::jsonb)) x;
  if exists (select 1 from unnest(v_services) s where not exists (select 1 from public.services v where v.code = s)) then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;

  if v_id is null then
    insert into public.plans (code, line, name, summary, scope, exclusions, limit_documents, limit_operations, limit_workers,
      included_services, renewal_terms, cancellation_terms, position, created_by)
    values (upper(trim(p_data ->> 'code')), p_data ->> 'line', trim(p_data ->> 'name'),
      nullif(trim(coalesce(p_data ->> 'summary', '')), ''), trim(coalesce(p_data ->> 'scope', '')),
      nullif(trim(coalesce(p_data ->> 'exclusions', '')), ''),
      nullif(p_data ->> 'limit_documents', '')::integer, nullif(p_data ->> 'limit_operations', '')::integer,
      nullif(p_data ->> 'limit_workers', '')::integer, v_services,
      nullif(trim(coalesce(p_data ->> 'renewal_terms', '')), ''), nullif(trim(coalesce(p_data ->> 'cancellation_terms', '')), ''),
      coalesce(nullif(p_data ->> 'position', '')::smallint, 1), v_uid)
    returning id into v_id;
  else
    update public.plans set
      name = trim(p_data ->> 'name'), summary = nullif(trim(coalesce(p_data ->> 'summary', '')), ''),
      scope = trim(coalesce(p_data ->> 'scope', '')), exclusions = nullif(trim(coalesce(p_data ->> 'exclusions', '')), ''),
      limit_documents = nullif(p_data ->> 'limit_documents', '')::integer,
      limit_operations = nullif(p_data ->> 'limit_operations', '')::integer,
      limit_workers = nullif(p_data ->> 'limit_workers', '')::integer,
      included_services = v_services,
      renewal_terms = nullif(trim(coalesce(p_data ->> 'renewal_terms', '')), ''),
      cancellation_terms = nullif(trim(coalesce(p_data ->> 'cancellation_terms', '')), ''),
      position = coalesce(nullif(p_data ->> 'position', '')::smallint, position), updated_at = now()
    where id = v_id;
    if not found then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  end if;
  return v_id;
exception
  when unique_violation then raise exception 'ENQ_CODIGO_DUPLICADO';
  when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range then
    raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

-- Activar exige un precio vigente. Desactivar no afecta a las suscripciones existentes.
create or replace function public.set_plan_active(p_plan uuid, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_session(true);
  if not private.is_staff(array['enqora_admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_active and not exists (select 1 from public.plan_prices where plan_id = p_plan and status = 'vigente') then
    raise exception 'ENQ_SIN_TARIFA';
  end if;
  update public.plans set active = coalesce(p_active, false), updated_at = now() where id = p_plan;
  if not found then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
end
$$;

create or replace function public.draft_plan_price(p_plan uuid, p_monthly_price integer, p_notes text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_id uuid;
begin
  if not private.is_staff(array['enqora_admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_monthly_price is null or p_monthly_price <= 0 or p_monthly_price > 100000000
     or char_length(coalesce(p_notes, '')) > 1000 then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  if not exists (select 1 from public.plans where id = p_plan) then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  delete from public.plan_prices where plan_id = p_plan and status = 'borrador';
  insert into public.plan_prices (plan_id, version, monthly_price, notes, created_by)
  values (p_plan, (select coalesce(max(version), 0) + 1 from public.plan_prices where plan_id = p_plan),
    p_monthly_price, nullif(trim(coalesce(p_notes, '')), ''), v_uid)
  returning id into v_id;
  return v_id;
end
$$;

create or replace function public.publish_plan_price(p_price uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
  v_p public.plan_prices;
begin
  if not private.is_staff(array['enqora_admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  select * into v_p from public.plan_prices where id = p_price for update;
  if not found or v_p.status <> 'borrador' then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  update public.plan_prices set status = 'retirada', retired_at = now() where plan_id = v_p.plan_id and status = 'vigente';
  update public.plan_prices set status = 'vigente', published_by = v_uid, published_at = now() where id = p_price;
end
$$;

-- Retirar el precio vigente desactiva el plan (no se puede contratar sin precio publicado).
create or replace function public.retire_plan_price(p_price uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_plan uuid;
begin
  perform private.require_session(true);
  if not private.is_staff(array['enqora_admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  update public.plan_prices set status = 'retirada', retired_at = now() where id = p_price and status = 'vigente'
  returning plan_id into v_plan;
  if v_plan is null then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  update public.plans set active = false, updated_at = now() where id = v_plan;
end
$$;

-- ---------------------------------------------------------------------
-- 6. Suscripción directa (cliente)
-- ---------------------------------------------------------------------

create or replace function public.subscribe_plan(p_company uuid, p_plan uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_session(true);
  if not private.has_role(p_company, array['owner', 'admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  perform 1 from public.companies where id = p_company for update;
  return private.create_subscription(p_company, p_plan);
end
$$;

-- Pendiente de pago o vencida: se cancela de inmediato (y se anulan sus cobros abiertos).
-- Activa: se cancela al terminar el período pagado (sin devoluciones proporcionales).
create or replace function public.cancel_subscription(p_subscription uuid, p_reason text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_s public.subscriptions;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  perform private.require_session(true);
  select * into v_s from public.subscriptions where id = p_subscription for update;
  if not found or not private.has_role(v_s.company_id, array['owner', 'admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if char_length(coalesce(v_reason, '')) > 500 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if v_s.status = 'cancelada' then raise exception 'ENQ_YA_DECIDIDA'; end if;

  if v_s.status in ('pendiente_pago', 'vencida') then
    update public.subscriptions set status = 'cancelada', canceled_at = now(), cancel_reason = v_reason, updated_at = now()
    where id = p_subscription;
    update public.charges set status = 'anulado', void_reason = 'Suscripción cancelada por el cliente', updated_at = now()
    where subscription_id = p_subscription and status in ('pendiente', 'vencido');
    perform private.log_event(v_s.company_id, 'suscripcion.cancelada', v_s.plan_name, jsonb_build_object('suscripcion', p_subscription));
    return 'cancelada';
  end if;

  update public.subscriptions set cancel_at_period_end = true, cancel_reason = v_reason, updated_at = now()
  where id = p_subscription;
  update public.charges set status = 'anulado', void_reason = 'Renovación cancelada por el cliente', updated_at = now()
  where subscription_id = p_subscription and status in ('pendiente', 'vencido') and period_start > v_s.paid_until;
  perform private.log_event(v_s.company_id, 'suscripcion.no_renovar', v_s.plan_name,
    jsonb_build_object('suscripcion', p_subscription, 'hasta', v_s.paid_until));
  return 'al_terminar_periodo';
end
$$;

create or replace function public.resume_subscription(p_subscription uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_s public.subscriptions;
begin
  perform private.require_session(true);
  select * into v_s from public.subscriptions where id = p_subscription for update;
  if not found or not private.has_role(v_s.company_id, array['owner', 'admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_s.status <> 'activa' or not v_s.cancel_at_period_end then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  update public.subscriptions set cancel_at_period_end = false, cancel_reason = null, updated_at = now() where id = p_subscription;
  perform private.log_event(v_s.company_id, 'suscripcion.reanudada', v_s.plan_name, jsonb_build_object('suscripcion', p_subscription));
end
$$;

-- ---------------------------------------------------------------------
-- 7. Propuesta mensual al cerrar un caso
-- ---------------------------------------------------------------------

-- p_data: resolved, ongoing, next_month, risks, benefit.
create or replace function public.create_plan_proposal(p_case uuid, p_plan uuid, p_data jsonb, p_valid_days integer default 15)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_case public.cases;
  v_plan public.plans;
  v_price public.plan_prices;
  v_agent boolean := private.is_staff(array['ai_agent']);
  v_id uuid;
  v_approval uuid;
begin
  select * into v_case from public.cases where id = p_case for update;
  if not found or not private.can_work_case(p_case) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_case.status not in ('verificacion', 'cerrado') then raise exception 'ENQ_CASO_NO_CERRADO'; end if;
  if p_valid_days is null or p_valid_days not between 1 and 60 or p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  select * into v_plan from public.plans where id = p_plan;
  select * into v_price from public.plan_prices where plan_id = p_plan and status = 'vigente';
  if v_plan.id is null or not v_plan.active or v_price.id is null then raise exception 'ENQ_PLAN_NO_DISPONIBLE'; end if;
  if exists (select 1 from public.plan_proposals where case_id = p_case and status in ('pendiente_aprobacion', 'observada', 'enviada')) then
    raise exception 'ENQ_PROPUESTA_ABIERTA';
  end if;

  insert into public.plan_proposals (case_id, company_id, plan_id, plan_price_id, plan_code, plan_name, monthly_price,
    resolved, ongoing, next_month, risks, benefit, valid_until, status, created_by, sent_at)
  values (p_case, v_case.company_id, v_plan.id, v_price.id, v_plan.code, v_plan.name, v_price.monthly_price,
    trim(coalesce(p_data ->> 'resolved', '')), trim(coalesce(p_data ->> 'ongoing', '')),
    nullif(trim(coalesce(p_data ->> 'next_month', '')), ''), nullif(trim(coalesce(p_data ->> 'risks', '')), ''),
    nullif(trim(coalesce(p_data ->> 'benefit', '')), ''), private.today_cl() + p_valid_days,
    case when v_agent then 'pendiente_aprobacion' else 'enviada' end, v_uid,
    case when v_agent then null else now() end)
  returning id into v_id;

  if v_agent then
    insert into public.approvals (case_id, kind, title, detail, payload, approver_role, requested_by)
    values (p_case, 'precio', 'Propuesta de plan · ' || v_plan.name,
      'Propuesta mensual redactada por un agente IA: revisar antes de enviarla al cliente.',
      jsonb_build_object('propuesta', v_id, 'plan', v_plan.code, 'precio', v_price.monthly_price),
      case when v_case.responsible_id is null then 'supervisor' else 'responsable' end, v_uid)
    returning id into v_approval;
    update public.plan_proposals set approval_id = v_approval where id = v_id;
  else
    perform private.log_case(p_case, 'plan', v_plan.name, 'cliente',
      jsonb_build_object('accion', 'enviada', 'propuesta', v_id, 'precio', v_price.monthly_price));
  end if;
  return v_id;
exception
  when check_violation or not_null_violation then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

create or replace function private.on_plan_proposal_decided() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_pp public.plan_proposals;
begin
  if new.status = old.status then return new; end if;
  select * into v_pp from public.plan_proposals where approval_id = new.id and status = 'pendiente_aprobacion' for update;
  if not found then return new; end if;
  if new.status = 'aprobada' then
    update public.plan_proposals set status = 'enviada', sent_at = now() where id = v_pp.id;
    perform private.log_case(v_pp.case_id, 'plan', v_pp.plan_name, 'cliente',
      jsonb_build_object('accion', 'enviada', 'propuesta', v_pp.id, 'precio', v_pp.monthly_price));
  elsif new.status in ('rechazada', 'devuelta') then
    update public.plan_proposals set status = 'observada' where id = v_pp.id;
  elsif new.status = 'anulada' then
    update public.plan_proposals set status = 'anulada' where id = v_pp.id;
  end if;
  return new;
end
$$;

drop trigger if exists approvals_plan_proposal_flow on public.approvals;
create trigger approvals_plan_proposal_flow after update of status on public.approvals
  for each row execute function private.on_plan_proposal_decided();

-- El cliente decide. Aceptar crea la suscripción y su primer cobro.
create or replace function public.decide_plan_proposal(p_proposal uuid, p_decision text, p_note text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
  v_pp public.plan_proposals;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_sub uuid;
begin
  select * into v_pp from public.plan_proposals where id = p_proposal for update;
  if not found or not private.has_role(v_pp.company_id, array['owner', 'admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_pp.status <> 'enviada' then raise exception 'ENQ_YA_DECIDIDA'; end if;
  if p_decision not in ('aceptar', 'rechazar') or char_length(coalesce(v_note, '')) > 1000 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;

  if p_decision = 'aceptar' then
    if v_pp.valid_until < private.today_cl() then raise exception 'ENQ_PROPUESTA_VENCIDA'; end if;
    if not exists (select 1 from public.plan_prices where id = v_pp.plan_price_id and status = 'vigente') then
      raise exception 'ENQ_PLAN_NO_DISPONIBLE';   -- el precio cambió: el equipo debe enviar una nueva propuesta
    end if;
    perform 1 from public.companies where id = v_pp.company_id for update;
    v_sub := private.create_subscription(v_pp.company_id, v_pp.plan_id, p_proposal);
  end if;

  update public.plan_proposals set
    status = case p_decision when 'aceptar' then 'aceptada' else 'rechazada' end,
    subscription_id = v_sub, decided_by = v_uid, decided_at = now(), decision_note = v_note,
    evidence = jsonb_build_object('usuario', v_uid, 'rol_en_empresa', private.member_role(v_pp.company_id),
      'sesion', private.current_session_id(), 'segundo_factor', 'reciente', 'momento', now(),
      'plan', v_pp.plan_code, 'precio_mensual', v_pp.monthly_price, 'validez', v_pp.valid_until)
  where id = p_proposal;

  perform private.log_case(v_pp.case_id, 'plan', v_note, 'cliente',
    jsonb_build_object('accion', case p_decision when 'aceptar' then 'aceptada' else 'rechazada' end,
      'propuesta', p_proposal, 'titulo', v_pp.plan_name, 'precio', v_pp.monthly_price));
  return v_sub;
end
$$;

create or replace function public.cancel_plan_proposal(p_proposal uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_pp public.plan_proposals;
begin
  select * into v_pp from public.plan_proposals where id = p_proposal for update;
  if not found or not private.can_work_case(v_pp.case_id) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_pp.status not in ('pendiente_aprobacion', 'observada', 'enviada') then raise exception 'ENQ_YA_DECIDIDA'; end if;
  update public.plan_proposals set status = 'anulada', decided_by = v_uid, decided_at = now() where id = p_proposal;
  if v_pp.approval_id is not null then
    update public.approvals set status = 'anulada', decided_by = v_uid, decided_at = now()
    where id = v_pp.approval_id and status = 'pendiente';
  end if;
  if v_pp.sent_at is not null then
    perform private.log_case(v_pp.case_id, 'plan', v_pp.plan_name, 'cliente', jsonb_build_object('accion', 'anulada', 'propuesta', p_proposal));
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 8. Cobro de las cotizaciones aceptadas
-- ---------------------------------------------------------------------

create or replace function private.on_quote_accepted() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_folio text;
begin
  if new.status <> 'aceptada' or old.status = 'aceptada' then return new; end if;
  if exists (select 1 from public.charges where quote_id = new.id and status <> 'anulado') then return new; end if;
  select folio into v_folio from public.cases where id = new.case_id;
  perform private.new_charge(new.company_id, 'cotizacion', new.service_name || ' · caso ' || v_folio, new.final_price,
    private.today_cl() + 5, new.id, null, new.case_id);
  return new;
end
$$;

drop trigger if exists quotes_charge_on_accept on public.quotes;
create trigger quotes_charge_on_accept after update of status on public.quotes
  for each row execute function private.on_quote_accepted();

-- Cotizaciones aceptadas antes de esta migración (cero o más filas; precio > 0).
do $$
declare
  r record;
begin
  for r in
    select q.id, q.company_id, q.case_id, q.service_name, q.final_price, c.folio,
      coalesce((q.decided_at at time zone 'America/Santiago')::date, private.today_cl()) as decided_on
    from public.quotes q join public.cases c on c.id = q.case_id
    where q.status = 'aceptada' and q.final_price > 0
      and not exists (select 1 from public.charges ch where ch.quote_id = q.id)
  loop
    perform private.new_charge(r.company_id, 'cotizacion', r.service_name || ' · caso ' || r.folio, r.final_price,
      r.decided_on + 5, r.id, null, r.case_id);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 9. Pagos por transferencia y registro manual
-- ---------------------------------------------------------------------

create or replace function public.report_transfer(p_charge uuid, p_reference text, p_paid_on date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_c public.charges;
  v_ref text := nullif(trim(coalesce(p_reference, '')), '');
  v_id uuid;
begin
  select * into v_c from public.charges where id = p_charge for update;
  if not found or not private.has_role(v_c.company_id, array['owner', 'admin', 'accountant']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_c.status not in ('pendiente', 'vencido') then raise exception 'ENQ_COBRO_NO_PAGABLE'; end if;
  if v_ref is null or char_length(v_ref) not between 3 and 120 or p_paid_on is null
     or p_paid_on > private.today_cl() or p_paid_on < private.today_cl() - 60 then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  insert into public.payments (charge_id, company_id, method, amount, status, reference, paid_on, reported_by)
  values (p_charge, v_c.company_id, 'transferencia', v_c.amount, 'informado', v_ref, p_paid_on, v_uid)
  returning id into v_id;
  update public.charges set status = 'en_revision', updated_at = now() where id = p_charge;
  perform private.log_event(v_c.company_id, 'pago.informado', v_c.folio, jsonb_build_object('pago', v_id, 'monto', v_c.amount));
  return v_id;
end
$$;

-- Administrador ENQORA: confirma o rechaza una transferencia informada.
create or replace function public.review_payment(p_payment uuid, p_decision text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_p public.payments;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  perform private.require_session(true);
  if not private.is_staff(array['enqora_admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  select * into v_p from public.payments where id = p_payment for update;
  if not found or v_p.status <> 'informado' then raise exception 'ENQ_YA_DECIDIDA'; end if;
  if p_decision = 'confirmar' then
    update public.payments set review_note = v_note where id = p_payment;
    perform private.settle_payment(p_payment);
  elsif p_decision = 'rechazar' then
    if char_length(coalesce(v_note, '')) < 10 then raise exception 'ENQ_FALTA_OBSERVACION'; end if;
    update public.payments set status = 'rechazado', review_note = left(v_note, 1000), confirmed_by = (select auth.uid()),
      confirmed_at = now()
    where id = p_payment;
    update public.charges set status = case when due_date < private.today_cl() then 'vencido' else 'pendiente' end,
      updated_at = now()
    where id = v_p.charge_id and status = 'en_revision';
    perform private.log_event(v_p.company_id, 'pago.rechazado', null, jsonb_build_object('pago', p_payment));
  else
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
end
$$;

-- Administrador ENQORA: registra un pago recibido por otro medio (queda confirmado).
create or replace function public.register_payment(p_charge uuid, p_method text, p_reference text, p_paid_on date)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
  v_c public.charges;
  v_id uuid;
begin
  if not private.is_staff(array['enqora_admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  select * into v_c from public.charges where id = p_charge for update;
  if not found then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if v_c.status not in ('pendiente', 'vencido', 'en_revision') then raise exception 'ENQ_COBRO_NO_PAGABLE'; end if;
  if p_method not in ('transferencia', 'otro') or char_length(trim(coalesce(p_reference, ''))) not between 3 and 120
     or p_paid_on is null or p_paid_on > private.today_cl() then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  insert into public.payments (charge_id, company_id, method, amount, status, reference, paid_on, reported_by)
  values (p_charge, v_c.company_id, p_method, v_c.amount, 'informado', trim(p_reference), p_paid_on, v_uid)
  returning id into v_id;
  perform private.settle_payment(v_id);
  return v_id;
end
$$;

create or replace function public.void_charge(p_charge uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_c public.charges;
begin
  perform private.require_session(true);
  if not private.is_staff(array['enqora_admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 10 and 500 then raise exception 'ENQ_FALTA_OBSERVACION'; end if;
  select * into v_c from public.charges where id = p_charge for update;
  if not found or v_c.status not in ('pendiente', 'vencido', 'en_revision') then raise exception 'ENQ_COBRO_NO_PAGABLE'; end if;
  update public.charges set status = 'anulado', void_reason = trim(p_reason), updated_at = now() where id = p_charge;
  update public.payments set status = 'anulado' where charge_id = p_charge and status in ('iniciado', 'informado');
  perform private.log_event(v_c.company_id, 'cobro.anulado', v_c.folio, jsonb_build_object('cobro', p_charge, 'motivo', trim(p_reason)));
end
$$;

create or replace function public.save_billing_settings(p_data jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
begin
  if not private.is_staff(array['enqora_admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  update public.billing_settings set
    bank_name = nullif(trim(coalesce(p_data ->> 'bank_name', '')), ''),
    account_type = nullif(trim(coalesce(p_data ->> 'account_type', '')), ''),
    account_number = nullif(trim(coalesce(p_data ->> 'account_number', '')), ''),
    holder_name = nullif(trim(coalesce(p_data ->> 'holder_name', '')), ''),
    holder_rut = nullif(trim(coalesce(p_data ->> 'holder_rut', '')), ''),
    notify_email = nullif(trim(coalesce(p_data ->> 'notify_email', '')), ''),
    transfer_note = nullif(trim(coalesce(p_data ->> 'transfer_note', '')), ''),
    updated_by = v_uid, updated_at = now()
  where id;
exception
  when check_violation then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

-- ---------------------------------------------------------------------
-- 10. Pasarela de pago en línea (Flow)
-- ---------------------------------------------------------------------

-- El cliente inicia un pago en línea. Devuelve los datos para crear la orden en la pasarela.
create or replace function public.start_gateway_payment(p_charge uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_c public.charges;
  v_id uuid;
  v_email text;
begin
  select * into v_c from public.charges where id = p_charge for update;
  if not found or not private.has_role(v_c.company_id, array['owner', 'admin', 'accountant']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_c.status not in ('pendiente', 'vencido') then raise exception 'ENQ_COBRO_NO_PAGABLE'; end if;
  if (select count(*) from public.payments where charge_id = p_charge and method = 'pasarela'
        and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'ENQ_DEMASIADAS_CONSULTAS';
  end if;
  -- Intentos anteriores sin respuesta de la pasarela quedan anulados.
  update public.payments set status = 'anulado' where charge_id = p_charge and method = 'pasarela' and status = 'iniciado'
    and created_at < now() - interval '2 hours';
  select email into v_email from auth.users where id = v_uid;
  insert into public.payments (charge_id, company_id, method, provider, amount, status, reported_by)
  values (p_charge, v_c.company_id, 'pasarela', 'flow', v_c.amount, 'iniciado', v_uid)
  returning id into v_id;
  return jsonb_build_object('pago', v_id, 'monto', v_c.amount, 'asunto', 'ENQORA ' || v_c.folio || ' · ' || left(v_c.description, 80),
    'correo', v_email);
end
$$;

create or replace function public.gateway_attach(p_payment uuid, p_token text, p_order text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
begin
  if char_length(coalesce(p_token, '')) not between 10 and 200 or char_length(coalesce(p_order, '')) > 60 then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  update public.payments set provider_ref = p_token, provider_order = nullif(p_order, '')
  where id = p_payment and reported_by = v_uid and status = 'iniciado' and provider_ref is null;
  if not found then raise exception 'ENQ_SIN_PERMISO'; end if;
end
$$;

-- La aplicación informa el estado consultado a la pasarela. Protegido por la clave de servicio.
-- p_status (Flow): 1 pendiente · 2 pagada · 3 rechazada · 4 anulada.
create or replace function public.gateway_settle(
  p_token text, p_payment uuid, p_status integer, p_amount bigint, p_currency text, p_order text default null,
  p_media text default null
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_p public.payments;
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  select * into v_p from public.payments where id = p_payment for update;
  if not found or v_p.method <> 'pasarela' then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if v_p.status = 'confirmado' then return 'pagado'; end if;

  update public.payments set provider_order = coalesce(nullif(left(p_order, 60), ''), provider_order),
    media = coalesce(nullif(left(p_media, 60), ''), media)
  where id = p_payment;

  if p_status = 2 then
    if p_amount is distinct from v_p.amount::bigint or upper(coalesce(p_currency, '')) <> 'CLP' then
      update public.payments set status = 'rechazado', review_note = 'El monto o la moneda informados por la pasarela no coinciden con el cobro.'
      where id = p_payment;
      perform private.log_event(v_p.company_id, 'pago.monto_no_coincide', null,
        jsonb_build_object('pago', p_payment, 'esperado', v_p.amount, 'informado', p_amount));
      return 'monto_invalido';
    end if;
    return private.settle_payment(p_payment);
  elsif p_status = 3 then
    update public.payments set status = 'rechazado' where id = p_payment and status = 'iniciado';
    return 'rechazado';
  elsif p_status = 4 then
    update public.payments set status = 'anulado' where id = p_payment and status = 'iniciado';
    return 'anulado';
  end if;
  return 'pendiente';
end
$$;

-- Genera una nueva clave de servicio y la devuelve una sola vez. Se guarda solo su hash.
create or replace function public.rotate_service_token() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
  v_token text := 'enq_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if not private.is_staff(array['enqora_admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  update private.service_secrets set token_hash = encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
    rotated_by = v_uid, rotated_at = now()
  where id;
  return v_token;
end
$$;

create or replace function public.billing_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_session();
  if not private.is_billing_staff() then raise exception 'ENQ_SIN_PERMISO'; end if;
  return (select jsonb_build_object('clave_configurada', token_hash is not null, 'rotada', rotated_at)
          from private.service_secrets where id);
end
$$;

-- ---------------------------------------------------------------------
-- 11. Facturación diaria: vencimientos y renovaciones (idempotente)
-- Se ejecuta con la clave de servicio (tarea diaria de Vercel) o por el Administrador ENQORA.
-- ---------------------------------------------------------------------

create or replace function public.billing_run(p_token text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := private.today_cl();
  v_proposals integer;
  v_overdue integer;
  v_renewals integer := 0;
  v_expired integer;
  v_ended integer;
  r record;
begin
  if p_token is not null then
    if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  else
    perform private.require_session();
    if not private.is_staff(array['enqora_admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  end if;

  update public.plan_proposals set status = 'vencida' where status = 'enviada' and valid_until < v_today;
  get diagnostics v_proposals = row_count;

  update public.charges set status = 'vencido', updated_at = now() where status = 'pendiente' and due_date < v_today;
  get diagnostics v_overdue = row_count;

  -- Fin de las suscripciones que no se renuevan.
  update public.subscriptions set status = 'cancelada', canceled_at = now(), updated_at = now()
  where status = 'activa' and cancel_at_period_end and paid_until < v_today;
  get diagnostics v_ended = row_count;

  -- Cobro del próximo período, 5 días antes de que termine el pagado.
  for r in
    select s.* from public.subscriptions s
    where s.status = 'activa' and not s.cancel_at_period_end and s.paid_until is not null and s.paid_until - 5 <= v_today
      and not exists (select 1 from public.charges c where c.subscription_id = s.id and c.period_start = s.paid_until + 1
                      and c.status <> 'anulado')
  loop
    perform private.new_charge(r.company_id, 'suscripcion',
      'Plan ' || r.plan_name || ' · ' || to_char(r.paid_until + 1, 'DD-MM-YYYY') || ' al ' ||
        to_char((r.paid_until + 1 + interval '1 month' - interval '1 day')::date, 'DD-MM-YYYY'),
      r.monthly_price, greatest(r.paid_until, v_today), null, r.id, null,
      r.paid_until + 1, (r.paid_until + 1 + interval '1 month' - interval '1 day')::date);
    v_renewals := v_renewals + 1;
  end loop;

  -- Vencida: período terminado hace más de 5 días sin pago del siguiente.
  update public.subscriptions set status = 'vencida', updated_at = now()
  where status = 'activa' and paid_until < v_today - 5;
  get diagnostics v_expired = row_count;

  return jsonb_build_object('fecha', v_today, 'propuestas_vencidas', v_proposals, 'cobros_vencidos', v_overdue,
    'renovaciones', v_renewals, 'suscripciones_vencidas', v_expired, 'suscripciones_terminadas', v_ended);
end
$$;

-- ---------------------------------------------------------------------
-- 12. Planes iniciales (SIN precio, inactivos hasta que ENQORA los revise)
-- ---------------------------------------------------------------------

insert into public.plans (code, line, name, summary, scope, exclusions, position) values
  ('PLA-01', 'plataforma', 'Plataforma Esencial', 'Tu empresa ordenada en ENQORA.',
   'Acceso a la plataforma, Centro de control, expediente digital de la empresa, seguimiento de casos y avisos de obligaciones.',
   'No incluye la preparación ni presentación de declaraciones por un profesional.', 1),
  ('PLA-02', 'plataforma', 'Plataforma Pyme', 'Más usuarios y herramientas para equipos.',
   'Todo lo de Plataforma Esencial, más usuarios adicionales, permisos por rol y contabilidad básica automatizada según los límites del plan.',
   'No incluye la preparación ni presentación de declaraciones por un profesional.', 2),
  ('CPR-01', 'contabilidad_profesional', 'Contabilidad Profesional', 'Un profesional lleva tu contabilidad cada mes.',
   'Registro contable mensual, revisión de documentos, preparación y presentación del IVA (F29) y reportes mensuales, revisados por un profesional ENQORA.',
   'No incluye remuneraciones, regularización de períodos anteriores ni gestiones presenciales.', 1),
  ('CPR-02', 'contabilidad_profesional', 'Contabilidad y Remuneraciones', 'Contabilidad mensual más sueldos y cotizaciones.',
   'Todo lo de Contabilidad Profesional, más liquidaciones de sueldo, cotizaciones previsionales y libro de remuneraciones.',
   'No incluye regularización de períodos anteriores, juicios laborales ni gestiones presenciales.', 2)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- 13. Permisos de ejecución
-- ---------------------------------------------------------------------

revoke execute on function private.today_cl(), private.is_billing_staff(), private.can_see_billing(uuid),
  private.check_service_token(text),
  private.new_charge(uuid, text, text, integer, date, uuid, uuid, uuid, date, date),
  private.create_subscription(uuid, uuid, uuid), private.settle_payment(uuid),
  private.on_plan_proposal_decided(), private.on_quote_accepted()
from public, anon;
grant execute on function private.today_cl(), private.is_billing_staff(), private.can_see_billing(uuid) to authenticated;

revoke execute on function
  public.save_plan(uuid, jsonb), public.set_plan_active(uuid, boolean), public.draft_plan_price(uuid, integer, text),
  public.publish_plan_price(uuid), public.retire_plan_price(uuid), public.subscribe_plan(uuid, uuid),
  public.cancel_subscription(uuid, text), public.resume_subscription(uuid),
  public.create_plan_proposal(uuid, uuid, jsonb, integer), public.decide_plan_proposal(uuid, text, text),
  public.cancel_plan_proposal(uuid), public.report_transfer(uuid, text, date), public.review_payment(uuid, text, text),
  public.register_payment(uuid, text, text, date), public.void_charge(uuid, text), public.save_billing_settings(jsonb),
  public.start_gateway_payment(uuid), public.gateway_attach(uuid, text, text),
  public.gateway_settle(text, uuid, integer, bigint, text, text, text), public.rotate_service_token(),
  public.billing_status(), public.billing_run(text)
from public, anon;

grant execute on function
  public.save_plan(uuid, jsonb), public.set_plan_active(uuid, boolean), public.draft_plan_price(uuid, integer, text),
  public.publish_plan_price(uuid), public.retire_plan_price(uuid), public.subscribe_plan(uuid, uuid),
  public.cancel_subscription(uuid, text), public.resume_subscription(uuid),
  public.create_plan_proposal(uuid, uuid, jsonb, integer), public.decide_plan_proposal(uuid, text, text),
  public.cancel_plan_proposal(uuid), public.report_transfer(uuid, text, date), public.review_payment(uuid, text, text),
  public.register_payment(uuid, text, text, date), public.void_charge(uuid, text), public.save_billing_settings(jsonb),
  public.start_gateway_payment(uuid), public.gateway_attach(uuid, text, text),
  public.gateway_settle(text, uuid, integer, bigint, text, text, text), public.rotate_service_token(),
  public.billing_status(), public.billing_run(text)
to authenticated;

-- La pasarela y la tarea diaria llaman sin sesión: solo pasan con la clave de servicio.
grant execute on function public.gateway_settle(text, uuid, integer, bigint, text, text, text), public.billing_run(text) to anon;

-- ---------------------------------------------------------------------
-- Reversión (solo si fuera necesario):
--   drop trigger if exists approvals_plan_proposal_flow on public.approvals;
--   drop trigger if exists quotes_charge_on_accept on public.quotes;
--   drop table if exists public.payments, public.charges, public.plan_proposals, public.subscriptions,
--     public.plan_prices, public.plans, public.billing_settings, private.service_secrets cascade;
--   drop sequence if exists public.charge_folio_seq;
--   (y las funciones creadas en esta migración)
-- ---------------------------------------------------------------------
