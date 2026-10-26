-- =====================================================================
-- ENQORA · 0012 · Mandatos, actuaciones y notificaciones (M11 / Etapa 9)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0002…0011.
--
-- Principios (ver docs/ENQORA-MANDATOS.md y docs/ENQORA-NOTIFICACIONES.md):
--  · La aprobación interna y la autorización del cliente NO son un mandato legal.
--  · Mandato: lo prepara el equipo; el cliente lo revisa, declara quién firma y sube el
--    documento firmado; un abogado o el Administrador ENQORA lo verifica con lista de chequeo
--    (cuatro ojos: no quien lo preparó). Solo entonces queda vigente. Es revocable y vence.
--  · Actuación ante una institución: exige mandato vigente que cubra esa institución y una
--    autorización vigente del cliente para el caso. Se comprueba al verificar y al ejecutar.
--  · Los agentes IA pueden preparar y planificar; nunca enviar, verificar ni ejecutar.
--  · Nunca se solicita ni almacena ClaveÚnica ni clave del SII.
--  · Notificaciones: en la aplicación siempre; por correo y WhatsApp según preferencias.
--    El envío lo hace la aplicación con la clave de servicio (sin service_role).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Historial del caso
-- ---------------------------------------------------------------------

alter table public.case_events drop constraint if exists case_events_kind_check;
alter table public.case_events add constraint case_events_kind_check check (kind in (
  'creado', 'estado', 'comentario', 'nota_interna', 'documento', 'asignacion', 'tarea', 'prioridad',
  'aprobacion', 'autorizacion', 'cotizacion', 'diagnostico', 'plan', 'pago', 'actuacion'
));

-- ---------------------------------------------------------------------
-- 2. Instituciones
-- ---------------------------------------------------------------------

create or replace function private.institutions() returns text[]
language sql immutable set search_path = '' as $$
  select array['sii', 'tgr', 'inapi', 'registro_empresas', 'municipalidad', 'direccion_trabajo',
               'cbr', 'notaria', 'tribunal', 'otra']
$$;

-- ---------------------------------------------------------------------
-- 3. Mandatos
-- ---------------------------------------------------------------------

create sequence public.mandate_folio_seq;

create table public.mandates (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique,
  company_id uuid not null references public.companies (id) on delete cascade,
  case_id uuid references public.cases (id) on delete set null,
  kind text not null check (kind in ('simple', 'notarial')),
  representative_name text not null check (char_length(representative_name) between 3 and 160),
  representative_rut text check (char_length(representative_rut) <= 12),
  institutions text[] not null check (cardinality(institutions) between 1 and 10),
  procedures text not null check (char_length(procedures) between 10 and 2000),   -- trámites permitidos
  scope text not null check (char_length(scope) between 30 and 8000),             -- texto del mandato
  valid_from date not null,
  valid_until date not null,
  status text not null default 'borrador' check (status in (
    'borrador', 'pendiente_firma', 'en_verificacion', 'vigente', 'revocado', 'vencido', 'anulado'
  )),
  observation text check (char_length(observation) <= 1000),                       -- motivo de una devolución
  signer_name text check (char_length(signer_name) <= 160),
  signer_rut text check (char_length(signer_rut) <= 12),
  signer_role text check (char_length(signer_role) <= 80),
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  acceptance jsonb not null default '{}'::jsonb,
  document_path text,
  document_name text check (char_length(document_name) <= 200),
  document_uploaded_by uuid references auth.users (id) on delete set null,
  document_uploaded_at timestamptz,
  verification jsonb not null default '{}'::jsonb,
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  prepared_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  revoke_reason text check (char_length(revoke_reason) <= 500),
  check (valid_until >= valid_from and valid_until <= valid_from + 1096),
  check (institutions <@ array['sii', 'tgr', 'inapi', 'registro_empresas', 'municipalidad', 'direccion_trabajo',
                               'cbr', 'notaria', 'tribunal', 'otra'])
);
create index mandates_company_idx on public.mandates (company_id, status);

-- ¿Hay un mandato vigente de la empresa que cubra la institución en la fecha?
create or replace function private.mandate_covers(p_mandate uuid, p_company uuid, p_institution text, p_day date)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.mandates m
    where m.id = p_mandate and m.company_id = p_company and m.status = 'vigente'
      and p_institution = any (m.institutions) and p_day between m.valid_from and m.valid_until
  )
$$;

-- Ruta en almacenamiento: <empresa>/<mandato>/<archivo>
create or replace function private.path_mandate(p_name text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  parts text[] := string_to_array(coalesce(p_name, ''), '/');
  v_id uuid;
begin
  if array_length(parts, 1) <> 3 or parts[1] !~ '^[0-9a-f-]{36}$' or parts[2] !~ '^[0-9a-f-]{36}$' or parts[3] = '' then
    return null;
  end if;
  select id into v_id from public.mandates where id = parts[2]::uuid and company_id = parts[1]::uuid;
  return v_id;
end
$$;

create or replace function private.can_see_mandate(p_mandate uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.mandates m
    where m.id = p_mandate and (
      private.has_role(m.company_id, array['owner', 'admin'])
      or private.is_staff(array['enqora_admin', 'ops_director', 'lawyer_pro'])
      or (private.is_staff() and (m.prepared_by = (select auth.uid()) or private.works_company(m.company_id)))
    )
  )
$$;

-- Documento firmado: almacenamiento privado propio.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mandatos', 'mandatos', false, 20971520, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists enqora_mandatos_subir on storage.objects;
create policy enqora_mandatos_subir on storage.objects for insert to authenticated
  with check (
    bucket_id = 'mandatos' and private.is_mfa()
    and private.path_mandate(name) is not null
    and exists (
      select 1 from public.mandates m
      where m.id = private.path_mandate(name) and m.status = 'pendiente_firma'
        and (private.has_role(m.company_id, array['owner', 'admin'])
             or private.is_staff(array['enqora_admin', 'ops_director', 'lawyer_pro']))
    )
  );

drop policy if exists enqora_mandatos_leer on storage.objects;
create policy enqora_mandatos_leer on storage.objects for select to authenticated
  using (
    bucket_id = 'mandatos' and private.is_mfa()
    and exists (select 1 from public.mandates m where m.document_path = storage.objects.name and private.can_see_mandate(m.id))
  );

-- ---------------------------------------------------------------------
-- 4. Actuaciones ante instituciones
-- ---------------------------------------------------------------------

create table public.case_actions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  institution text not null check (institution = any (array['sii', 'tgr', 'inapi', 'registro_empresas', 'municipalidad',
                                                             'direccion_trabajo', 'cbr', 'notaria', 'tribunal', 'otra'])),
  procedure text not null check (char_length(procedure) between 5 and 200),
  detail text check (char_length(detail) <= 2000),
  mandate_id uuid references public.mandates (id) on delete set null,
  authorization_id uuid references public.client_authorizations (id) on delete set null,
  status text not null default 'planificada' check (status in ('planificada', 'verificada', 'ejecutada', 'fallida', 'cancelada')),
  checks jsonb not null default '{}'::jsonb,
  planned_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  executed_by uuid references auth.users (id) on delete set null,
  executed_at timestamptz,
  result text check (char_length(result) <= 2000)
);
create index case_actions_case_idx on public.case_actions (case_id, created_at desc);

