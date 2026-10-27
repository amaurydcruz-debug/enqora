-- =====================================================================
-- ENQORA · 0017 · Aprendizaje de casos y vigilancia normativa (M16)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0002…0016.
--
--  1. Aprendizajes: cada caso resuelto deja una lección anonimizada (problema, ruta, resultado,
--     qué funcionó, qué mejorar). La aprueba una persona distinta de quien la escribió (cuatro ojos)
--     y los agentes la reciben en los casos siguientes del mismo servicio.
--  2. Vigilancia normativa: un agente revisa semanalmente fuentes oficiales y propone novedades
--     (leyes, circulares, plazos, beneficios). Nada se aplica ni se muestra al cliente sin
--     verificación de la supervisión.
--  3. Métricas por ruta: casos resueltos, días promedio y aprendizajes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Aprendizajes de casos resueltos
-- ---------------------------------------------------------------------

create table public.case_learnings (
  id uuid primary key default gen_random_uuid(),
  case_id uuid unique references public.cases (id) on delete set null,
  module text not null,
  rubro text check (char_length(rubro) <= 40),
  problem text not null check (char_length(problem) between 10 and 1000),
  route text not null check (char_length(route) between 10 and 3000),
  outcome text not null check (char_length(outcome) between 10 and 1500),
  worked text check (char_length(worked) <= 1500),
  improve text check (char_length(improve) <= 1500),
  benefits text check (char_length(benefits) <= 1000),
  days_to_resolve integer check (days_to_resolve >= 0),
  status text not null default 'borrador' check (status in ('borrador', 'aprobado', 'descartado')),
  created_by uuid references auth.users (id) on delete set null,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  review_note text check (char_length(review_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index case_learnings_module_idx on public.case_learnings (module, status, approved_at desc);
create index case_learnings_created_by_idx on public.case_learnings (created_by);
create index case_learnings_approved_by_idx on public.case_learnings (approved_by);

alter table public.case_learnings enable row level security;
revoke all on public.case_learnings from anon, authenticated;
grant select on public.case_learnings to authenticated;
create policy mfa_requerido on public.case_learnings as restrictive for all to authenticated using (private.is_mfa()) with check (private.is_mfa());
-- Solo el equipo ENQORA (no contienen datos de la empresa, pero son conocimiento interno).
create policy aprendizajes_equipo on public.case_learnings for select to authenticated using (private.is_staff());

-- Guarda (o actualiza el borrador de) el aprendizaje de un caso en verificación o cerrado.
-- p_data: problema, ruta, resultado, funciono, mejorar, beneficios
create or replace function public.save_case_learning(p_case uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_case public.cases;
  v_co public.companies;
  v_id uuid;
  v_text text;
begin
  select * into v_case from public.cases where id = p_case;
  if not found or not private.can_work_case(p_case) or private.is_staff(array['ai_agent']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_case.status not in ('verificacion', 'cerrado') then raise exception 'ENQ_CASO_SIN_RESOLVER'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if exists (select 1 from public.case_learnings where case_id = p_case and status = 'aprobado') then raise exception 'ENQ_YA_DECIDIDA'; end if;

  -- Anonimización: el aprendizaje no puede contener el nombre ni el RUT de la empresa.
  select * into v_co from public.companies where id = v_case.company_id;
  v_text := lower(concat_ws(' ', p_data ->> 'problema', p_data ->> 'ruta', p_data ->> 'resultado', p_data ->> 'funciono',
                            p_data ->> 'mejorar', p_data ->> 'beneficios'));
  if position(lower(v_co.legal_name) in v_text) > 0
     or (v_co.trade_name is not null and char_length(v_co.trade_name) >= 4 and position(lower(v_co.trade_name) in v_text) > 0)
     or position(split_part(v_co.rut, '-', 1) in regexp_replace(v_text, '[^0-9]', '', 'g')) > 0 then
    raise exception 'ENQ_APRENDIZAJE_IDENTIFICA';
  end if;

  insert into public.case_learnings (case_id, module, rubro, problem, route, outcome, worked, improve, benefits, days_to_resolve, created_by)
  values (p_case, v_case.module,
    (select o.answers ->> 'actividad' from public.company_onboarding o where o.company_id = v_case.company_id),
    trim(coalesce(p_data ->> 'problema', '')), trim(coalesce(p_data ->> 'ruta', '')), trim(coalesce(p_data ->> 'resultado', '')),
    nullif(trim(coalesce(p_data ->> 'funciono', '')), ''), nullif(trim(coalesce(p_data ->> 'mejorar', '')), ''),
    nullif(trim(coalesce(p_data ->> 'beneficios', '')), ''),
    greatest(0, (coalesce(v_case.closed_at, now())::date - v_case.created_at::date)), v_uid)
  on conflict (case_id) do update set
    problem = excluded.problem, route = excluded.route, outcome = excluded.outcome, worked = excluded.worked,
    improve = excluded.improve, benefits = excluded.benefits, days_to_resolve = excluded.days_to_resolve,
    status = 'borrador', created_by = v_uid, approved_by = null, approved_at = null, updated_at = now()
  returning id into v_id;
  return v_id;
exception
  when check_violation or not_null_violation then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

-- Aprobar o descartar (supervisión, distinta de quien lo escribió).
create or replace function public.decide_case_learning(p_learning uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_l public.case_learnings;
begin
  if not private.is_supervisor() then raise exception 'ENQ_SIN_PERMISO'; end if;
  select * into v_l from public.case_learnings where id = p_learning for update;
  if not found then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_l.status <> 'borrador' then raise exception 'ENQ_YA_DECIDIDA'; end if;
  if v_l.created_by = v_uid then raise exception 'ENQ_CUATRO_OJOS'; end if;
  update public.case_learnings set status = case when p_approve then 'aprobado' else 'descartado' end,
    approved_by = v_uid, approved_at = now(), review_note = left(nullif(trim(coalesce(p_note, '')), ''), 1000), updated_at = now()
  where id = p_learning;
end
$$;

-- ---------------------------------------------------------------------
-- 2. Vigilancia normativa
-- ---------------------------------------------------------------------

create table public.regulatory_updates (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 5 and 200),
  summary text not null check (char_length(summary) between 10 and 2000),
  institution text check (char_length(institution) <= 120),
  kind text not null check (kind in ('ley', 'reglamento', 'circular', 'resolucion', 'beneficio', 'tramite', 'plazo', 'otro')),
  source_url text not null check (source_url ~ '^https://[^\s]+\.[^\s]+$' and char_length(source_url) <= 400),
  published_on date,
  impact text check (char_length(impact) <= 1000),
  modules text[] not null default '{}',
  rubros text[] not null default '{}',
  status text not null default 'detectada' check (status in ('detectada', 'verificada', 'aplicada', 'descartada')),
  client_visible boolean not null default false,
  detected_by text not null default 'vigilancia' check (detected_by in ('vigilancia', 'equipo')),
  dedupe_key text not null unique,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (char_length(review_note) <= 1000),
  created_at timestamptz not null default now()
);
create index regulatory_updates_status_idx on public.regulatory_updates (status, created_at desc);
create index regulatory_updates_reviewed_by_idx on public.regulatory_updates (reviewed_by);

alter table public.regulatory_updates enable row level security;
revoke all on public.regulatory_updates from anon, authenticated;
grant select on public.regulatory_updates to authenticated;
create policy mfa_requerido on public.regulatory_updates as restrictive for all to authenticated using (private.is_mfa()) with check (private.is_mfa());
create policy novedades_equipo on public.regulatory_updates for select to authenticated using (private.is_staff());
create policy novedades_clientes on public.regulatory_updates for select to authenticated
  using (status in ('verificada', 'aplicada') and client_visible);

create or replace function private.valid_update(p jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'object'
    and char_length(trim(coalesce(p ->> 'titulo', ''))) between 5 and 200
    and char_length(trim(coalesce(p ->> 'resumen', ''))) between 10 and 2000
    and coalesce(p ->> 'url', '') ~ '^https://[^\s]+\.[^\s]+$' and char_length(p ->> 'url') <= 400
    and coalesce(p ->> 'tipo', '') in ('ley', 'reglamento', 'circular', 'resolucion', 'beneficio', 'tramite', 'plazo', 'otro')
$$;

create or replace function private.insert_update(p jsonb, p_by text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_date date;
begin
  if not private.valid_update(p) then return false; end if;
  begin
    v_date := nullif(p ->> 'publicado', '')::date;
  exception when others then v_date := null;
  end;
  insert into public.regulatory_updates (title, summary, institution, kind, source_url, published_on, impact, modules, rubros, detected_by, dedupe_key)
  values (trim(p ->> 'titulo'), trim(p ->> 'resumen'), left(p ->> 'institucion', 120), p ->> 'tipo', p ->> 'url', v_date,
    left(nullif(trim(coalesce(p ->> 'impacto', '')), ''), 1000),
    coalesce((select array_agg(x) from jsonb_array_elements_text(case when jsonb_typeof(p -> 'modulos') = 'array' then p -> 'modulos' else '[]'::jsonb end) x
              where x in ('idea', 'create', 'brand', 'formaliza', 'contabilidad', 'gestion', 'crece', 'legal', 'general')), '{}'),
    coalesce((select array_agg(left(x, 40)) from jsonb_array_elements_text(case when jsonb_typeof(p -> 'rubros') = 'array' then p -> 'rubros' else '[]'::jsonb end) x), '{}'),
    p_by, md5(lower(p ->> 'url') || '|' || lower(trim(p ->> 'titulo'))))
  on conflict (dedupe_key) do nothing;
  return found;
end
$$;

-- El agente de vigilancia entrega sus hallazgos con la clave de servicio (tarea semanal).
create or replace function public.ingest_regulatory_updates(p_token text, p_items jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  p jsonb;
  v_n integer := 0;
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  for p in select * from jsonb_array_elements(p_items) limit 30 loop
    if private.insert_update(p, 'vigilancia') then v_n := v_n + 1; end if;
  end loop;
  if v_n > 0 then
    perform private.notify(private.staff_users(array['enqora_admin', 'ops_director']), null, null, 'equipo',
      'Vigilancia normativa: ' || v_n || ' novedad' || case when v_n = 1 then '' else 'es' end || ' por verificar',
      'Revisa las fuentes y decide si aplican a ENQORA y a sus clientes.', '/mando/vigilancia', 'vigilancia-' || to_char(now(), 'IYYY-IW'));
  end if;
  return v_n;
end
$$;

-- El equipo también puede registrar una novedad a mano.
create or replace function public.add_regulatory_update(p_data jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_session();
  if not private.is_staff() or private.is_staff(array['ai_agent']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if not private.insert_update(p_data, 'equipo') then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
end
$$;

-- Verificar, marcar como aplicada a la base de ENQORA o descartar (supervisión).
-- Al verificar una novedad visible para clientes con rubros definidos, se avisa a las empresas de esos rubros.
create or replace function public.review_regulatory_update(
  p_update uuid, p_status text, p_note text default null, p_client_visible boolean default false,
  p_modules text[] default null, p_rubros text[] default null
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_u public.regulatory_updates;
  v_co record;
  v_n integer := 0;
begin
  if not private.is_supervisor() then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_status not in ('verificada', 'aplicada', 'descartada') then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  select * into v_u from public.regulatory_updates where id = p_update for update;
  if not found then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_u.status = 'descartada' then raise exception 'ENQ_YA_DECIDIDA'; end if;
  if p_status = 'descartada' and char_length(trim(coalesce(p_note, ''))) < 10 then raise exception 'ENQ_FALTA_OBSERVACION'; end if;

  update public.regulatory_updates set status = p_status, reviewed_by = v_uid, reviewed_at = now(),
    review_note = left(nullif(trim(coalesce(p_note, '')), ''), 1000),
    client_visible = p_status <> 'descartada' and coalesce(p_client_visible, false),
    modules = coalesce((select array_agg(x) from unnest(p_modules) x
                        where x in ('idea', 'create', 'brand', 'formaliza', 'contabilidad', 'gestion', 'crece', 'legal', 'general')), modules),
    rubros = coalesce(p_rubros, rubros)
  where id = p_update
  returning * into v_u;

  if v_u.status = 'verificada' and v_u.client_visible and cardinality(v_u.rubros) > 0 and v_u.status <> 'descartada' then
    for v_co in
      select o.company_id from public.company_onboarding o where o.answers ->> 'actividad' = any (v_u.rubros)
    loop
      perform private.notify(private.company_users(v_co.company_id, array['owner', 'admin']), v_co.company_id, null, 'casos',
        left('Novedad para tu empresa: ' || v_u.title, 200), left(v_u.summary, 500), '/panel#novedades',
        'novedad-' || v_u.id || '-' || v_co.company_id);
      v_n := v_n + 1;
    end loop;
  end if;
  return v_n;
end
$$;

-- ---------------------------------------------------------------------
-- 3. Contexto de los agentes: aprendizajes y novedades verificadas (reemplaza la de 0014)
-- ---------------------------------------------------------------------

create or replace function private.agent_context(p_case uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'caso', jsonb_build_object('folio', c.folio, 'servicio', c.module, 'titulo', c.title, 'descripcion', c.description,
      'estado', c.status, 'prioridad', c.priority, 'creado', c.created_at, 'respuestas_iniciales', c.intake,
      'gratuito', c.origin = 'diagnostico_gratuito'),
    'empresa', jsonb_build_object('razon_social', co.legal_name, 'nombre_fantasia', co.trade_name, 'rut', co.rut,
      'giro', co.activity, 'regimen_tributario', co.tax_regime),
    'perfil_empresa', (select o.answers from public.company_onboarding o where o.company_id = c.company_id),
    'documentos', coalesce((select jsonb_agg(jsonb_build_object('nombre', d.file_name, 'fecha', d.created_at::date) order by d.created_at)
      from public.case_documents d where d.case_id = c.id), '[]'::jsonb),
    'mensajes', coalesce((select jsonb_agg(x order by x ->> 'fecha') from (
      select jsonb_build_object('tipo', e.kind, 'texto', left(e.body, 1500), 'fecha', e.created_at,
        'autor', case when exists (select 1 from public.staff_members s where s.user_id = e.actor_id) then 'equipo' else 'cliente' end) as x
      from public.case_events e where e.case_id = c.id and e.kind in ('comentario', 'nota_interna') and e.body is not null
      order by e.created_at desc limit 20) m), '[]'::jsonb),
    'pasos_registrados', coalesce((select jsonb_agg(jsonb_build_object('agente', s.agent, 'etapa', s.stage, 'titulo', s.title,
      'detalle', s.detail, 'estado', s.status) order by s.created_at) from public.case_analysis_steps s where s.case_id = c.id), '[]'::jsonb),
    'diagnostico_entregado', (select jsonb_build_object('resumen', d.summary, 'situaciones',
      (select jsonb_agg(f.title order by f.position) from public.diagnosis_findings f where f.diagnosis_id = d.id))
      from public.diagnoses d where d.case_id = c.id and d.status = 'publicado'),
    'cotizaciones', coalesce((select jsonb_agg(jsonb_build_object('servicio', q.service_name, 'estado', q.status))
      from public.quotes q where q.case_id = c.id), '[]'::jsonb),
    -- Lo aprendido en casos resueltos del mismo servicio (aprobado, anonimizado).
    'aprendizajes', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('rubro', l.rubro, 'problema', l.problem, 'ruta', l.route, 'resultado', l.outcome,
        'funciono', l.worked, 'mejorar', l.improve, 'beneficios', l.benefits, 'dias', l.days_to_resolve) as x
      from public.case_learnings l where l.status = 'aprobado' and l.module = c.module and l.case_id is distinct from c.id
      order by (l.rubro is not distinct from (select o.answers ->> 'actividad' from public.company_onboarding o where o.company_id = c.company_id)) desc,
               l.approved_at desc
      limit 6) a), '[]'::jsonb),
    -- Novedades normativas y beneficios verificados por la supervisión en el último año.
    'novedades_verificadas', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('titulo', u.title, 'resumen', u.summary, 'institucion', u.institution, 'tipo', u.kind,
        'fuente', u.source_url, 'publicado', u.published_on, 'impacto', u.impact) as x
      from public.regulatory_updates u
      where u.status in ('verificada', 'aplicada') and u.created_at > now() - interval '1 year'
        and (cardinality(u.modules) = 0 or c.module = any (u.modules))
      order by u.reviewed_at desc nulls last
      limit 8) n), '[]'::jsonb)
  )
  from public.cases c join public.companies co on co.id = c.company_id
  where c.id = p_case
$$;

-- ---------------------------------------------------------------------
-- 4. Métricas por ruta (equipo)
-- ---------------------------------------------------------------------

create or replace function public.route_metrics() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_session();
  if not private.is_staff() then raise exception 'ENQ_SIN_PERMISO'; end if;
  return coalesce((select jsonb_agg(x order by x ->> 'servicio') from (
    select jsonb_build_object(
      'servicio', m.module,
      'abiertos', (select count(*) from public.cases c where c.module = m.module and c.status not in ('cerrado', 'cancelado')),
      'resueltos_180d', (select count(*) from public.cases c where c.module = m.module and c.status = 'cerrado' and c.closed_at > now() - interval '180 days'),
      'dias_promedio', (select round(avg(c.closed_at::date - c.created_at::date)) from public.cases c
                        where c.module = m.module and c.status = 'cerrado' and c.closed_at > now() - interval '180 days'),
      'aprendizajes', (select count(*) from public.case_learnings l where l.module = m.module and l.status = 'aprobado'),
      'por_revisar', (select count(*) from public.case_learnings l where l.module = m.module and l.status = 'borrador')) as x
    from unnest(array['idea', 'create', 'brand', 'formaliza', 'contabilidad', 'gestion', 'crece', 'legal', 'general']) as m(module)
  ) s), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------------
-- 5. Permisos
-- ---------------------------------------------------------------------

revoke execute on function private.valid_update(jsonb), private.insert_update(jsonb, text) from public, anon, authenticated;
revoke execute on function
  public.save_case_learning(uuid, jsonb), public.decide_case_learning(uuid, boolean, text),
  public.ingest_regulatory_updates(text, jsonb), public.add_regulatory_update(jsonb),
  public.review_regulatory_update(uuid, text, text, boolean, text[], text[]), public.route_metrics()
from public, anon;
grant execute on function
  public.save_case_learning(uuid, jsonb), public.decide_case_learning(uuid, boolean, text),
  public.ingest_regulatory_updates(text, jsonb), public.add_regulatory_update(jsonb),
  public.review_regulatory_update(uuid, text, text, boolean, text[], text[]), public.route_metrics()
to authenticated;
-- La tarea semanal (sin sesión) entrega novedades solo con la clave de servicio.
grant execute on function public.ingest_regulatory_updates(text, jsonb) to anon;
-- Corrección de 0015: la tarea diaria corre sin sesión (rol anon) y se protege con la clave de servicio.
grant execute on function public.daily_run(text) to anon;
