-- =====================================================================
-- ENQORA · 0071 · Diagnóstico «Empresa al día» (de 0 a OK)
-- La empresa responde un cuestionario según su tamaño y rubro; ENQORA calcula (sin IA, reglas fijas con fuente
-- oficial) un semáforo por frente —SII, municipalidad, Dirección del Trabajo, previsión, seguridad laboral y
-- entorno— y la lista de pendientes priorizada por riesgo de multa.
-- Trazabilidad: cada diagnóstico es una versión nueva e inmutable (quién lo respondió, cuándo, con qué versión
-- de las reglas). Nunca se sobrescribe ni se borra.
-- Se puede ejecutar más de una vez.
-- =====================================================================

create table if not exists public.diagnosticos_empresa (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  version int not null check (version >= 1),
  reglas text not null check (char_length(reglas) between 4 and 20),
  perfil jsonb not null,
  respuestas jsonb not null,
  resultado jsonb not null,
  puntaje int not null check (puntaje between 0 and 100),
  creado_por uuid references auth.users (id) on delete set null,
  creado timestamptz not null default now(),
  unique (company_id, version)
);
create index if not exists diagnosticos_empresa_idx on public.diagnosticos_empresa (company_id, version desc);
alter table public.diagnosticos_empresa enable row level security;
revoke all on public.diagnosticos_empresa from anon, authenticated;
grant select on public.diagnosticos_empresa to authenticated;
drop policy if exists diagnosticos_empresa_ver on public.diagnosticos_empresa;
create policy diagnosticos_empresa_ver on public.diagnosticos_empresa for select to authenticated
  using (private.is_member(company_id) or private.works_company(company_id));

create or replace function private.diagnostico_inmutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'ENQ_DIAGNOSTICO_INMUTABLE';
end
$$;
drop trigger if exists diagnosticos_empresa_inmutable on public.diagnosticos_empresa;
create trigger diagnosticos_empresa_inmutable before update on public.diagnosticos_empresa
  for each row execute function private.diagnostico_inmutable();

create or replace function public.guardar_diagnostico_empresa(p_company uuid, p_reglas text, p_perfil jsonb, p_respuestas jsonb,
  p_resultado jsonb, p_puntaje int) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_version int;
begin
  if not (private.has_role(p_company, array['owner', 'admin', 'accountant']) or private.works_company(p_company))
     or private.is_staff(array['ai_agent']) then
    raise exception 'ENQ_SIN_PERMISO';
  end if;
  if jsonb_typeof(p_perfil) <> 'object' or jsonb_typeof(p_respuestas) <> 'object' or jsonb_typeof(p_resultado) <> 'object'
     or octet_length(p_resultado::text) > 60000 or octet_length(p_respuestas::text) > 10000 then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  select coalesce(max(version), 0) + 1 into v_version from public.diagnosticos_empresa where company_id = p_company;
  insert into public.diagnosticos_empresa (company_id, version, reglas, perfil, respuestas, resultado, puntaje, creado_por)
  values (p_company, v_version, left(p_reglas, 20), p_perfil, p_respuestas, p_resultado, greatest(0, least(100, p_puntaje)), v_uid);
  perform private.log_event(p_company, 'empresa_al_dia.diagnostico', 'v' || v_version || ' · ' || p_puntaje || '%',
    jsonb_build_object('version', v_version, 'reglas', p_reglas, 'puntaje', p_puntaje));
  return v_version;
exception
  when check_violation then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

revoke execute on function private.diagnostico_inmutable() from public, anon, authenticated;
revoke execute on function public.guardar_diagnostico_empresa(uuid, text, jsonb, jsonb, jsonb, int) from public, anon;
grant execute on function public.guardar_diagnostico_empresa(uuid, text, jsonb, jsonb, jsonb, int) to authenticated;
