-- =====================================================================
-- ENQORA · 0057 · Áreas laborales: partes del conflicto y conflictos de interés
-- Defensa del Trabajador y Defensa Laboral Empresarial usan el módulo 'legal' y el mismo núcleo de casos,
-- documentos, pagos, permisos y auditoría. Los expedientes ya son separados y confidenciales: el cliente ve
-- solo los casos de su cuenta y, del equipo, solo la supervisión y los profesionales asignados (0004).
-- Esta migración agrega:
--   1) private.case_parties: de qué lado está el cliente y quién es la contraparte (RUT guardado solo como
--      huella SHA-256 del RUT normalizado; nombre para que el equipo lo reconozca).
--   2) Bloqueo: un profesional no puede ser responsable ni apoyo de un caso si ya trabaja (o trabajó) en un
--      caso de la contraparte. Aplica al asignar (trigger en case_assignments y en cases.responsible_id) y
--      avisa a la supervisión si el conflicto aparece al registrar la contraparte después de asignar.
--   3) Aviso a la supervisión cuando ENQORA ya atiende a la contraparte (aunque sea con otro profesional).
-- Se puede ejecutar más de una vez.
-- =====================================================================

create table if not exists private.case_parties (
  case_id uuid primary key references public.cases (id) on delete cascade,
  lado text not null check (lado in ('trabajador', 'empleador')),
  cliente_clave text,                -- SHA-256 del RUT normalizado del cliente (empresa o persona)
  cliente_nombre_clave text,         -- nombre del cliente normalizado (sin tildes, minúsculas, espacios simples)
  contraparte_clave text,            -- SHA-256 del RUT normalizado de la contraparte (si se conoce)
  contraparte_nombre text check (char_length(contraparte_nombre) <= 160),
  contraparte_nombre_clave text,
  registrado_por uuid references auth.users (id) on delete set null,
  registrado_at timestamptz not null default now()
);
create index if not exists case_parties_cliente_idx on private.case_parties (cliente_clave);
create index if not exists case_parties_contraparte_idx on private.case_parties (contraparte_clave);
create index if not exists case_parties_cnombre_idx on private.case_parties (contraparte_nombre_clave);
create index if not exists case_parties_clnombre_idx on private.case_parties (cliente_nombre_clave);

create or replace function private.clave_rut(p_rut text) returns text
language sql immutable set search_path = '' as $$
  select case when private.normalize_rut(p_rut) is null then null
              else encode(extensions.digest(private.normalize_rut(p_rut), 'sha256'), 'hex') end
$$;

create or replace function private.clave_nombre(p_nombre text) returns text
language sql immutable set search_path = '' as $$
  select nullif(btrim(regexp_replace(lower(translate(coalesce(p_nombre, ''),
    'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')), '[^a-z0-9]+', ' ', 'g')), '')
$$;

