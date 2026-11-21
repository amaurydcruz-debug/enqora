-- =====================================================================
-- ENQORA · 0073 · Remuneraciones (trabajadores, parámetros del mes y liquidaciones)
-- 1) Parámetros previsionales y tributarios del mes (UF, UTM, topes, tasas de AFP, SIS, seguro de cesantía,
--    aporte del empleador): los propone el equipo o un agente CON SU FUENTE y los aprueba una persona del equipo.
--    Una versión aprobada es inmutable; un cambio es una versión nueva que reemplaza a la anterior.
-- 2) Ficha de trabajadores por empresa (solo la ven propietario, administrador, contador y el equipo asignado;
--    Ley 21.719). Nunca se borra un trabajador: se da de baja con fecha y motivo.
-- 3) Liquidaciones con versiones: el cálculo queda congelado con los parámetros que usó; se aprueba (persona,
--    nunca un agente) o se anula con motivo. Una sola aprobada por trabajador y mes.
-- Se puede ejecutar más de una vez.
-- =====================================================================

-- ---------- 1. Parámetros del mes ----------
create table if not exists public.rem_parametros (
  id uuid primary key default gen_random_uuid(),
  periodo text not null check (periodo ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  version int not null check (version >= 1),
  valores jsonb not null,
  fuente text not null check (char_length(fuente) between 5 and 600),
  observaciones text check (observaciones is null or char_length(observaciones) <= 1000),
  estado text not null default 'borrador' check (estado in ('borrador', 'aprobado', 'reemplazado', 'descartado')),
  creado_por uuid references auth.users (id) on delete set null,
  creado timestamptz not null default now(),
  aprobado_por uuid references auth.users (id) on delete set null,
  aprobado_at timestamptz,
  unique (periodo, version)
);
create unique index if not exists rem_parametros_un_aprobado on public.rem_parametros (periodo) where estado = 'aprobado';
alter table public.rem_parametros enable row level security;
revoke all on public.rem_parametros from anon, authenticated;
grant select on public.rem_parametros to authenticated;
-- Son indicadores públicos (Previred, SII): cualquier persona con sesión puede leerlos.
drop policy if exists rem_parametros_ver on public.rem_parametros;
create policy rem_parametros_ver on public.rem_parametros for select to authenticated using (true);

create or replace function private.rem_parametros_inmutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.periodo is distinct from old.periodo or new.version is distinct from old.version or new.valores is distinct from old.valores
     or new.fuente is distinct from old.fuente or new.creado_por is distinct from old.creado_por or new.creado is distinct from old.creado then
    raise exception 'ENQ_PARAMETROS_INMUTABLES';
  end if;
  if not ((old.estado = 'borrador' and new.estado in ('aprobado', 'descartado')) or (old.estado = 'aprobado' and new.estado = 'reemplazado')
          or old.estado = new.estado) then
    raise exception 'ENQ_PARAMETROS_INMUTABLES';
  end if;
  return new;
end
$$;
drop trigger if exists rem_parametros_inmutable on public.rem_parametros;
create trigger rem_parametros_inmutable before update on public.rem_parametros
  for each row execute function private.rem_parametros_inmutable();
-- No se borra nada de remuneraciones. Única excepción: cuando se elimina la empresa completa (derecho de
-- supresión, Ley 21.719), el borrado en cascada sí procede.
create or replace function private.rem_no_borrar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name <> 'rem_parametros' and not exists (select 1 from public.companies c where c.id = old.company_id) then
    return old;
  end if;
  raise exception 'ENQ_NO_SE_BORRA';
end
$$;
drop trigger if exists rem_parametros_no_borrar on public.rem_parametros;
create trigger rem_parametros_no_borrar before delete on public.rem_parametros
  for each row execute function private.rem_no_borrar();

-- Valida que vengan todos los números que usa el motor (sin valores por defecto escondidos).
create or replace function private.rem_valores_ok(v jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  k text;
  n numeric;
begin
  if jsonb_typeof(v) <> 'object' or octet_length(v::text) > 4000 then return false; end if;
  foreach k in array array['uf', 'utm', 'imm', 'tope_afp_uf', 'tope_afc_uf', 'sis', 'aporte_empleador', 'afc_indefinido_trab',
                           'afc_indefinido_emp', 'afc_plazo_emp', 'salud_legal'] loop
    if jsonb_typeof(v -> k) <> 'number' then return false; end if;
    n := (v ->> k)::numeric;
    if n < 0 then return false; end if;
  end loop;
  if (v ->> 'uf')::numeric < 1000 or (v ->> 'utm')::numeric < 1000 or (v ->> 'imm')::numeric < 1000 then return false; end if;
  if (v ->> 'salud_legal')::numeric > 20 or (v ->> 'sis')::numeric > 10 or (v ->> 'aporte_empleador')::numeric > 20 then return false; end if;
  if jsonb_typeof(v -> 'afp') <> 'object' or (select count(*) from jsonb_object_keys(v -> 'afp')) = 0 then return false; end if;
  for k in select jsonb_object_keys(v -> 'afp') loop
    if jsonb_typeof(v -> 'afp' -> k) <> 'number' or (v -> 'afp' ->> k)::numeric not between 10 and 15 then return false; end if;
  end loop;
  return true;
end
$$;

-- Propone (equipo o agente): queda en borrador hasta que una persona lo apruebe.
create or replace function public.rem_proponer_parametros(p_periodo text, p_valores jsonb, p_fuente text, p_observaciones text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_version int;
  v_id uuid;
begin
  if not private.is_staff(array['enqora_admin', 'ops_director', 'accountant_pro', 'ai_agent']) then
    raise exception 'ENQ_SIN_PERMISO';
  end if;
  if p_periodo !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' or not private.rem_valores_ok(p_valores)
     or char_length(coalesce(trim(p_fuente), '')) < 5 then
    raise exception 'ENQ_PARAMETROS_INVALIDOS';
  end if;
  perform pg_advisory_xact_lock(hashtext('rem_parametros:' || p_periodo));
  select coalesce(max(version), 0) + 1 into v_version from public.rem_parametros where periodo = p_periodo;
  insert into public.rem_parametros (periodo, version, valores, fuente, observaciones, creado_por)
  values (p_periodo, v_version, p_valores, left(trim(p_fuente), 600), nullif(left(trim(coalesce(p_observaciones, '')), 1000), ''), v_uid)
  returning id into v_id;
  perform private.log_event(null, 'remuneraciones.parametros_propuestos', p_periodo || ' v' || v_version,
    jsonb_build_object('id', v_id, 'fuente', p_fuente));
  return v_id;
end
$$;

-- Aprueba (persona del equipo, nunca un agente). Reemplaza la versión aprobada anterior del mismo mes.
create or replace function public.rem_aprobar_parametros(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_row public.rem_parametros;
begin
  if not private.is_staff(array['enqora_admin', 'ops_director', 'accountant_pro']) or private.is_staff(array['ai_agent']) then
    raise exception 'ENQ_SIN_PERMISO';
  end if;
  select * into v_row from public.rem_parametros where id = p_id for update;
  if not found then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if v_row.estado <> 'borrador' then raise exception 'ENQ_YA_DECIDIDA'; end if;
  update public.rem_parametros set estado = 'reemplazado' where periodo = v_row.periodo and estado = 'aprobado';
  update public.rem_parametros set estado = 'aprobado', aprobado_por = v_uid, aprobado_at = now() where id = p_id;
  perform private.log_event(null, 'remuneraciones.parametros_aprobados', v_row.periodo || ' v' || v_row.version,
    jsonb_build_object('id', p_id));
end
$$;

create or replace function public.rem_descartar_parametros(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_row public.rem_parametros;
begin
  if not private.is_staff(array['enqora_admin', 'ops_director', 'accountant_pro']) or private.is_staff(array['ai_agent']) then
    raise exception 'ENQ_SIN_PERMISO';
  end if;
  select * into v_row from public.rem_parametros where id = p_id for update;
  if not found then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if v_row.estado <> 'borrador' then raise exception 'ENQ_YA_DECIDIDA'; end if;
  update public.rem_parametros set estado = 'descartado' where id = p_id;
  perform private.log_event(null, 'remuneraciones.parametros_descartados', v_row.periodo || ' v' || v_row.version,
    jsonb_build_object('id', p_id, 'por', v_uid));
end
$$;

-- ---------- 2. Empresa (mutual) y trabajadores ----------
create table if not exists public.rem_empresa (
  company_id uuid primary key references public.companies (id) on delete cascade,
  mutual text not null check (mutual in ('ACHS', 'IST', 'Mutual de Seguridad', 'ISL')),
  tasa_mutual numeric(5, 3) not null check (tasa_mutual between 0.9 and 8),
  actualizado_por uuid references auth.users (id) on delete set null,
  actualizado timestamptz not null default now()
);
alter table public.rem_empresa enable row level security;
revoke all on public.rem_empresa from anon, authenticated;
grant select on public.rem_empresa to authenticated;
drop policy if exists rem_empresa_ver on public.rem_empresa;
create policy rem_empresa_ver on public.rem_empresa for select to authenticated
  using (private.has_role(company_id, array['owner', 'admin', 'accountant']) or private.works_company(company_id));

create table if not exists public.rem_trabajadores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  rut text not null check (rut ~ '^[0-9]{7,8}-[0-9K]$'),
  nombre text not null check (char_length(nombre) between 3 and 120),
  cargo text check (cargo is null or char_length(cargo) <= 80),
  fecha_ingreso date not null,
  tipo_contrato text not null check (tipo_contrato in ('indefinido', 'plazo_fijo', 'obra')),
  sueldo_base bigint not null check (sueldo_base between 1 and 100000000),
  jornada_horas numeric(4, 1) not null check (jornada_horas between 1 and 45),
  afp text not null check (char_length(afp) between 3 and 20),
  salud text not null check (salud in ('fonasa', 'isapre')),
  isapre text check (isapre is null or char_length(isapre) <= 40),
  plan_isapre_uf numeric(6, 3) check (plan_isapre_uf is null or plan_isapre_uf between 0 and 50),
  colacion bigint not null default 0 check (colacion between 0 and 5000000),
  movilizacion bigint not null default 0 check (movilizacion between 0 and 5000000),
  gratificacion text not null default 'art50' check (gratificacion in ('art50', 'ninguna')),
  activo boolean not null default true,
  fecha_baja date,
  motivo_baja text,
  creado_por uuid references auth.users (id) on delete set null,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  unique (company_id, rut),
  check (salud = 'fonasa' or plan_isapre_uf is not null)
);
create index if not exists rem_trabajadores_idx on public.rem_trabajadores (company_id, activo, nombre);
alter table public.rem_trabajadores enable row level security;
revoke all on public.rem_trabajadores from anon, authenticated;
grant select on public.rem_trabajadores to authenticated;
drop policy if exists rem_trabajadores_ver on public.rem_trabajadores;
create policy rem_trabajadores_ver on public.rem_trabajadores for select to authenticated
  using (private.has_role(company_id, array['owner', 'admin', 'accountant']) or private.works_company(company_id));
drop trigger if exists rem_trabajadores_no_borrar on public.rem_trabajadores;
create trigger rem_trabajadores_no_borrar before delete on public.rem_trabajadores
  for each row execute function private.rem_no_borrar();

create or replace function private.rem_puede(p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_role(p_company, array['owner', 'admin', 'accountant']) or private.works_company(p_company)
$$;

create or replace function public.rem_guardar_empresa(p_company uuid, p_mutual text, p_tasa numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
begin
  if not private.rem_puede(p_company) or private.is_staff(array['ai_agent']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  insert into public.rem_empresa (company_id, mutual, tasa_mutual, actualizado_por)
  values (p_company, p_mutual, p_tasa, v_uid)
  on conflict (company_id) do update set mutual = excluded.mutual, tasa_mutual = excluded.tasa_mutual,
    actualizado_por = v_uid, actualizado = now();
  perform private.log_event(p_company, 'remuneraciones.mutual', p_mutual || ' ' || p_tasa || '%', '{}'::jsonb);
exception
  when check_violation then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

-- Crea o actualiza un trabajador. Cada cambio queda en la bitácora con el antes y el después.
create or replace function public.rem_guardar_trabajador(p_company uuid, p_id uuid, p_datos jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_antes jsonb;
  v_id uuid;
begin
  if not private.rem_puede(p_company) or private.is_staff(array['ai_agent']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if jsonb_typeof(p_datos) <> 'object' or octet_length(p_datos::text) > 4000 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if p_id is null then
    insert into public.rem_trabajadores (company_id, rut, nombre, cargo, fecha_ingreso, tipo_contrato, sueldo_base, jornada_horas,
      afp, salud, isapre, plan_isapre_uf, colacion, movilizacion, gratificacion, creado_por)
    values (p_company, upper(p_datos ->> 'rut'), trim(p_datos ->> 'nombre'), nullif(trim(p_datos ->> 'cargo'), ''),
      (p_datos ->> 'fecha_ingreso')::date, p_datos ->> 'tipo_contrato', (p_datos ->> 'sueldo_base')::bigint,
      (p_datos ->> 'jornada_horas')::numeric, p_datos ->> 'afp', p_datos ->> 'salud', nullif(trim(p_datos ->> 'isapre'), ''),
      nullif(p_datos ->> 'plan_isapre_uf', '')::numeric, coalesce((p_datos ->> 'colacion')::bigint, 0),
      coalesce((p_datos ->> 'movilizacion')::bigint, 0), coalesce(p_datos ->> 'gratificacion', 'art50'), v_uid)
    returning id into v_id;
    perform private.log_event(p_company, 'remuneraciones.trabajador_creado', v_id::text, jsonb_build_object('rut', upper(p_datos ->> 'rut')));
  else
    select to_jsonb(t) - 'creado' - 'actualizado' into v_antes from public.rem_trabajadores t
      where t.id = p_id and t.company_id = p_company for update;
    if v_antes is null then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
    update public.rem_trabajadores set nombre = trim(p_datos ->> 'nombre'), cargo = nullif(trim(p_datos ->> 'cargo'), ''),
      fecha_ingreso = (p_datos ->> 'fecha_ingreso')::date, tipo_contrato = p_datos ->> 'tipo_contrato',
      sueldo_base = (p_datos ->> 'sueldo_base')::bigint, jornada_horas = (p_datos ->> 'jornada_horas')::numeric,
      afp = p_datos ->> 'afp', salud = p_datos ->> 'salud', isapre = nullif(trim(p_datos ->> 'isapre'), ''),
      plan_isapre_uf = nullif(p_datos ->> 'plan_isapre_uf', '')::numeric, colacion = coalesce((p_datos ->> 'colacion')::bigint, 0),
      movilizacion = coalesce((p_datos ->> 'movilizacion')::bigint, 0), gratificacion = coalesce(p_datos ->> 'gratificacion', 'art50'),
      actualizado = now()
    where id = p_id;
    v_id := p_id;
    perform private.log_event(p_company, 'remuneraciones.trabajador_editado', v_id::text,
      jsonb_build_object('antes', v_antes, 'despues', p_datos));
  end if;
  return v_id;
exception
  when check_violation or not_null_violation or invalid_text_representation or invalid_datetime_format or datetime_field_overflow
    or numeric_value_out_of_range then raise exception 'ENQ_DATOS_INVALIDOS';
  when unique_violation then raise exception 'ENQ_TRABAJADOR_DUPLICADO';
end
$$;

create or replace function public.rem_baja_trabajador(p_id uuid, p_fecha date, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_company uuid;
begin
  select company_id into v_company from public.rem_trabajadores where id = p_id and activo for update;
  if v_company is null then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if not private.rem_puede(v_company) or private.is_staff(array['ai_agent']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_fecha is null or char_length(coalesce(trim(p_motivo), '')) < 3 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  update public.rem_trabajadores set activo = false, fecha_baja = p_fecha, motivo_baja = left(trim(p_motivo), 300), actualizado = now()
    where id = p_id;
  perform private.log_event(v_company, 'remuneraciones.trabajador_baja', p_id::text,
    jsonb_build_object('fecha', p_fecha, 'motivo', p_motivo, 'por', v_uid));
end
$$;

-- ---------- 3. Liquidaciones ----------
create table if not exists public.rem_liquidaciones (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  trabajador_id uuid not null references public.rem_trabajadores (id) on delete cascade,
  periodo text not null check (periodo ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  version int not null check (version >= 1),
  parametros_id uuid not null references public.rem_parametros (id) on delete restrict,
  motor text not null check (char_length(motor) between 4 and 20),
  ficha jsonb not null,
  novedades jsonb not null,
  detalle jsonb not null,
  total_imponible bigint not null check (total_imponible >= 0),
  liquido bigint not null,
  costo_empresa bigint not null check (costo_empresa >= 0),
  estado text not null default 'borrador' check (estado in ('borrador', 'aprobada', 'anulada')),
  creado_por uuid references auth.users (id) on delete set null,
  creado timestamptz not null default now(),
  aprobado_por uuid references auth.users (id) on delete set null,
  aprobado_at timestamptz,
  anulado_por uuid references auth.users (id) on delete set null,
  anulado_at timestamptz,
  motivo_anulacion text,
  unique (trabajador_id, periodo, version)
);
create unique index if not exists rem_liquidaciones_una_aprobada on public.rem_liquidaciones (trabajador_id, periodo) where estado = 'aprobada';
create index if not exists rem_liquidaciones_idx on public.rem_liquidaciones (company_id, periodo, estado);
alter table public.rem_liquidaciones enable row level security;
revoke all on public.rem_liquidaciones from anon, authenticated;
grant select on public.rem_liquidaciones to authenticated;
drop policy if exists rem_liquidaciones_ver on public.rem_liquidaciones;
create policy rem_liquidaciones_ver on public.rem_liquidaciones for select to authenticated
  using (private.has_role(company_id, array['owner', 'admin', 'accountant']) or private.works_company(company_id));
drop trigger if exists rem_liquidaciones_no_borrar on public.rem_liquidaciones;
create trigger rem_liquidaciones_no_borrar before delete on public.rem_liquidaciones
  for each row execute function private.rem_no_borrar();

create or replace function private.rem_liquidacion_inmutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - array['estado', 'aprobado_por', 'aprobado_at', 'anulado_por', 'anulado_at', 'motivo_anulacion'])
     is distinct from (to_jsonb(old) - array['estado', 'aprobado_por', 'aprobado_at', 'anulado_por', 'anulado_at', 'motivo_anulacion']) then
    raise exception 'ENQ_LIQUIDACION_INMUTABLE';
  end if;
  if not ((old.estado = 'borrador' and new.estado in ('aprobada', 'anulada')) or (old.estado = 'aprobada' and new.estado = 'anulada')
          or old.estado = new.estado) then
    raise exception 'ENQ_LIQUIDACION_INMUTABLE';
  end if;
  return new;
end
$$;
drop trigger if exists rem_liquidaciones_inmutable on public.rem_liquidaciones;
create trigger rem_liquidaciones_inmutable before update on public.rem_liquidaciones
  for each row execute function private.rem_liquidacion_inmutable();

-- Guarda un cálculo como borrador (versión nueva). Exige parámetros APROBADOS del mismo mes.
-- Los borradores anteriores del mismo trabajador y mes se anulan como «reemplazados».
create or replace function public.rem_guardar_liquidacion(p_trabajador uuid, p_periodo text, p_parametros uuid, p_motor text,
  p_novedades jsonb, p_detalle jsonb, p_imponible bigint, p_liquido bigint, p_costo bigint) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_trab public.rem_trabajadores;
  v_version int;
  v_id uuid;
begin
  select * into v_trab from public.rem_trabajadores where id = p_trabajador;
  if not found then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if not private.rem_puede(v_trab.company_id) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if not exists (select 1 from public.rem_parametros where id = p_parametros and periodo = p_periodo and estado = 'aprobado') then
    raise exception 'ENQ_SIN_PARAMETROS';
  end if;
  if jsonb_typeof(p_novedades) <> 'object' or jsonb_typeof(p_detalle) <> 'object' or octet_length(p_detalle::text) > 20000
     or octet_length(p_novedades::text) > 2000 then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  perform pg_advisory_xact_lock(hashtext('rem_liq:' || p_trabajador || ':' || p_periodo));
  select coalesce(max(version), 0) + 1 into v_version from public.rem_liquidaciones where trabajador_id = p_trabajador and periodo = p_periodo;
  update public.rem_liquidaciones set estado = 'anulada', anulado_por = v_uid, anulado_at = now(),
    motivo_anulacion = 'Reemplazada por la versión ' || v_version
  where trabajador_id = p_trabajador and periodo = p_periodo and estado = 'borrador';
  insert into public.rem_liquidaciones (company_id, trabajador_id, periodo, version, parametros_id, motor, ficha, novedades, detalle,
    total_imponible, liquido, costo_empresa, creado_por)
  values (v_trab.company_id, p_trabajador, p_periodo, v_version, p_parametros, left(p_motor, 20),
    to_jsonb(v_trab) - 'creado_por' - 'creado' - 'actualizado', p_novedades, p_detalle, p_imponible, p_liquido, p_costo, v_uid)
  returning id into v_id;
  perform private.log_event(v_trab.company_id, 'remuneraciones.liquidacion_calculada', p_periodo || ' v' || v_version,
    jsonb_build_object('id', v_id, 'trabajador', p_trabajador, 'liquido', p_liquido));
  return v_id;
exception
  when check_violation then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

create or replace function public.rem_aprobar_liquidacion(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_row public.rem_liquidaciones;
begin
  select * into v_row from public.rem_liquidaciones where id = p_id for update;
  if not found then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if not private.rem_puede(v_row.company_id) or private.is_staff(array['ai_agent']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_row.estado <> 'borrador' then raise exception 'ENQ_YA_DECIDIDA'; end if;
  if exists (select 1 from public.rem_liquidaciones where trabajador_id = v_row.trabajador_id and periodo = v_row.periodo and estado = 'aprobada') then
    raise exception 'ENQ_LIQUIDACION_YA_APROBADA';
  end if;
  update public.rem_liquidaciones set estado = 'aprobada', aprobado_por = v_uid, aprobado_at = now() where id = p_id;
  perform private.log_event(v_row.company_id, 'remuneraciones.liquidacion_aprobada', v_row.periodo || ' v' || v_row.version,
    jsonb_build_object('id', p_id, 'trabajador', v_row.trabajador_id, 'liquido', v_row.liquido));
end
$$;

create or replace function public.rem_anular_liquidacion(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_row public.rem_liquidaciones;
begin
  select * into v_row from public.rem_liquidaciones where id = p_id for update;
  if not found then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if not private.rem_puede(v_row.company_id) or private.is_staff(array['ai_agent']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_row.estado = 'anulada' then raise exception 'ENQ_YA_DECIDIDA'; end if;
  if char_length(coalesce(trim(p_motivo), '')) < 3 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  update public.rem_liquidaciones set estado = 'anulada', anulado_por = v_uid, anulado_at = now(), motivo_anulacion = left(trim(p_motivo), 300)
    where id = p_id;
  perform private.log_event(v_row.company_id, 'remuneraciones.liquidacion_anulada', v_row.periodo || ' v' || v_row.version,
    jsonb_build_object('id', p_id, 'motivo', p_motivo, 'estaba', v_row.estado));
end
$$;

-- ---------- Permisos ----------
revoke execute on function private.rem_parametros_inmutable() from public, anon, authenticated;
revoke execute on function private.rem_no_borrar() from public, anon, authenticated;
revoke execute on function private.rem_valores_ok(jsonb) from public, anon, authenticated;
revoke execute on function private.rem_liquidacion_inmutable() from public, anon, authenticated;
revoke execute on function private.rem_puede(uuid) from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'public.rem_proponer_parametros(text, jsonb, text, text)', 'public.rem_aprobar_parametros(uuid)', 'public.rem_descartar_parametros(uuid)',
    'public.rem_guardar_empresa(uuid, text, numeric)', 'public.rem_guardar_trabajador(uuid, uuid, jsonb)',
    'public.rem_baja_trabajador(uuid, date, text)',
    'public.rem_guardar_liquidacion(uuid, text, uuid, text, jsonb, jsonb, bigint, bigint, bigint)',
    'public.rem_aprobar_liquidacion(uuid)', 'public.rem_anular_liquidacion(uuid, text)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$$;
