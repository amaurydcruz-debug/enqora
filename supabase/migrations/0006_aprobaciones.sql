-- =====================================================================
-- ENQORA · Etapa 5 · Centro de Mando: aprobaciones y autorizaciones
-- 1. Aprobaciones internas (mecanismo común): diagnóstico, cierre, precio,
--    excepción, actuación. Aprobar / rechazar / devolver con observaciones.
-- 2. Autorizaciones del cliente dentro del caso: explícitas, limitadas a lo
--    descrito, con plazo opcional, con evidencia y revocables.
-- 3. Bandeja de aprobaciones por perfil (approval_inbox).
-- Requiere 0002, 0003 y 0004. Ejecutar UNA vez en Supabase → SQL Editor.
--
-- Reglas:
--   · Los agentes IA pueden SOLICITAR aprobaciones, nunca decidirlas.
--   · Quien solicita no decide (cuatro ojos). Solo la supervisión puede
--     decidir lo que ella misma solicitó, y queda marcado en el historial.
--   · Decidir exige reautenticación reciente (segundo factor < 15 min).
--   · El cliente nunca ve las aprobaciones internas; sí ve sus autorizaciones.
--   · Solo Propietario o Administrador de la empresa autoriza, rechaza o revoca.
--   · Una autorización dentro de ENQORA NO es un mandato legal ni un poder.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Historial: nuevos tipos de evento
-- ---------------------------------------------------------------------

alter table public.case_events drop constraint case_events_kind_check;
alter table public.case_events add constraint case_events_kind_check check (kind in (
  'creado', 'estado', 'comentario', 'nota_interna', 'documento', 'asignacion', 'tarea', 'prioridad',
  'aprobacion', 'autorizacion'
));

-- ---------------------------------------------------------------------
-- 2. Aprobaciones internas
-- ---------------------------------------------------------------------

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  kind text not null check (kind in ('diagnostico', 'cierre', 'precio', 'excepcion', 'actuacion', 'otro')),
  title text not null check (char_length(title) between 3 and 160),
  detail text check (char_length(detail) <= 4000),
  payload jsonb not null default '{}'::jsonb,
  approver_role text not null default 'responsable'
    check (approver_role in ('responsable', 'accountant_pro', 'lawyer_pro', 'supervisor')),
  on_approve_status text check (on_approve_status in (
    'en_investigacion', 'diagnostico', 'esperando_cliente', 'autorizacion_cliente', 'en_ejecucion', 'verificacion'
  )),
  status text not null default 'pendiente' check (status in ('pendiente', 'aprobada', 'rechazada', 'devuelta', 'anulada')),
  requested_by uuid references auth.users (id) on delete set null,
  requested_at timestamptz not null default now(),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 4000),
  self_decided boolean not null default false
);
create index approvals_case_idx on public.approvals (case_id, requested_at desc);
create index approvals_pending_idx on public.approvals (status, requested_at) where status = 'pendiente';

-- ---------------------------------------------------------------------
-- 3. Autorizaciones del cliente
-- ---------------------------------------------------------------------

create table public.client_authorizations (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 160),
  scope text not null check (char_length(scope) between 10 and 2000),
  institution text check (char_length(institution) <= 160),
  valid_until date,
  status text not null default 'pendiente' check (status in ('pendiente', 'autorizada', 'rechazada', 'revocada', 'anulada')),
  requested_by uuid references auth.users (id) on delete set null,
  requested_at timestamptz not null default now(),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 2000),
  evidence jsonb not null default '{}'::jsonb,
  revoked_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz
);
create index client_authorizations_case_idx on public.client_authorizations (case_id, requested_at desc);
create index client_authorizations_company_idx on public.client_authorizations (company_id, status);

-- ---------------------------------------------------------------------
-- 4. Funciones de acceso
-- ---------------------------------------------------------------------

