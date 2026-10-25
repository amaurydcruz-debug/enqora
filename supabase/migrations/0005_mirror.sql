-- =====================================================================
-- ENQORA · ENQORA MIRROR · Ventana de Inteligencia
-- Registro real de los pasos de análisis de un caso. La ventana MIRROR
-- solo muestra lo que aquí se registra: nunca simula trabajo inexistente.
-- Hoy los registra el equipo ENQORA; mañana también los agentes IA
-- (cuenta de equipo con rol "Agente IA"), con la misma función.
-- Requiere 0004_nucleo.sql. Ejecutar UNA vez en Supabase → SQL Editor.
-- =====================================================================

create table public.case_analysis_steps (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  agent text not null check (agent in (
    'tributario', 'contable', 'legal', 'financiero', 'investigador', 'estrategico'
  )),
  stage text not null check (stage in (
    'recibiendo', 'organizando', 'normativa', 'cruce', 'alternativas', 'escenarios',
    'diagnostico', 'autorizacion', 'disponible'
  )),
  title text not null check (char_length(title) between 3 and 160),
  detail text check (char_length(detail) <= 2000),
  status text not null default 'trabajando' check (status in ('trabajando', 'completado', 'revision')),
  progress smallint check (progress between 0 and 100), -- solo si el avance es medible
  visibility text not null default 'cliente' check (visibility in ('cliente', 'interno')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index case_analysis_steps_case_idx on public.case_analysis_steps (case_id, created_at);

alter table public.case_analysis_steps enable row level security;
revoke all on public.case_analysis_steps from anon, authenticated;
grant select on public.case_analysis_steps to authenticated;

create policy mfa_requerido on public.case_analysis_steps as restrictive for all to authenticated
  using (private.is_mfa()) with check (private.is_mfa());
create policy pasos_visibles on public.case_analysis_steps for select to authenticated
  using (private.can_see_item(case_id, visibility));

create or replace function public.log_analysis_step(
  p_case uuid, p_agent text, p_stage text, p_title text, p_detail text default null,
  p_status text default 'trabajando', p_progress int default null, p_visibility text default 'cliente'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_id uuid;
begin
  if not private.can_work_case(p_case) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if exists (select 1 from public.cases where id = p_case and status in ('cerrado', 'cancelado')) then
    raise exception 'ENQ_CASO_CERRADO';
  end if;
  if char_length(trim(coalesce(p_title, ''))) < 3 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;

  insert into public.case_analysis_steps (case_id, agent, stage, title, detail, status, progress, visibility, created_by)
  values (p_case, p_agent, p_stage, trim(p_title), nullif(trim(coalesce(p_detail, '')), ''),
          coalesce(p_status, 'trabajando'), p_progress, coalesce(p_visibility, 'cliente'), v_uid)
  returning id into v_id;

  update public.cases set updated_at = now() where id = p_case;
  return v_id;
end
$$;

create or replace function public.update_analysis_step(
  p_step uuid, p_status text, p_progress int default null, p_detail text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_case uuid;
begin
  perform private.require_session();
  select case_id into v_case from public.case_analysis_steps where id = p_step;
  if v_case is null or not private.can_work_case(v_case) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_status not in ('trabajando', 'completado', 'revision') then raise exception 'ENQ_DATOS_INVALIDOS'; end if;

  update public.case_analysis_steps set
    status = p_status,
    progress = case when p_status = 'completado' and progress is not null then 100 else coalesce(p_progress, progress) end,
    detail = coalesce(nullif(trim(coalesce(p_detail, '')), ''), detail),
    updated_at = now()
  where id = p_step;
  update public.cases set updated_at = now() where id = v_case;
end
$$;

revoke execute on function
  public.log_analysis_step(uuid, text, text, text, text, text, int, text),
  public.update_analysis_step(uuid, text, int, text)
from public, anon;
grant execute on function
  public.log_analysis_step(uuid, text, text, text, text, text, int, text),
  public.update_analysis_step(uuid, text, int, text)
to authenticated;
