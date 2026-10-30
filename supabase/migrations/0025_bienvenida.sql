-- =====================================================================
-- ENQORA · Descuento de bienvenida: 40% durante los primeros 6 meses de cada cliente
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0024_asesor_precios.sql.
--
-- • El precio ENQORA normal se fija cerca del mercado (asesor de precios, M20).
-- • Cada empresa cliente paga un descuento de bienvenida (40% por defecto) en todos sus cobros
--   durante sus primeros meses (6 por defecto), contados desde su primer cobro. Después paga el
--   precio normal. Porcentaje y meses son editables en Catálogo y precios.
-- • El descuento se aplica en un solo lugar: al crear cada cobro (cotizaciones y planes mensuales),
--   y queda a la vista en el cobro: precio normal, descuento y fecha de término del beneficio.
-- =====================================================================

-- 1. Política comercial
alter table private.pricing_policy
  add column if not exists welcome_discount_pct integer not null default 40 check (welcome_discount_pct between 0 and 80),
  add column if not exists welcome_months integer not null default 6 check (welcome_months between 0 and 24);
-- El 40% pasa a ser el beneficio de bienvenida; el precio normal sugerido queda en la mediana de mercado.
update private.pricing_policy set market_discount_pct = 0 where id and market_discount_pct = 40;

drop function if exists public.set_pricing_policy(integer, integer);
create or replace function public.set_pricing_policy(
  p_discount integer, p_min_references integer, p_welcome_pct integer default null, p_welcome_months integer default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
begin
  if not private.is_staff(array['enqora_admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  update private.pricing_policy set
    market_discount_pct = p_discount, min_references = p_min_references,
    welcome_discount_pct = coalesce(p_welcome_pct, welcome_discount_pct),
    welcome_months = coalesce(p_welcome_months, welcome_months),
    updated_by = v_uid, updated_at = now()
  where id;
exception
  when check_violation then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

-- 2. Beneficio por empresa
alter table public.companies
  add column if not exists welcome_from date,
  add column if not exists welcome_until date,
  add column if not exists welcome_pct integer check (welcome_pct between 0 and 80);

alter table public.charges
  add column if not exists list_amount integer check (list_amount > 0),
  add column if not exists discount_pct integer check (discount_pct between 0 and 80);

-- 3. Todo cobro pasa por aquí: aplica el beneficio si la empresa está dentro de su período.
create or replace function private.new_charge(
  p_company uuid, p_kind text, p_description text, p_amount integer, p_due date,
  p_quote uuid default null, p_subscription uuid default null, p_case uuid default null,
  p_period_start date default null, p_period_end date default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_pol private.pricing_policy;
  v_co public.companies;
  v_ref date := coalesce(p_period_start, private.today_cl());
  v_amount integer := p_amount;
  v_pct integer;
  v_desc text := p_description;
begin
  select * into v_pol from private.pricing_policy where id;
  select * into v_co from public.companies where id = p_company for update;

  -- El beneficio comienza con el primer cobro de la empresa (su primera contratación).
  if v_co.welcome_from is null and coalesce(v_pol.welcome_months, 0) > 0 and coalesce(v_pol.welcome_discount_pct, 0) > 0 then
    update public.companies set welcome_from = private.today_cl(),
      welcome_until = (private.today_cl() + make_interval(months => v_pol.welcome_months))::date,
      welcome_pct = v_pol.welcome_discount_pct
    where id = p_company
    returning * into v_co;
  end if;

  if v_co.welcome_until is not null and v_ref < v_co.welcome_until and coalesce(v_co.welcome_pct, 0) > 0 then
    v_pct := v_co.welcome_pct;
    v_amount := greatest(1, round(p_amount * (100 - v_pct) / 100.0)::integer);
    v_desc := left(p_description, 230) || ' · bienvenida −' || v_pct || '% hasta el ' || to_char(v_co.welcome_until, 'DD-MM-YYYY');
  end if;

  insert into public.charges (folio, company_id, kind, quote_id, subscription_id, case_id, description, amount,
    list_amount, discount_pct, period_start, period_end, due_date, created_by)
  values ('COB-' || to_char(private.today_cl(), 'YYYY') || '-' || lpad(nextval('public.charge_folio_seq')::text, 5, '0'),
    p_company, p_kind, p_quote, p_subscription, p_case, left(v_desc, 300), v_amount,
    case when v_pct is not null then p_amount end, v_pct,
    p_period_start, p_period_end, p_due, (select auth.uid()))
  returning id into v_id;
  perform private.log_event(p_company, 'cobro.creado', left(v_desc, 300),
    jsonb_build_object('cobro', v_id, 'monto', v_amount, 'precio_normal', p_amount, 'descuento_bienvenida', v_pct, 'tipo', p_kind));
  return v_id;
end
$$;

-- 4. Catálogo público con el beneficio de bienvenida vigente
drop function if exists public.public_catalog();
create function public.public_catalog()
returns table (code text, module text, name text, summary text, unit text, requires_professional boolean, price_from integer,
               market_price integer, market_sources integer, market_consulted date, welcome_pct integer, welcome_months integer)
language sql stable security definer set search_path = '' as $$
  select s.code, s.module, s.name, s.summary, s.unit, s.requires_professional, t.base_price,
         case when m.n >= p.min_references then m.median end,
         case when m.n >= p.min_references then m.n end,
         case when m.n >= p.min_references then m.last_consulted end,
         nullif(p.welcome_discount_pct, 0), case when p.welcome_discount_pct > 0 then nullif(p.welcome_months, 0) end
  from public.services s
  left join public.service_tariffs t on t.service_id = s.id and t.status = 'vigente'
  cross join private.pricing_policy p
  left join lateral private.market_median(s.id) m on true
  where s.active
  order by s.code
$$;

-- La asesoría informa también el beneficio de bienvenida.
create or replace function public.price_advice(p_service uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_pol private.pricing_policy;
  v_m record;
  v_pending integer;
  v_sug integer;
begin
  perform private.require_session();
  if not private.is_staff() then raise exception 'ENQ_SIN_PERMISO'; end if;
  select * into v_pol from private.pricing_policy where id;
  select * into v_m from private.market_median(p_service);
  select count(*)::integer into v_pending from public.market_references where service_id = p_service and status = 'por_verificar';
  v_sug := case when v_m.median is null then null
                else (round(v_m.median * (100 - v_pol.market_discount_pct) / 100.0 / 100.0) * 100)::integer end;
  return jsonb_build_object(
    'mediana', v_m.median, 'referencias', coalesce(v_m.n, 0), 'ultima_consulta', v_m.last_consulted, 'por_verificar', v_pending,
    'descuento', v_pol.market_discount_pct, 'minimo_referencias', v_pol.min_references,
    'suficiente', coalesce(v_m.n, 0) >= v_pol.min_references, 'sugerido', v_sug,
    'bienvenida_pct', v_pol.welcome_discount_pct, 'bienvenida_meses', v_pol.welcome_months,
    'precio_bienvenida', case when v_sug is null then null else round(v_sug * (100 - v_pol.welcome_discount_pct) / 100.0)::integer end);
end
$$;

-- 5. Permisos
revoke execute on function public.set_pricing_policy(integer, integer, integer, integer), public.public_catalog() from public, anon;
grant execute on function public.set_pricing_policy(integer, integer, integer, integer) to authenticated;
grant execute on function public.public_catalog() to anon, authenticated;