-- Comprobación del habilitante: mandato y autorización vigentes para esta actuación.
create or replace function private.action_checks(p_action uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_a public.case_actions;
  v_auth public.client_authorizations;
  v_today date := (now() at time zone 'America/Santiago')::date;
  v_mandate boolean;
  v_authorized boolean;
begin
  select * into v_a from public.case_actions where id = p_action;
  v_mandate := v_a.mandate_id is not null and private.mandate_covers(v_a.mandate_id, v_a.company_id, v_a.institution, v_today);
  select * into v_auth from public.client_authorizations where id = v_a.authorization_id;
  v_authorized := v_auth.id is not null and v_auth.case_id = v_a.case_id and v_auth.status = 'autorizada'
    and (v_auth.valid_until is null or v_auth.valid_until >= v_today);
  return jsonb_build_object('mandato_vigente', v_mandate, 'autorizacion_vigente', v_authorized, 'fecha', v_today,
    'mandato', v_a.mandate_id, 'autorizacion', v_a.authorization_id);
end
$$;

-- ---------------------------------------------------------------------
-- 5. Notificaciones
-- ---------------------------------------------------------------------

create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  case_id uuid references public.cases (id) on delete cascade,
  category text not null check (category in ('casos', 'cotizaciones', 'pagos', 'mandatos', 'equipo')),
  title text not null check (char_length(title) between 3 and 200),
  body text check (char_length(body) <= 500),
  link text check (link ~ '^/[A-Za-z0-9/_#?=&.-]*$'),
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (user_id, dedupe_key)
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email boolean not null default true,
  whatsapp boolean not null default false,
  phone text check (phone ~ '^\+569[0-9]{8}$'),
  phone_verified_at timestamptz,
  whatsapp_consent_at timestamptz,
  muted text[] not null default '{}' check (muted <@ array['casos', 'cotizaciones', 'pagos', 'mandatos', 'equipo']),
  updated_at timestamptz not null default now()
);

create table private.phone_codes (
  user_id uuid primary key,
  phone text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts smallint not null default 0,
  sent_at timestamptz not null default now()
);

create table public.notification_deliveries (
  id bigint generated always as identity primary key,
  notification_id bigint not null references public.notifications (id) on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp')),
  status text not null default 'pendiente' check (status in ('pendiente', 'enviado', 'fallido', 'omitido')),
  attempts smallint not null default 0,
  locked_at timestamptz,
  last_error text check (char_length(last_error) <= 300),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index notification_deliveries_pending_idx on public.notification_deliveries (created_at) where status = 'pendiente';

-- Crea la notificación para cada destinatario (nunca para quien realizó la acción) y sus envíos
-- según las preferencias de cada persona.
create or replace function private.notify(
  p_users uuid[], p_company uuid, p_case uuid, p_category text, p_title text, p_body text, p_link text, p_dedupe text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_user uuid;
  v_id bigint;
  v_pref public.notification_preferences;
begin
  for v_user in select distinct u from unnest(coalesce(p_users, '{}')) u where u is not null and u is distinct from v_actor loop
    insert into public.notifications (user_id, company_id, case_id, category, title, body, link, dedupe_key)
    values (v_user, p_company, p_case, p_category, left(p_title, 200), left(p_body, 500), p_link, p_dedupe)
    on conflict (user_id, dedupe_key) do nothing
    returning id into v_id;
    continue when v_id is null;

    select * into v_pref from public.notification_preferences where user_id = v_user;
    if not (p_category = any (coalesce(v_pref.muted, '{}'))) then
      if coalesce(v_pref.email, true) then
        insert into public.notification_deliveries (notification_id, channel) values (v_id, 'email');
      end if;
      if coalesce(v_pref.whatsapp, false) and v_pref.phone_verified_at is not null then
        insert into public.notification_deliveries (notification_id, channel) values (v_id, 'whatsapp');
      end if;
    end if;
    v_id := null;
  end loop;
end
$$;

-- Destinatarios
create or replace function private.company_users(p_company uuid, p_roles text[]) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(user_id), '{}') from public.company_members where company_id = p_company and role = any (p_roles)
$$;

create or replace function private.staff_users(p_roles text[]) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(user_id), '{}') from public.staff_members where active and role = any (p_roles)
$$;

create or replace function private.case_team(p_case uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct a.user_id), '{}')
  from public.case_assignments a join public.staff_members s on s.user_id = a.user_id and s.active and s.role <> 'ai_agent'
  where a.case_id = p_case
$$;

create or replace function private.money_cl(p_amount bigint) returns text
language sql immutable set search_path = '' as $$
  select '$' || replace(to_char(p_amount, 'FM999,999,999,990'), ',', '.')
$$;

-- ---------------------------------------------------------------------
-- 6. Disparadores de notificaciones
-- ---------------------------------------------------------------------

create or replace function private.on_case_event_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_case public.cases;
  v_client uuid[];
  v_team uuid[];
  v_actor_staff boolean := new.actor_id is not null and exists (select 1 from public.staff_members s where s.user_id = new.actor_id and s.active);
  v_accion text := coalesce(new.metadata ->> 'accion', '');
  v_titulo text := coalesce(new.metadata ->> 'titulo', new.body, '');
  v_link text;
  v_key text := 'ev:' || new.id;
