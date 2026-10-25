-- =====================================================================
-- ENQORA · Etapa 3 · Shield y Sentinel
-- Sesiones, dispositivos conocidos, registro de seguridad y alertas.
-- Requiere 0002_empresas.sql. Ejecutar UNA vez en Supabase → SQL Editor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tablas
-- ---------------------------------------------------------------------

-- Dispositivos desde los que el usuario ha ingresado. Se identifican por un
-- código aleatorio guardado en una cookie del navegador; aquí solo se guarda su huella.
create table public.known_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  device_hash text not null,
  label text not null check (char_length(label) <= 120),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  last_ip text check (char_length(last_ip) <= 64),
  unique (user_id, device_hash)
);

-- Registro de seguridad personal (Sentinel). Solo el propio usuario lo ve.
create table public.security_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  event text not null check (event in (
    'ingreso', 'nuevo_dispositivo', 'mfa_activado', 'clave_cambiada', 'clave_restablecida',
    'sesion_cerrada', 'sesiones_cerradas', 'dispositivo_olvidado'
  )),
  ip text check (char_length(ip) <= 64),
  user_agent text check (char_length(user_agent) <= 400),
  device_id uuid references public.known_devices (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);
create index security_events_user_idx on public.security_events (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- 2. RLS: cada usuario solo ve lo suyo, con segundo factor
-- ---------------------------------------------------------------------

alter table public.known_devices enable row level security;
alter table public.security_events enable row level security;

revoke all on public.known_devices, public.security_events from anon, authenticated;
grant select on public.known_devices, public.security_events to authenticated;

create policy mfa_requerido on public.known_devices as restrictive for all to authenticated
  using (private.is_mfa()) with check (private.is_mfa());
create policy mfa_requerido on public.security_events as restrictive for all to authenticated
  using (private.is_mfa()) with check (private.is_mfa());

create policy dispositivos_propios on public.known_devices for select to authenticated
  using (user_id = (select auth.uid()));
create policy eventos_propios on public.security_events for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 3. Funciones
-- ---------------------------------------------------------------------

create or replace function private.current_session_id() returns uuid
language sql stable set search_path = '' as $$
  select nullif((select auth.jwt()) ->> 'session_id', '')::uuid
$$;

-- Registra un ingreso completo (contraseña + segundo factor) y detecta dispositivos nuevos.
-- Devuelve true si el dispositivo es nuevo y el usuario ya tenía otros (motivo de alerta).
create or replace function public.register_login(
  p_device_token text, p_ip text default null, p_user_agent text default null, p_label text default null
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_hash text;
  v_device uuid;
  v_had_devices boolean;
  v_is_new boolean := false;
begin
  if coalesce(p_device_token, '') !~ '^[0-9a-f]{32,64}$' then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  v_hash := encode(extensions.digest(p_device_token, 'sha256'), 'hex');

  select id into v_device from public.known_devices where user_id = v_uid and device_hash = v_hash;

  if v_device is null then
    select exists (select 1 from public.known_devices where user_id = v_uid) into v_had_devices;
    insert into public.known_devices (user_id, device_hash, label, last_ip)
    values (v_uid, v_hash, coalesce(nullif(left(p_label, 120), ''), 'Dispositivo'), left(p_ip, 64))
    returning id into v_device;
    v_is_new := v_had_devices;
  else
    update public.known_devices
    set last_seen = now(), last_ip = left(p_ip, 64), label = coalesce(nullif(left(p_label, 120), ''), label)
    where id = v_device;
  end if;

  insert into public.security_events (user_id, event, ip, user_agent, device_id)
  values (v_uid, case when v_is_new then 'nuevo_dispositivo' else 'ingreso' end,
          left(p_ip, 64), left(p_user_agent, 400), v_device);

  return v_is_new;
end
$$;

-- Registra otros eventos de seguridad del propio usuario.
-- No exige segundo factor: también se usa al restablecer la contraseña.
create or replace function public.log_security_event(
  p_event text, p_ip text default null, p_user_agent text default null, p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'ENQ_AUTH'; end if;
  if p_event not in ('mfa_activado', 'clave_cambiada', 'clave_restablecida', 'sesiones_cerradas') then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  insert into public.security_events (user_id, event, ip, user_agent, metadata)
  values (v_uid, p_event, left(p_ip, 64), left(p_user_agent, 400), coalesce(p_metadata, '{}'::jsonb));
end
$$;

-- Marca como revisadas las alertas de dispositivo nuevo.
create or replace function public.acknowledge_security_alerts() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
begin
  update public.security_events set acknowledged_at = now()
  where user_id = v_uid and event = 'nuevo_dispositivo' and acknowledged_at is null;
end
$$;

-- Olvidar un dispositivo: el próximo ingreso desde él generará una alerta.
create or replace function public.forget_device(p_device uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
  v_label text;
begin
  delete from public.known_devices where id = p_device and user_id = v_uid returning label into v_label;
  if v_label is null then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  insert into public.security_events (user_id, event, metadata)
  values (v_uid, 'dispositivo_olvidado', jsonb_build_object('dispositivo', v_label));
end
$$;

-- Sesiones abiertas del usuario actual (lectura de auth.sessions, solo las propias).
create or replace function public.my_sessions()
returns table (
  id uuid, created_at timestamptz, last_active timestamptz, user_agent text, ip text, aal text, is_current boolean
)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
begin
  return query
  select s.id,
         s.created_at,
         greatest(s.created_at, s.updated_at, s.refreshed_at::timestamptz),
         left(s.user_agent, 400),
         host(s.ip),
         s.aal::text,
         s.id = private.current_session_id()
  from auth.sessions s
  where s.user_id = v_uid and (s.not_after is null or s.not_after > now())
  order by 3 desc nulls last
  limit 50;
end
$$;

-- Cerrar una sesión concreta (otro dispositivo). Exige reautenticación reciente.
create or replace function public.revoke_session(p_session uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
  v_ua text;
begin
  if p_session = private.current_session_id() then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  delete from auth.sessions where id = p_session and user_id = v_uid returning user_agent into v_ua;
  if not found then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  insert into public.security_events (user_id, event, user_agent)
  values (v_uid, 'sesion_cerrada', left(v_ua, 400));
end
$$;

-- Cerrar todas las demás sesiones. Exige reautenticación reciente.
create or replace function public.revoke_other_sessions() returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
  v_count int;
begin
  delete from auth.sessions
  where user_id = v_uid and id is distinct from private.current_session_id();
  get diagnostics v_count = row_count;
  insert into public.security_events (user_id, event, metadata)
  values (v_uid, 'sesiones_cerradas', jsonb_build_object('cantidad', v_count));
  return v_count;
end
$$;

-- ---------------------------------------------------------------------
-- 4. Permisos de ejecución
-- ---------------------------------------------------------------------

revoke execute on function private.current_session_id() from public, anon;
grant execute on function private.current_session_id() to authenticated;

revoke execute on function
  public.register_login(text, text, text, text),
  public.log_security_event(text, text, text, jsonb),
  public.acknowledge_security_alerts(),
  public.forget_device(uuid),
  public.my_sessions(),
  public.revoke_session(uuid),
  public.revoke_other_sessions()
from public, anon;

grant execute on function
  public.register_login(text, text, text, text),
  public.log_security_event(text, text, text, jsonb),
  public.acknowledge_security_alerts(),
  public.forget_device(uuid),
  public.my_sessions(),
  public.revoke_session(uuid),
  public.revoke_other_sessions()
to authenticated;
