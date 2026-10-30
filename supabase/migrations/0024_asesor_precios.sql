-- =====================================================================
-- ENQORA · Asesor de precios (M20)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0023_consulta_parcial.sql.
--
-- Un agente investiga en fuentes públicas los precios que el mercado publica por cada trámite o
-- servicio y los deja como referencias «por verificar». El equipo verifica cada fuente. Con las
-- referencias verificadas se calcula la mediana de mercado y un precio ENQORA sugerido con el
-- descuento de la política comercial (40% por defecto). El agente nunca publica precios: el
-- Administrador crea el borrador de tarifa y la publica con su confirmación de identidad.
-- =====================================================================

-- 1. Referencias de mercado: origen, verificación y evidencia
alter table public.market_references
  add column if not exists origin text not null default 'manual' check (origin in ('manual', 'agente')),
  add column if not exists status text not null default 'verificada' check (status in ('por_verificar', 'verificada', 'descartada')),
  add column if not exists evidence text check (char_length(evidence) <= 500),
  add column if not exists reviewed_by uuid references auth.users (id) on delete set null,
  add column if not exists reviewed_at timestamptz;
create index if not exists market_references_reviewed_idx on public.market_references (reviewed_by);
create index if not exists market_references_status_idx on public.market_references (service_id, status, consulted_on desc);

-- El cliente solo ve referencias verificadas y recientes.
drop policy if exists referencias_visibles on public.market_references;
create policy referencias_visibles on public.market_references for select to authenticated
  using (private.is_staff()
         or (status = 'verificada' and consulted_on >= current_date - 180
             and exists (select 1 from public.services s where s.id = service_id and s.active)));