begin
  if new.visibility <> 'cliente' then return new; end if;
  select * into v_case from public.cases where id = new.case_id;
  v_client := private.company_users(v_case.company_id, array['owner', 'admin']) || coalesce(array[v_case.created_by], '{}');
  v_team := private.case_team(v_case.id);
  if cardinality(v_team) = 0 then v_team := private.staff_users(array['ops_director', 'enqora_admin']); end if;
  v_link := '/casos/' || v_case.id;

  if new.kind = 'creado' then
    perform private.notify(private.staff_users(array['ops_director', 'enqora_admin']), v_case.company_id, v_case.id, 'equipo',
      'Nueva solicitud ' || v_case.folio, v_case.title, v_link, v_key);
  elsif new.kind = 'comentario' then
    if v_actor_staff then
      perform private.notify(v_client, v_case.company_id, v_case.id, 'casos',
        'Nuevo mensaje del equipo ENQORA · ' || v_case.folio, v_case.title, v_link || '#historial', v_key);
    else
      perform private.notify(v_team, v_case.company_id, v_case.id, 'equipo',
        'Mensaje del cliente · ' || v_case.folio, v_case.title, v_link || '#historial', v_key);
    end if;
  elsif new.kind = 'documento' then
    if v_actor_staff then
      perform private.notify(v_client, v_case.company_id, v_case.id, 'casos',
        'Nuevo documento en tu caso ' || v_case.folio, left(coalesce(new.body, ''), 200), v_link || '#documentos', v_key);
    else
      perform private.notify(v_team, v_case.company_id, v_case.id, 'equipo',
        'El cliente subió un documento · ' || v_case.folio, left(coalesce(new.body, ''), 200), v_link || '#documentos', v_key);
    end if;
  elsif new.kind = 'estado' then
    if new.metadata ->> 'a' = 'esperando_cliente' then
      perform private.notify(v_client, v_case.company_id, v_case.id, 'casos',
        'Tu caso ' || v_case.folio || ' espera tu respuesta', v_case.title, v_link, v_key);
    elsif new.metadata ->> 'a' = 'cerrado' then
      perform private.notify(v_client, v_case.company_id, v_case.id, 'casos',
        'Tu caso ' || v_case.folio || ' fue cerrado', v_case.title, v_link, v_key);
    end if;
  elsif new.kind = 'cotizacion' then
    if v_accion = 'enviada' then
      perform private.notify(private.company_users(v_case.company_id, array['owner', 'admin']), v_case.company_id, v_case.id,
        'cotizaciones', 'Tienes una cotización por revisar · ' || v_case.folio, v_titulo, v_link || '#cotizacion', v_key);
    elsif v_accion in ('aceptada', 'rechazada') then
      perform private.notify(v_team, v_case.company_id, v_case.id, 'equipo',
        case v_accion when 'aceptada' then 'El cliente aceptó la cotización · ' else 'El cliente no aceptó la cotización · ' end || v_case.folio,
        v_titulo, v_link || '#cotizacion', v_key);
    end if;
  elsif new.kind = 'diagnostico' then
    if v_accion = 'publicado' then
      perform private.notify(private.company_users(v_case.company_id, array['owner', 'admin', 'accountant']), v_case.company_id,
        v_case.id, 'casos', 'Tu diagnóstico está listo · ' || v_case.folio, v_case.title, v_link || '#diagnostico', v_key);
    elsif v_accion = 'solicitado' then
      perform private.notify(private.staff_users(array['ops_director', 'enqora_admin']), v_case.company_id, v_case.id, 'equipo',
        'Diagnóstico gratuito solicitado · ' || v_case.folio, v_case.title, v_link, v_key);
    elsif v_accion = 'cotizacion_solicitada' then
      perform private.notify(v_team, v_case.company_id, v_case.id, 'equipo',
        'El cliente pidió cotizar una situación · ' || v_case.folio, v_titulo, v_link || '#diagnostico', v_key);
    end if;
  elsif new.kind = 'autorizacion' then
    if v_accion = 'solicitada' then
      perform private.notify(private.company_users(v_case.company_id, array['owner', 'admin']), v_case.company_id, v_case.id,
        'casos', 'ENQORA pide tu autorización · ' || v_case.folio, v_titulo, v_link || '#autorizaciones', v_key);
    elsif v_accion in ('autorizada', 'rechazada', 'revocada') then
      perform private.notify(v_team, v_case.company_id, v_case.id, 'equipo',
        'Autorización ' || v_accion || ' por el cliente · ' || v_case.folio, v_titulo, v_link || '#autorizaciones', v_key);
    end if;
  elsif new.kind = 'plan' then
    if v_accion = 'enviada' then
      perform private.notify(private.company_users(v_case.company_id, array['owner', 'admin']), v_case.company_id, v_case.id,
        'cotizaciones', 'ENQORA te propone un plan mensual', coalesce(new.body, ''), v_link || '#plan', v_key);
    elsif v_accion in ('aceptada', 'rechazada') then
      perform private.notify(v_team, v_case.company_id, v_case.id, 'equipo',
        'Propuesta de plan ' || v_accion || ' · ' || v_case.folio, v_titulo, v_link || '#plan', v_key);
    end if;
  elsif new.kind = 'actuacion' and v_accion in ('ejecutada', 'fallida') then
    perform private.notify(private.company_users(v_case.company_id, array['owner', 'admin']), v_case.company_id, v_case.id, 'casos',
      case v_accion when 'ejecutada' then 'ENQORA realizó un trámite en tu caso · ' else 'Un trámite de tu caso no se completó · ' end || v_case.folio,
      v_titulo, v_link || '#actuaciones', v_key);
  end if;
  return new;
end
$$;

drop trigger if exists case_events_notify on public.case_events;
create trigger case_events_notify after insert on public.case_events
  for each row execute function private.on_case_event_notify();

create or replace function private.on_approval_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_case public.cases;
  v_users uuid[];
begin
  if new.status <> 'pendiente' then return new; end if;
  select * into v_case from public.cases where id = new.case_id;
  if new.approver_role = 'responsable' and v_case.responsible_id is not null then
    v_users := array[v_case.responsible_id];
  elsif new.approver_role in ('accountant_pro', 'lawyer_pro') then
    select coalesce(array_agg(a.user_id), '{}') into v_users from public.case_assignments a
      join public.staff_members s on s.user_id = a.user_id and s.active and s.role = new.approver_role
    where a.case_id = new.case_id;
    if cardinality(v_users) = 0 then v_users := private.staff_users(array[new.approver_role]); end if;
  else
    v_users := private.staff_users(array['ops_director', 'enqora_admin']);
  end if;
  perform private.notify(v_users, v_case.company_id, v_case.id, 'equipo', 'Aprobación pendiente · ' || v_case.folio,
    new.title, '/casos/' || v_case.id || '#proximas', 'ap:' || new.id);
  return new;
