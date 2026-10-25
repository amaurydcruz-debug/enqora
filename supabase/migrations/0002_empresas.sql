-- =====================================================================
-- ENQORA · Etapa 2 · Empresas, membresías, roles y aislamiento (RLS)
-- Ejecutar UNA vez en Supabase → SQL Editor → New query → Run.
--
-- Principios:
--   · Cada usuario solo ve las empresas de las que es miembro.
--   · Toda lectura exige sesión con segundo factor (aal2).
--   · Ninguna tabla acepta escrituras directas: todo cambio pasa por
--     funciones que validan permisos y dejan registro de auditoría.
--   · Cambiar permisos o invitar exige haber validado el segundo factor
--     hace menos de 15 minutos (reautenticación).
--   · Registrar un RUT NO concede acceso a datos tributarios.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, supabase_auth_admin;

-- ---------------------------------------------------------------------
-- 1. Tablas
-- ---------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text check (char_length(full_name) <= 120),
  created_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  rut text not null,
  legal_name text not null check (char_length(legal_name) between 2 and 160),
  trade_name text check (char_length(trade_name) <= 120),
  activity text check (char_length(activity) <= 200),
  tax_regime text not null default 'por_definir' check (
    tax_regime in ('pro_pyme_general', 'pro_pyme_transparente', 'general_semi_integrado',
                   'renta_presunta', 'otro', 'por_definir')
  ),
  rut_verified boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index companies_rut_idx on public.companies (rut);

create table public.company_members (
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'accountant', 'viewer')),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);
create index company_members_user_idx on public.company_members (user_id);

create table public.company_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'),
  role text not null check (role in ('admin', 'accountant', 'viewer')),
  token_hash text not null unique,
  expires_at timestamptz not null default now() + interval '7 days',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz
);
create index company_invitations_company_idx on public.company_invitations (company_id);