-- 2. Política comercial: descuento sobre la mediana del mercado
create table if not exists private.pricing_policy (
  id boolean primary key default true check (id),
  market_discount_pct integer not null default 40 check (market_discount_pct between 0 and 80),
  min_references integer not null default 3 check (min_references between 1 and 20),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
insert into private.pricing_policy (id) values (true) on conflict do nothing;

create or replace function public.set_pricing_policy(p_discount integer, p_min_references integer) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
begin
  if not private.is_staff(array['enqora_admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  update private.pricing_policy set market_discount_pct = p_discount, min_references = p_min_references,
    updated_by = v_uid, updated_at = now() where id;
exception
  when check_violation then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

-- 3. Asesoría: mediana de mercado (referencias verificadas, 180 días, misma unidad) y precio sugerido
create or replace function private.market_median(p_service uuid) returns table (median integer, n integer, last_consulted date)
language sql stable security definer set search_path = '' as $$
  select round(percentile_cont(0.5) within group (order by (r.amount_min + coalesce(r.amount_max, r.amount_min)) / 2.0))::integer,
         count(*)::integer, max(r.consulted_on)
  from public.market_references r join public.services s on s.id = r.service_id
  where r.service_id = p_service and r.status = 'verificada' and r.unit = s.unit and r.consulted_on >= current_date - 180
$$;

create or replace function public.price_advice(p_service uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_pol private.pricing_policy;
  v_m record;
  v_pending integer;
begin
  perform private.require_session();
  if not private.is_staff() then raise exception 'ENQ_SIN_PERMISO'; end if;
  select * into v_pol from private.pricing_policy where id;
  select * into v_m from private.market_median(p_service);
  select count(*)::integer into v_pending from public.market_references where service_id = p_service and status = 'por_verificar';
  return jsonb_build_object(
    'mediana', v_m.median, 'referencias', coalesce(v_m.n, 0), 'ultima_consulta', v_m.last_consulted, 'por_verificar', v_pending,
    'descuento', v_pol.market_discount_pct, 'minimo_referencias', v_pol.min_references,
    'suficiente', coalesce(v_m.n, 0) >= v_pol.min_references,
    'sugerido', case when v_m.median is null then null
                     else (round(v_m.median * (100 - v_pol.market_discount_pct) / 100.0 / 100.0) * 100)::integer end);
end
$$;

-- El agente entrega referencias con la clave de servicio: quedan «por verificar».
create or replace function public.svc_add_market_references(p_token text, p_service uuid, p_items jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 15 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if not exists (select 1 from public.services where id = p_service) then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  insert into public.market_references (service_id, provider, url, consulted_on, scope_note, amount_min, amount_max, unit, origin, status, evidence)
  select p_service, left(trim(x.provider), 120), trim(x.url), private.today_cl(), left(nullif(trim(coalesce(x.scope_note, '')), ''), 500),
         x.amount_min, case when x.amount_max >= x.amount_min then x.amount_max end, x.unit, 'agente', 'por_verificar',
         left(nullif(trim(coalesce(x.evidence, '')), ''), 500)
  from jsonb_to_recordset(p_items) as x(provider text, url text, scope_note text, amount_min integer, amount_max integer, unit text, evidence text)
  where char_length(trim(coalesce(x.provider, ''))) >= 2 and x.url ~ '^https://' and char_length(x.url) <= 500
    and x.amount_min between 1000 and 100000000 and x.unit in ('caso', 'mes', 'trabajador', 'documento', 'hora')
    and not exists (
      select 1 from public.market_references m
      where m.service_id = p_service and m.url = trim(x.url) and m.amount_min = x.amount_min and m.consulted_on >= current_date - 30);
  get diagnostics v_count = row_count;
  return v_count;
exception
  when invalid_text_representation or numeric_value_out_of_range then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

-- Verificación humana de cada referencia (supervisión o Administrador).
create or replace function public.review_market_reference(p_reference uuid, p_decision text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
begin
  if not private.is_supervisor() then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_decision not in ('verificada', 'descartada') then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  update public.market_references set status = p_decision, reviewed_by = v_uid, reviewed_at = now()
  where id = p_reference and status = 'por_verificar';
  if not found then raise exception 'ENQ_YA_DECIDIDA'; end if;
end
$$;

-- Borrador de tarifa con el precio sugerido (no publica: la publicación sigue siendo del Administrador).
create or replace function public.draft_tariff_from_advice(p_service uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_advice jsonb;
  v_price integer;
  v_last public.service_tariffs;
begin
  perform private.require_session();
  if not private.is_staff(array['enqora_admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  v_advice := public.price_advice(p_service);
  if not (v_advice ->> 'suficiente')::boolean or (v_advice ->> 'sugerido') is null then raise exception 'ENQ_SIN_REFERENCIAS'; end if;
  v_price := (v_advice ->> 'sugerido')::integer;
  select * into v_last from public.service_tariffs where service_id = p_service order by version desc limit 1;
  return public.draft_tariff(
    p_service, v_price, coalesce(v_last.factor_media, 1), coalesce(v_last.factor_compleja, 1), coalesce(v_last.factor_especializada, 1),
    coalesce(v_last.onsite_fee, 0), coalesce(v_last.urgency_pct, 0), coalesce(v_last.max_discount_pct, 0),
    v_price, greatest(v_price, coalesce(v_last.max_price, v_price)), v_last.est_hours, v_last.specialty,
    format('Sugerido por el asesor de precios: mediana de mercado %s (%s referencias verificadas, última del %s) menos %s%%.',
           v_advice ->> 'mediana', v_advice ->> 'referencias', v_advice ->> 'ultima_consulta', v_advice ->> 'descuento'));
end
$$;

-- Servicios a investigar por la tarea semanal: activos, primero los sin referencias recientes.
create or replace function public.svc_services_for_research(p_token text, p_limit integer default 2)
returns table (id uuid, code text, name text, scope text, unit text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  return query
    select s.id, s.code, s.name, s.scope, s.unit from public.services s
    where s.active
    order by (select max(r.consulted_on) from public.market_references r where r.service_id = s.id and r.status <> 'descartada') asc nulls first, s.code
    limit least(greatest(coalesce(p_limit, 2), 1), 5);
end
$$;

-- 4. Catálogo público con precio de mercado (solo si hay suficientes referencias verificadas)
drop function if exists public.public_catalog();
create function public.public_catalog()
returns table (code text, module text, name text, summary text, unit text, requires_professional boolean, price_from integer,
               market_price integer, market_sources integer, market_consulted date)
language sql stable security definer set search_path = '' as $$
  select s.code, s.module, s.name, s.summary, s.unit, s.requires_professional, t.base_price,
         case when m.n >= p.min_references then m.median end,
         case when m.n >= p.min_references then m.n end,
         case when m.n >= p.min_references then m.last_consulted end
  from public.services s
  left join public.service_tariffs t on t.service_id = s.id and t.status = 'vigente'
  cross join private.pricing_policy p
  left join lateral private.market_median(s.id) m on true
  where s.active
  order by s.code
$$;

-- 5. Permisos
revoke execute on function private.market_median(uuid) from public, anon;
revoke execute on function
  public.set_pricing_policy(integer, integer), public.price_advice(uuid), public.svc_add_market_references(text, uuid, jsonb),
  public.review_market_reference(uuid, text), public.draft_tariff_from_advice(uuid), public.public_catalog(),
  public.svc_services_for_research(text, integer)
from public, anon;
grant execute on function public.svc_services_for_research(text, integer) to anon, authenticated;
grant execute on function public.public_catalog() to anon, authenticated;
grant execute on function public.svc_add_market_references(text, uuid, jsonb) to anon, authenticated;
grant execute on function public.set_pricing_policy(integer, integer), public.price_advice(uuid),
  public.review_market_reference(uuid, text), public.draft_tariff_from_advice(uuid) to authenticated;
