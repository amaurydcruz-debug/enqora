-- =====================================================================
-- ENQORA · Acceso del equipo por pase de jornada
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0021_autoarranque_conector.sql.
--
-- • El equipo no se registra en la página pública: el Administrador genera, desde el Centro de
--   Mando, un enlace personal para cada persona que trabajará ese día.
-- • Cada enlace es de un solo uso, está ligado a un correo y solo sirve dentro del horario de la
--   jornada (por defecto 10:00 a 18:00, hora de Chile). Al usarlo, la persona tiene acceso al equipo
--   hasta el fin de esa jornada; después necesita un enlace nuevo.
-- • Administradores y coadministradores (mismo rol, mismas facultades) no necesitan pase.
-- • La seguridad de la cuenta no cambia: contraseña + segundo factor.
-- =====================================================================

-- 1. Acceso con vencimiento
alter table public.staff_members add column if not exists access_until timestamptz;

-- Rol vigente: Administradores (y coadministradores) y agentes IA siempre; el resto solo con pase vigente.
create or replace function private.staff_role() returns text
language sql stable security definer set search_path = '' as $$
  select s.role from public.staff_members s
  where s.user_id = (select auth.uid()) and s.active
    and (s.role in ('enqora_admin', 'ai_agent') or s.access_until > now())
$$;

-- 2. Horario de la jornada (editable: cambia estas dos horas si el horario cambia)
create or replace function private.shift_window(p_day date, out starts_at timestamptz, out ends_at timestamptz)
language sql stable set search_path = '' as $$
  select (p_day + time '10:00') at time zone 'America/Santiago',
         (p_day + time '18:00') at time zone 'America/Santiago'
$$;

-- 3. Pases de jornada
create table if not exists public.team_passes (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'),
  role text not null check (role in ('ops_director', 'accountant_pro', 'lawyer_pro', 'field_agent')),
  work_day date not null,
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  token_hash text not null unique,
  note text check (char_length(note) <= 200),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz
);
create index if not exists team_passes_day_idx on public.team_passes (work_day desc, created_at desc);
create index if not exists team_passes_created_by_idx on public.team_passes (created_by);
create index if not exists team_passes_used_by_idx on public.team_passes (used_by);

alter table public.team_passes enable row level security;
revoke all on public.team_passes from anon, authenticated;
grant select on public.team_passes to authenticated;
drop policy if exists mfa_requerido on public.team_passes;
drop policy if exists pases_admin on public.team_passes;
create policy mfa_requerido on public.team_passes as restrictive for all to authenticated
  using (private.is_mfa()) with check (private.is_mfa());
create policy pases_admin on public.team_passes for select to authenticated using (private.is_staff(array['enqora_admin']));

