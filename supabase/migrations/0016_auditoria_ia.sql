-- =====================================================================
-- ENQORA · 0016 · Auditoría independiente de los agentes IA (M15)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0002…0015.
--
-- Flujo: agente (Claude) propone → auditor independiente (OpenAI) + verificaciones deterministas
-- revisan → reglas de aprobación de ENQORA deciden:
--   aprobada            → el equipo puede aceptar la propuesta
--   corregir/investigar/
--   falta_dato          → vuelve al agente (máx. 2 rondas de corrección) o se piden datos
--   escalar             → bloqueada: solo la supervisión puede aceptarla, con fundamento escrito
-- El expediente de auditoría conserva propuesta original, observaciones, correcciones, versiones
-- y quién autorizó la entrega.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Columnas y tablas
-- ---------------------------------------------------------------------

alter table public.agent_runs
  add column if not exists parent_run_id uuid references public.agent_runs (id) on delete set null,
  add column if not exists correction_round smallint not null default 0 check (correction_round between 0 and 2),
  add column if not exists audit_status text not null default 'no_aplica'
    check (audit_status in ('no_aplica', 'pendiente', 'auditando', 'auditada', 'fallida')),
  add column if not exists audit_decision text
    check (audit_decision in ('aprobar', 'corregir', 'investigar', 'falta_dato', 'escalar'));
create index if not exists agent_runs_parent_idx on public.agent_runs (parent_run_id) where parent_run_id is not null;

alter table public.agent_proposals drop constraint if exists agent_proposals_status_check;
alter table public.agent_proposals add constraint agent_proposals_status_check
  check (status in ('pendiente', 'aceptada', 'descartada', 'reemplazada'));
alter table public.agent_proposals
  add column if not exists audit_verdict text check (audit_verdict in ('aprobada', 'corregir', 'investigar', 'falta_dato', 'escalar')),
  add column if not exists audit_severity text check (audit_severity in ('ninguna', 'baja', 'media', 'alta', 'critica')),
  add column if not exists audit_notes jsonb not null default '[]'::jsonb check (jsonb_typeof(audit_notes) = 'array'),
  add column if not exists override_by uuid references auth.users (id) on delete set null,
  add column if not exists override_note text check (char_length(override_note) <= 1000);
create index if not exists agent_proposals_override_by_idx on public.agent_proposals (override_by) where override_by is not null;