end
$$;

drop trigger if exists approvals_notify on public.approvals;
create trigger approvals_notify after insert on public.approvals
  for each row execute function private.on_approval_notify();

create or replace function private.on_charge_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_users uuid[] := private.company_users(new.company_id, array['owner', 'admin', 'accountant']);
begin
  if tg_op = 'INSERT' then
    perform private.notify(v_users, new.company_id, new.case_id, 'pagos', 'Nuevo cobro ' || new.folio || ' · ' || private.money_cl(new.amount),
      new.description, '/facturacion#cobros', 'ch:' || new.id || ':nuevo');
  elsif new.status = 'vencido' and old.status <> 'vencido' then
    perform private.notify(v_users, new.company_id, new.case_id, 'pagos', 'Cobro vencido ' || new.folio || ' · ' || private.money_cl(new.amount),
      new.description, '/facturacion#cobros', 'ch:' || new.id || ':vencido');
  end if;
  return new;
end
$$;

drop trigger if exists charges_notify on public.charges;
create trigger charges_notify after insert or update of status on public.charges
  for each row execute function private.on_charge_notify();

create or replace function private.on_payment_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_folio text;
begin
  select folio into v_folio from public.charges where id = new.charge_id;
  if tg_op = 'INSERT' and new.status = 'informado' and new.method = 'transferencia'
     and not private.is_staff(array['enqora_admin']) then
    perform private.notify(private.staff_users(array['enqora_admin']), new.company_id, null, 'equipo',
      'Transferencia informada · ' || v_folio || ' · ' || private.money_cl(new.amount), coalesce(new.reference, ''),
      '/mando/cobros#por-confirmar', 'py:' || new.id || ':informado');
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('confirmado', 'rechazado') then
    perform private.notify(private.company_users(new.company_id, array['owner', 'admin', 'accountant']), new.company_id, null, 'pagos',
      case new.status when 'confirmado' then 'Pago confirmado · ' else 'Revisa tu pago · ' end || v_folio || ' · ' || private.money_cl(new.amount),
      case new.status when 'confirmado' then 'Tu comprobante está disponible.' else coalesce(new.review_note, '') end,
      '/facturacion#pagos', 'py:' || new.id || ':' || new.status);
  end if;
  return new;
end
$$;

drop trigger if exists payments_notify on public.payments;
create trigger payments_notify after insert or update of status on public.payments
  for each row execute function private.on_payment_notify();

create or replace function private.on_mandate_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_client uuid[] := private.company_users(new.company_id, array['owner', 'admin']);
  v_team uuid[] := private.staff_users(array['lawyer_pro', 'enqora_admin']) || coalesce(array[new.prepared_by], '{}');
  v_link text := '/empresas/' || new.company_id || '#mandatos';
  v_key text := 'md:' || new.id || ':' || new.status || ':' || extract(epoch from now())::bigint;
begin
  if new.status = old.status then return new; end if;
  if new.status = 'pendiente_firma' and old.status = 'borrador' then
    perform private.notify(v_client, new.company_id, null, 'mandatos', 'ENQORA te envió un mandato para revisar · ' || new.folio,
      'Revísalo, indica quién firma y sube el documento firmado.', v_link, v_key);
  elsif new.status = 'pendiente_firma' and old.status = 'en_verificacion' then
    perform private.notify(v_client, new.company_id, null, 'mandatos', 'Tu mandato ' || new.folio || ' fue observado',
      coalesce(new.observation, ''), v_link, v_key);
  elsif new.status = 'en_verificacion' then
    perform private.notify(v_team, new.company_id, null, 'equipo', 'Mandato firmado para verificar · ' || new.folio,
      new.representative_name, '/mando/mandatos#' || new.id, v_key);
  elsif new.status = 'vigente' then
    perform private.notify(v_client || coalesce(array[new.prepared_by], '{}'), new.company_id, null, 'mandatos',
      'Mandato vigente · ' || new.folio, 'Vigente hasta el ' || to_char(new.valid_until, 'DD-MM-YYYY') || '.', v_link, v_key);
  elsif new.status in ('revocado', 'vencido') then
    perform private.notify(v_client || v_team, new.company_id, null, 'mandatos', 'Mandato ' || new.status || ' · ' || new.folio,
      coalesce(new.revoke_reason, 'ENQORA ya no puede actuar con este mandato.'), v_link, v_key);
  end if;
  return new;
end
$$;

drop trigger if exists mandates_notify on public.mandates;
create trigger mandates_notify after update of status on public.mandates
  for each row execute function private.on_mandate_notify();

-- ---------------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------------

alter table public.mandates enable row level security;
alter table public.case_actions enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_deliveries enable row level security;

revoke all on public.mandates, public.case_actions, public.notifications, public.notification_preferences,
  public.notification_deliveries from anon, authenticated;
grant select on public.mandates, public.case_actions, public.notifications, public.notification_preferences to authenticated;
revoke all on private.phone_codes from public, anon, authenticated;

create policy mfa_requerido on public.mandates as restrictive for all to authenticated using (private.is_mfa()) with check (private.is_mfa());
create policy mfa_requerido on public.case_actions as restrictive for all to authenticated using (private.is_mfa()) with check (private.is_mfa());
create policy mfa_requerido on public.notifications as restrictive for all to authenticated using (private.is_mfa()) with check (private.is_mfa());
create policy mfa_requerido on public.notification_preferences as restrictive for all to authenticated using (private.is_mfa()) with check (private.is_mfa());

create policy mandatos_visibles on public.mandates for select to authenticated
  using (private.can_see_mandate(id) and (status <> 'borrador' or private.is_staff()));
create policy actuaciones_visibles on public.case_actions for select to authenticated using (private.can_see_case(case_id));
create policy notificaciones_propias on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy preferencias_propias on public.notification_preferences for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 8. Mandatos: operaciones
-- ---------------------------------------------------------------------

