-- =====================================================================
-- ENQORA · 0014 · Agentes IA reales y módulos de servicio (M13)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0002…0013.
--
-- Principios (ver docs/ENQORA-AGENTES.md):
--  · Un agente IA lo ejecuta una persona del equipo sobre un caso. Trabaja con los antecedentes
--    reales del caso y entrega PROPUESTAS (pasos, situaciones de diagnóstico, tareas, preguntas al
--    cliente). Nada llega al cliente sin que una persona lo acepte.
--  · MIRROR muestra el trabajo real del agente (paso «trabajando» mientras corre).
--  · Cada ejecución queda auditada: quién la pidió, modelo, tokens y resultado.
--  · Módulos: preguntas iniciales propias del servicio guardadas en el caso.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Preguntas iniciales del módulo (intake)
-- ---------------------------------------------------------------------

alter table public.cases add column if not exists intake jsonb not null default '{}'::jsonb;

-- Quien creó la solicitud (o el equipo) guarda las respuestas iniciales del módulo.
create or replace function public.set_case_intake(p_case uuid, p_intake jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_case public.cases;
  v_key text;
  v_val jsonb;
begin
  select * into v_case from public.cases where id = p_case for update;
  if not found or not (v_case.created_by = v_uid or private.can_work_case(p_case)) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_case.status in ('cerrado', 'cancelado') then raise exception 'ENQ_CASO_CERRADO'; end if;
  if p_intake is null or jsonb_typeof(p_intake) <> 'object' or (select count(*) from jsonb_object_keys(p_intake)) > 20
     or pg_column_size(p_intake) > 12000 then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  for v_key, v_val in select * from jsonb_each(p_intake) loop
    if v_key !~ '^[a-z_]{2,40}$' or jsonb_typeof(v_val) <> 'string' or char_length(v_val #>> '{}') > 1000 then
      raise exception 'ENQ_DATOS_INVALIDOS';
    end if;
  end loop;
  update public.cases set intake = p_intake, updated_at = now() where id = p_case;
end
$$;

-- ---------------------------------------------------------------------
-- 2. Ejecuciones de agentes y sus propuestas
-- ---------------------------------------------------------------------

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  agent text not null check (agent in ('tributario', 'contable', 'legal', 'financiero', 'investigador', 'estrategico')),
  instruction text check (char_length(instruction) <= 1000),
  status text not null default 'en_curso' check (status in ('en_curso', 'completada', 'fallida')),
  step_id uuid references public.case_analysis_steps (id) on delete set null,
  model text check (char_length(model) <= 80),
  input_tokens integer,
  output_tokens integer,
  web_searches integer,
  summary text check (char_length(summary) <= 4000),
  error text check (char_length(error) <= 500),
  requested_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index agent_runs_case_idx on public.agent_runs (case_id, created_at desc);

create table public.agent_proposals (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs (id) on delete cascade,
  case_id uuid not null references public.cases (id) on delete cascade,
  position smallint not null default 1,
  kind text not null check (kind in ('paso', 'hallazgo', 'tarea', 'pregunta')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 16000),
  status text not null default 'pendiente' check (status in ('pendiente', 'aceptada', 'descartada')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index agent_proposals_run_idx on public.agent_proposals (run_id, position);

alter table public.agent_runs enable row level security;
alter table public.agent_proposals enable row level security;
revoke all on public.agent_runs, public.agent_proposals from anon, authenticated;
grant select on public.agent_runs, public.agent_proposals to authenticated;
create policy mfa_requerido on public.agent_runs as restrictive for all to authenticated using (private.is_mfa()) with check (private.is_mfa());
create policy mfa_requerido on public.agent_proposals as restrictive for all to authenticated using (private.is_mfa()) with check (private.is_mfa());
-- Solo el equipo que trabaja el caso ve las ejecuciones y propuestas (el cliente ve lo aceptado).
create policy ejecuciones_visibles on public.agent_runs for select to authenticated using (private.can_work_case(case_id));
create policy propuestas_agente_visibles on public.agent_proposals for select to authenticated using (private.can_work_case(case_id));

-- Contexto del caso para el agente: solo lo necesario, nunca claves ni contenido de archivos.
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
      from public.quotes q where q.case_id = c.id), '[]'::jsonb)
  )
  from public.cases c join public.companies co on co.id = c.company_id
  where c.id = p_case
$$;

-- Inicia una ejecución: la pide una persona del equipo del caso. Devuelve el contexto para el agente.
create or replace function public.start_agent_run(p_case uuid, p_agent text, p_instruction text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_case public.cases;
  v_run uuid;
  v_step uuid;
  v_stage text;
begin
  select * into v_case from public.cases where id = p_case;
  if not found or not private.can_work_case(p_case) or private.is_staff(array['ai_agent']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_case.status in ('cerrado', 'cancelado') then raise exception 'ENQ_CASO_CERRADO'; end if;
  if p_agent not in ('tributario', 'contable', 'legal', 'financiero', 'investigador', 'estrategico')
     or char_length(coalesce(p_instruction, '')) > 1000 then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  if (select count(*) from public.agent_runs where case_id = p_case and created_at > now() - interval '1 day') >= 20 then
    raise exception 'ENQ_DEMASIADAS_CONSULTAS';
  end if;
  if exists (select 1 from public.agent_runs where case_id = p_case and agent = p_agent and status = 'en_curso'
             and created_at > now() - interval '3 minutes') then
    raise exception 'ENQ_AGENTE_OCUPADO';
  end if;
  -- Ejecuciones colgadas (más de 3 minutos) se cierran como fallidas.
  update public.agent_runs set status = 'fallida', error = 'Sin respuesta', finished_at = now()
  where case_id = p_case and status = 'en_curso' and created_at <= now() - interval '3 minutes';

  v_stage := case p_agent when 'tributario' then 'normativa' when 'legal' then 'normativa' when 'investigador' then 'normativa'
                          when 'contable' then 'cruce' when 'financiero' then 'escenarios' else 'alternativas' end;
  insert into public.case_analysis_steps (case_id, agent, stage, title, detail, status, visibility, created_by)
  values (p_case, p_agent, v_stage, 'Analizando los antecedentes del caso', null, 'trabajando', 'cliente', v_uid)
  returning id into v_step;
  insert into public.agent_runs (case_id, agent, instruction, step_id, requested_by)
  values (p_case, p_agent, nullif(trim(coalesce(p_instruction, '')), ''), v_step, v_uid)
  returning id into v_run;
  update public.cases set updated_at = now() where id = p_case;
  return jsonb_build_object('run', v_run, 'context', private.agent_context(p_case));
end
$$;

-- Termina la ejecución y guarda las propuestas (máx. 30). Solo quien la pidió.
-- p_proposals: [{kind, payload}]
create or replace function public.finish_agent_run(
  p_run uuid, p_ok boolean, p_summary text, p_proposals jsonb, p_model text default null,
  p_input_tokens integer default null, p_output_tokens integer default null, p_web_searches integer default null,
  p_error text default null
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_r public.agent_runs;
  p jsonb;
  v_n integer := 0;
begin
  select * into v_r from public.agent_runs where id = p_run for update;
  if not found or v_r.requested_by is distinct from v_uid then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_r.status <> 'en_curso' then raise exception 'ENQ_YA_DECIDIDA'; end if;

  if p_ok and p_proposals is not null and jsonb_typeof(p_proposals) = 'array' then
    for p in select * from jsonb_array_elements(p_proposals) limit 30 loop
      begin
        insert into public.agent_proposals (run_id, case_id, position, kind, payload)
        values (p_run, v_r.case_id, v_n + 1, p ->> 'kind', p -> 'payload');
        v_n := v_n + 1;
      exception when check_violation or not_null_violation then
        null;   -- propuesta mal formada: se omite
      end;
    end loop;
  end if;

  update public.agent_runs set status = case when p_ok then 'completada' else 'fallida' end, finished_at = now(),
    summary = left(nullif(trim(coalesce(p_summary, '')), ''), 4000), model = left(p_model, 80),
    input_tokens = p_input_tokens, output_tokens = p_output_tokens, web_searches = p_web_searches, error = left(p_error, 500)
  where id = p_run;

  if p_ok then
    update public.case_analysis_steps set status = 'revision', updated_at = now(),
      detail = case when v_n = 0 then 'Sin propuestas nuevas.' else v_n || ' propuesta' || case when v_n = 1 then '' else 's' end
                    || ' en revisión del equipo ENQORA.' end
    where id = v_r.step_id;
  else
    delete from public.case_analysis_steps where id = v_r.step_id;   -- no hubo trabajo que mostrar
  end if;
  update public.cases set updated_at = now() where id = v_r.case_id;
  return v_n;
end
$$;

-- Aceptar o descartar una propuesta (una persona del equipo, nunca un agente IA).
-- Aceptar aplica la propuesta con las mismas funciones que usaría una persona.
create or replace function public.decide_agent_proposal(p_proposal uuid, p_decision text, p_visibility text default 'cliente')
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_p public.agent_proposals;
  v_r public.agent_runs;
  v_diag uuid;
  v_vis text := case when p_visibility = 'interno' then 'interno' else 'cliente' end;
  v_stage text;
begin
  select * into v_p from public.agent_proposals where id = p_proposal for update;
  if not found or not private.can_work_case(v_p.case_id) or private.is_staff(array['ai_agent']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_p.status <> 'pendiente' then raise exception 'ENQ_YA_DECIDIDA'; end if;
  select * into v_r from public.agent_runs where id = v_p.run_id;

  if p_decision = 'aceptar' then
    if v_p.kind = 'paso' then
      v_stage := coalesce(nullif(v_p.payload ->> 'etapa', ''), 'normativa');
      if v_stage not in ('recibiendo', 'organizando', 'normativa', 'cruce', 'alternativas', 'escenarios', 'diagnostico') then
        v_stage := 'normativa';
      end if;
      perform public.log_analysis_step(v_p.case_id, v_r.agent, v_stage, left(v_p.payload ->> 'titulo', 160),
        left(v_p.payload ->> 'detalle', 2000), 'completado', null, v_vis);
    elsif v_p.kind = 'hallazgo' then
      v_diag := public.draft_diagnosis(v_p.case_id);
      perform public.save_finding(v_diag, null, jsonb_build_object(
        'title', left(v_p.payload ->> 'titulo', 160), 'situation', v_p.payload ->> 'situacion',
        'obligations', v_p.payload ->> 'normativa', 'sources', coalesce(v_p.payload -> 'fuentes', '[]'::jsonb),
        'causes', v_p.payload ->> 'causas', 'corrections', v_p.payload ->> 'correcciones',
        'benefits', v_p.payload ->> 'beneficios',
        'risk_level', case when v_p.payload ->> 'nivel_riesgo' in ('bajo', 'medio', 'alto') then v_p.payload ->> 'nivel_riesgo' else 'medio' end,
        'risk', v_p.payload ->> 'riesgo',
        'certainty', case when v_p.payload ->> 'certeza' in ('alta', 'media', 'baja') then v_p.payload ->> 'certeza' else 'baja' end,
        'missing', v_p.payload ->> 'falta'));
    elsif v_p.kind = 'tarea' then
      perform public.create_task(v_p.case_id, left(v_p.payload ->> 'titulo', 200), null, null,
        case when v_p.payload ->> 'para' = 'cliente' then 'cliente' else 'interno' end);
    elsif v_p.kind = 'pregunta' then
      perform public.add_case_comment(v_p.case_id, left(v_p.payload ->> 'texto', 4000), false);
    end if;
    update public.agent_proposals set status = 'aceptada', decided_by = v_uid, decided_at = now() where id = p_proposal;
  elsif p_decision = 'descartar' then
    update public.agent_proposals set status = 'descartada', decided_by = v_uid, decided_at = now() where id = p_proposal;
  else
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;

  -- Cuando no quedan propuestas pendientes, el paso del agente queda completado en MIRROR.
  if not exists (select 1 from public.agent_proposals where run_id = v_p.run_id and status = 'pendiente') then
    update public.case_analysis_steps set status = 'completado', updated_at = now(),
      detail = 'Propuestas revisadas por el equipo ENQORA.'
    where id = v_r.step_id and status = 'revision';
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 3. Permisos de ejecución
-- ---------------------------------------------------------------------

revoke execute on function private.agent_context(uuid) from public, anon, authenticated;
revoke execute on function public.set_case_intake(uuid, jsonb), public.start_agent_run(uuid, text, text),
  public.finish_agent_run(uuid, boolean, text, jsonb, text, integer, integer, integer, text),
  public.decide_agent_proposal(uuid, text, text)
from public, anon;
grant execute on function public.set_case_intake(uuid, jsonb), public.start_agent_run(uuid, text, text),
  public.finish_agent_run(uuid, boolean, text, jsonb, text, integer, integer, integer, text),
  public.decide_agent_proposal(uuid, text, text)
to authenticated;

-- ---------------------------------------------------------------------
-- Reversión (solo si fuera necesario):
--   drop table if exists public.agent_proposals, public.agent_runs cascade;
--   drop function if exists public.start_agent_run, public.finish_agent_run, public.decide_agent_proposal,
--     public.set_case_intake, private.agent_context;
--   alter table public.cases drop column if exists intake;
-- ---------------------------------------------------------------------