-- ¿Puede el usuario actual decidir esta aprobación? (no comprueba cuatro ojos)
create or replace function private.can_decide_approval(p_approval uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when private.staff_role() is null or private.staff_role() = 'ai_agent' then false
      when private.is_supervisor() then true
      when a.approver_role = 'supervisor' then false
      when a.approver_role = 'responsable' then c.responsible_id = (select auth.uid())
      else private.staff_role() = a.approver_role and private.is_assigned(a.case_id)
    end
    from public.approvals a join public.cases c on c.id = a.case_id
    where a.id = p_approval
  ), false)
$$;

-- Puede solicitar autorizaciones al cliente: equipo con acceso al caso, salvo agentes IA.
create or replace function private.can_request_authorization(p_case uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_work_case(p_case) and coalesce(private.staff_role(), '') <> 'ai_agent'
$$;

-- ---------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------

alter table public.approvals enable row level security;
alter table public.client_authorizations enable row level security;

revoke all on public.approvals, public.client_authorizations from anon, authenticated;
grant select on public.approvals, public.client_authorizations to authenticated;

create policy mfa_requerido on public.approvals as restrictive for all to authenticated
  using (private.is_mfa()) with check (private.is_mfa());
create policy mfa_requerido on public.client_authorizations as restrictive for all to authenticated
  using (private.is_mfa()) with check (private.is_mfa());

-- Aprobaciones: solo el equipo con acceso al caso (el cliente nunca las ve).
create policy aprobaciones_equipo on public.approvals for select to authenticated
  using (private.can_work_case(case_id));

-- Autorizaciones: el cliente (miembros de la empresa) y el equipo con acceso.
create policy autorizaciones_visibles on public.client_authorizations for select to authenticated
  using (private.can_see_case(case_id));

-- ---------------------------------------------------------------------
-- 6. Operaciones: aprobaciones internas
-- ---------------------------------------------------------------------

create or replace function public.request_approval(
  p_case uuid, p_kind text, p_title text, p_detail text default null,
  p_approver_role text default 'responsable', p_on_approve_status text default null,
  p_payload jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_case public.cases;
  v_id uuid;
begin
  select * into v_case from public.cases where id = p_case for update;
  if not found or not private.can_work_case(p_case) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_case.status in ('cerrado', 'cancelado') then raise exception 'ENQ_CASO_CERRADO'; end if;
  if p_kind not in ('diagnostico', 'cierre', 'precio', 'excepcion', 'actuacion', 'otro')
     or coalesce(p_approver_role, '') not in ('responsable', 'accountant_pro', 'lawyer_pro', 'supervisor')
     or char_length(trim(coalesce(p_title, ''))) < 3
     or (p_on_approve_status is not null and p_on_approve_status not in (
       'en_investigacion', 'diagnostico', 'esperando_cliente', 'autorizacion_cliente', 'en_ejecucion', 'verificacion'))
  then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  if p_approver_role = 'responsable' and v_case.responsible_id is null then raise exception 'ENQ_SIN_RESPONSABLE'; end if;

  insert into public.approvals (case_id, kind, title, detail, payload, approver_role, on_approve_status, requested_by)
  values (p_case, p_kind, trim(p_title), nullif(trim(coalesce(p_detail, '')), ''), coalesce(p_payload, '{}'::jsonb),
          p_approver_role, p_on_approve_status, v_uid)
  returning id into v_id;

  perform private.log_case(p_case, 'aprobacion', trim(p_title), 'interno',
    jsonb_build_object('accion', 'solicitada', 'aprobacion', v_id, 'tipo', p_kind));

  -- Un diagnóstico enviado a revisión deja el caso "En revisión profesional".
  if p_kind = 'diagnostico' and v_case.status <> 'revision_profesional' then
    update public.cases set status = 'revision_profesional', updated_at = now() where id = p_case;
    perform private.log_case(p_case, 'estado', null, 'cliente',
      jsonb_build_object('de', v_case.status, 'a', 'revision_profesional'));
  end if;
  return v_id;
end
$$;

-- p_decision: 'aprobar' | 'rechazar' | 'devolver'. Rechazar y devolver exigen observación.
create or replace function public.decide_approval(p_approval uuid, p_decision text, p_note text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
  v_app public.approvals;
  v_case public.cases;
  v_status text;
  v_self boolean;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select * into v_app from public.approvals where id = p_approval for update;
  if not found or not private.can_work_case(v_app.case_id) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_app.status <> 'pendiente' then raise exception 'ENQ_YA_DECIDIDA'; end if;
  if not private.can_decide_approval(p_approval) then raise exception 'ENQ_SIN_PERMISO'; end if;
  v_self := v_app.requested_by = v_uid;
  if v_self and not private.is_supervisor() then raise exception 'ENQ_CUATRO_OJOS'; end if;

  v_status := case p_decision when 'aprobar' then 'aprobada' when 'rechazar' then 'rechazada'
                              when 'devolver' then 'devuelta' else null end;
  if v_status is null then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if v_status <> 'aprobada' and char_length(coalesce(v_note, '')) < 10 then raise exception 'ENQ_FALTA_OBSERVACION'; end if;

  update public.approvals set status = v_status, decided_by = v_uid, decided_at = now(),
    decision_note = v_note, self_decided = v_self
  where id = p_approval;

  perform private.log_case(v_app.case_id, 'aprobacion', v_note, 'interno',
    jsonb_build_object('accion', v_status, 'aprobacion', p_approval, 'tipo', v_app.kind, 'titulo', v_app.title,
                       'misma_persona', v_self));

  -- Efecto sobre el caso
  select * into v_case from public.cases where id = v_app.case_id for update;
  if v_case.status not in ('cerrado', 'cancelado') then
    if v_status = 'aprobada' and v_app.on_approve_status is not null and v_app.on_approve_status <> v_case.status then
      update public.cases set status = v_app.on_approve_status, updated_at = now() where id = v_case.id;
      perform private.log_case(v_case.id, 'estado', null, 'cliente',
        jsonb_build_object('de', v_case.status, 'a', v_app.on_approve_status));
    elsif v_status = 'devuelta' and v_case.status <> 'devuelto' then
      update public.cases set status = 'devuelto', updated_at = now() where id = v_case.id;
      perform private.log_case(v_case.id, 'estado', null, 'cliente',
        jsonb_build_object('de', v_case.status, 'a', 'devuelto'));
    end if;
  end if;
end
$$;

-- Anular una solicitud pendiente: quien la pidió o la supervisión.
create or replace function public.cancel_approval(p_approval uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_app public.approvals;
begin
  select * into v_app from public.approvals where id = p_approval for update;
  if not found or not private.can_work_case(v_app.case_id) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_app.status <> 'pendiente' then raise exception 'ENQ_YA_DECIDIDA'; end if;
  if v_app.requested_by is distinct from v_uid and not private.is_supervisor() then raise exception 'ENQ_SIN_PERMISO'; end if;
  update public.approvals set status = 'anulada', decided_by = v_uid, decided_at = now() where id = p_approval;
  perform private.log_case(v_app.case_id, 'aprobacion', v_app.title, 'interno',
    jsonb_build_object('accion', 'anulada', 'aprobacion', p_approval, 'tipo', v_app.kind));
end
$$;

-- Bandeja: aprobaciones pendientes que el usuario actual puede decidir.
create or replace function public.approval_inbox()
returns table (
  id uuid, case_id uuid, folio text, case_title text, company_id uuid, kind text, title text,
  approver_role text, requested_by uuid, requested_at timestamptz, own_request boolean
)
language sql stable security definer set search_path = '' as $$
  select a.id, a.case_id, c.folio, c.title, c.company_id, a.kind, a.title, a.approver_role,
         a.requested_by, a.requested_at, a.requested_by = (select auth.uid())
  from public.approvals a
  join public.cases c on c.id = a.case_id
  where a.status = 'pendiente'
    and private.is_mfa()
    and private.can_work_case(a.case_id)
    and private.can_decide_approval(a.id)
    and (a.requested_by is distinct from (select auth.uid()) or private.is_supervisor())
  order by a.requested_at
$$;

-- ---------------------------------------------------------------------
-- 7. Operaciones: autorizaciones del cliente
-- ---------------------------------------------------------------------

create or replace function public.request_client_authorization(
  p_case uuid, p_title text, p_scope text, p_institution text default null, p_valid_until date default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_case public.cases;
  v_id uuid;
begin
  select * into v_case from public.cases where id = p_case for update;
  if not found or not private.can_request_authorization(p_case) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_case.status in ('cerrado', 'cancelado') then raise exception 'ENQ_CASO_CERRADO'; end if;
  if char_length(trim(coalesce(p_title, ''))) < 3 or char_length(trim(coalesce(p_scope, ''))) < 10
     or char_length(coalesce(p_institution, '')) > 160
     or (p_valid_until is not null and p_valid_until < (now() at time zone 'America/Santiago')::date) then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;

  insert into public.client_authorizations (case_id, company_id, title, scope, institution, valid_until, requested_by)
  values (p_case, v_case.company_id, trim(p_title), trim(p_scope), nullif(trim(coalesce(p_institution, '')), ''),
          p_valid_until, v_uid)
  returning id into v_id;

  perform private.log_case(p_case, 'autorizacion', trim(p_title), 'cliente',
    jsonb_build_object('accion', 'solicitada', 'autorizacion', v_id));

  if v_case.status <> 'autorizacion_cliente' then
    update public.cases set status = 'autorizacion_cliente', updated_at = now() where id = p_case;
    perform private.log_case(p_case, 'estado', null, 'cliente',
      jsonb_build_object('de', v_case.status, 'a', 'autorizacion_cliente'));
  end if;
  return v_id;
end
$$;

-- p_decision: 'autorizar' | 'rechazar'. Solo Propietario o Administrador de la empresa.
create or replace function public.decide_client_authorization(p_auth uuid, p_decision text, p_note text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
  v_auth public.client_authorizations;
  v_case public.cases;
  v_status text;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select * into v_auth from public.client_authorizations where id = p_auth for update;
  if not found or not private.has_role(v_auth.company_id, array['owner', 'admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_auth.status <> 'pendiente' then raise exception 'ENQ_YA_DECIDIDA'; end if;
  v_status := case p_decision when 'autorizar' then 'autorizada' when 'rechazar' then 'rechazada' else null end;
  if v_status is null or char_length(coalesce(v_note, '')) > 2000 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if v_status = 'autorizada' and v_auth.valid_until is not null
     and v_auth.valid_until < (now() at time zone 'America/Santiago')::date then
    raise exception 'ENQ_AUTORIZACION_VENCIDA';
  end if;

  update public.client_authorizations set
    status = v_status, decided_by = v_uid, decided_at = now(), decision_note = v_note,
    evidence = jsonb_build_object(
      'usuario', v_uid,
      'rol_en_empresa', private.member_role(v_auth.company_id),
      'sesion', private.current_session_id(),
      'segundo_factor', 'reciente',
      'momento', now(),
      'alcance', v_auth.scope,
      'institucion', v_auth.institution,
      'vigencia', v_auth.valid_until)
  where id = p_auth;

  perform private.log_case(v_auth.case_id, 'autorizacion', v_note, 'cliente',
    jsonb_build_object('accion', v_status, 'autorizacion', p_auth, 'titulo', v_auth.title));
  perform private.log_event(v_auth.company_id, 'autorizacion.' || v_status, v_auth.title,
    jsonb_build_object('caso', v_auth.case_id, 'autorizacion', p_auth));

  select * into v_case from public.cases where id = v_auth.case_id for update;
  if v_case.status = 'autorizacion_cliente' then
    if v_status = 'rechazada' then
      update public.cases set status = 'devuelto', updated_at = now() where id = v_case.id;
      perform private.log_case(v_case.id, 'estado', null, 'cliente', jsonb_build_object('de', v_case.status, 'a', 'devuelto'));
    elsif not exists (select 1 from public.client_authorizations where case_id = v_case.id and status = 'pendiente') then
      update public.cases set status = 'en_ejecucion', updated_at = now() where id = v_case.id;
      perform private.log_case(v_case.id, 'estado', null, 'cliente', jsonb_build_object('de', v_case.status, 'a', 'en_ejecucion'));
    end if;
  end if;
end
$$;

-- Revocar una autorización otorgada. Detiene la ejecución del caso.
create or replace function public.revoke_client_authorization(p_auth uuid, p_note text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
  v_auth public.client_authorizations;
  v_case public.cases;
begin
  select * into v_auth from public.client_authorizations where id = p_auth for update;
  if not found or not private.has_role(v_auth.company_id, array['owner', 'admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_auth.status <> 'autorizada' then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if char_length(coalesce(p_note, '')) > 2000 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;

  update public.client_authorizations set status = 'revocada', revoked_by = v_uid, revoked_at = now(),
    decision_note = coalesce(nullif(trim(coalesce(p_note, '')), ''), decision_note)
  where id = p_auth;

  perform private.log_case(v_auth.case_id, 'autorizacion', nullif(trim(coalesce(p_note, '')), ''), 'cliente',
    jsonb_build_object('accion', 'revocada', 'autorizacion', p_auth, 'titulo', v_auth.title));
  perform private.log_event(v_auth.company_id, 'autorizacion.revocada', v_auth.title,
    jsonb_build_object('caso', v_auth.case_id, 'autorizacion', p_auth));

  select * into v_case from public.cases where id = v_auth.case_id for update;
  if v_case.status in ('en_ejecucion', 'verificacion') then
    update public.cases set status = 'devuelto', updated_at = now() where id = v_case.id;
    perform private.log_case(v_case.id, 'estado', null, 'cliente', jsonb_build_object('de', v_case.status, 'a', 'devuelto'));
  end if;
end
$$;

-- Anular una solicitud de autorización aún pendiente (equipo).
create or replace function public.cancel_client_authorization(p_auth uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_auth public.client_authorizations;
begin
  select * into v_auth from public.client_authorizations where id = p_auth for update;
  if not found or not private.can_request_authorization(v_auth.case_id) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_auth.status <> 'pendiente' then raise exception 'ENQ_YA_DECIDIDA'; end if;
  update public.client_authorizations set status = 'anulada', decided_by = v_uid, decided_at = now() where id = p_auth;
  perform private.log_case(v_auth.case_id, 'autorizacion', v_auth.title, 'cliente',
    jsonb_build_object('accion', 'anulada', 'autorizacion', p_auth));
end
$$;

-- ---------------------------------------------------------------------
-- 8. Permisos de ejecución
-- ---------------------------------------------------------------------

revoke execute on function private.can_decide_approval(uuid), private.can_request_authorization(uuid) from public, anon;
grant execute on function private.can_decide_approval(uuid), private.can_request_authorization(uuid) to authenticated;

revoke execute on function
  public.request_approval(uuid, text, text, text, text, text, jsonb),
  public.decide_approval(uuid, text, text),
  public.cancel_approval(uuid),
  public.approval_inbox(),
  public.request_client_authorization(uuid, text, text, text, date),
  public.decide_client_authorization(uuid, text, text),
  public.revoke_client_authorization(uuid, text),
  public.cancel_client_authorization(uuid)
from public, anon;

grant execute on function
  public.request_approval(uuid, text, text, text, text, text, jsonb),
  public.decide_approval(uuid, text, text),
  public.cancel_approval(uuid),
  public.approval_inbox(),
  public.request_client_authorization(uuid, text, text, text, date),
  public.decide_client_authorization(uuid, text, text),
  public.revoke_client_authorization(uuid, text),
  public.cancel_client_authorization(uuid)
to authenticated;

-- ---------------------------------------------------------------------
-- Reversión (solo si fuera necesario):
--   drop function if exists public.request_approval, public.decide_approval, public.cancel_approval,
--     public.approval_inbox, public.request_client_authorization, public.decide_client_authorization,
--     public.revoke_client_authorization, public.cancel_client_authorization,
--     private.can_decide_approval, private.can_request_authorization cascade;
--   drop table if exists public.approvals, public.client_authorizations cascade;
-- ---------------------------------------------------------------------