create table if not exists public.agent_audits (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs (id) on delete cascade,
  case_id uuid not null references public.cases (id) on delete cascade,
  status text not null check (status in ('completada', 'fallida')),
  decision text check (decision in ('aprobar', 'corregir', 'investigar', 'falta_dato', 'escalar')),
  summary text check (char_length(summary) <= 4000),
  observations jsonb not null default '[]'::jsonb check (jsonb_typeof(observations) = 'array' and pg_column_size(observations) <= 64000),
  checks jsonb not null default '[]'::jsonb check (jsonb_typeof(checks) = 'array' and pg_column_size(checks) <= 32000),
  auditor text check (char_length(auditor) <= 80),
  input_tokens integer,
  output_tokens integer,
  web_searches integer,
  error text check (char_length(error) <= 500),
  requested_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists agent_audits_run_idx on public.agent_audits (run_id, created_at desc);
create index if not exists agent_audits_case_idx on public.agent_audits (case_id);
create index if not exists agent_audits_requested_by_idx on public.agent_audits (requested_by);

alter table public.agent_audits enable row level security;
revoke all on public.agent_audits from anon, authenticated;
grant select on public.agent_audits to authenticated;
drop policy if exists mfa_requerido on public.agent_audits;
create policy mfa_requerido on public.agent_audits as restrictive for all to authenticated using (private.is_mfa()) with check (private.is_mfa());
drop policy if exists auditorias_visibles on public.agent_audits;
create policy auditorias_visibles on public.agent_audits for select to authenticated using (private.can_work_case(case_id));

-- ---------------------------------------------------------------------
-- 2. Inicio con auditoría y rondas de corrección
-- ---------------------------------------------------------------------

drop function if exists public.start_agent_run(uuid, text, text);
-- p_audit: el servidor indica si hay auditor configurado. p_parent: ejecución que se está corrigiendo.
create or replace function public.start_agent_run(
  p_case uuid, p_agent text, p_instruction text default null, p_audit boolean default false, p_parent uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_case public.cases;
  v_parent public.agent_runs;
  v_run uuid;
  v_step uuid;
  v_stage text;
  v_round smallint := 0;
begin
  select * into v_case from public.cases where id = p_case;
  if not found or not private.can_work_case(p_case) or private.is_staff(array['ai_agent']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_case.status in ('cerrado', 'cancelado') then raise exception 'ENQ_CASO_CERRADO'; end if;
  if p_agent not in ('tributario', 'contable', 'legal', 'financiero', 'investigador', 'estrategico')
     or char_length(coalesce(p_instruction, '')) > 1000 then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  if p_parent is not null then
    select * into v_parent from public.agent_runs where id = p_parent;
    if not found or v_parent.case_id <> p_case or v_parent.agent <> p_agent then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
    if v_parent.audit_status <> 'auditada' or v_parent.audit_decision not in ('corregir', 'investigar', 'falta_dato') then
      raise exception 'ENQ_SIN_CORRECCION';
    end if;
    if v_parent.correction_round >= 2 then raise exception 'ENQ_LIMITE_CORRECCIONES'; end if;
    v_round := v_parent.correction_round + 1;
  end if;
  if (select count(*) from public.agent_runs where case_id = p_case and created_at > now() - interval '1 day') >= 20 then
    raise exception 'ENQ_DEMASIADAS_CONSULTAS';
  end if;
  if exists (select 1 from public.agent_runs where case_id = p_case and agent = p_agent and status = 'en_curso'
             and created_at > now() - interval '3 minutes') then
    raise exception 'ENQ_AGENTE_OCUPADO';
  end if;
  update public.agent_runs set status = 'fallida', error = 'Sin respuesta', finished_at = now()
  where case_id = p_case and status = 'en_curso' and created_at <= now() - interval '3 minutes';

  v_stage := case p_agent when 'tributario' then 'normativa' when 'legal' then 'normativa' when 'investigador' then 'normativa'
                          when 'contable' then 'cruce' when 'financiero' then 'escenarios' else 'alternativas' end;
  insert into public.case_analysis_steps (case_id, agent, stage, title, detail, status, visibility, created_by)
  values (p_case, p_agent, v_stage,
          case when v_round > 0 then 'Corrigiendo el análisis según la auditoría' else 'Analizando los antecedentes del caso' end,
          null, 'trabajando', 'cliente', v_uid)
  returning id into v_step;
  insert into public.agent_runs (case_id, agent, instruction, step_id, requested_by, parent_run_id, correction_round, audit_status)
  values (p_case, p_agent, nullif(trim(coalesce(p_instruction, '')), ''), v_step, v_uid, p_parent, v_round,
          case when p_audit then 'pendiente' else 'no_aplica' end)
  returning id into v_run;
  update public.cases set updated_at = now() where id = p_case;
  return jsonb_build_object('run', v_run, 'context', private.agent_context(p_case), 'ronda', v_round);
end
$$;

-- Observaciones de la auditoría que el agente debe corregir (texto para su instrucción).
create or replace function public.correction_brief(p_run uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_r public.agent_runs;
  v_text text;
begin
  perform private.require_session();
  select * into v_r from public.agent_runs where id = p_run;
  if not found or not private.can_work_case(v_r.case_id) then raise exception 'ENQ_SIN_PERMISO'; end if;
  select string_agg(format('- [%s] %s: %s', p.kind, coalesce(p.payload ->> 'titulo', p.payload ->> 'texto', 'propuesta'),
           (select string_agg(coalesce(n ->> 'detalle', '') || coalesce(' → ' || nullif(n ->> 'correccion_sugerida', ''), ''), ' | ')
              from jsonb_array_elements(p.audit_notes) n)), E'\n' order by p.position)
    into v_text
  from public.agent_proposals p
  where p.run_id = p_run and p.audit_verdict is not null and p.audit_verdict <> 'aprobada';
  return left(coalesce((select summary from public.agent_audits where run_id = p_run and status = 'completada' order by created_at desc limit 1), '')
              || E'\n' || coalesce(v_text, ''), 6000);
end
$$;

-- ---------------------------------------------------------------------
-- 3. Término de la ejecución (reemplaza la de 0014)
-- ---------------------------------------------------------------------

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
    input_tokens = p_input_tokens, output_tokens = p_output_tokens, web_searches = p_web_searches, error = left(p_error, 500),
    audit_status = case when p_ok and v_n > 0 then audit_status else 'no_aplica' end
  where id = p_run;

  if p_ok then
    update public.case_analysis_steps set status = 'revision', updated_at = now(),
      detail = case when v_n = 0 then 'Sin propuestas nuevas.'
                    when v_r.audit_status = 'pendiente' then v_n || ' propuesta' || case when v_n = 1 then '' else 's' end || ' en auditoría independiente.'
                    else v_n || ' propuesta' || case when v_n = 1 then '' else 's' end || ' en revisión del equipo ENQORA.' end
    where id = v_r.step_id;
    -- Una corrección reemplaza las propuestas pendientes de la versión anterior.
    if v_r.parent_run_id is not null then
      update public.agent_proposals set status = 'reemplazada', decided_by = v_uid, decided_at = now()
      where run_id = v_r.parent_run_id and status = 'pendiente';
      update public.case_analysis_steps s set status = 'completado', updated_at = now(), detail = 'Reemplazado por una versión corregida.'
      from public.agent_runs pr where pr.id = v_r.parent_run_id and s.id = pr.step_id and s.status = 'revision';
    end if;
  else
    delete from public.case_analysis_steps where id = v_r.step_id;   -- no hubo trabajo que mostrar
  end if;
  update public.cases set updated_at = now() where id = v_r.case_id;
  return v_n;
end
$$;

-- ---------------------------------------------------------------------
-- 4. Auditoría
-- ---------------------------------------------------------------------

-- Entrega al servidor lo que debe auditarse y marca la ejecución «auditando».
create or replace function public.audit_input(p_run uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_r public.agent_runs;
begin
  perform private.require_session();
  select * into v_r from public.agent_runs where id = p_run for update;
  if not found or not private.can_work_case(v_r.case_id) or private.is_staff(array['ai_agent']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_r.status <> 'completada' or v_r.audit_status not in ('pendiente', 'fallida', 'auditando') then raise exception 'ENQ_YA_DECIDIDA'; end if;
  if (select count(*) from public.agent_audits where run_id = p_run) >= 3 then raise exception 'ENQ_DEMASIADAS_CONSULTAS'; end if;
  update public.agent_runs set audit_status = 'auditando' where id = p_run;
  return jsonb_build_object(
    'agente', v_r.agent, 'indicacion', v_r.instruction, 'resumen', v_r.summary, 'ronda_correccion', v_r.correction_round,
    'propuestas', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'tipo', p.kind, 'contenido', p.payload) order by p.position)
                            from public.agent_proposals p where p.run_id = p_run and p.status = 'pendiente'), '[]'::jsonb),
    'contexto', private.agent_context(v_r.case_id));
end
$$;

-- Guarda el resultado. p_verdicts: [{id, veredicto, gravedad, observaciones: [...]}]
create or replace function public.save_agent_audit(
  p_run uuid, p_ok boolean, p_decision text, p_summary text, p_verdicts jsonb, p_checks jsonb,
  p_auditor text default null, p_input_tokens integer default null, p_output_tokens integer default null,
  p_web_searches integer default null, p_error text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_r public.agent_runs;
  v jsonb;
  v_detail text;
begin
  select * into v_r from public.agent_runs where id = p_run for update;
  if not found or not private.can_work_case(v_r.case_id) or private.is_staff(array['ai_agent']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_r.audit_status <> 'auditando' then raise exception 'ENQ_YA_DECIDIDA'; end if;
  if p_ok and (p_decision is null or p_decision not in ('aprobar', 'corregir', 'investigar', 'falta_dato', 'escalar')) then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;

  insert into public.agent_audits (run_id, case_id, status, decision, summary, observations, checks, auditor,
    input_tokens, output_tokens, web_searches, error, requested_by)
  values (p_run, v_r.case_id, case when p_ok then 'completada' else 'fallida' end, case when p_ok then p_decision end,
    left(p_summary, 4000), case when jsonb_typeof(p_verdicts) = 'array' then p_verdicts else '[]'::jsonb end,
    case when jsonb_typeof(p_checks) = 'array' then p_checks else '[]'::jsonb end, left(p_auditor, 80),
    p_input_tokens, p_output_tokens, p_web_searches, left(p_error, 500), v_uid);

  if not p_ok then
    update public.agent_runs set audit_status = 'fallida' where id = p_run;
    update public.case_analysis_steps set detail = 'Auditoría pendiente de reintento.', updated_at = now() where id = v_r.step_id;
    return;
  end if;

  for v in select * from jsonb_array_elements(coalesce(p_verdicts, '[]'::jsonb)) loop
    update public.agent_proposals set
      audit_verdict = case when v ->> 'veredicto' in ('aprobada', 'corregir', 'investigar', 'falta_dato', 'escalar') then v ->> 'veredicto' else 'investigar' end,
      audit_severity = case when v ->> 'gravedad' in ('ninguna', 'baja', 'media', 'alta', 'critica') then v ->> 'gravedad' else 'media' end,
      audit_notes = case when jsonb_typeof(v -> 'observaciones') = 'array' then v -> 'observaciones' else '[]'::jsonb end
    where run_id = p_run and status = 'pendiente' and id::text = v ->> 'id';
  end loop;
  -- Propuesta que el auditor no evaluó: no se presume correcta.
  update public.agent_proposals set audit_verdict = 'investigar', audit_severity = 'media',
    audit_notes = '[{"tipo": "reglas", "detalle": "La auditoría no evaluó esta propuesta.", "correccion_sugerida": ""}]'::jsonb
  where run_id = p_run and status = 'pendiente' and audit_verdict is null;

  update public.agent_runs set audit_status = 'auditada', audit_decision = p_decision where id = p_run;

  v_detail := case p_decision
    when 'aprobar' then 'Auditoría independiente sin observaciones importantes. En revisión del equipo ENQORA.'
    when 'escalar' then 'La auditoría pidió revisión de la supervisión antes de continuar.'
    when 'falta_dato' then 'Se necesitan antecedentes adicionales para confirmar el análisis.'
    else 'La auditoría pidió precisiones; el análisis se está ajustando.' end;
  update public.case_analysis_steps set detail = v_detail, updated_at = now() where id = v_r.step_id;

  perform private.log_case(v_r.case_id, 'nota_interna',
    'Auditoría independiente de la propuesta del agente ' || v_r.agent || ': ' || p_decision
      || coalesce('. ' || left(p_summary, 600), ''), 'interno',
    jsonb_build_object('auditoria', p_run, 'decision', p_decision));
  if p_decision = 'escalar' then
    perform private.notify(private.staff_users(array['enqora_admin', 'ops_director']),
      (select company_id from public.cases where id = v_r.case_id), v_r.case_id, 'equipo',
      'Auditoría IA escalada a supervisión', 'Una propuesta de agente requiere tu revisión antes de continuar.',
      '/casos/' || v_r.case_id || '#agentes', 'auditoria-' || p_run);
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 5. Aceptar o descartar con reglas de auditoría (reemplaza la de 0014)
-- ---------------------------------------------------------------------

drop function if exists public.decide_agent_proposal(uuid, text, text);
create or replace function public.decide_agent_proposal(
  p_proposal uuid, p_decision text, p_visibility text default 'cliente', p_override_note text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_p public.agent_proposals;
  v_r public.agent_runs;
  v_diag uuid;
  v_vis text := case when p_visibility = 'interno' then 'interno' else 'cliente' end;
  v_stage text;
  v_blocked boolean;
  v_note text := nullif(trim(coalesce(p_override_note, '')), '');
begin
  select * into v_p from public.agent_proposals where id = p_proposal for update;
  if not found or not private.can_work_case(v_p.case_id) or private.is_staff(array['ai_agent']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_p.status <> 'pendiente' then raise exception 'ENQ_YA_DECIDIDA'; end if;
  select * into v_r from public.agent_runs where id = v_p.run_id;

  if p_decision = 'aceptar' then
    -- Reglas de auditoría: sin auditoría terminada, o con observaciones, solo la supervisión puede
    -- aceptar, y debe dejar escrito el fundamento.
    v_blocked := v_r.audit_status in ('pendiente', 'auditando', 'fallida')
                 or coalesce(v_p.audit_verdict, 'aprobada') <> 'aprobada';
    if v_blocked then
      if not private.is_supervisor() then
        raise exception '%', case when v_r.audit_status in ('pendiente', 'auditando', 'fallida') then 'ENQ_AUDITORIA_PENDIENTE' else 'ENQ_AUDITORIA_OBSERVADA' end;
      end if;
      if char_length(coalesce(v_note, '')) < 10 then raise exception 'ENQ_FALTA_FUNDAMENTO'; end if;
    end if;

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
    update public.agent_proposals set status = 'aceptada', decided_by = v_uid, decided_at = now(),
      override_by = case when v_blocked then v_uid end, override_note = case when v_blocked then left(v_note, 1000) end
    where id = p_proposal;
    if v_blocked then
      perform private.log_case(v_p.case_id, 'nota_interna',
        'La supervisión aceptó una propuesta del agente con observaciones de auditoría. Fundamento: ' || left(v_note, 1000),
        'interno', jsonb_build_object('propuesta', p_proposal));
    end if;
  elsif p_decision = 'descartar' then
    update public.agent_proposals set status = 'descartada', decided_by = v_uid, decided_at = now() where id = p_proposal;
  else
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;

  if not exists (select 1 from public.agent_proposals where run_id = v_p.run_id and status = 'pendiente') then
    update public.case_analysis_steps set status = 'completado', updated_at = now(),
      detail = 'Propuestas revisadas por el equipo ENQORA.'
    where id = v_r.step_id and status = 'revision';
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 6. Estado del sistema: indicadores de auditoría (amplía 0015)
-- ---------------------------------------------------------------------

create or replace function public.audit_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_session();
  if not private.is_staff(array['enqora_admin', 'ops_director']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  return (select jsonb_build_object(
    'auditorias', count(*),
    'aprobadas', count(*) filter (where decision = 'aprobar'),
    'con_observaciones', count(*) filter (where decision in ('corregir', 'investigar', 'falta_dato')),
    'escaladas', count(*) filter (where decision = 'escalar'),
    'fallidas', count(*) filter (where status = 'fallida'),
    'aceptadas_con_excepcion', (select count(*) from public.agent_proposals where override_by is not null and decided_at > now() - interval '30 days'))
  from public.agent_audits where created_at > now() - interval '30 days');
end
$$;

-- ---------------------------------------------------------------------
-- 7. Permisos
-- ---------------------------------------------------------------------

revoke execute on function
  public.start_agent_run(uuid, text, text, boolean, uuid), public.correction_brief(uuid), public.audit_input(uuid),
  public.save_agent_audit(uuid, boolean, text, text, jsonb, jsonb, text, integer, integer, integer, text),
  public.decide_agent_proposal(uuid, text, text, text), public.audit_stats()
from public, anon;
grant execute on function
  public.start_agent_run(uuid, text, text, boolean, uuid), public.correction_brief(uuid), public.audit_input(uuid),
  public.save_agent_audit(uuid, boolean, text, text, jsonb, jsonb, text, integer, integer, integer, text),
  public.decide_agent_proposal(uuid, text, text, text), public.audit_stats()
to authenticated;
