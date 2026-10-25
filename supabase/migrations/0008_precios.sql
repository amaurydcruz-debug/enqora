-- =====================================================================
-- ENQORA · 0008 · Catálogo de servicios y motor de precios (M07 / Etapa 6)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0002…0007.
--
-- Principios (ver docs/ENQORA-COMERCIAL.md y docs/ENQORA-PRECIOS.md):
--  · Las tarifas son versionadas: borrador → vigente → retirada. Solo la supervisión publica.
--  · El precio se calcula SIEMPRE en la base de datos con la tarifa vigente (no en el navegador).
--  · Dentro de los parámetros aprobados la cotización se envía sola; fuera de rango, con un
--    servicio que exige criterio profesional o propuesta por un agente IA, pasa por el Centro
--    de Mando (tabla approvals). Un agente nunca publica tarifas ni aprueba excepciones.
--  · El descuento se calcula sobre la tarifa estándar ENQORA vigente; las referencias de
--    mercado se muestran aparte, con fuente y fecha, y se ocultan al cliente si tienen más de 180 días.
--  · Ningún precio viene precargado: las tarifas las define ENQORA desde el panel.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Catálogo de servicios
-- ---------------------------------------------------------------------

create table public.services (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z]{2,6}-[0-9]{2,3}$'),
  module text not null check (module in ('contabilidad', 'create', 'formaliza', 'brand', 'legal', 'gestion', 'crece', 'idea', 'general')),
  name text not null check (char_length(name) between 3 and 120),
  summary text check (char_length(summary) <= 300),
  scope text not null check (char_length(scope) between 10 and 4000),
  exclusions text check (char_length(exclusions) <= 4000),
  unit text not null check (unit in ('caso', 'mes', 'trabajador', 'documento', 'hora')),
  requires_professional boolean not null default false,
  active boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.service_tariffs (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services (id) on delete cascade,
  version integer not null check (version >= 1),
  status text not null default 'borrador' check (status in ('borrador', 'vigente', 'retirada')),
  base_price integer not null check (base_price >= 0),                 -- CLP, por unidad
  factor_media numeric(4, 2) not null default 1 check (factor_media between 1 and 5),
  factor_compleja numeric(4, 2) not null default 1 check (factor_compleja between 1 and 5),
  factor_especializada numeric(4, 2) not null default 1 check (factor_especializada between 1 and 5),
  onsite_fee integer not null default 0 check (onsite_fee >= 0),
  urgency_pct integer not null default 0 check (urgency_pct between 0 and 100),
  max_discount_pct integer not null default 0 check (max_discount_pct between 0 and 50),
  min_price integer not null check (min_price >= 0),                   -- CLP, por unidad
  max_price integer not null,                                          -- CLP, por unidad
  est_hours numeric(6, 1) check (est_hours >= 0),
  specialty text check (char_length(specialty) <= 80),
  notes text check (char_length(notes) <= 2000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  published_by uuid references auth.users (id) on delete set null,
  published_at timestamptz,
  retired_at timestamptz,
  unique (service_id, version),
  check (max_price >= min_price),
  check (factor_compleja >= factor_media and factor_especializada >= factor_compleja)
);
create unique index service_tariffs_one_current on public.service_tariffs (service_id) where status = 'vigente';

create table public.market_references (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services (id) on delete cascade,
  provider text not null check (char_length(provider) between 2 and 120),
  url text not null check (url ~ '^https://' and char_length(url) <= 500),
  consulted_on date not null,
  scope_note text check (char_length(scope_note) <= 500),
  amount_min integer not null check (amount_min >= 0),
  amount_max integer,
  unit text not null check (unit in ('caso', 'mes', 'trabajador', 'documento', 'hora')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (amount_max is null or amount_max >= amount_min)
);
create index market_references_service_idx on public.market_references (service_id, consulted_on desc);

-- ---------------------------------------------------------------------
-- 2. Cotizaciones
-- ---------------------------------------------------------------------

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  service_id uuid not null references public.services (id),
  tariff_id uuid not null references public.service_tariffs (id),
  tariff_version integer not null,
  -- Copia del servicio al momento de cotizar (lo que el cliente acepta no cambia después)
  service_code text not null,
  service_name text not null,
  unit text not null,
  scope text not null,
  exclusions text,
  -- Variables
  complexity text not null check (complexity in ('simple', 'media', 'compleja', 'especializada')),
  quantity integer not null check (quantity between 1 and 1000),
  onsite boolean not null default false,
  urgent boolean not null default false,
  discount_pct integer not null default 0 check (discount_pct between 0 and 100),
  discount_reason text check (char_length(discount_reason) <= 500),
  external_costs integer not null default 0 check (external_costs >= 0),
  external_detail text check (char_length(external_detail) <= 500),
  payment_terms text check (char_length(payment_terms) <= 500),
  valid_until date not null,
  -- Resultado del cálculo (CLP)
  subtotal integer not null,
  urgency_amount integer not null,
  onsite_amount integer not null,
  standard_price integer not null,
  discount_amount integer not null,
  final_price integer not null,
  within_range boolean not null,
  review_reasons text[] not null default '{}',
  -- Flujo
  status text not null default 'enviada' check (status in (
    'pendiente_aprobacion', 'observada', 'enviada', 'aceptada', 'rechazada', 'anulada'
  )),
  approval_id uuid references public.approvals (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 1000),
  evidence jsonb not null default '{}'::jsonb
);
create index quotes_case_idx on public.quotes (case_id, created_at desc);
create index quotes_approval_idx on public.quotes (approval_id);

alter table public.case_events drop constraint if exists case_events_kind_check;
alter table public.case_events add constraint case_events_kind_check check (kind in (
  'creado', 'estado', 'comentario', 'nota_interna', 'documento', 'asignacion', 'tarea', 'prioridad',
  'aprobacion', 'autorizacion', 'cotizacion'
));

-- ---------------------------------------------------------------------
-- 3. Seguridad de filas
-- ---------------------------------------------------------------------

alter table public.services enable row level security;
alter table public.service_tariffs enable row level security;
alter table public.market_references enable row level security;
alter table public.quotes enable row level security;

revoke all on public.services, public.service_tariffs, public.market_references, public.quotes from anon, authenticated;
grant select on public.services, public.service_tariffs, public.market_references, public.quotes to authenticated;

create policy mfa_requerido on public.services as restrictive for all to authenticated using (private.is_mfa()) with check (private.is_mfa());
create policy mfa_requerido on public.service_tariffs as restrictive for all to authenticated using (private.is_mfa()) with check (private.is_mfa());
create policy mfa_requerido on public.market_references as restrictive for all to authenticated using (private.is_mfa()) with check (private.is_mfa());
create policy mfa_requerido on public.quotes as restrictive for all to authenticated using (private.is_mfa()) with check (private.is_mfa());

-- Catálogo: el cliente ve los servicios activos; el equipo ve todo.
create policy catalogo_visible on public.services for select to authenticated
  using (active or private.is_staff());

-- Tarifas: el cliente solo ve la vigente de un servicio activo; el equipo, todas las versiones.
create policy tarifas_visibles on public.service_tariffs for select to authenticated
  using (private.is_staff()
         or (status = 'vigente' and exists (select 1 from public.services s where s.id = service_id and s.active)));

-- Referencias de mercado: al cliente solo las recientes (180 días) de servicios activos.
create policy referencias_visibles on public.market_references for select to authenticated
  using (private.is_staff()
         or (consulted_on >= current_date - 180
             and exists (select 1 from public.services s where s.id = service_id and s.active)));

-- Cotizaciones: el equipo del caso las ve todas; el cliente, solo las que ya le fueron enviadas.
create policy cotizaciones_visibles on public.quotes for select to authenticated
  using (private.can_work_case(case_id)
         or (private.can_see_case(case_id) and status in ('enviada', 'aceptada', 'rechazada', 'anulada') and sent_at is not null));

-- ---------------------------------------------------------------------
-- 4. Funciones auxiliares
-- ---------------------------------------------------------------------

create or replace function private.require_admin() returns uuid
language plpgsql stable set search_path = '' as $$
declare v_uid uuid := private.require_session();
begin
  if not private.is_staff(array['enqora_admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  return v_uid;
end
$$;

-- Cálculo oficial del precio (única fuente de verdad).
create or replace function private.quote_calc(
  p_tariff public.service_tariffs, p_complexity text, p_quantity integer,
  p_onsite boolean, p_urgent boolean, p_discount_pct integer
) returns table (subtotal integer, urgency_amount integer, onsite_amount integer,
                 standard_price integer, discount_amount integer, final_price integer, within_range boolean)
language plpgsql immutable set search_path = '' as $$
declare
  v_factor numeric := case p_complexity
    when 'simple' then 1 when 'media' then p_tariff.factor_media
    when 'compleja' then p_tariff.factor_compleja when 'especializada' then p_tariff.factor_especializada end;
begin
  if v_factor is null or p_quantity is null or p_quantity < 1 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  subtotal := round(p_tariff.base_price * v_factor)::integer * p_quantity;
  urgency_amount := case when p_urgent then round(subtotal * p_tariff.urgency_pct / 100.0)::integer else 0 end;
  onsite_amount := case when p_onsite then p_tariff.onsite_fee else 0 end;
  standard_price := subtotal + urgency_amount + onsite_amount;
  discount_amount := round(standard_price * coalesce(p_discount_pct, 0) / 100.0)::integer;
  final_price := standard_price - discount_amount;
  within_range := coalesce(p_discount_pct, 0) <= p_tariff.max_discount_pct
                  and final_price >= p_tariff.min_price * p_quantity
                  and final_price <= p_tariff.max_price * p_quantity;
  return next;
end
$$;

-- ---------------------------------------------------------------------
-- 5. Administración del catálogo (solo Administrador ENQORA)
-- ---------------------------------------------------------------------

create or replace function public.save_service(
  p_id uuid, p_code text, p_module text, p_name text, p_summary text, p_scope text,
  p_exclusions text, p_unit text, p_requires_professional boolean, p_active boolean
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_admin();
  v_id uuid;
begin
  if p_id is null then
    insert into public.services (code, module, name, summary, scope, exclusions, unit, requires_professional, active, created_by)
    values (upper(trim(p_code)), p_module, trim(p_name), nullif(trim(coalesce(p_summary, '')), ''), trim(p_scope),
            nullif(trim(coalesce(p_exclusions, '')), ''), p_unit, coalesce(p_requires_professional, false),
            coalesce(p_active, false), v_uid)
    returning id into v_id;
  else
    update public.services set
      module = p_module, name = trim(p_name), summary = nullif(trim(coalesce(p_summary, '')), ''),
      scope = trim(p_scope), exclusions = nullif(trim(coalesce(p_exclusions, '')), ''), unit = p_unit,
      requires_professional = coalesce(p_requires_professional, false), active = coalesce(p_active, false),
      updated_at = now()
    where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  end if;
  return v_id;
exception
  when unique_violation then raise exception 'ENQ_CODIGO_DUPLICADO';
  when check_violation then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

-- Crea una nueva versión en borrador (nunca modifica una tarifa vigente).
create or replace function public.draft_tariff(
  p_service uuid, p_base_price integer, p_factor_media numeric, p_factor_compleja numeric,
  p_factor_especializada numeric, p_onsite_fee integer, p_urgency_pct integer, p_max_discount_pct integer,
  p_min_price integer, p_max_price integer, p_est_hours numeric, p_specialty text, p_notes text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_admin();
  v_id uuid;
  v_version integer;
begin
  if not exists (select 1 from public.services where id = p_service) then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  select coalesce(max(version), 0) + 1 into v_version from public.service_tariffs where service_id = p_service;
  insert into public.service_tariffs (
    service_id, version, base_price, factor_media, factor_compleja, factor_especializada, onsite_fee,
    urgency_pct, max_discount_pct, min_price, max_price, est_hours, specialty, notes, created_by)
  values (p_service, v_version, p_base_price, coalesce(p_factor_media, 1), coalesce(p_factor_compleja, 1),
          coalesce(p_factor_especializada, 1), coalesce(p_onsite_fee, 0), coalesce(p_urgency_pct, 0),
          coalesce(p_max_discount_pct, 0), p_min_price, p_max_price, p_est_hours,
          nullif(trim(coalesce(p_specialty, '')), ''), nullif(trim(coalesce(p_notes, '')), ''), v_uid)
  returning id into v_id;
  return v_id;
exception
  when check_violation or not_null_violation then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

-- Publica un borrador: pasa a vigente y retira la versión anterior. Exige reautenticación reciente.
create or replace function public.publish_tariff(p_tariff uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
  v_t public.service_tariffs;
begin
  if not private.is_staff(array['enqora_admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  select * into v_t from public.service_tariffs where id = p_tariff for update;
  if not found or v_t.status <> 'borrador' then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  update public.service_tariffs set status = 'retirada', retired_at = now()
  where service_id = v_t.service_id and status = 'vigente';
  update public.service_tariffs set status = 'vigente', published_by = v_uid, published_at = now() where id = p_tariff;
end
$$;

-- Retira la tarifa vigente (el servicio queda sin precio publicado).
create or replace function public.retire_tariff(p_tariff uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_session(true);
  if not private.is_staff(array['enqora_admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  update public.service_tariffs set status = 'retirada', retired_at = now() where id = p_tariff and status = 'vigente';
  if not found then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
end
$$;

-- Referencias de mercado: cualquier integrante del equipo (incluidos agentes de investigación) puede registrarlas.
create or replace function public.add_market_reference(
  p_service uuid, p_provider text, p_url text, p_consulted_on date, p_scope_note text,
  p_amount_min integer, p_amount_max integer, p_unit text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_id uuid;
begin
  if not private.is_staff() then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_consulted_on is null or p_consulted_on > (now() at time zone 'America/Santiago')::date then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  insert into public.market_references (service_id, provider, url, consulted_on, scope_note, amount_min, amount_max, unit, created_by)
  values (p_service, trim(p_provider), trim(p_url), p_consulted_on, nullif(trim(coalesce(p_scope_note, '')), ''),
          p_amount_min, p_amount_max, p_unit, v_uid)
  returning id into v_id;
  return v_id;
exception
  when check_violation or not_null_violation or foreign_key_violation then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

create or replace function public.delete_market_reference(p_reference uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  delete from public.market_references where id = p_reference;
end
$$;

-- ---------------------------------------------------------------------
-- 6. Cotizaciones
-- ---------------------------------------------------------------------

create or replace function public.create_quote(
  p_case uuid, p_service uuid, p_complexity text, p_quantity integer, p_onsite boolean, p_urgent boolean,
  p_discount_pct integer, p_discount_reason text, p_external_costs integer, p_external_detail text,
  p_payment_terms text, p_valid_days integer
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_case public.cases;
  v_service public.services;
  v_tariff public.service_tariffs;
  v_calc record;
  v_reasons text[] := '{}';
  v_needs_review boolean;
  v_reason text := nullif(trim(coalesce(p_discount_reason, '')), '');
  v_id uuid;
  v_approval uuid;
  v_today date := (now() at time zone 'America/Santiago')::date;
begin
  select * into v_case from public.cases where id = p_case for update;
  if not found or not private.can_work_case(p_case) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_case.status in ('cerrado', 'cancelado') then raise exception 'ENQ_CASO_CERRADO'; end if;

  select * into v_service from public.services where id = p_service;
  if not found or not v_service.active then raise exception 'ENQ_SERVICIO_INACTIVO'; end if;
  select * into v_tariff from public.service_tariffs where service_id = p_service and status = 'vigente';
  if not found then raise exception 'ENQ_SIN_TARIFA'; end if;

  if coalesce(p_valid_days, 0) not between 1 and 90
     or coalesce(p_discount_pct, 0) not between 0 and 100
     or coalesce(p_external_costs, 0) < 0 then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  if coalesce(p_discount_pct, 0) > 0 and char_length(coalesce(v_reason, '')) < 10 then raise exception 'ENQ_FALTA_MOTIVO_DESCUENTO'; end if;

  select * into v_calc from private.quote_calc(v_tariff, p_complexity, p_quantity, coalesce(p_onsite, false),
                                               coalesce(p_urgent, false), coalesce(p_discount_pct, 0));

  if not v_calc.within_range then v_reasons := array_append(v_reasons, 'fuera_de_rango'); end if;
  if v_service.requires_professional then v_reasons := array_append(v_reasons, 'criterio_profesional'); end if;
  if private.staff_role() = 'ai_agent' then v_reasons := array_append(v_reasons, 'propuesta_de_agente'); end if;
  v_needs_review := cardinality(v_reasons) > 0;

  insert into public.quotes (
    case_id, company_id, service_id, tariff_id, tariff_version, service_code, service_name, unit, scope, exclusions,
    complexity, quantity, onsite, urgent, discount_pct, discount_reason, external_costs, external_detail,
    payment_terms, valid_until, subtotal, urgency_amount, onsite_amount, standard_price, discount_amount,
    final_price, within_range, review_reasons, status, created_by, sent_at)
  values (
    p_case, v_case.company_id, p_service, v_tariff.id, v_tariff.version, v_service.code, v_service.name,
    v_service.unit, v_service.scope, v_service.exclusions, p_complexity, p_quantity, coalesce(p_onsite, false),
    coalesce(p_urgent, false), coalesce(p_discount_pct, 0), v_reason, coalesce(p_external_costs, 0),
    nullif(trim(coalesce(p_external_detail, '')), ''), nullif(trim(coalesce(p_payment_terms, '')), ''),
    v_today + p_valid_days, v_calc.subtotal, v_calc.urgency_amount, v_calc.onsite_amount, v_calc.standard_price,
    v_calc.discount_amount, v_calc.final_price, v_calc.within_range, v_reasons,
    case when v_needs_review then 'pendiente_aprobacion' else 'enviada' end, v_uid,
    case when v_needs_review then null else now() end)
  returning id into v_id;

  if v_needs_review then
    insert into public.approvals (case_id, kind, title, detail, payload, approver_role, requested_by)
    values (p_case,
            case when v_calc.within_range then 'precio' else 'excepcion' end,
            'Cotización ' || v_service.code || ' · ' || v_service.name,
            case when v_calc.within_range then 'Revisión del precio antes de enviarlo al cliente.'
                 else 'Precio o descuento fuera de los parámetros de la tarifa vigente.' end,
            jsonb_build_object('cotizacion', v_id, 'monto', v_calc.final_price, 'estandar', v_calc.standard_price,
                               'descuento_pct', coalesce(p_discount_pct, 0), 'motivos', to_jsonb(v_reasons)),
            case when not v_calc.within_range or v_case.responsible_id is null then 'supervisor' else 'responsable' end,
            v_uid)
    returning id into v_approval;
    update public.quotes set approval_id = v_approval where id = v_id;
    perform private.log_case(p_case, 'aprobacion', 'Cotización ' || v_service.code, 'interno',
      jsonb_build_object('accion', 'solicitada', 'aprobacion', v_approval, 'tipo', 'precio', 'titulo', 'Cotización ' || v_service.code));
  else
    perform private.log_case(p_case, 'cotizacion', v_service.name, 'cliente',
      jsonb_build_object('accion', 'enviada', 'cotizacion', v_id, 'monto', v_calc.final_price));
  end if;
  return v_id;
end
$$;

-- Al decidirse la aprobación, la cotización avanza sola.
create or replace function private.on_approval_decided() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_q public.quotes;
begin
  if new.status = old.status then return new; end if;
  select * into v_q from public.quotes where approval_id = new.id and status = 'pendiente_aprobacion' for update;
  if not found then return new; end if;
  if new.status = 'aprobada' then
    update public.quotes set status = 'enviada', sent_at = now() where id = v_q.id;
    perform private.log_case(v_q.case_id, 'cotizacion', v_q.service_name, 'cliente',
      jsonb_build_object('accion', 'enviada', 'cotizacion', v_q.id, 'monto', v_q.final_price));
  elsif new.status in ('rechazada', 'devuelta') then
    update public.quotes set status = 'observada' where id = v_q.id;
  elsif new.status = 'anulada' then
    update public.quotes set status = 'anulada' where id = v_q.id;
  end if;
  return new;
end
$$;

drop trigger if exists approvals_quote_flow on public.approvals;
create trigger approvals_quote_flow after update of status on public.approvals
  for each row execute function private.on_approval_decided();

-- El cliente acepta o rechaza. Solo Propietario o Administrador, con identidad confirmada.
create or replace function public.decide_quote(p_quote uuid, p_decision text, p_note text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
  v_q public.quotes;
  v_status text;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select * into v_q from public.quotes where id = p_quote for update;
  if not found or not private.has_role(v_q.company_id, array['owner', 'admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_q.status <> 'enviada' then raise exception 'ENQ_YA_DECIDIDA'; end if;
  v_status := case p_decision when 'aceptar' then 'aceptada' when 'rechazar' then 'rechazada' else null end;
  if v_status is null or char_length(coalesce(v_note, '')) > 1000 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if v_status = 'aceptada' and v_q.valid_until < (now() at time zone 'America/Santiago')::date then
    raise exception 'ENQ_COTIZACION_VENCIDA';
  end if;

  update public.quotes set
    status = v_status, decided_by = v_uid, decided_at = now(), decision_note = v_note,
    evidence = jsonb_build_object(
      'usuario', v_uid, 'rol_en_empresa', private.member_role(v_q.company_id),
      'sesion', private.current_session_id(), 'segundo_factor', 'reciente', 'momento', now(),
      'servicio', v_q.service_code, 'version_tarifa', v_q.tariff_version, 'precio_final', v_q.final_price,
      'gastos_externos', v_q.external_costs, 'alcance', v_q.scope, 'exclusiones', v_q.exclusions,
      'condiciones', v_q.payment_terms, 'validez', v_q.valid_until)
  where id = p_quote;

  perform private.log_case(v_q.case_id, 'cotizacion', v_note, 'cliente',
    jsonb_build_object('accion', v_status, 'cotizacion', p_quote, 'titulo', v_q.service_name, 'monto', v_q.final_price));
  perform private.log_event(v_q.company_id, 'cotizacion.' || v_status, v_q.service_name,
    jsonb_build_object('caso', v_q.case_id, 'cotizacion', p_quote, 'monto', v_q.final_price));
end
$$;

-- El equipo anula una cotización aún no aceptada (también la aprobación pendiente, si existe).
create or replace function public.cancel_quote(p_quote uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_q public.quotes;
begin
  select * into v_q from public.quotes where id = p_quote for update;
  if not found or not private.can_work_case(v_q.case_id) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_q.status not in ('pendiente_aprobacion', 'observada', 'enviada') then raise exception 'ENQ_YA_DECIDIDA'; end if;
  update public.quotes set status = 'anulada', decided_by = v_uid, decided_at = now() where id = p_quote;
  if v_q.approval_id is not null then
    update public.approvals set status = 'anulada', decided_by = v_uid, decided_at = now()
    where id = v_q.approval_id and status = 'pendiente';
  end if;
  if v_q.sent_at is not null then
    perform private.log_case(v_q.case_id, 'cotizacion', null, 'cliente',
      jsonb_build_object('accion', 'anulada', 'cotizacion', p_quote, 'titulo', v_q.service_name));
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 7. Catálogo inicial (SIN precios, inactivo hasta que ENQORA lo revise)
-- Descripciones de alcance como borrador editable desde /mando/catalogo.
-- ---------------------------------------------------------------------

insert into public.services (code, module, name, summary, scope, exclusions, unit, requires_professional) values
  ('CON-01', 'contabilidad', 'Contabilidad mensual pyme', 'Registro contable y control mensual de tu empresa.',
   'Registro de compras y ventas, conciliación bancaria y libros contables del período, con reporte mensual.',
   'Remuneraciones, declaraciones anuales y regularización de períodos anteriores se cotizan aparte.', 'mes', false),
  ('CON-02', 'contabilidad', 'Declaración mensual de IVA (F29)', 'Preparación y revisión del F29 del período.',
   'Cuadratura del Registro de Compras y Ventas y preparación del Formulario 29 para tu revisión.',
   'La presentación ante el SII requiere tu autorización y los medios que la normativa exija.', 'mes', false),
  ('CON-03', 'contabilidad', 'Regularización de contabilidad atrasada', 'Puesta al día de períodos pendientes.',
   'Reconstrucción y registro de los períodos pendientes, con informe de diferencias y obligaciones detectadas.',
   'Multas, intereses y giros que determine el SII no están incluidos.', 'mes', true),
  ('CON-04', 'contabilidad', 'Remuneraciones', 'Liquidaciones de sueldo y cotizaciones del mes.',
   'Cálculo de liquidaciones, libro de remuneraciones y preparación de cotizaciones previsionales del período.',
   'Finiquitos, juicios laborales y asesoría legal laboral se cotizan aparte.', 'trabajador', false),
  ('CON-05', 'contabilidad', 'Declaración anual de renta', 'Preparación de la declaración de renta de la empresa.',
   'Revisión de antecedentes del año tributario y preparación de la declaración para tu revisión.',
   'Rectificatorias de años anteriores y fiscalizaciones se cotizan aparte.', 'caso', true),
  ('CRE-01', 'create', 'Constitución de empresa', 'Creación de tu empresa con la estructura adecuada.',
   'Análisis de la estructura jurídica, redacción de estatutos y constitución en el Registro de Empresas y Sociedades.',
   'Aranceles notariales o de conservadores, cuando correspondan, se informan como gastos externos.', 'caso', true),
  ('FOR-01', 'formaliza', 'Inicio de actividades', 'Puesta en marcha tributaria de la empresa.',
   'Revisión de actividades económicas y preparación del inicio de actividades ante el SII.',
   'La presentación requiere tu autorización.', 'caso', false),
  ('FOR-02', 'formaliza', 'Patente municipal', 'Obtención de la patente según comuna y actividad.',
   'Revisión de requisitos de la municipalidad, preparación del expediente y seguimiento de la solicitud.',
   'Derechos municipales y permisos sectoriales se informan como gastos externos.', 'caso', false),
  ('BRA-01', 'brand', 'Registro de marca ante INAPI', 'Búsqueda preliminar y solicitud de marca.',
   'Búsqueda preliminar de antecedentes, preparación de la solicitud y seguimiento del trámite.',
   'Tasas de INAPI, oposiciones y la concesión, que depende de INAPI, no están garantizadas ni incluidas.', 'caso', true),
  ('LEG-01', 'legal', 'Revisión de contrato', 'Revisión profesional de un contrato.',
   'Lectura del contrato, observaciones de riesgos y sugerencias de redacción.',
   'Negociación con terceros y representación judicial se cotizan aparte.', 'documento', true),
  ('GEN-01', 'general', 'Consulta profesional', 'Hora de asesoría con un profesional ENQORA.',
   'Reunión con un profesional autorizado para orientarte sobre tu situación.',
   'La ejecución de trámites derivados de la consulta se cotiza aparte.', 'hora', true)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- 8. Permisos de ejecución
-- ---------------------------------------------------------------------

revoke execute on function private.require_admin(), private.quote_calc(public.service_tariffs, text, integer, boolean, boolean, integer),
  private.on_approval_decided() from public, anon;

revoke execute on function
  public.save_service(uuid, text, text, text, text, text, text, text, boolean, boolean),
  public.draft_tariff(uuid, integer, numeric, numeric, numeric, integer, integer, integer, integer, integer, numeric, text, text),
  public.publish_tariff(uuid), public.retire_tariff(uuid),
  public.add_market_reference(uuid, text, text, date, text, integer, integer, text),
  public.delete_market_reference(uuid),
  public.create_quote(uuid, uuid, text, integer, boolean, boolean, integer, text, integer, text, text, integer),
  public.decide_quote(uuid, text, text), public.cancel_quote(uuid)
from public, anon;

grant execute on function
  public.save_service(uuid, text, text, text, text, text, text, text, boolean, boolean),
  public.draft_tariff(uuid, integer, numeric, numeric, numeric, integer, integer, integer, integer, integer, numeric, text, text),
  public.publish_tariff(uuid), public.retire_tariff(uuid),
  public.add_market_reference(uuid, text, text, date, text, integer, integer, text),
  public.delete_market_reference(uuid),
  public.create_quote(uuid, uuid, text, integer, boolean, boolean, integer, text, integer, text, text, integer),
  public.decide_quote(uuid, text, text), public.cancel_quote(uuid)
to authenticated;

-- ---------------------------------------------------------------------
-- Reversión (solo si fuera necesario):
--   drop trigger if exists approvals_quote_flow on public.approvals;
--   drop function if exists public.save_service, public.draft_tariff, public.publish_tariff, public.retire_tariff,
--     public.add_market_reference, public.delete_market_reference, public.create_quote, public.decide_quote,
--     public.cancel_quote, private.require_admin, private.quote_calc, private.on_approval_decided cascade;
--   drop table if exists public.quotes, public.market_references, public.service_tariffs, public.services cascade;
-- ---------------------------------------------------------------------