-- p_data: kind, representative_name, representative_rut, institutions[], procedures, scope, valid_from, valid_until, case_id
create or replace function public.save_mandate(p_mandate uuid, p_company uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_id uuid := p_mandate;
  v_inst text[];
  v_case uuid := nullif(p_data ->> 'case_id', '')::uuid;
  v_m public.mandates;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' or jsonb_typeof(coalesce(p_data -> 'institutions', 'null')) <> 'array' then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_inst from jsonb_array_elements_text(p_data -> 'institutions') x;

  if v_id is null then
    if not (private.is_staff(array['enqora_admin', 'ops_director', 'lawyer_pro']) or private.works_company(p_company)) then
      raise exception 'ENQ_SIN_PERMISO';
    end if;
    if v_case is not null and private.case_company(v_case) is distinct from p_company then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
    insert into public.mandates (folio, company_id, case_id, kind, representative_name, representative_rut, institutions, procedures,
      scope, valid_from, valid_until, prepared_by)
    values ('MAN-' || to_char((now() at time zone 'America/Santiago')::date, 'YYYY') || '-' || lpad(nextval('public.mandate_folio_seq')::text, 5, '0'),
      p_company, v_case, p_data ->> 'kind', trim(coalesce(p_data ->> 'representative_name', '')),
      nullif(trim(coalesce(p_data ->> 'representative_rut', '')), ''), v_inst, trim(coalesce(p_data ->> 'procedures', '')),
      trim(coalesce(p_data ->> 'scope', '')), (p_data ->> 'valid_from')::date, (p_data ->> 'valid_until')::date, v_uid)
    returning id into v_id;
    perform private.log_event(p_company, 'mandato.preparado', null, jsonb_build_object('mandato', v_id));
  else
    select * into v_m from public.mandates where id = v_id for update;
    if not found or not (private.is_staff(array['enqora_admin', 'ops_director', 'lawyer_pro']) or v_m.prepared_by = v_uid) then
      raise exception 'ENQ_SIN_PERMISO';
    end if;
    if v_m.status <> 'borrador' then raise exception 'ENQ_MANDATO_NO_EDITABLE'; end if;
    update public.mandates set kind = p_data ->> 'kind', representative_name = trim(coalesce(p_data ->> 'representative_name', '')),
      representative_rut = nullif(trim(coalesce(p_data ->> 'representative_rut', '')), ''), institutions = v_inst,
      procedures = trim(coalesce(p_data ->> 'procedures', '')), scope = trim(coalesce(p_data ->> 'scope', '')),
      valid_from = (p_data ->> 'valid_from')::date, valid_until = (p_data ->> 'valid_until')::date, updated_at = now()
    where id = v_id;
  end if;
  return v_id;
exception
  when check_violation or not_null_violation or invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

-- Enviar al cliente: una persona del equipo (no un agente IA).
create or replace function public.send_mandate(p_mandate uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_m public.mandates;
begin
  select * into v_m from public.mandates where id = p_mandate for update;
  if not found or private.is_staff(array['ai_agent']) or not private.is_staff()
     or not (private.is_staff(array['enqora_admin', 'ops_director', 'lawyer_pro']) or v_m.prepared_by = v_uid) then
    raise exception 'ENQ_SIN_PERMISO';
  end if;
  if v_m.status <> 'borrador' then raise exception 'ENQ_MANDATO_NO_EDITABLE'; end if;
  if v_m.valid_until < (now() at time zone 'America/Santiago')::date then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  update public.mandates set status = 'pendiente_firma', updated_at = now() where id = p_mandate;
end
$$;

-- El cliente revisa y declara quién firma (Propietario o Administrador, con identidad confirmada).
-- Es su consentimiento dentro de ENQORA; el mandato legal es el documento firmado.
create or replace function public.accept_mandate(p_mandate uuid, p_signer_name text, p_signer_rut text, p_signer_role text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
  v_m public.mandates;
  v_rut text := private.normalize_rut(p_signer_rut);
begin
  select * into v_m from public.mandates where id = p_mandate for update;
  if not found or not private.has_role(v_m.company_id, array['owner', 'admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_m.status <> 'pendiente_firma' then raise exception 'ENQ_MANDATO_NO_EDITABLE'; end if;
  if char_length(trim(coalesce(p_signer_name, ''))) not between 3 and 160 or char_length(trim(coalesce(p_signer_role, ''))) not between 3 and 80 then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  if v_rut is null or not private.rut_is_valid(v_rut) then raise exception 'ENQ_RUT_INVALIDO'; end if;
  update public.mandates set signer_name = trim(p_signer_name), signer_rut = v_rut, signer_role = trim(p_signer_role),
    accepted_by = v_uid, accepted_at = now(), updated_at = now(),
    acceptance = jsonb_build_object('usuario', v_uid, 'rol_en_empresa', private.member_role(v_m.company_id),
      'sesion', private.current_session_id(), 'segundo_factor', 'reciente', 'momento', now(),
      'texto', md5(v_m.scope || v_m.procedures || array_to_string(v_m.institutions, ',') || v_m.valid_until::text))
  where id = p_mandate;
  perform private.log_event(v_m.company_id, 'mandato.aceptado', v_m.folio, jsonb_build_object('mandato', p_mandate));
end
$$;

-- Registrar el documento firmado (ya subido al almacenamiento «mandatos»).
create or replace function public.attach_mandate_document(p_mandate uuid, p_path text, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_m public.mandates;
begin
  select * into v_m from public.mandates where id = p_mandate for update;
  if not found or not (private.has_role(v_m.company_id, array['owner', 'admin'])
                       or private.is_staff(array['enqora_admin', 'ops_director', 'lawyer_pro'])) then
    raise exception 'ENQ_SIN_PERMISO';
  end if;
  if v_m.status <> 'pendiente_firma' then raise exception 'ENQ_MANDATO_NO_EDITABLE'; end if;
  if v_m.accepted_at is null then raise exception 'ENQ_MANDATO_SIN_ACEPTAR'; end if;
  if private.path_mandate(p_path) is distinct from p_mandate then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'mandatos' and o.name = p_path) then
    raise exception 'ENQ_ARCHIVO_NO_SUBIDO';
  end if;
  update public.mandates set document_path = p_path, document_name = left(coalesce(nullif(trim(p_name), ''), 'mandato'), 200),
    document_uploaded_by = v_uid, document_uploaded_at = now(), status = 'en_verificacion', observation = null, updated_at = now()
  where id = p_mandate;
end
$$;

-- Verificación: abogado o Administrador ENQORA, con reautenticación, y distinto de quien lo preparó.
-- p_checks: identidad_firmante, representacion_legal, documento_coincide, requisitos_institucion (todos true para aprobar).
create or replace function public.verify_mandate(p_mandate uuid, p_decision text, p_checks jsonb, p_note text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
  v_m public.mandates;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_ok boolean;
begin
  if not private.is_staff(array['lawyer_pro', 'enqora_admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  select * into v_m from public.mandates where id = p_mandate for update;
  if not found then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_m.status <> 'en_verificacion' then raise exception 'ENQ_YA_DECIDIDA'; end if;
  if v_m.prepared_by = v_uid then raise exception 'ENQ_CUATRO_OJOS'; end if;
  v_ok := coalesce((p_checks ->> 'identidad_firmante')::boolean, false) and coalesce((p_checks ->> 'representacion_legal')::boolean, false)
    and coalesce((p_checks ->> 'documento_coincide')::boolean, false) and coalesce((p_checks ->> 'requisitos_institucion')::boolean, false);

  if p_decision = 'aprobar' then
    if not v_ok then raise exception 'ENQ_VERIFICACION_INCOMPLETA'; end if;
    if v_m.valid_until < (now() at time zone 'America/Santiago')::date then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
    update public.mandates set status = 'vigente', verified_by = v_uid, verified_at = now(), updated_at = now(),
      verification = jsonb_build_object('identidad_firmante', true, 'representacion_legal', true, 'documento_coincide', true,
        'requisitos_institucion', true, 'nota', v_note, 'por', v_uid, 'momento', now())
    where id = p_mandate;
    perform private.log_event(v_m.company_id, 'mandato.vigente', v_m.folio, jsonb_build_object('mandato', p_mandate));
  elsif p_decision = 'observar' then
    if char_length(coalesce(v_note, '')) < 10 then raise exception 'ENQ_FALTA_OBSERVACION'; end if;
    update public.mandates set status = 'pendiente_firma', observation = left(v_note, 1000), document_path = null,
      document_name = null, updated_at = now(),
      verification = jsonb_build_object('resultado', 'observado', 'nota', v_note, 'por', v_uid, 'momento', now(), 'checks', p_checks)
    where id = p_mandate;
  else
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
end
$$;

-- El cliente revoca (Propietario o Administrador). También puede anular el equipo uno no vigente.
create or replace function public.revoke_mandate(p_mandate uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
  v_m public.mandates;
begin
  select * into v_m from public.mandates where id = p_mandate for update;
  if not found or not private.has_role(v_m.company_id, array['owner', 'admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_m.status not in ('vigente', 'pendiente_firma', 'en_verificacion') then raise exception 'ENQ_YA_DECIDIDA'; end if;
  if char_length(coalesce(trim(p_reason), '')) > 500 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  update public.mandates set status = 'revocado', revoked_by = v_uid, revoked_at = now(),
    revoke_reason = coalesce(nullif(trim(p_reason), ''), 'Revocado por la empresa.'), updated_at = now()
  where id = p_mandate;
  -- Las actuaciones aún no ejecutadas que dependían de él quedan sin habilitante.
  update public.case_actions set status = 'planificada', checks = checks || jsonb_build_object('mandato_vigente', false)
  where mandate_id = p_mandate and status = 'verificada';
  perform private.log_event(v_m.company_id, 'mandato.revocado', v_m.folio, jsonb_build_object('mandato', p_mandate));
end
$$;

create or replace function public.cancel_mandate(p_mandate uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_m public.mandates;
begin
  select * into v_m from public.mandates where id = p_mandate for update;
  if not found or not (private.is_staff(array['enqora_admin', 'ops_director', 'lawyer_pro']) or v_m.prepared_by = v_uid) then
    raise exception 'ENQ_SIN_PERMISO';
  end if;
  if v_m.status not in ('borrador', 'pendiente_firma', 'en_verificacion') then raise exception 'ENQ_YA_DECIDIDA'; end if;
  update public.mandates set status = 'anulado', updated_at = now() where id = p_mandate;
end
$$;

-- ---------------------------------------------------------------------
-- 9. Actuaciones: planificar, verificar el habilitante y ejecutar
-- ---------------------------------------------------------------------

create or replace function public.plan_action(p_case uuid, p_institution text, p_procedure text, p_detail text,
  p_mandate uuid, p_authorization uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_id uuid;
begin
  if not private.can_work_case(p_case) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if exists (select 1 from public.cases where id = p_case and status in ('cerrado', 'cancelado')) then raise exception 'ENQ_CASO_CERRADO'; end if;
  if p_mandate is not null and not exists (select 1 from public.mandates where id = p_mandate and company_id = private.case_company(p_case)) then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  if p_authorization is not null and not exists (select 1 from public.client_authorizations where id = p_authorization and case_id = p_case) then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  insert into public.case_actions (case_id, company_id, institution, procedure, detail, mandate_id, authorization_id, planned_by)
  values (p_case, private.case_company(p_case), p_institution, trim(coalesce(p_procedure, '')), nullif(trim(coalesce(p_detail, '')), ''),
    p_mandate, p_authorization, v_uid)
  returning id into v_id;
  perform private.log_case(p_case, 'actuacion', trim(p_procedure), 'cliente',
    jsonb_build_object('accion', 'planificada', 'actuacion', v_id, 'institucion', p_institution, 'titulo', trim(p_procedure)));
  return v_id;
exception
  when check_violation or not_null_violation then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

-- Verificar: responsable del caso, supervisión o abogado; no un agente IA ni quien la planificó.
create or replace function public.verify_action(p_action uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
  v_a public.case_actions;
  v_case public.cases;
  v_checks jsonb;
begin
  select * into v_a from public.case_actions where id = p_action for update;
  if not found or not private.can_work_case(v_a.case_id) or private.is_staff(array['ai_agent']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  select * into v_case from public.cases where id = v_a.case_id;
  if not (private.is_supervisor() or private.is_staff(array['lawyer_pro']) or v_case.responsible_id = v_uid) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_a.planned_by = v_uid then raise exception 'ENQ_CUATRO_OJOS'; end if;
  if v_a.status <> 'planificada' then raise exception 'ENQ_YA_DECIDIDA'; end if;
  v_checks := private.action_checks(p_action);
  if not (v_checks ->> 'mandato_vigente')::boolean then raise exception 'ENQ_SIN_MANDATO_VIGENTE'; end if;
  if not (v_checks ->> 'autorizacion_vigente')::boolean then raise exception 'ENQ_SIN_AUTORIZACION_VIGENTE'; end if;
  update public.case_actions set status = 'verificada', checks = v_checks, verified_by = v_uid, verified_at = now() where id = p_action;
  perform private.log_case(v_a.case_id, 'actuacion', v_a.procedure, 'cliente',
    jsonb_build_object('accion', 'verificada', 'actuacion', p_action, 'titulo', v_a.procedure));
  return v_checks;
end
$$;

-- Ejecutar (registrar el resultado): vuelve a comprobar el habilitante en ese momento.
create or replace function public.execute_action(p_action uuid, p_success boolean, p_result text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
  v_a public.case_actions;
  v_checks jsonb;
  v_result text := nullif(trim(coalesce(p_result, '')), '');
begin
  select * into v_a from public.case_actions where id = p_action for update;
  if not found or not private.can_work_case(v_a.case_id) or private.is_staff(array['ai_agent']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_a.status <> 'verificada' then raise exception 'ENQ_ACTUACION_NO_VERIFICADA'; end if;
  if char_length(coalesce(v_result, '')) not between 10 and 2000 then raise exception 'ENQ_FALTA_OBSERVACION'; end if;
  v_checks := private.action_checks(p_action);
  if not (v_checks ->> 'mandato_vigente')::boolean then raise exception 'ENQ_SIN_MANDATO_VIGENTE'; end if;
  if not (v_checks ->> 'autorizacion_vigente')::boolean then raise exception 'ENQ_SIN_AUTORIZACION_VIGENTE'; end if;
  update public.case_actions set status = case when p_success then 'ejecutada' else 'fallida' end, executed_by = v_uid,
    executed_at = now(), result = v_result, checks = v_checks || jsonb_build_object('al_ejecutar', now())
  where id = p_action;
  perform private.log_case(v_a.case_id, 'actuacion', v_result, 'cliente',
    jsonb_build_object('accion', case when p_success then 'ejecutada' else 'fallida' end, 'actuacion', p_action, 'titulo', v_a.procedure));
end
$$;

create or replace function public.cancel_action(p_action uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_a public.case_actions;
begin
  perform private.require_session();
  select * into v_a from public.case_actions where id = p_action for update;
  if not found or not private.can_work_case(v_a.case_id) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_a.status not in ('planificada', 'verificada') then raise exception 'ENQ_YA_DECIDIDA'; end if;
  update public.case_actions set status = 'cancelada' where id = p_action;
  perform private.log_case(v_a.case_id, 'actuacion', v_a.procedure, 'cliente',
    jsonb_build_object('accion', 'cancelada', 'actuacion', p_action, 'titulo', v_a.procedure));
end
$$;

-- ---------------------------------------------------------------------
-- 10. Notificaciones: lectura y preferencias
-- ---------------------------------------------------------------------

create or replace function public.mark_notifications_read(p_ids bigint[] default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_n integer;
begin
  update public.notifications set read_at = now()
  where user_id = v_uid and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics v_n = row_count;
  return v_n;
end
$$;

create or replace function public.save_notification_preferences(p_email boolean, p_whatsapp boolean, p_muted text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_pref public.notification_preferences;
begin
  select * into v_pref from public.notification_preferences where user_id = v_uid;
  if coalesce(p_whatsapp, false) and v_pref.phone_verified_at is null then raise exception 'ENQ_TELEFONO_NO_VERIFICADO'; end if;
  insert into public.notification_preferences (user_id, email, whatsapp, muted, whatsapp_consent_at)
  values (v_uid, coalesce(p_email, true), coalesce(p_whatsapp, false), coalesce(p_muted, '{}'),
    case when p_whatsapp then now() end)
  on conflict (user_id) do update set email = excluded.email, whatsapp = excluded.whatsapp, muted = excluded.muted,
    whatsapp_consent_at = case when excluded.whatsapp and not public.notification_preferences.whatsapp then now()
                               when excluded.whatsapp then public.notification_preferences.whatsapp_consent_at end,
    updated_at = now();
exception
  when check_violation then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

-- La aplicación genera el código, lo envía por WhatsApp y registra aquí solo su hash.
create or replace function public.start_phone_verification(p_phone text, p_code_hash text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_prev private.phone_codes;
begin
  if p_phone !~ '^\+569[0-9]{8}$' or p_code_hash !~ '^[0-9a-f]{64}$' then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  select * into v_prev from private.phone_codes where user_id = v_uid;
  if v_prev.sent_at > now() - interval '60 seconds' then raise exception 'ENQ_DEMASIADAS_CONSULTAS'; end if;
  insert into private.phone_codes (user_id, phone, code_hash, expires_at, attempts, sent_at)
  values (v_uid, p_phone, p_code_hash, now() + interval '10 minutes', 0, now())
  on conflict (user_id) do update set phone = excluded.phone, code_hash = excluded.code_hash, expires_at = excluded.expires_at,
    attempts = 0, sent_at = now();
end
$$;

create or replace function public.confirm_phone_verification(p_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_c private.phone_codes;
begin
  select * into v_c from private.phone_codes where user_id = v_uid for update;
  if not found or v_c.expires_at < now() then raise exception 'ENQ_CODIGO_VENCIDO'; end if;
  if v_c.attempts >= 5 then raise exception 'ENQ_DEMASIADAS_CONSULTAS'; end if;
  if encode(sha256(convert_to(coalesce(p_code, ''), 'UTF8')), 'hex') <> v_c.code_hash then
    update private.phone_codes set attempts = attempts + 1 where user_id = v_uid;
    raise exception 'ENQ_CODIGO_INCORRECTO';
  end if;
  delete from private.phone_codes where user_id = v_uid;
  insert into public.notification_preferences (user_id, phone, phone_verified_at)
  values (v_uid, v_c.phone, now())
  on conflict (user_id) do update set phone = excluded.phone, phone_verified_at = now(), updated_at = now();
end
$$;

create or replace function public.remove_phone() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
begin
  update public.notification_preferences set phone = null, phone_verified_at = null, whatsapp = false,
    whatsapp_consent_at = null, updated_at = now()
  where user_id = v_uid;
  update public.notification_deliveries d set status = 'omitido', last_error = 'Teléfono eliminado'
  from public.notifications n where n.id = d.notification_id and n.user_id = v_uid and d.channel = 'whatsapp' and d.status = 'pendiente';
end
$$;

-- ---------------------------------------------------------------------
-- 11. Envío (la aplicación, con la clave de servicio)
-- ---------------------------------------------------------------------

-- Toma hasta p_limit envíos pendientes (con bloqueo para no duplicar) y devuelve lo necesario para enviarlos.
create or replace function public.claim_deliveries(p_token text, p_limit integer default 20)
returns table (id bigint, channel text, recipient text, title text, body text, link text)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  -- Destinatario sin correo o sin teléfono verificado: se omite.
  return query
  with picked as (
    select d.id from public.notification_deliveries d
    where d.status = 'pendiente' and (d.locked_at is null or d.locked_at < now() - interval '5 minutes') and d.attempts < 5
      and d.created_at > now() - interval '3 days'
    order by d.created_at
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
    for update skip locked
  ), upd as (
    update public.notification_deliveries d set locked_at = now(), attempts = d.attempts + 1
    from picked where d.id = picked.id
    returning d.id, d.channel, d.notification_id
  )
  select upd.id, upd.channel,
    case upd.channel when 'email' then u.email::text else p.phone end,
    n.title, n.body, n.link
  from upd
  join public.notifications n on n.id = upd.notification_id
  join auth.users u on u.id = n.user_id
  left join public.notification_preferences p on p.user_id = n.user_id
  where (upd.channel = 'email' and u.email is not null)
     or (upd.channel = 'whatsapp' and p.phone is not null and p.phone_verified_at is not null and p.whatsapp);
end
$$;

create or replace function public.finish_delivery(p_token text, p_delivery bigint, p_ok boolean, p_error text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  update public.notification_deliveries set
    status = case when p_ok then 'enviado' when attempts >= 5 then 'fallido' else 'pendiente' end,
    sent_at = case when p_ok then now() end, last_error = left(p_error, 300), locked_at = null
  where id = p_delivery;
end
$$;

-- ---------------------------------------------------------------------
-- 12. Tarea diaria: facturación, vencimiento de mandatos y limpieza
-- ---------------------------------------------------------------------

create or replace function public.daily_run(p_token text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_billing jsonb;
  v_expired integer;
  v_skipped integer;
begin
  v_billing := public.billing_run(p_token);   -- comprueba la clave de servicio o la sesión del Administrador

  update public.mandates set status = 'vencido', updated_at = now()
  where status = 'vigente' and valid_until < (now() at time zone 'America/Santiago')::date;
  get diagnostics v_expired = row_count;

  update public.notification_deliveries set status = 'omitido', last_error = coalesce(last_error, 'Vencido sin enviar')
  where status = 'pendiente' and created_at < now() - interval '3 days';
  get diagnostics v_skipped = row_count;

  return v_billing || jsonb_build_object('mandatos_vencidos', v_expired, 'envios_omitidos', v_skipped);
end
$$;

-- ---------------------------------------------------------------------
-- 13. Permisos de ejecución
-- ---------------------------------------------------------------------

revoke execute on function private.institutions(), private.mandate_covers(uuid, uuid, text, date), private.path_mandate(text),
  private.can_see_mandate(uuid), private.action_checks(uuid),
  private.notify(uuid[], uuid, uuid, text, text, text, text, text), private.company_users(uuid, text[]),
  private.staff_users(text[]), private.case_team(uuid), private.money_cl(bigint), private.on_case_event_notify(),
  private.on_approval_notify(), private.on_charge_notify(), private.on_payment_notify(), private.on_mandate_notify()
from public, anon;
grant execute on function private.path_mandate(text), private.can_see_mandate(uuid) to authenticated;

revoke execute on function
  public.save_mandate(uuid, uuid, jsonb), public.send_mandate(uuid), public.accept_mandate(uuid, text, text, text),
  public.attach_mandate_document(uuid, text, text), public.verify_mandate(uuid, text, jsonb, text),
  public.revoke_mandate(uuid, text), public.cancel_mandate(uuid),
  public.plan_action(uuid, text, text, text, uuid, uuid), public.verify_action(uuid), public.execute_action(uuid, boolean, text),
  public.cancel_action(uuid), public.mark_notifications_read(bigint[]), public.save_notification_preferences(boolean, boolean, text[]),
  public.start_phone_verification(text, text), public.confirm_phone_verification(text), public.remove_phone(),
  public.claim_deliveries(text, integer), public.finish_delivery(text, bigint, boolean, text), public.daily_run(text)
from public, anon;

grant execute on function
  public.save_mandate(uuid, uuid, jsonb), public.send_mandate(uuid), public.accept_mandate(uuid, text, text, text),
  public.attach_mandate_document(uuid, text, text), public.verify_mandate(uuid, text, jsonb, text),
  public.revoke_mandate(uuid, text), public.cancel_mandate(uuid),
  public.plan_action(uuid, text, text, text, uuid, uuid), public.verify_action(uuid), public.execute_action(uuid, boolean, text),
  public.cancel_action(uuid), public.mark_notifications_read(bigint[]), public.save_notification_preferences(boolean, boolean, text[]),
  public.start_phone_verification(text, text), public.confirm_phone_verification(text), public.remove_phone(),
  public.claim_deliveries(text, integer), public.finish_delivery(text, bigint, boolean, text), public.daily_run(text)
to authenticated;

-- El envío y la tarea diaria corren sin sesión: solo pasan con la clave de servicio.
grant execute on function public.claim_deliveries(text, integer), public.finish_delivery(text, bigint, boolean, text),
  public.daily_run(text) to anon;

-- ---------------------------------------------------------------------
-- Reversión (solo si fuera necesario):
--   drop trigger if exists case_events_notify on public.case_events;
--   drop trigger if exists approvals_notify on public.approvals;
--   drop trigger if exists charges_notify on public.charges;
--   drop trigger if exists payments_notify on public.payments;
--   drop trigger if exists mandates_notify on public.mandates;
--   drop table if exists public.notification_deliveries, public.notification_preferences, public.notifications,
--     public.case_actions, public.mandates, private.phone_codes cascade;
--   drop sequence if exists public.mandate_folio_seq;
-- ---------------------------------------------------------------------
