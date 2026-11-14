-- =====================================================================
-- ENQORA · 0055 · Autorizar a ENQORA en el SII (Mandato Digital)
-- Para actuar ante el SII por un cliente, ENQORA NUNCA usa su clave: el cliente otorga en sii.cl un Mandato
-- Digital a la persona de ENQORA que lleva el caso, solo para los trámites que elige y hasta una fecha.
-- El profesional actúa con su propia clave y el SII registra que fue él.
-- Flujo: solicitado (el profesional indica trámites y fecha) → otorgado (el cliente lo crea en sii.cl y lo
--        confirma aquí) → aceptado (el profesional lo acepta en sii.cl) → revocado (el cliente lo revoca al
--        terminar; ENQORA se lo recuerda al cerrar el caso). Cada paso queda en la historia del caso.
-- Requiere 0054. Se puede ejecutar más de una vez.
-- =====================================================================

create table if not exists public.sii_mandates (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  mandatario_id uuid references auth.users (id) on delete set null,
  mandatario_nombre text not null check (char_length(mandatario_nombre) between 5 and 120),
  mandatario_rut text not null check (mandatario_rut ~ '^[0-9]{7,8}-[0-9K]$'),
  tramites text[] not null check (cardinality(tramites) between 1 and 8),
  vence date not null,
  status text not null default 'solicitado' check (status in ('solicitado', 'otorgado', 'aceptado', 'revocado', 'cancelado')),
  requested_at timestamptz not null default now(),
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  note text check (char_length(note) <= 500),
  updated_at timestamptz not null default now()
);
create index if not exists sii_mandates_case_idx on public.sii_mandates (case_id, requested_at desc);
create unique index if not exists sii_mandates_un_activo on public.sii_mandates (case_id) where status in ('solicitado', 'otorgado', 'aceptado');

alter table public.sii_mandates enable row level security;
revoke all on public.sii_mandates from anon, authenticated;
grant select on public.sii_mandates to authenticated;
drop policy if exists mfa_requerido on public.sii_mandates;
create policy mfa_requerido on public.sii_mandates as restrictive for all to authenticated using (private.is_mfa()) with check (private.is_mfa());
drop policy if exists mandatos_sii_ver on public.sii_mandates;
create policy mandatos_sii_ver on public.sii_mandates for select to authenticated using (private.can_see_case(case_id));

alter table public.case_events drop constraint if exists case_events_kind_check;
alter table public.case_events add constraint case_events_kind_check check (kind in (
  'creado', 'estado', 'comentario', 'nota_interna', 'documento', 'asignacion', 'tarea', 'prioridad',
  'aprobacion', 'autorizacion', 'cotizacion', 'diagnostico', 'plan', 'pago', 'actuacion', 'legal', 'terreno', 'sii'
));

-- Trámites que se pueden pedir (los nombres son los del menú «Trámite» del SII).
create or replace function private.sii_tramites_validos() returns text[]
language sql immutable as $$
  select array['dj_renta', 'declarar_f22', 'rectificar_f22', 'rectificar_dj', 'giros_condonaciones', 'info_ingresos', 'dj_mensuales', 'termino_giro']
$$;

create or replace function private.sii_mandate_event(m public.sii_mandates, p_text text) returns void
language sql security definer set search_path = '' as $$
  insert into public.case_events (case_id, actor_id, kind, body, visibility, metadata)
  values (m.case_id, (select auth.uid()), 'sii', left(p_text, 4000), 'cliente',
          jsonb_build_object('mandato', m.id, 'estado', m.status, 'tramites', m.tramites, 'vence', m.vence))
$$;

