-- =====================================================================
-- ENQORA · 0044 · Consentimientos con evidencia y derechos sobre datos personales
-- 1) Al registrarse, la persona acepta los Términos y la Política de privacidad. Antes solo se verificaba la
--    casilla; ahora queda un registro inalterable de QUÉ versión aceptó y CUÁNDO (lo escribe la base al crear
--    la cuenta, desde los datos del registro).
-- 2) Derechos del titular (Ley 19.628 modificada por la Ley 21.719, vigente desde el 01-12-2026): acceso,
--    rectificación, supresión, oposición, portabilidad y bloqueo. La persona los pide desde «Seguridad»; el
--    equipo los atiende desde el Centro de Mando con plazo de 30 días corridos, prorrogable una vez por 30 más
--    (plazo por confirmar con el estudio jurídico).
-- Se puede ejecutar más de una vez.
-- =====================================================================

-- ---------- 1. Consentimientos ----------
create table if not exists private.consentimientos (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  documento text not null check (documento in ('terminos', 'privacidad')),
  version text not null,
  aceptado_at timestamptz not null default now(),
  origen text not null default 'registro'
);
create index if not exists consentimientos_user_idx on private.consentimientos (user_id, aceptado_at desc);
alter table private.consentimientos enable row level security;

create or replace function private.on_auth_user_consent() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'terminos_version', '') <> '' then
    insert into private.consentimientos (user_id, documento, version, origen)
    values (new.id, 'terminos', left(new.raw_user_meta_data ->> 'terminos_version', 40), 'registro');
  end if;
  if coalesce(new.raw_user_meta_data ->> 'privacidad_version', '') <> '' then
    insert into private.consentimientos (user_id, documento, version, origen)
    values (new.id, 'privacidad', left(new.raw_user_meta_data ->> 'privacidad_version', 40), 'registro');
  end if;
  return new;
end
$$;
drop trigger if exists auth_user_consent on auth.users;
create trigger auth_user_consent after insert on auth.users
  for each row execute function private.on_auth_user_consent();

create or replace function public.mis_consentimientos() returns table (documento text, version text, aceptado_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.documento, c.version, c.aceptado_at from private.consentimientos c
  where c.user_id = auth.uid() order by c.aceptado_at desc
$$;

-- Avisos de la cuenta (datos personales, seguridad): nueva categoría de notificación.
alter table public.notifications drop constraint if exists notifications_category_check;
alter table public.notifications add constraint notifications_category_check
  check (category in ('casos', 'cotizaciones', 'pagos', 'mandatos', 'equipo', 'cuenta'));

-- ---------- 2. Derechos del titular ----------
create table if not exists public.data_rights_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('acceso', 'rectificacion', 'supresion', 'oposicion', 'portabilidad', 'bloqueo')),
  detalle text check (char_length(detalle) <= 2000),
  estado text not null default 'recibida' check (estado in ('recibida', 'en_curso', 'respondida', 'rechazada')),
  vence date not null default ((now() at time zone 'America/Santiago')::date + 30),
  prorrogada boolean not null default false,
  respuesta text check (char_length(respuesta) <= 4000),
  atendida_por uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists data_rights_user_idx on public.data_rights_requests (user_id, created_at desc);
create index if not exists data_rights_open_idx on public.data_rights_requests (vence) where estado in ('recibida', 'en_curso');
alter table public.data_rights_requests enable row level security;
revoke all on public.data_rights_requests from anon, authenticated;
grant select on public.data_rights_requests to authenticated;
drop policy if exists mfa_requerido on public.data_rights_requests;
create policy mfa_requerido on public.data_rights_requests as restrictive for all to authenticated using (private.is_mfa()) with check (private.is_mfa());
drop policy if exists data_rights_select on public.data_rights_requests;
create policy data_rights_select on public.data_rights_requests for select to authenticated
  using (user_id = auth.uid() or private.is_staff());

create or replace function public.solicitar_derecho_datos(p_tipo text, p_detalle text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_id uuid;
begin
  if (select count(*) from public.data_rights_requests where user_id = v_uid and created_at > now() - interval '1 day') >= 5 then
    raise exception 'ENQ_DEMASIADAS_CONSULTAS';
  end if;
  insert into public.data_rights_requests (user_id, tipo, detalle) values (v_uid, p_tipo, nullif(left(btrim(coalesce(p_detalle, '')), 2000), ''))
  returning id into v_id;
  perform private.notify(
    (select array_agg(s.user_id) from public.staff_members s where s.active and s.role in ('enqora_admin', 'ops_director', 'lawyer_pro')),
    null, null, 'equipo', 'Solicitud de derechos sobre datos: ' || p_tipo,
    'Plazo legal: 30 días corridos (vence el ' || to_char((now() at time zone 'America/Santiago')::date + 30, 'DD-MM-YYYY') || ').',
    '/mando/derechos', 'derechos-' || v_id);
  return v_id;
end
$$;

create or replace function public.responder_derecho_datos(p_id uuid, p_estado text, p_respuesta text, p_prorrogar boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
  v_r public.data_rights_requests;
begin
  if not private.is_staff(array['enqora_admin', 'ops_director', 'lawyer_pro']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  select * into v_r from public.data_rights_requests where id = p_id for update;
  if not found then raise exception 'ENQ_NO_ENCONTRADO'; end if;
  if p_estado not in ('en_curso', 'respondida', 'rechazada') then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if p_estado in ('respondida', 'rechazada') and char_length(btrim(coalesce(p_respuesta, ''))) < 20 then raise exception 'ENQ_FALTA_OBSERVACION'; end if;
  if p_prorrogar and v_r.prorrogada then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  update public.data_rights_requests set estado = p_estado, respuesta = nullif(btrim(coalesce(p_respuesta, '')), ''),
    vence = case when p_prorrogar then vence + 30 else vence end, prorrogada = prorrogada or p_prorrogar,
    atendida_por = v_uid, updated_at = now()
  where id = p_id;
  perform private.notify(array[v_r.user_id], null, null, 'cuenta',
    case p_estado when 'respondida' then 'Respondimos tu solicitud sobre tus datos' when 'rechazada' then 'Tu solicitud sobre tus datos fue resuelta'
      else case when p_prorrogar then 'Ampliamos el plazo de tu solicitud sobre tus datos' else 'Estamos atendiendo tu solicitud sobre tus datos' end end,
    'Revisa el detalle en Seguridad → Tus datos personales.', '/seguridad#datos', 'derechos-r-' || p_id || '-' || p_estado);
end
$$;

revoke execute on function public.mis_consentimientos(), public.solicitar_derecho_datos(text, text), public.responder_derecho_datos(uuid, text, text, boolean) from public;
grant execute on function public.mis_consentimientos(), public.solicitar_derecho_datos(text, text), public.responder_derecho_datos(uuid, text, text, boolean) to authenticated;
