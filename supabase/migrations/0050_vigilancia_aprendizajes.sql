-- =====================================================================
-- ENQORA · 0050 · Vigilancia normativa y aprendizajes: vigencia, avisos y privacidad
--  1. Las novedades con plazo (beneficios, condonaciones, fechas límite) tienen «vigente hasta». Vencidas, dejan
--     de mostrarse a clientes, en la consulta pública y a los agentes; quedan en el historial del equipo.
--  2. Se avisa a las empresas del rubro tanto si la novedad queda «verificada» como «aplicada» (antes, solo
--     con «verificada»), y nunca si ya venció.
--  3. Un aprendizaje no puede contener correos, teléfonos ni RUT de nadie (antes solo se revisaba la empresa
--     del caso). Ley 21.719.
--  4. Al guardar un aprendizaje se avisa a la supervisión (cuatro ojos) para que lo revise.
--  5. La pantalla de Vigilancia muestra la última ejecución del agente y si falló (registro de 0049).
-- Requiere 0049. Se puede ejecutar más de una vez.
-- =====================================================================

-- 1. Vigencia
alter table public.regulatory_updates add column if not exists vigente_hasta date;

drop policy if exists novedades_clientes on public.regulatory_updates;
create policy novedades_clientes on public.regulatory_updates for select to authenticated
  using (status in ('verificada', 'aplicada') and client_visible
         and (vigente_hasta is null or vigente_hasta >= (now() at time zone 'America/Santiago')::date));

create or replace function public.public_regulatory_news(p_institutions text[] default null)
returns table (title text, summary text, institution text, source_url text, published_on date, reviewed_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select u.title, u.summary, u.institution, u.source_url, u.published_on, u.reviewed_at
  from public.regulatory_updates u
  where u.status in ('verificada', 'aplicada') and u.client_visible
    and (u.vigente_hasta is null or u.vigente_hasta >= (now() at time zone 'America/Santiago')::date)
    and (p_institutions is null or exists (
      select 1 from unnest(p_institutions) i where coalesce(u.institution, '') ilike '%' || i || '%'))
  order by coalesce(u.published_on, u.reviewed_at::date) desc nulls last
  limit 5
$$;
revoke execute on function public.public_regulatory_news(text[]) from public;
grant execute on function public.public_regulatory_news(text[]) to anon, authenticated;

-- 2. Revisión con vigencia y aviso también al «aplicar»
drop function if exists public.review_regulatory_update(uuid, text, text, boolean, text[], text[]);
create or replace function public.review_regulatory_update(
  p_update uuid, p_status text, p_note text default null, p_client_visible boolean default false,
  p_modules text[] default null, p_rubros text[] default null, p_vigente_hasta date default null
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_u public.regulatory_updates;
  v_co record;
  v_n integer := 0;
  v_hoy date := (now() at time zone 'America/Santiago')::date;
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
    rubros = coalesce(p_rubros, rubros),
    vigente_hasta = p_vigente_hasta
  where id = p_update
  returning * into v_u;

  if v_u.status in ('verificada', 'aplicada') and v_u.client_visible and cardinality(v_u.rubros) > 0
     and (v_u.vigente_hasta is null or v_u.vigente_hasta >= v_hoy) then
    for v_co in
      select o.company_id from public.company_onboarding o where o.answers ->> 'actividad' = any (v_u.rubros)
    loop
      perform private.notify(private.company_users(v_co.company_id, array['owner', 'admin']), v_co.company_id, null, 'casos',
        left('Novedad para tu empresa: ' || v_u.title, 200),
        left(v_u.summary || coalesce(' Vigente hasta el ' || to_char(v_u.vigente_hasta, 'DD-MM-YYYY') || '.', ''), 500),
        '/panel#novedades', 'novedad-' || v_u.id || '-' || v_co.company_id);
      v_n := v_n + 1;
    end loop;
  end if;
  return v_n;
end
$$;
revoke execute on function public.review_regulatory_update(uuid, text, text, boolean, text[], text[], date) from public, anon;
grant execute on function public.review_regulatory_update(uuid, text, text, boolean, text[], text[], date) to authenticated;

-- Los agentes de casos ya no reciben novedades vencidas.
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
        'fuente', u.source_url, 'publicado', u.published_on, 'impacto', u.impact, 'vigente_hasta', u.vigente_hasta) as x
      from public.regulatory_updates u
      where u.status in ('verificada', 'aplicada') and u.created_at > now() - interval '1 year'
        and (u.vigente_hasta is null or u.vigente_hasta >= (now() at time zone 'America/Santiago')::date)
        and (cardinality(u.modules) = 0 or c.module = any (u.modules))
      order by u.reviewed_at desc nulls last
      limit 8) n), '[]'::jsonb)
  )
  from public.cases c join public.companies co on co.id = c.company_id
  where c.id = p_case
$$;

-- 3. Aprendizajes sin datos personales
create or replace function private.learning_sin_datos() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_text text := concat_ws(' ', new.problem, new.route, new.outcome, new.worked, new.improve, new.benefits);
begin
  if v_text ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'                        -- correo
     or v_text ~ '(\+?56[ .-]?)?9[ .-]?[0-9]{4}[ .-]?[0-9]{4}'              -- celular chileno
     or v_text ~* '[0-9]{1,2}\.?[0-9]{3}\.?[0-9]{3}-[0-9k]'                 -- RUT o RUN
  then
    raise exception 'ENQ_APRENDIZAJE_IDENTIFICA';
  end if;
  return new;
end
$$;
drop trigger if exists case_learnings_sin_datos on public.case_learnings;
create trigger case_learnings_sin_datos before insert or update of problem, route, outcome, worked, improve, benefits
  on public.case_learnings for each row execute function private.learning_sin_datos();

-- 4. Aviso a la supervisión cuando hay un aprendizaje por revisar
create or replace function private.learning_aviso() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'borrador' and (tg_op = 'INSERT' or old.status is distinct from 'borrador' or old.updated_at < now() - interval '1 hour') then
    perform private.notify(
      array(select u from unnest(private.staff_users(array['enqora_admin', 'ops_director'])) u where u is distinct from new.created_by),
      null, new.case_id, 'equipo', 'Aprendizaje por revisar',
      'Un caso resuelto dejó una lección. Revísala (cuatro ojos) para que los agentes la usen en los próximos casos.',
      '/mando/aprendizajes', 'aprendizaje-' || new.id || '-' || to_char(now(), 'YYYYMMDD'));
  end if;
  return new;
end
$$;
drop trigger if exists case_learnings_aviso on public.case_learnings;
create trigger case_learnings_aviso after insert or update on public.case_learnings
  for each row execute function private.learning_aviso();

-- 5. Última ejecución de la vigilancia (para el equipo)
create or replace function public.vigilancia_ultima() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_session();
  if not private.is_staff() then raise exception 'ENQ_SIN_PERMISO'; end if;
  return (select jsonb_build_object('fecha', creado, 'ok', ok, 'motivo', motivo, 'busquedas', busquedas,
            'fallidas_30d', (select count(*) from private.ai_usage x where x.modulo = 'vigilancia_normativa' and not x.ok and x.creado > now() - interval '30 days'))
          from private.ai_usage where modulo = 'vigilancia_normativa' order by creado desc limit 1);
end
$$;
revoke execute on function private.learning_sin_datos(), private.learning_aviso() from public, anon, authenticated;
revoke execute on function public.vigilancia_ultima() from public;
grant execute on function public.vigilancia_ultima() to authenticated;
