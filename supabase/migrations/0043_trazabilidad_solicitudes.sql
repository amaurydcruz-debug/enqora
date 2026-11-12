-- =====================================================================
-- ENQORA · 0043 · Trazabilidad: solicitud pública → cuenta → caso
-- Antes, una solicitud enviada desde la portada («Quiero esta solución») quedaba suelta: si la persona después
-- creaba su cuenta y abría un caso, el equipo no veía que era la misma persona ni su relato.
-- 1) Cada solicitud recibe un código aleatorio (SOL-XXXXXX) que se le muestra a la persona.
-- 2) Al entrar a su cuenta, las solicitudes enviadas con su MISMO correo se vinculan solas a su usuario.
-- 3) Al abrir su primer caso, la solicitud vinculada se une al caso y su relato queda en la bitácora.
-- 4) El equipo puede vincular a mano una solicitud (p. ej., por WhatsApp) con el folio del caso.
-- Se puede ejecutar más de una vez.
-- =====================================================================
alter table private.solicitudes_caso add column if not exists referencia text;
alter table private.solicitudes_caso add column if not exists user_id uuid references auth.users (id) on delete set null;
alter table private.solicitudes_caso add column if not exists company_id uuid references public.companies (id) on delete set null;
alter table private.solicitudes_caso add column if not exists case_id uuid references public.cases (id) on delete set null;
alter table private.solicitudes_caso add column if not exists vinculada timestamptz;
create unique index if not exists solicitudes_caso_referencia_idx on private.solicitudes_caso (referencia);
create index if not exists solicitudes_caso_user_idx on private.solicitudes_caso (user_id) where user_id is not null;

-- Código aleatorio (sin 0/O/1/I para dictarlo sin errores).
create or replace function private.codigo_solicitud() returns text
language plpgsql volatile set search_path = '' as $$
declare
  a text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
begin
  loop
    c := 'SOL-' || (select string_agg(substr(a, 1 + floor(random() * 32)::int, 1), '') from generate_series(1, 6));
    exit when not exists (select 1 from private.solicitudes_caso where referencia = c);
  end loop;
  return c;
end
$$;
create or replace function private.on_solicitud_referencia() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.referencia is null then new.referencia := private.codigo_solicitud(); end if;
  return new;
end
$$;
drop trigger if exists solicitudes_caso_referencia on private.solicitudes_caso;
create trigger solicitudes_caso_referencia before insert on private.solicitudes_caso
  for each row execute function private.on_solicitud_referencia();
update private.solicitudes_caso set referencia = private.codigo_solicitud() where referencia is null;

-- El visitante recién creó su solicitud: obtiene su código (solo dentro de 10 minutos y desde el mismo visitante).
create or replace function public.solicitud_codigo(p_id uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_client text;
  v_headers jsonb;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then v_headers := null;
  end;
  v_client := coalesce(v_headers ->> 'x-enqora-client', '');
  return (select s.referencia from private.solicitudes_caso s
          where s.id = p_id and s.creada > now() - interval '10 minutes' and s.client = v_client);
end
$$;

-- Al entrar: vincula las solicitudes por correo hechas con el mismo correo de la cuenta (últimos 180 días).
create or replace function public.vincular_mis_solicitudes() returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  n integer;
begin
  if v_uid is null then return 0; end if;
  select lower(email) into v_email from auth.users where id = v_uid and email_confirmed_at is not null;
  if v_email is null then return 0; end if;
  update private.solicitudes_caso set user_id = v_uid, vinculada = now(), actualizada = now()
  where user_id is null and canal = 'correo' and lower(btrim(contacto)) = v_email and creada > now() - interval '180 days';
  get diagnostics n = row_count;
  return n;
end
$$;

-- Al abrir un caso: la solicitud vinculada más reciente (sin caso) se une al caso y su relato queda en la bitácora.
create or replace function public.vincular_solicitud_caso(p_case uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_case public.cases;
  v_sol private.solicitudes_caso;
begin
  perform public.vincular_mis_solicitudes();
  select * into v_case from public.cases where id = p_case;
  if not found or not private.is_member(v_case.company_id) then return null; end if;
  select * into v_sol from private.solicitudes_caso
  where user_id = v_uid and case_id is null order by creada desc limit 1;
  if not found then return null; end if;
  update private.solicitudes_caso set case_id = p_case, company_id = v_case.company_id,
    estado = case when estado = 'nueva' then 'en_revision' else estado end, actualizada = now()
  where id = v_sol.id;
  perform private.log_case(p_case, 'comentario', 'Solicitud previa ' || v_sol.referencia || ' (' || to_char(v_sol.creada at time zone 'America/Santiago', 'DD-MM-YYYY') || '): ' || left(v_sol.relato, 1500), 'cliente',
    jsonb_build_object('solicitud', v_sol.referencia));
  return v_sol.referencia;
end
$$;

-- Equipo: vincula a mano una solicitud con un caso (por su folio), p. ej., cuando llegó por WhatsApp.
create or replace function public.staff_vincular_solicitud(p_id uuid, p_folio text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_case public.cases;
  v_sol private.solicitudes_caso;
begin
  if not private.is_staff() then raise exception 'ENQ_SIN_PERMISO'; end if;
  select * into v_case from public.cases where upper(folio) = upper(btrim(p_folio));
  if not found then raise exception 'ENQ_NO_ENCONTRADO'; end if;
  select * into v_sol from private.solicitudes_caso where id = p_id;
  if not found then raise exception 'ENQ_NO_ENCONTRADO'; end if;
  update private.solicitudes_caso set case_id = v_case.id, company_id = v_case.company_id, vinculada = coalesce(vinculada, now()),
    atendida_por = auth.uid(), actualizada = now()
  where id = p_id;
  if v_sol.case_id is distinct from v_case.id then
    perform private.log_case(v_case.id, 'nota_interna', 'Solicitud previa ' || v_sol.referencia || ' vinculada por el equipo: ' || left(v_sol.relato, 1500), 'interno',
      jsonb_build_object('solicitud', v_sol.referencia));
  end if;
end
$$;

-- Listado del equipo con el folio del caso vinculado.
create or replace function public.solicitudes_caso_listar(p_estado text default null) returns setof jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_staff() then raise exception 'ENQ_SIN_PERMISO'; end if;
  return query
    select (to_jsonb(s) - 'client') || jsonb_build_object('folio', c.folio, 'con_cuenta', s.user_id is not null)
    from private.solicitudes_caso s left join public.cases c on c.id = s.case_id
    where p_estado is null or s.estado = p_estado
    order by s.creada desc limit 200;
end
$$;

revoke execute on function public.solicitud_codigo(uuid), public.vincular_mis_solicitudes(), public.vincular_solicitud_caso(uuid),
  public.staff_vincular_solicitud(uuid, text) from public;
grant execute on function public.solicitud_codigo(uuid) to anon, authenticated;
grant execute on function public.vincular_mis_solicitudes(), public.vincular_solicitud_caso(uuid), public.staff_vincular_solicitud(uuid, text) to authenticated;