-- Casos de ENQORA cuyo cliente es la contraparte de este caso, o cuya contraparte es el cliente de este caso.
create or replace function private.casos_opuestos(p_case uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select o.case_id
  from private.case_parties p
  join private.case_parties o on o.case_id <> p.case_id
  where p.case_id = p_case
    and ((p.contraparte_clave is not null and o.cliente_clave = p.contraparte_clave)
      or (p.cliente_clave is not null and o.contraparte_clave = p.cliente_clave)
      or (p.contraparte_nombre_clave is not null and o.cliente_nombre_clave = p.contraparte_nombre_clave)
      or (p.cliente_nombre_clave is not null and o.contraparte_nombre_clave = p.cliente_nombre_clave))
$$;

-- ¿Este profesional trabaja o trabajó en un caso de la contraparte?
create or replace function private.conflicto_profesional(p_case uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.casos_opuestos(p_case) x(case_id)
    where exists (select 1 from public.case_assignments a where a.case_id = x.case_id and a.user_id = p_user
                    and a.role_in_case in ('responsable', 'apoyo'))
       or exists (select 1 from public.cases c where c.id = x.case_id and c.responsible_id = p_user)
  )
$$;

create or replace function private.bloquear_conflicto_asignacion() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.role_in_case in ('responsable', 'apoyo') and private.conflicto_profesional(new.case_id, new.user_id) then
    raise exception 'ENQ_CONFLICTO_INTERES';
  end if;
  return new;
end
$$;
drop trigger if exists conflicto_interes_asignacion on public.case_assignments;
create trigger conflicto_interes_asignacion before insert or update of role_in_case, user_id on public.case_assignments
  for each row execute function private.bloquear_conflicto_asignacion();

create or replace function private.bloquear_conflicto_responsable() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.responsible_id is not null and new.responsible_id is distinct from old.responsible_id
     and private.conflicto_profesional(new.id, new.responsible_id) then
    raise exception 'ENQ_CONFLICTO_INTERES';
  end if;
  return new;
end
$$;
drop trigger if exists conflicto_interes_responsable on public.cases;
create trigger conflicto_interes_responsable before update of responsible_id on public.cases
  for each row execute function private.bloquear_conflicto_responsable();

-- Registrar (o corregir) las partes. Lo hace el cliente (no lector) o el equipo con acceso al caso.
create or replace function public.set_case_party(p_case uuid, p_lado text, p_contraparte_rut text, p_contraparte_nombre text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
  v_case public.cases;
  v_co public.companies;
  v_rut text := nullif(btrim(coalesce(p_contraparte_rut, '')), '');
  v_nombre text := nullif(btrim(coalesce(p_contraparte_nombre, '')), '');
  v_conflicto_prof boolean;
  v_opuestos int;
  v_sup uuid[];
begin
  select * into v_case from public.cases where id = p_case;
  if not found then raise exception 'ENQ_NO_ENCONTRADO'; end if;
  if v_case.module <> 'legal' then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if not (private.can_work_case(p_case)
          or (private.is_member(v_case.company_id) and private.member_role(v_case.company_id) <> 'viewer')) then
    raise exception 'ENQ_SIN_PERMISO';
  end if;
  if p_lado not in ('trabajador', 'empleador') then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if v_rut is null and v_nombre is null then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if v_rut is not null and not private.rut_is_valid(private.normalize_rut(v_rut)) then raise exception 'ENQ_RUT_INVALIDO'; end if;
  if char_length(coalesce(v_nombre, '')) > 160 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  select * into v_co from public.companies where id = v_case.company_id;

  insert into private.case_parties (case_id, lado, cliente_clave, cliente_nombre_clave, contraparte_clave, contraparte_nombre, contraparte_nombre_clave, registrado_por, registrado_at)
  values (p_case, p_lado, private.clave_rut(v_co.rut), private.clave_nombre(v_co.legal_name), private.clave_rut(v_rut), v_nombre, private.clave_nombre(v_nombre), v_uid, now())
  on conflict (case_id) do update set lado = excluded.lado, cliente_clave = excluded.cliente_clave,
    cliente_nombre_clave = excluded.cliente_nombre_clave, contraparte_clave = excluded.contraparte_clave,
    contraparte_nombre = excluded.contraparte_nombre, contraparte_nombre_clave = excluded.contraparte_nombre_clave,
    registrado_por = excluded.registrado_por, registrado_at = now();

  perform private.log_case(p_case, 'legal', 'Se registraron las partes del conflicto laboral.', 'interno',
    jsonb_build_object('lado', p_lado, 'contraparte_rut', v_rut is not null));

  -- ¿Algún profesional ya asignado quedó en conflicto? ¿ENQORA atiende a la contraparte?
  select exists (
    select 1 from public.case_assignments a where a.case_id = p_case and a.role_in_case in ('responsable', 'apoyo')
      and private.conflicto_profesional(p_case, a.user_id)
  ) into v_conflicto_prof;
  select count(*) into v_opuestos from private.casos_opuestos(p_case);
  if v_conflicto_prof or v_opuestos > 0 then
    select array_agg(user_id) into v_sup from public.staff_members where active and role in ('enqora_admin', 'ops_director');
    perform private.notify(v_sup, v_case.company_id, p_case, 'equipo',
      case when v_conflicto_prof then 'Conflicto de interés en ' || v_case.folio else 'ENQORA atiende a la contraparte de ' || v_case.folio end,
      case when v_conflicto_prof then 'Un profesional asignado trabaja en un caso de la contraparte. Reasigna antes de continuar.'
           else 'Otro caso de ENQORA tiene como cliente a la contraparte. Revisa la separación de equipos.' end,
      '/casos/' || p_case, 'conflicto:' || p_case);
    perform private.log_case(p_case, 'legal',
      case when v_conflicto_prof then 'Conflicto de interés detectado con un profesional asignado.' else 'ENQORA atiende a la contraparte en otro caso.' end,
      'interno', jsonb_build_object('conflicto_profesional', v_conflicto_prof, 'casos_opuestos', v_opuestos));
  end if;
  return jsonb_build_object('conflicto_profesional', v_conflicto_prof, 'casos_opuestos', v_opuestos);
end
$$;

-- Lo que ve cada quien: el cliente ve su lado y el nombre de la contraparte; el equipo con acceso ve además
-- si hay conflicto y cuántos casos de la contraparte atiende ENQORA (sin datos de esos casos).
create or replace function public.case_party(p_case uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_p private.case_parties;
  v_staff boolean := private.can_work_case(p_case);
begin
  if not (v_staff or private.is_member(private.case_company(p_case))) then raise exception 'ENQ_SIN_PERMISO'; end if;
  select * into v_p from private.case_parties where case_id = p_case;
  if not found then return null; end if;
  return jsonb_build_object('lado', v_p.lado, 'contraparte_nombre', v_p.contraparte_nombre,
    'contraparte_rut', v_p.contraparte_clave is not null, 'registrado_at', v_p.registrado_at)
    || case when v_staff then jsonb_build_object(
      'conflicto_profesional', exists (select 1 from public.case_assignments a where a.case_id = p_case
         and a.role_in_case in ('responsable', 'apoyo') and private.conflicto_profesional(p_case, a.user_id)),
      'casos_opuestos', (select count(*) from private.casos_opuestos(p_case))) else '{}'::jsonb end;
end
$$;

-- Antes de asignar: ¿este profesional queda en conflicto? (solo supervisión)
create or replace function public.conflicto_asignacion(p_case uuid, p_user uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_supervisor() then raise exception 'ENQ_SIN_PERMISO'; end if;
  return private.conflicto_profesional(p_case, p_user);
end
$$;

revoke all on table private.case_parties from public, anon, authenticated;
revoke execute on function public.set_case_party(uuid, text, text, text) from public, anon;
revoke execute on function public.case_party(uuid) from public, anon;
revoke execute on function public.conflicto_asignacion(uuid, uuid) from public, anon;
grant execute on function public.set_case_party(uuid, text, text, text) to authenticated;
grant execute on function public.case_party(uuid) to authenticated;
grant execute on function public.conflicto_asignacion(uuid, uuid) to authenticated;