-- Genera el enlace (se muestra una sola vez; se guarda solo su hash).
create or replace function public.create_team_pass(p_email text, p_role text, p_day date default null, p_note text default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_email text := lower(trim(coalesce(p_email, '')));
  v_day date := coalesce(p_day, private.today_cl());
  v_win record;
  v_token text;
  v_existing text;
begin
  if not private.is_staff(array['enqora_admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if v_day < private.today_cl() or v_day > private.today_cl() + 7 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  select * into v_win from private.shift_window(v_day);
  if v_win.ends_at <= now() then raise exception 'ENQ_FUERA_DE_HORARIO'; end if;

  -- Un Administrador no necesita pase; su rol no se cambia desde aquí.
  select s.role into v_existing from public.staff_members s join public.profiles p on p.id = s.user_id
  where p.email = v_email and s.active;
  if v_existing = 'enqora_admin' then raise exception 'ENQ_YA_MIEMBRO'; end if;
  if p_role not in ('ops_director', 'accountant_pro', 'lawyer_pro', 'field_agent') then raise exception 'ENQ_DATOS_INVALIDOS'; end if;

  -- Un solo pase vigente por persona y jornada.
  update public.team_passes set revoked_at = now()
  where email = v_email and work_day = v_day and used_at is null and revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.team_passes (email, role, work_day, valid_from, valid_until, token_hash, note, created_by)
  values (v_email, p_role, v_day, v_win.starts_at, v_win.ends_at, encode(extensions.digest(v_token, 'sha256'), 'hex'),
          left(nullif(trim(coalesce(p_note, '')), ''), 200), v_uid);
  return v_token;
end
$$;

-- Vista previa del enlace (sin sesión): estado, correo y horario. No revela nada más.
create or replace function public.team_pass_preview(p_token text)
returns table (status text, email text, role text, valid_from timestamptz, valid_until timestamptz, has_account boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  v public.team_passes;
begin
  select * into v from public.team_passes where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if not found or v.revoked_at is not null then
    return query select 'invalido'::text, null::text, null::text, null::timestamptz, null::timestamptz, null::boolean;
    return;
  end if;
  return query select
    case when v.used_at is not null then 'usado'
         when now() < v.valid_from then 'aun_no'
         when now() >= v.valid_until then 'vencido'
         else 'valido' end,
    v.email, v.role, v.valid_from, v.valid_until,
    exists (select 1 from public.profiles p where p.email = v.email);
end
$$;

-- Usa el pase: solo la cuenta del correo invitado, con segundo factor y dentro del horario.
create or replace function public.accept_team_pass(p_token text) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_email text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
  v public.team_passes;
begin
  if not private.is_mfa() then raise exception 'ENQ_MFA'; end if;
  select * into v from public.team_passes
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') for update;
  if not found or v.revoked_at is not null or v.used_at is not null then raise exception 'ENQ_INVITACION_INVALIDA'; end if;
  if now() < v.valid_from or now() >= v.valid_until then raise exception 'ENQ_FUERA_DE_HORARIO'; end if;
  if v.email <> v_email then raise exception 'ENQ_INVITACION_OTRO_CORREO'; end if;
  if exists (select 1 from public.staff_members where user_id = v_uid and role = 'enqora_admin' and active) then
    raise exception 'ENQ_YA_MIEMBRO';
  end if;

  insert into public.staff_members (user_id, role, created_by, access_until)
  values (v_uid, v.role, v.created_by, v.valid_until)
  on conflict (user_id) do update set role = excluded.role, active = true, access_until = excluded.access_until, updated_at = now();
  update public.team_passes set used_at = now(), used_by = v_uid where id = v.id;
  return v.valid_until;
end
$$;

create or replace function public.revoke_team_pass(p_pass uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_session();
  if not private.is_staff(array['enqora_admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  update public.team_passes set revoked_at = now() where id = p_pass and used_at is null and revoked_at is null;
  if not found then raise exception 'ENQ_YA_DECIDIDA'; end if;
end
$$;

-- Corta el acceso de hoy de una persona del equipo (no a Administradores).
create or replace function public.end_staff_access(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_session();
  if not private.is_staff(array['enqora_admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  update public.staff_members set access_until = now(), updated_at = now()
  where user_id = p_user and role <> 'enqora_admin';
  if not found then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
end
$$;

-- 4. Coadministradores: un Administrador designa a otra cuenta existente con las mismas facultades.
--    (Mismo rol «enqora_admin». Pide confirmar identidad. Para retirarlo: set_staff_role(correo, null).)
create or replace function public.designate_coadmin(p_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
  v_target uuid;
begin
  if not private.is_staff(array['enqora_admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  select id into v_target from public.profiles where email = lower(trim(coalesce(p_email, '')));
  if v_target is null then raise exception 'ENQ_USUARIO_NO_EXISTE'; end if;
  insert into public.staff_members (user_id, role, created_by) values (v_target, 'enqora_admin', v_uid)
  on conflict (user_id) do update set role = 'enqora_admin', active = true, access_until = null, updated_at = now();
end
$$;

-- Lista del equipo para el Administrador (con correo, rol y acceso de hoy).
create or replace function public.team_overview()
returns table (user_id uuid, email text, full_name text, role text, active boolean, access_until timestamptz, has_access boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_session();
  if not private.is_staff(array['enqora_admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  return query
    select s.user_id, p.email, p.full_name, s.role, s.active, s.access_until,
           s.active and (s.role in ('enqora_admin', 'ai_agent') or coalesce(s.access_until > now(), false))
    from public.staff_members s left join public.profiles p on p.id = s.user_id
    order by (s.role = 'enqora_admin') desc, p.email;
end
$$;

-- 5. Permisos
revoke execute on function private.shift_window(date) from public, anon;
revoke execute on function
  public.create_team_pass(text, text, date, text), public.team_pass_preview(text), public.accept_team_pass(text),
  public.revoke_team_pass(uuid), public.end_staff_access(uuid), public.designate_coadmin(text), public.team_overview()
from public, anon;
grant execute on function public.team_pass_preview(text) to anon, authenticated;
grant execute on function
  public.create_team_pass(text, text, date, text), public.accept_team_pass(text), public.revoke_team_pass(uuid),
  public.end_staff_access(uuid), public.designate_coadmin(text), public.team_overview()
to authenticated;

-- Reversión (solo si fuera necesario):
--   create or replace function private.staff_role() ... (versión de 0004, sin access_until)
--   drop function if exists public.create_team_pass, public.team_pass_preview, public.accept_team_pass,
--     public.revoke_team_pass, public.end_staff_access, public.designate_coadmin, public.team_overview, private.shift_window;
--   drop table if exists public.team_passes;