-- 1. El profesional de ENQORA pide el mandato (para sí mismo).
create or replace function public.request_sii_mandate(p_case uuid, p_rut text, p_nombre text, p_tramites text[], p_vence date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_case public.cases;
  v_id uuid;
  m public.sii_mandates;
  v_hoy date := (now() at time zone 'America/Santiago')::date;
begin
  if not private.can_request_authorization(p_case) then raise exception 'ENQ_SIN_PERMISO'; end if;
  select * into v_case from public.cases where id = p_case;
  if v_case.status in ('cerrado', 'cancelado') then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if p_vence is null or p_vence <= v_hoy or p_vence > v_hoy + 365 then raise exception 'ENQ_FECHA_INVALIDA'; end if;
  if p_tramites is null or cardinality(p_tramites) = 0 or not (p_tramites <@ private.sii_tramites_validos()) then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  insert into public.sii_mandates (case_id, company_id, mandatario_id, mandatario_nombre, mandatario_rut, tramites, vence)
  values (p_case, v_case.company_id, v_uid, trim(p_nombre), upper(trim(p_rut)), (select array_agg(distinct x) from unnest(p_tramites) x), p_vence)
  returning * into m;
  perform private.sii_mandate_event(m, 'ENQORA pide autorización en el SII (Mandato Digital) para ' || m.mandatario_nombre
    || ', hasta el ' || to_char(m.vence, 'DD-MM-YYYY') || '. Tú eliges los trámites; nunca te pediremos tu clave.');
  perform private.notify(private.company_users(m.company_id, array['owner', 'admin']), m.company_id, m.case_id, 'casos',
    'Autoriza a ENQORA en el SII · ' || v_case.folio, 'Otorga un Mandato Digital en sii.cl para que ENQORA haga los trámites de tu caso sin pedirte tu clave.',
    '/casos/' || m.case_id || '#sii', 'sii-mandato-' || m.id);
  return m.id;
exception
  when unique_violation then raise exception 'ENQ_MANDATO_SII_ACTIVO';
  when check_violation then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

-- 2. El cliente confirma que lo otorgó en sii.cl.
create or replace function public.grant_sii_mandate(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  m public.sii_mandates;
begin
  select * into m from public.sii_mandates where id = p_id for update;
  if not found or not private.has_role(m.company_id, array['owner', 'admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if m.status <> 'solicitado' then raise exception 'ENQ_YA_DECIDIDA'; end if;
  update public.sii_mandates set status = 'otorgado', granted_by = v_uid, granted_at = now(), updated_at = now() where id = p_id returning * into m;
  perform private.sii_mandate_event(m, 'El cliente otorgó el Mandato Digital en el SII. Falta que ' || m.mandatario_nombre || ' lo acepte.');
  if m.mandatario_id is not null then
    perform private.notify(array[m.mandatario_id], m.company_id, m.case_id, 'equipo', 'Acepta el Mandato Digital en el SII',
      'El cliente ya te designó como mandatario. Acéptalo en sii.cl con tu clave y confírmalo en el caso.', '/casos/' || m.case_id || '#sii', 'sii-otorgado-' || m.id);
  end if;
end
$$;

-- 3. El profesional confirma que lo aceptó en sii.cl.
create or replace function public.accept_sii_mandate(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.sii_mandates;
begin
  perform private.require_session();
  select * into m from public.sii_mandates where id = p_id for update;
  if not found or m.mandatario_id is distinct from (select auth.uid()) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if m.status <> 'otorgado' then raise exception 'ENQ_YA_DECIDIDA'; end if;
  update public.sii_mandates set status = 'aceptado', accepted_at = now(), updated_at = now() where id = p_id returning * into m;
  perform private.sii_mandate_event(m, m.mandatario_nombre || ' aceptó el Mandato Digital: ENQORA ya puede hacer en el SII solo los trámites que autorizaste, hasta el '
    || to_char(m.vence, 'DD-MM-YYYY') || '.');
  perform private.notify(private.company_users(m.company_id, array['owner', 'admin']), m.company_id, m.case_id, 'casos',
    'ENQORA ya puede trabajar en tu caso ante el SII', 'Solo en los trámites que autorizaste. Al terminar te pediremos revocar el mandato.',
    '/casos/' || m.case_id || '#sii', 'sii-aceptado-' || m.id);
end
$$;

-- 4. El cliente lo revoca (en sii.cl) y lo confirma aquí. También puede anularse la solicitud.
create or replace function public.revoke_sii_mandate(p_id uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.sii_mandates;
  v_cliente boolean;
begin
  perform private.require_session();
  select * into m from public.sii_mandates where id = p_id for update;
  if not found then raise exception 'ENQ_SIN_PERMISO'; end if;
  v_cliente := private.has_role(m.company_id, array['owner', 'admin']);
  if m.status = 'solicitado' and (m.mandatario_id = (select auth.uid()) or private.is_supervisor() or v_cliente) then
    update public.sii_mandates set status = 'cancelado', note = left(p_note, 500), updated_at = now() where id = p_id returning * into m;
    perform private.sii_mandate_event(m, 'Se anuló la solicitud de Mandato Digital.');
  elsif m.status in ('otorgado', 'aceptado') and v_cliente then
    update public.sii_mandates set status = 'revocado', revoked_at = now(), note = left(p_note, 500), updated_at = now() where id = p_id returning * into m;
    perform private.sii_mandate_event(m, 'El cliente revocó el Mandato Digital: ENQORA ya no puede actuar en su nombre ante el SII.');
    if m.mandatario_id is not null then
      perform private.notify(array[m.mandatario_id], m.company_id, m.case_id, 'equipo', 'Mandato Digital revocado',
        'El cliente revocó tu mandato en el SII.', '/casos/' || m.case_id || '#sii', 'sii-revocado-' || m.id);
    end if;
  else
    raise exception 'ENQ_SIN_PERMISO';
  end if;
end
$$;

-- 5. Al cerrar o cancelar el caso, recordar al cliente que revoque el mandato vigente.
create or replace function private.sii_mandate_on_case_close() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  m public.sii_mandates;
begin
  if new.status in ('cerrado', 'cancelado') and old.status is distinct from new.status then
    for m in select * from public.sii_mandates where case_id = new.id and status in ('otorgado', 'aceptado') loop
      perform private.notify(private.company_users(m.company_id, array['owner', 'admin']), m.company_id, m.case_id, 'casos',
        'Revoca el Mandato Digital de ENQORA en el SII', 'Tu caso terminó. Entra a sii.cl → Mandatario Digital → Administración y gestión de mandatos y revócalo; luego confírmalo en el caso.',
        '/casos/' || m.case_id || '#sii', 'sii-revocar-' || m.id);
    end loop;
    update public.sii_mandates set status = 'cancelado', note = 'Caso cerrado antes de otorgarse', updated_at = now()
    where case_id = new.id and status = 'solicitado';
  end if;
  return new;
end
$$;
drop trigger if exists cases_sii_mandate_close on public.cases;
create trigger cases_sii_mandate_close after update of status on public.cases for each row execute function private.sii_mandate_on_case_close();

revoke execute on function private.sii_tramites_validos(), private.sii_mandate_event(public.sii_mandates, text), private.sii_mandate_on_case_close() from public, anon, authenticated;
revoke execute on function public.request_sii_mandate(uuid, text, text, text[], date), public.grant_sii_mandate(uuid),
  public.accept_sii_mandate(uuid), public.revoke_sii_mandate(uuid, text) from public, anon;
grant execute on function public.request_sii_mandate(uuid, text, text, text[], date), public.grant_sii_mandate(uuid),
  public.accept_sii_mandate(uuid), public.revoke_sii_mandate(uuid, text) to authenticated;