create table public.audit_events (
  id bigint generated always as identity primary key,
  company_id uuid references public.companies (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  target text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_company_idx on public.audit_events (company_id, created_at desc);

-- ---------------------------------------------------------------------
-- 2. Funciones internas (esquema private, no expuesto por la API)
-- ---------------------------------------------------------------------

-- Sesión con segundo factor verificado.
create or replace function private.is_mfa() returns boolean
language sql stable set search_path = '' as $$
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
$$;

-- Segundo factor validado hace menos de p_minutes minutos (reautenticación).
create or replace function private.recent_mfa(p_minutes int default 15) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1
    from jsonb_array_elements(coalesce((select auth.jwt()) -> 'amr', '[]'::jsonb)) as e
    where e ->> 'method' = 'totp'
      and to_timestamp((e ->> 'timestamp')::bigint) > now() - make_interval(mins => p_minutes)
  )
$$;

create or replace function private.is_member(p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.company_members m
    where m.company_id = p_company and m.user_id = (select auth.uid())
  )
$$;

create or replace function private.member_role(p_company uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.company_members m
  where m.company_id = p_company and m.user_id = (select auth.uid())
$$;

create or replace function private.has_role(p_company uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.member_role(p_company) = any (p_roles), false)
$$;

-- ¿El usuario actual comparte alguna empresa con p_user?
create or replace function private.shares_company(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.company_members a
    join public.company_members b on b.company_id = a.company_id
    where a.user_id = (select auth.uid()) and b.user_id = p_user
  )
$$;

-- Normaliza un RUT a 12345678-K (sin puntos). Devuelve null si el formato no es válido.
create or replace function private.normalize_rut(p_rut text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  v text := upper(regexp_replace(coalesce(p_rut, ''), '[^0-9kK]', '', 'g'));
begin
  if length(v) < 8 or length(v) > 9 or substr(v, 1, length(v) - 1) !~ '^[0-9]+$' then
    return null;
  end if;
  return ltrim(substr(v, 1, length(v) - 1), '0') || '-' || right(v, 1);
end
$$;

-- Valida el dígito verificador (módulo 11).
create or replace function private.rut_is_valid(p_rut text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  body text;
  dv text;
  s int := 0;
  m int := 2;
  i int;
  r int;
begin
  if p_rut is null or p_rut !~ '^[1-9][0-9]{6,7}-[0-9K]$' then
    return false;
  end if;
  body := split_part(p_rut, '-', 1);
  dv := split_part(p_rut, '-', 2);
  for i in reverse length(body) .. 1 loop
    s := s + substr(body, i, 1)::int * m;
    m := case when m = 7 then 2 else m + 1 end;
  end loop;
  r := 11 - (s % 11);
  return dv = case r when 11 then '0' when 10 then 'K' else r::text end;
end
$$;

alter table public.companies add constraint companies_rut_valid check (private.rut_is_valid(rut));

create or replace function private.log_event(
  p_company uuid, p_action text, p_target text default null, p_metadata jsonb default '{}'::jsonb
) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_events (company_id, actor_id, action, target, metadata)
  values (p_company, (select auth.uid()), p_action, p_target, coalesce(p_metadata, '{}'::jsonb))
$$;

-- Comprobación común al inicio de cada operación.
create or replace function private.require_session(p_reauth boolean default false) returns uuid
language plpgsql stable set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'ENQ_AUTH'; end if;
  if not private.is_mfa() then raise exception 'ENQ_MFA'; end if;
  if p_reauth and not private.recent_mfa(15) then raise exception 'ENQ_REAUTH'; end if;
  return v_uid;
end
$$;

-- Cantidad de propietarios de una empresa.
create or replace function private.owner_count(p_company uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.company_members where company_id = p_company and role = 'owner'
$$;

-- ---------------------------------------------------------------------
-- 3. Perfiles: se crean y actualizan automáticamente desde Auth
-- ---------------------------------------------------------------------

create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email) values (new.id, lower(coalesce(new.email, '')))
  on conflict (id) do update set email = excluded.email;
  return new;
end
$$;

create trigger enqora_on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create trigger enqora_on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function private.handle_new_user();

insert into public.profiles (id, email)
select id, lower(coalesce(email, '')) from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 4. Seguridad a nivel de fila (RLS)
-- ---------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.company_invitations enable row level security;
alter table public.audit_events enable row level security;

-- Solo lectura desde la API; las escrituras pasan por las funciones de la sección 5.
revoke all on public.profiles, public.companies, public.company_members,
              public.company_invitations, public.audit_events from anon, authenticated;
grant select on public.profiles, public.companies, public.company_members,
               public.company_invitations, public.audit_events to authenticated;

-- Política restrictiva: sin segundo factor no se lee nada.
create policy mfa_requerido on public.profiles as restrictive for all to authenticated
  using (private.is_mfa()) with check (private.is_mfa());
create policy mfa_requerido on public.companies as restrictive for all to authenticated
  using (private.is_mfa()) with check (private.is_mfa());
create policy mfa_requerido on public.company_members as restrictive for all to authenticated
  using (private.is_mfa()) with check (private.is_mfa());
create policy mfa_requerido on public.company_invitations as restrictive for all to authenticated
  using (private.is_mfa()) with check (private.is_mfa());
create policy mfa_requerido on public.audit_events as restrictive for all to authenticated
  using (private.is_mfa()) with check (private.is_mfa());

create policy perfil_propio_o_colegas on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_company(id));

create policy miembros_leen_su_empresa on public.companies for select to authenticated
  using (private.is_member(id));

create policy miembros_leen_miembros on public.company_members for select to authenticated
  using (private.is_member(company_id));

create policy admins_leen_invitaciones on public.company_invitations for select to authenticated
  using (private.has_role(company_id, array['owner', 'admin']));

create policy admins_leen_auditoria on public.audit_events for select to authenticated
  using (private.has_role(company_id, array['owner', 'admin']));

-- ---------------------------------------------------------------------
-- 5. Operaciones (RPC) — validan permisos y registran auditoría
-- ---------------------------------------------------------------------

create or replace function public.create_company(
  p_rut text, p_legal_name text, p_trade_name text default null,
  p_activity text default null, p_tax_regime text default 'por_definir'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_rut text := private.normalize_rut(p_rut);
  v_id uuid;
begin
  if not private.rut_is_valid(v_rut) then raise exception 'ENQ_RUT_INVALIDO'; end if;
  if char_length(trim(coalesce(p_legal_name, ''))) < 2 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if (select count(*) from public.company_members where user_id = v_uid and role = 'owner') >= 25 then
    raise exception 'ENQ_LIMITE_EMPRESAS';
  end if;
  if exists (
    select 1 from public.company_members m join public.companies c on c.id = m.company_id
    where m.user_id = v_uid and c.rut = v_rut
  ) then
    raise exception 'ENQ_EMPRESA_DUPLICADA';
  end if;

  insert into public.companies (rut, legal_name, trade_name, activity, tax_regime, created_by)
  values (v_rut, trim(p_legal_name), nullif(trim(coalesce(p_trade_name, '')), ''),
          nullif(trim(coalesce(p_activity, '')), ''), coalesce(nullif(p_tax_regime, ''), 'por_definir'), v_uid)
  returning id into v_id;

  insert into public.company_members (company_id, user_id, role) values (v_id, v_uid, 'owner');
  perform private.log_event(v_id, 'empresa.creada', v_rut);
  return v_id;
end
$$;

create or replace function public.update_company(
  p_company uuid, p_legal_name text, p_trade_name text default null,
  p_activity text default null, p_tax_regime text default 'por_definir'
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_session();
  if not private.has_role(p_company, array['owner', 'admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if char_length(trim(coalesce(p_legal_name, ''))) < 2 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;

  update public.companies set
    legal_name = trim(p_legal_name),
    trade_name = nullif(trim(coalesce(p_trade_name, '')), ''),
    activity = nullif(trim(coalesce(p_activity, '')), ''),
    tax_regime = coalesce(nullif(p_tax_regime, ''), 'por_definir'),
    updated_at = now()
  where id = p_company;

  perform private.log_event(p_company, 'empresa.actualizada');
end
$$;

create or replace function public.create_invitation(p_company uuid, p_email text, p_role text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
  v_my_role text := private.member_role(p_company);
  v_email text := lower(trim(coalesce(p_email, '')));
  v_token text;
begin
  if v_my_role is null or v_my_role not in ('owner', 'admin') then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_role not in ('admin', 'accountant', 'viewer') then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if p_role = 'admin' and v_my_role <> 'owner' then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if exists (
    select 1 from public.company_members m join public.profiles p on p.id = m.user_id
    where m.company_id = p_company and p.email = v_email
  ) then
    raise exception 'ENQ_YA_MIEMBRO';
  end if;

  -- Una sola invitación vigente por correo y empresa.
  update public.company_invitations set revoked_at = now()
  where company_id = p_company and email = v_email and accepted_at is null and revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.company_invitations (company_id, email, role, token_hash, created_by)
  values (p_company, v_email, p_role, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_uid);

  perform private.log_event(p_company, 'invitacion.creada', v_email, jsonb_build_object('rol', p_role));
  return v_token;
end
$$;

create or replace function public.revoke_invitation(p_invitation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.company_invitations;
begin
  perform private.require_session();
  select * into v_inv from public.company_invitations where id = p_invitation;
  if not found or not private.has_role(v_inv.company_id, array['owner', 'admin']) then
    raise exception 'ENQ_SIN_PERMISO';
  end if;
  update public.company_invitations set revoked_at = now()
  where id = p_invitation and accepted_at is null and revoked_at is null;
  perform private.log_event(v_inv.company_id, 'invitacion.revocada', v_inv.email);
end
$$;

-- Vista previa de una invitación (antes de aceptarla). No revela datos si el correo no coincide.
create or replace function public.invitation_preview(p_token text)
returns table (status text, company_name text, role text, invited_email text)
language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.company_invitations;
  v_email text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
begin
  perform private.require_session();
  select * into v_inv from public.company_invitations
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');

  if not found or v_inv.revoked_at is not null then
    return query select 'invalida'::text, null::text, null::text, null::text; return;
  end if;
  if v_inv.accepted_at is not null then
    return query select 'usada'::text, null::text, null::text, null::text; return;
  end if;
  if v_inv.expires_at < now() then
    return query select 'expirada'::text, null::text, null::text, null::text; return;
  end if;
  if v_inv.email <> v_email then
    return query select 'otro_correo'::text, null::text, null::text,
      (left(v_inv.email, 2) || '•••@' || split_part(v_inv.email, '@', 2))::text;
    return;
  end if;
  return query
    select 'valida'::text, c.legal_name, v_inv.role, v_inv.email
    from public.companies c where c.id = v_inv.company_id;
end
$$;

create or replace function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_email text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
  v_inv public.company_invitations;
begin
  select * into v_inv from public.company_invitations
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
  for update;

  if not found or v_inv.revoked_at is not null or v_inv.accepted_at is not null or v_inv.expires_at < now() then
    raise exception 'ENQ_INVITACION_INVALIDA';
  end if;
  if v_inv.email <> v_email then raise exception 'ENQ_INVITACION_OTRO_CORREO'; end if;

  insert into public.company_members (company_id, user_id, role, invited_by)
  values (v_inv.company_id, v_uid, v_inv.role, v_inv.created_by)
  on conflict (company_id, user_id) do nothing;

  update public.company_invitations set accepted_at = now(), accepted_by = v_uid where id = v_inv.id;
  perform private.log_event(v_inv.company_id, 'invitacion.aceptada', v_email, jsonb_build_object('rol', v_inv.role));
  return v_inv.company_id;
end
$$;

create or replace function public.change_member_role(p_company uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
  v_my_role text := private.member_role(p_company);
  v_target_role text;
begin
  if p_role not in ('owner', 'admin', 'accountant', 'viewer') then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  select role into v_target_role from public.company_members where company_id = p_company and user_id = p_user;
  if v_target_role is null then raise exception 'ENQ_MIEMBRO_NO_EXISTE'; end if;

  if v_my_role = 'owner' then
    null; -- el propietario puede asignar cualquier rol
  elsif v_my_role = 'admin' then
    if v_target_role in ('owner', 'admin') or p_role in ('owner', 'admin') then raise exception 'ENQ_SIN_PERMISO'; end if;
  else
    raise exception 'ENQ_SIN_PERMISO';
  end if;

  if v_target_role = 'owner' and p_role <> 'owner' and private.owner_count(p_company) <= 1 then
    raise exception 'ENQ_ULTIMO_PROPIETARIO';
  end if;

  update public.company_members set role = p_role where company_id = p_company and user_id = p_user;
  perform private.log_event(p_company, 'miembro.rol_cambiado', p_user::text,
    jsonb_build_object('de', v_target_role, 'a', p_role));
end
$$;

create or replace function public.remove_member(p_company uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(p_user <> (select auth.uid()));
  v_my_role text := private.member_role(p_company);
  v_target_role text;
begin
  select role into v_target_role from public.company_members where company_id = p_company and user_id = p_user;
  if v_target_role is null or v_my_role is null then raise exception 'ENQ_MIEMBRO_NO_EXISTE'; end if;

  if p_user <> v_uid then
    if v_my_role = 'admin' and v_target_role in ('owner', 'admin') then raise exception 'ENQ_SIN_PERMISO'; end if;
    if v_my_role not in ('owner', 'admin') then raise exception 'ENQ_SIN_PERMISO'; end if;
  end if;

  if v_target_role = 'owner' and private.owner_count(p_company) <= 1 then
    raise exception 'ENQ_ULTIMO_PROPIETARIO';
  end if;

  delete from public.company_members where company_id = p_company and user_id = p_user;
  perform private.log_event(p_company,
    case when p_user = v_uid then 'miembro.salio' else 'miembro.eliminado' end, p_user::text,
    jsonb_build_object('rol', v_target_role));
end
$$;

create or replace function public.update_my_profile(p_full_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
begin
  if char_length(coalesce(p_full_name, '')) > 120 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  update public.profiles set full_name = nullif(trim(p_full_name), '') where id = v_uid;
end
$$;

-- ---------------------------------------------------------------------
-- 6. Permisos de ejecución
-- ---------------------------------------------------------------------

revoke execute on all functions in schema private from public, anon;
grant execute on function
  private.is_mfa(), private.recent_mfa(int), private.is_member(uuid), private.member_role(uuid),
  private.has_role(uuid, text[]), private.shares_company(uuid), private.rut_is_valid(text)
to authenticated;

revoke execute on function
  public.create_company(text, text, text, text, text),
  public.update_company(uuid, text, text, text, text),
  public.create_invitation(uuid, text, text),
  public.revoke_invitation(uuid),
  public.invitation_preview(text),
  public.accept_invitation(text),
  public.change_member_role(uuid, uuid, text),
  public.remove_member(uuid, uuid),
  public.update_my_profile(text)
from public, anon;

grant execute on function
  public.create_company(text, text, text, text, text),
  public.update_company(uuid, text, text, text, text),
  public.create_invitation(uuid, text, text),
  public.revoke_invitation(uuid),
  public.invitation_preview(text),
  public.accept_invitation(text),
  public.change_member_role(uuid, uuid, text),
  public.remove_member(uuid, uuid),
  public.update_my_profile(text)
to authenticated;
