-- =====================================================================
-- ENQORA · 0010 · Diagnóstico gratuito y onboarding (M09 / Etapa 7)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0002…0009.
--
-- Principios (ver docs/ENQORA-COMERCIAL.md y docs/ENQORA-DIAGNOSTICO.md):
--  · Onboarding: el cliente responde preguntas por opciones sobre su empresa. Las rutas que
--    se le sugieren salen de reglas explícitas sobre sus respuestas: orientan, no diagnostican.
--  · Diagnóstico gratuito: una primera consulta por empresa. Crea un caso con origen
--    «diagnostico_gratuito» que trabaja el equipo ENQORA.
--  · El informe se arma por situaciones (Situación 01, 02…), cada una con normativa y fuente,
--    causas, correcciones y alternativas, beneficios, riesgo, costo estimado, certeza y lo que
--    falta para confirmarlo.
--  · El cliente solo ve el informe cuando un profesional autorizado lo aprueba (approvals,
--    tipo «diagnostico», cuatro ojos). Un agente IA puede redactarlo y enviarlo, nunca aprobarlo.
--  · Cada nueva versión reemplaza a la anterior; el historial queda completo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Historial y origen del caso
-- ---------------------------------------------------------------------

alter table public.case_events drop constraint if exists case_events_kind_check;
alter table public.case_events add constraint case_events_kind_check check (kind in (
  'creado', 'estado', 'comentario', 'nota_interna', 'documento', 'asignacion', 'tarea', 'prioridad',
  'aprobacion', 'autorizacion', 'cotizacion', 'diagnostico'
));

alter table public.cases add column if not exists origin text not null default 'solicitud'
  check (origin in ('solicitud', 'diagnostico_gratuito'));
create index if not exists cases_origin_idx on public.cases (company_id) where origin = 'diagnostico_gratuito';

-- ---------------------------------------------------------------------
-- 2. Tablas
-- ---------------------------------------------------------------------

-- Respuestas del onboarding (una fila por empresa; se puede actualizar).
create table public.company_onboarding (
  company_id uuid primary key references public.companies (id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  completed boolean not null default false,
  revision integer not null default 1,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Informe de diagnóstico, versionado por caso.
create table public.diagnoses (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  version integer not null check (version >= 1),
  status text not null default 'borrador' check (status in ('borrador', 'en_revision', 'publicado', 'reemplazado')),
  summary text check (char_length(summary) <= 4000),
  certainty text check (certainty in ('alta', 'media', 'baja')),
  missing text check (char_length(missing) <= 2000),
  approval_id uuid references public.approvals (id) on delete set null,
  review_note text check (char_length(review_note) <= 4000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  published_at timestamptz,
  published_by uuid references auth.users (id) on delete set null,
  unique (case_id, version)
);
create unique index diagnoses_one_open on public.diagnoses (case_id) where status in ('borrador', 'en_revision');
create unique index diagnoses_one_published on public.diagnoses (case_id) where status = 'publicado';

-- Situaciones del informe.
create table public.diagnosis_findings (
  id uuid primary key default gen_random_uuid(),
  diagnosis_id uuid not null references public.diagnoses (id) on delete cascade,
  position smallint not null default 1 check (position between 1 and 30),
  title text not null check (char_length(title) between 3 and 160),
  situation text not null check (char_length(situation) between 10 and 4000),   -- qué está ocurriendo
  obligations text check (char_length(obligations) <= 4000),                     -- qué exige la normativa
  sources jsonb not null default '[]'::jsonb,                                    -- [{titulo, articulo, vigencia, url}]
  causes text check (char_length(causes) <= 2000),                               -- posibles causas
  corrections text check (char_length(corrections) <= 4000),                     -- correcciones y alternativas por verificar
  benefits text check (char_length(benefits) <= 2000),                           -- beneficios que podrían corresponder
  risk_level text not null check (risk_level in ('bajo', 'medio', 'alto')),
  risk text check (char_length(risk) <= 2000),                                   -- riesgo de no actuar, sin exagerar
  service_id uuid references public.services (id) on delete set null,            -- servicio ENQORA que ayudaría
  cost_min bigint check (cost_min >= 0),
  cost_max bigint check (cost_max >= 0),
  cost_note text check (char_length(cost_note) <= 500),
  certainty text not null check (certainty in ('alta', 'media', 'baja')),
  missing text check (char_length(missing) <= 2000),                             -- qué falta para confirmarlo
  quote_requested_at timestamptz,
  quote_requested_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cost_min is null or cost_max is null or cost_max >= cost_min),
  check (jsonb_typeof(sources) = 'array' and jsonb_array_length(sources) <= 10)
);
create index diagnosis_findings_diag_idx on public.diagnosis_findings (diagnosis_id, position);

-- ---------------------------------------------------------------------
-- 3. Funciones de acceso
-- ---------------------------------------------------------------------

-- Equipo que trabaja algún caso de la empresa (o supervisión).
create or replace function private.works_company(p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_supervisor() or (private.is_staff() and exists (
    select 1 from public.case_assignments a join public.cases c on c.id = a.case_id
    where c.company_id = p_company and a.user_id = (select auth.uid())
  ))
$$;

create or replace function private.diagnosis_visible(p_diag uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.diagnoses d
    where d.id = p_diag
      and (private.can_work_case(d.case_id) or (d.status = 'publicado' and private.can_see_case(d.case_id)))
  )
$$;

-- Opciones válidas del onboarding (deben coincidir con lib/onboarding.ts).
create or replace function private.onboarding_options() returns jsonb
language sql immutable set search_path = '' as $$
  select '{
    "etapa": ["idea", "constitucion", "inicio", "operando", "regularizar"],
    "actividad": ["comercio", "servicios", "gastronomia", "produccion", "construccion", "tecnologia", "transporte", "otra"],
    "trabajadores": ["ninguno", "1_5", "6_20", "mas_20"],
    "ventas": ["sin_ventas", "hasta_5m", "5m_25m", "25m_100m", "mas_100m", "prefiero_no"],
    "contabilidad": ["nadie", "yo", "contador", "oficina", "no_se"],
    "documentos": ["facturas", "boletas", "ambos", "ninguno", "no_se"],
    "preocupaciones": ["impuestos_atrasados", "observaciones_sii", "ordenar_contabilidad", "remuneraciones",
                       "elegir_regimen", "constituir", "inicio_actividades", "patente_permisos", "marca",
                       "contratos", "financiamiento", "crecer"],
    "urgencia": ["vence_pronto", "este_mes", "sin_apuro"]
  }'::jsonb
$$;

-- Valida las respuestas. Devuelve true si además están todas las obligatorias.
create or replace function private.onboarding_check(p_answers jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  v_opts jsonb := private.onboarding_options();
  v_key text;
  v_val jsonb;
  v_item jsonb;
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  for v_key, v_val in select * from jsonb_each(p_answers) loop
    if not (v_opts ? v_key) then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
    if v_key = 'preocupaciones' then
      if jsonb_typeof(v_val) <> 'array' or jsonb_array_length(v_val) not between 1 and 4
         or (select count(distinct e) from jsonb_array_elements_text(v_val) e) <> jsonb_array_length(v_val) then
        raise exception 'ENQ_DATOS_INVALIDOS';
      end if;
      for v_item in select * from jsonb_array_elements(v_val) loop
        if jsonb_typeof(v_item) <> 'string' or not ((v_opts -> v_key) @> jsonb_build_array(v_item)) then
          raise exception 'ENQ_DATOS_INVALIDOS';
        end if;
      end loop;
    elsif jsonb_typeof(v_val) <> 'string' or not ((v_opts -> v_key) @> jsonb_build_array(v_val)) then
      raise exception 'ENQ_DATOS_INVALIDOS';
    end if;
  end loop;
  return p_answers ?& array['etapa', 'contabilidad', 'preocupaciones', 'urgencia'];
end
$$;

-- ---------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------

alter table public.company_onboarding enable row level security;
alter table public.diagnoses enable row level security;
alter table public.diagnosis_findings enable row level security;

revoke all on public.company_onboarding, public.diagnoses, public.diagnosis_findings from anon, authenticated;
grant select on public.company_onboarding, public.diagnoses, public.diagnosis_findings to authenticated;

create policy mfa_requerido on public.company_onboarding as restrictive for all to authenticated
  using (private.is_mfa()) with check (private.is_mfa());
create policy mfa_requerido on public.diagnoses as restrictive for all to authenticated
  using (private.is_mfa()) with check (private.is_mfa());
create policy mfa_requerido on public.diagnosis_findings as restrictive for all to authenticated
  using (private.is_mfa()) with check (private.is_mfa());

-- Onboarding: miembros de la empresa y el equipo que trabaja sus casos.
create policy onboarding_visible on public.company_onboarding for select to authenticated
  using (private.is_member(company_id) or private.works_company(company_id));

-- Diagnóstico: el equipo del caso ve todas las versiones; el cliente, solo la publicada.
create policy diagnosticos_visibles on public.diagnoses for select to authenticated
  using (private.can_work_case(case_id) or (status = 'publicado' and private.can_see_case(case_id)));

create policy situaciones_visibles on public.diagnosis_findings for select to authenticated
  using (private.diagnosis_visible(diagnosis_id));

-- ---------------------------------------------------------------------
-- 5. Onboarding y solicitud del diagnóstico gratuito
-- ---------------------------------------------------------------------

create or replace function public.save_onboarding(p_company uuid, p_answers jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_complete boolean;
begin
  if not private.has_role(p_company, array['owner', 'admin', 'accountant']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if pg_column_size(p_answers) > 4000 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  v_complete := private.onboarding_check(p_answers);

  insert into public.company_onboarding (company_id, answers, completed, updated_by)
  values (p_company, p_answers, v_complete, v_uid)
  on conflict (company_id) do update set
    answers = excluded.answers, completed = excluded.completed, updated_by = v_uid,
    revision = public.company_onboarding.revision + 1, updated_at = now();

  perform private.log_event(p_company, 'onboarding.guardado', null, jsonb_build_object('completo', v_complete));
  return v_complete;
end
$$;

-- Primera consulta gratuita: una por empresa (no cuenta una cancelada sin informe publicado).
create or replace function public.start_free_diagnosis(
  p_company uuid, p_module text, p_title text, p_description text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_existing uuid;
  v_id uuid;
begin
  perform private.require_session();
  if not private.has_role(p_company, array['owner', 'admin', 'accountant']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if not exists (select 1 from public.company_onboarding o where o.company_id = p_company and o.completed) then
    raise exception 'ENQ_FALTA_ONBOARDING';
  end if;

  perform 1 from public.companies where id = p_company for update;  -- evita dos solicitudes simultáneas
  select c.id into v_existing from public.cases c
  where c.company_id = p_company and c.origin = 'diagnostico_gratuito'
    and (c.status <> 'cancelado'
         or exists (select 1 from public.diagnoses d where d.case_id = c.id and d.status in ('publicado', 'reemplazado')))
  limit 1;
  if v_existing is not null then raise exception 'ENQ_DIAGNOSTICO_YA_USADO'; end if;

  v_id := public.create_case(p_company, p_module, p_title, p_description);
  update public.cases set origin = 'diagnostico_gratuito' where id = v_id;
  perform private.log_case(v_id, 'diagnostico', 'Diagnóstico gratuito solicitado', 'cliente',
    jsonb_build_object('accion', 'solicitado'));
  perform private.log_event(p_company, 'diagnostico.solicitado', null, jsonb_build_object('caso', v_id));
  return v_id;
end
$$;

-- ---------------------------------------------------------------------
-- 6. Informe: redacción por el equipo ENQORA
-- ---------------------------------------------------------------------

-- Abre un borrador (o devuelve el abierto). Una nueva versión copia las situaciones de la publicada.
create or replace function public.draft_diagnosis(p_case uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_case public.cases;
  v_open uuid;
  v_pub uuid;
  v_id uuid;
  v_version integer;
begin
  select * into v_case from public.cases where id = p_case for update;
  if not found or not private.can_work_case(p_case) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_case.status in ('cerrado', 'cancelado') then raise exception 'ENQ_CASO_CERRADO'; end if;

  select id into v_open from public.diagnoses where case_id = p_case and status in ('borrador', 'en_revision');
  if v_open is not null then return v_open; end if;

  select coalesce(max(version), 0) + 1 into v_version from public.diagnoses where case_id = p_case;
  select id into v_pub from public.diagnoses where case_id = p_case and status = 'publicado';

  insert into public.diagnoses (case_id, version, summary, certainty, missing, created_by)
  select p_case, v_version, d.summary, d.certainty, d.missing, v_uid from public.diagnoses d where d.id = v_pub
  union all
  select p_case, v_version, null, null, null, v_uid where v_pub is null
  returning id into v_id;

  if v_pub is not null then
    insert into public.diagnosis_findings (diagnosis_id, position, title, situation, obligations, sources, causes,
      corrections, benefits, risk_level, risk, service_id, cost_min, cost_max, cost_note, certainty, missing)
    select v_id, position, title, situation, obligations, sources, causes, corrections, benefits, risk_level, risk,
      service_id, cost_min, cost_max, cost_note, certainty, missing
    from public.diagnosis_findings where diagnosis_id = v_pub;
  end if;

  if v_case.status in ('recibido', 'en_investigacion') then
    update public.cases set status = 'diagnostico', updated_at = now() where id = p_case;
    perform private.log_case(p_case, 'estado', null, 'cliente', jsonb_build_object('de', v_case.status, 'a', 'diagnostico'));
  end if;
  perform private.log_case(p_case, 'diagnostico', 'Borrador del diagnóstico v' || v_version, 'interno',
    jsonb_build_object('accion', 'borrador', 'diagnostico', v_id, 'version', v_version));
  return v_id;
end
$$;

-- Diagnóstico editable por el usuario actual (borrador de un caso que trabaja).
create or replace function private.editable_diagnosis(p_diag uuid) returns public.diagnoses
language plpgsql security definer set search_path = '' as $$
declare
  v_d public.diagnoses;
begin
  select * into v_d from public.diagnoses where id = p_diag for update;
  if not found or not private.can_work_case(v_d.case_id) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_d.status <> 'borrador' then raise exception 'ENQ_DIAGNOSTICO_NO_EDITABLE'; end if;
  if exists (select 1 from public.cases c where c.id = v_d.case_id and c.status in ('cerrado', 'cancelado')) then
    raise exception 'ENQ_CASO_CERRADO';
  end if;
  return v_d;
end
$$;

create or replace function public.save_diagnosis(p_diag uuid, p_summary text, p_certainty text, p_missing text default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_session();
  perform private.editable_diagnosis(p_diag);
  if char_length(coalesce(p_summary, '')) > 4000 or char_length(coalesce(p_missing, '')) > 2000
     or (p_certainty is not null and p_certainty not in ('alta', 'media', 'baja')) then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  update public.diagnoses set summary = nullif(trim(coalesce(p_summary, '')), ''), certainty = p_certainty,
    missing = nullif(trim(coalesce(p_missing, '')), ''), updated_at = now()
  where id = p_diag;
end
$$;

-- Crea o actualiza una situación. p_data: title, situation, obligations, sources[], causes, corrections,
-- benefits, risk_level, risk, service_id, cost_min, cost_max, cost_note, certainty, missing, position.
create or replace function public.save_finding(p_diag uuid, p_finding uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := p_finding;
  v_sources jsonb := coalesce(p_data -> 'sources', '[]'::jsonb);
  v_src jsonb;
  v_service uuid;
  v_pos smallint;
  t text;
begin
  perform private.require_session();
  perform private.editable_diagnosis(p_diag);
  if p_data is null or jsonb_typeof(p_data) <> 'object' or jsonb_typeof(v_sources) <> 'array'
     or jsonb_array_length(v_sources) > 10 then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  for v_src in select * from jsonb_array_elements(v_sources) loop
    if jsonb_typeof(v_src) <> 'object'
       or char_length(trim(coalesce(v_src ->> 'titulo', ''))) not between 3 and 200
       or char_length(coalesce(v_src ->> 'articulo', '')) > 120
       or char_length(coalesce(v_src ->> 'vigencia', '')) > 80
       or (coalesce(v_src ->> 'url', '') <> ''
           and ((v_src ->> 'url') !~ '^https://[^\s]+\.[^\s]+$' or char_length(v_src ->> 'url') > 400)) then
      raise exception 'ENQ_FUENTE_INVALIDA';
    end if;
  end loop;

  t := nullif(p_data ->> 'service_id', '');
  if t is not null then
    if t !~ '^[0-9a-f-]{36}$' then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
    select id into v_service from public.services where id = t::uuid;
    if v_service is null then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  end if;

  v_pos := coalesce(nullif(p_data ->> 'position', '')::smallint,
                    (select coalesce(max(position), 0) + 1 from public.diagnosis_findings where diagnosis_id = p_diag)::smallint);

  if v_id is null then
    insert into public.diagnosis_findings (diagnosis_id, position, title, situation, obligations, sources, causes,
      corrections, benefits, risk_level, risk, service_id, cost_min, cost_max, cost_note, certainty, missing)
    values (p_diag, v_pos, trim(coalesce(p_data ->> 'title', '')), trim(coalesce(p_data ->> 'situation', '')),
      nullif(trim(coalesce(p_data ->> 'obligations', '')), ''), v_sources,
      nullif(trim(coalesce(p_data ->> 'causes', '')), ''), nullif(trim(coalesce(p_data ->> 'corrections', '')), ''),
      nullif(trim(coalesce(p_data ->> 'benefits', '')), ''), p_data ->> 'risk_level',
      nullif(trim(coalesce(p_data ->> 'risk', '')), ''), v_service,
      nullif(p_data ->> 'cost_min', '')::bigint, nullif(p_data ->> 'cost_max', '')::bigint,
      nullif(trim(coalesce(p_data ->> 'cost_note', '')), ''), p_data ->> 'certainty',
      nullif(trim(coalesce(p_data ->> 'missing', '')), ''))
    returning id into v_id;
  else
    update public.diagnosis_findings set
      position = v_pos, title = trim(coalesce(p_data ->> 'title', '')), situation = trim(coalesce(p_data ->> 'situation', '')),
      obligations = nullif(trim(coalesce(p_data ->> 'obligations', '')), ''), sources = v_sources,
      causes = nullif(trim(coalesce(p_data ->> 'causes', '')), ''), corrections = nullif(trim(coalesce(p_data ->> 'corrections', '')), ''),
      benefits = nullif(trim(coalesce(p_data ->> 'benefits', '')), ''), risk_level = p_data ->> 'risk_level',
      risk = nullif(trim(coalesce(p_data ->> 'risk', '')), ''), service_id = v_service,
      cost_min = nullif(p_data ->> 'cost_min', '')::bigint, cost_max = nullif(p_data ->> 'cost_max', '')::bigint,
      cost_note = nullif(trim(coalesce(p_data ->> 'cost_note', '')), ''), certainty = p_data ->> 'certainty',
      missing = nullif(trim(coalesce(p_data ->> 'missing', '')), ''), updated_at = now()
    where id = v_id and diagnosis_id = p_diag;
    if not found then raise exception 'ENQ_SIN_PERMISO'; end if;
  end if;
  update public.diagnoses set updated_at = now() where id = p_diag;
  return v_id;
exception
  when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range then
    raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

create or replace function public.delete_finding(p_finding uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_diag uuid;
begin
  perform private.require_session();
  select diagnosis_id into v_diag from public.diagnosis_findings where id = p_finding;
  if v_diag is null then raise exception 'ENQ_SIN_PERMISO'; end if;
  perform private.editable_diagnosis(v_diag);
  delete from public.diagnosis_findings where id = p_finding;
end
$$;

-- Envía el borrador a revisión profesional (aprobación interna de tipo «diagnostico»).
create or replace function public.submit_diagnosis(p_diag uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_d public.diagnoses;
  v_case public.cases;
  v_count integer;
  v_approval uuid;
begin
  v_d := private.editable_diagnosis(p_diag);
  select count(*) into v_count from public.diagnosis_findings where diagnosis_id = p_diag;
  if v_count = 0 or v_d.summary is null or v_d.certainty is null then raise exception 'ENQ_DIAGNOSTICO_INCOMPLETO'; end if;
  select * into v_case from public.cases where id = v_d.case_id for update;

  insert into public.approvals (case_id, kind, title, detail, payload, approver_role, on_approve_status, requested_by)
  values (v_d.case_id, 'diagnostico', 'Diagnóstico v' || v_d.version || ' · ' || v_case.title,
          'Revisión profesional del informe antes de entregarlo al cliente.',
          jsonb_build_object('diagnostico', p_diag, 'version', v_d.version, 'situaciones', v_count),
          case when v_case.responsible_id is null then 'supervisor' else 'responsable' end,
          'esperando_cliente', v_uid)
  returning id into v_approval;

  update public.diagnoses set status = 'en_revision', approval_id = v_approval, submitted_at = now(),
    review_note = null, updated_at = now()
  where id = p_diag;

  perform private.log_case(v_d.case_id, 'aprobacion', 'Diagnóstico v' || v_d.version, 'interno',
    jsonb_build_object('accion', 'solicitada', 'aprobacion', v_approval, 'tipo', 'diagnostico', 'titulo', 'Diagnóstico v' || v_d.version));
  if v_case.status <> 'revision_profesional' then
    update public.cases set status = 'revision_profesional', updated_at = now() where id = v_d.case_id;
    perform private.log_case(v_d.case_id, 'estado', null, 'cliente',
      jsonb_build_object('de', v_case.status, 'a', 'revision_profesional'));
  end if;
  return v_approval;
end
$$;

-- Al decidirse la aprobación, el informe se publica o vuelve a borrador con la observación.
create or replace function private.on_diagnosis_decided() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_d public.diagnoses;
begin
  if new.status = old.status or new.kind <> 'diagnostico' then return new; end if;
  select * into v_d from public.diagnoses where approval_id = new.id and status = 'en_revision' for update;
  if not found then return new; end if;

  if new.status = 'aprobada' then
    update public.diagnoses set status = 'reemplazado', updated_at = now()
    where case_id = v_d.case_id and status = 'publicado';
    update public.diagnoses set status = 'publicado', published_at = now(), published_by = new.decided_by, updated_at = now()
    where id = v_d.id;
    perform private.log_case(v_d.case_id, 'diagnostico', 'Diagnóstico v' || v_d.version, 'cliente',
      jsonb_build_object('accion', 'publicado', 'diagnostico', v_d.id, 'version', v_d.version));
    perform private.log_event(private.case_company(v_d.case_id), 'diagnostico.publicado', null,
      jsonb_build_object('caso', v_d.case_id, 'version', v_d.version));
  else
    update public.diagnoses set status = 'borrador', approval_id = null, updated_at = now(),
      review_note = case when new.status = 'anulada' then null else new.decision_note end
    where id = v_d.id;
  end if;
  return new;
end
$$;

drop trigger if exists approvals_diagnosis_flow on public.approvals;
create trigger approvals_diagnosis_flow after update of status on public.approvals
  for each row execute function private.on_diagnosis_decided();

-- ---------------------------------------------------------------------
-- 7. El cliente pide cotizar la solución de una situación
-- ---------------------------------------------------------------------

create or replace function public.request_finding_quote(p_finding uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_f public.diagnosis_findings;
  v_d public.diagnoses;
  v_case public.cases;
begin
  select * into v_f from public.diagnosis_findings where id = p_finding for update;
  if not found then raise exception 'ENQ_SIN_PERMISO'; end if;
  select * into v_d from public.diagnoses where id = v_f.diagnosis_id;
  select * into v_case from public.cases where id = v_d.case_id;
  if v_d.status <> 'publicado' or not private.has_role(v_case.company_id, array['owner', 'admin', 'accountant']) then
    raise exception 'ENQ_SIN_PERMISO';
  end if;
  if v_case.status in ('cerrado', 'cancelado') then raise exception 'ENQ_CASO_CERRADO'; end if;
  if v_f.quote_requested_at is not null then raise exception 'ENQ_YA_SOLICITADA'; end if;

  update public.diagnosis_findings set quote_requested_at = now(), quote_requested_by = v_uid where id = p_finding;
  insert into public.case_tasks (case_id, title, assignee_id, visibility, created_by)
  values (v_case.id, left('Cotizar: ' || v_f.title, 200), v_case.responsible_id, 'interno', v_uid);
  perform private.log_case(v_case.id, 'diagnostico', v_f.title, 'cliente',
    jsonb_build_object('accion', 'cotizacion_solicitada', 'situacion', p_finding, 'titulo', v_f.title));
end
$$;

-- ---------------------------------------------------------------------
-- 8. Permisos de ejecución
-- ---------------------------------------------------------------------

revoke execute on function private.works_company(uuid), private.diagnosis_visible(uuid), private.onboarding_options(),
  private.onboarding_check(jsonb), private.editable_diagnosis(uuid), private.on_diagnosis_decided()
from public, anon;
grant execute on function private.works_company(uuid), private.diagnosis_visible(uuid) to authenticated;

revoke execute on function
  public.save_onboarding(uuid, jsonb), public.start_free_diagnosis(uuid, text, text, text),
  public.draft_diagnosis(uuid), public.save_diagnosis(uuid, text, text, text),
  public.save_finding(uuid, uuid, jsonb), public.delete_finding(uuid), public.submit_diagnosis(uuid),
  public.request_finding_quote(uuid)
from public, anon;

grant execute on function
  public.save_onboarding(uuid, jsonb), public.start_free_diagnosis(uuid, text, text, text),
  public.draft_diagnosis(uuid), public.save_diagnosis(uuid, text, text, text),
  public.save_finding(uuid, uuid, jsonb), public.delete_finding(uuid), public.submit_diagnosis(uuid),
  public.request_finding_quote(uuid)
to authenticated;

-- ---------------------------------------------------------------------
-- Reversión (solo si fuera necesario):
--   drop trigger if exists approvals_diagnosis_flow on public.approvals;
--   drop function if exists public.save_onboarding, public.start_free_diagnosis, public.draft_diagnosis,
--     public.save_diagnosis, public.save_finding, public.delete_finding, public.submit_diagnosis,
--     public.request_finding_quote, private.works_company, private.diagnosis_visible, private.onboarding_options,
--     private.onboarding_check, private.editable_diagnosis, private.on_diagnosis_decided cascade;
--   drop table if exists public.diagnosis_findings, public.diagnoses, public.company_onboarding cascade;
--   alter table public.cases drop column if exists origin;
-- ---------------------------------------------------------------------
