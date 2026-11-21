-- =====================================================================
-- ENQORA · 0074 · Remuneraciones: datos para Previred y el Libro de Remuneraciones Electrónico
-- 1) Parámetros del mes: el aporte del empleador de la Ley 21.735 se declara en partes (SIS, capitalización
--    individual, expectativa de vida y rentabilidad protegida), más la parte del 7% de Fonasa que va a la CCAF.
--    Una versión aprobada antes de esta migración sigue en el historial, pero hay que proponer y aprobar una nueva.
-- 2) Ficha del trabajador: apellidos y nombres por separado, sexo, nacionalidad, comuna, tipo de jornada del LRE,
--    isapre y FUN, y causal de término al dar de baja.
-- 3) Empresa: caja de compensación y sucursal de la mutual.
-- 4) Registro de cada archivo generado (quién, cuándo, huella SHA-256), sin borrado.
-- Requiere la 0073. Se puede ejecutar más de una vez.
-- =====================================================================

-- ---------- 1. Parámetros ----------
create or replace function private.rem_valores_ok(v jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  k text;
begin
  if coalesce(jsonb_typeof(v), '') <> 'object' or octet_length(v::text) > 4000 then return false; end if;
  foreach k in array array['uf', 'utm', 'imm', 'tope_afp_uf', 'tope_afc_uf', 'sis', 'aporte_ci', 'aporte_ev', 'aporte_rp',
                           'afc_indefinido_trab', 'afc_indefinido_emp', 'afc_plazo_emp', 'salud_legal'] loop
    if coalesce(jsonb_typeof(v -> k), '') <> 'number' or (v ->> k)::numeric < 0 then return false; end if;
  end loop;
  if (v ->> 'uf')::numeric < 1000 or (v ->> 'utm')::numeric < 1000 or (v ->> 'imm')::numeric < 1000 then return false; end if;
  if (v ->> 'salud_legal')::numeric > 20 or (v ->> 'sis')::numeric > 10 or (v ->> 'aporte_ci')::numeric > 10
     or (v ->> 'aporte_ev')::numeric > 10 or (v ->> 'aporte_rp')::numeric > 10 then return false; end if;
  if v ? 'ccaf_salud' and (jsonb_typeof(v -> 'ccaf_salud') <> 'number' or (v ->> 'ccaf_salud')::numeric not between 0 and 7) then return false; end if;
  if coalesce(jsonb_typeof(v -> 'afp'), '') <> 'object' or (select count(*) from jsonb_object_keys(v -> 'afp')) = 0 then return false; end if;
  for k in select jsonb_object_keys(v -> 'afp') loop
    if coalesce(jsonb_typeof(v -> 'afp' -> k), '') <> 'number' or (v -> 'afp' ->> k)::numeric not between 10 and 15 then return false; end if;
  end loop;
  return true;
end
$$;
revoke execute on function private.rem_valores_ok(jsonb) from public, anon, authenticated;

-- ---------- 2. Ficha del trabajador ----------
alter table public.rem_trabajadores
  add column if not exists apellido_paterno text check (apellido_paterno is null or char_length(apellido_paterno) between 1 and 30),
  add column if not exists apellido_materno text check (apellido_materno is null or char_length(apellido_materno) <= 30),
  add column if not exists nombres text check (nombres is null or char_length(nombres) between 1 and 30),
  add column if not exists sexo text check (sexo is null or sexo in ('M', 'F')),
  add column if not exists extranjero boolean not null default false,
  add column if not exists comuna int check (comuna is null or comuna between 1101 and 16999),
  add column if not exists jornada_lre smallint check (jornada_lre is null or jornada_lre in (101, 201, 301, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 501, 601, 701)),
  add column if not exists fun text check (fun is null or char_length(fun) <= 16),
  add column if not exists causal_termino smallint check (causal_termino is null or causal_termino in (3, 4, 5, 6, 7, 8, 11, 12, 13, 14, 15, 16, 18, 19, 20, 24, 25, 26, 27, 28, 29));

create or replace function public.rem_guardar_trabajador(p_company uuid, p_id uuid, p_datos jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_antes jsonb;
  v_id uuid;
  v_nombre text;
begin
  if not private.rem_puede(p_company) or private.is_staff(array['ai_agent']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if jsonb_typeof(p_datos) <> 'object' or octet_length(p_datos::text) > 4000 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  v_nombre := coalesce(nullif(trim(concat_ws(' ', nullif(trim(p_datos ->> 'nombres'), ''), nullif(trim(p_datos ->> 'apellido_paterno'), ''),
    nullif(trim(p_datos ->> 'apellido_materno'), ''))), ''), trim(p_datos ->> 'nombre'));
  if p_id is null then
    insert into public.rem_trabajadores (company_id, rut, nombre, cargo, fecha_ingreso, tipo_contrato, sueldo_base, jornada_horas,
      afp, salud, isapre, plan_isapre_uf, colacion, movilizacion, gratificacion, apellido_paterno, apellido_materno, nombres, sexo,
      extranjero, comuna, jornada_lre, fun, creado_por)
    values (p_company, upper(p_datos ->> 'rut'), v_nombre, nullif(trim(p_datos ->> 'cargo'), ''),
      (p_datos ->> 'fecha_ingreso')::date, p_datos ->> 'tipo_contrato', (p_datos ->> 'sueldo_base')::bigint,
      (p_datos ->> 'jornada_horas')::numeric, p_datos ->> 'afp', p_datos ->> 'salud', nullif(trim(p_datos ->> 'isapre'), ''),
      nullif(p_datos ->> 'plan_isapre_uf', '')::numeric, coalesce((p_datos ->> 'colacion')::bigint, 0),
      coalesce((p_datos ->> 'movilizacion')::bigint, 0), coalesce(p_datos ->> 'gratificacion', 'art50'),
      nullif(trim(p_datos ->> 'apellido_paterno'), ''), nullif(trim(p_datos ->> 'apellido_materno'), ''), nullif(trim(p_datos ->> 'nombres'), ''),
      nullif(p_datos ->> 'sexo', ''), coalesce((p_datos ->> 'extranjero')::boolean, false), nullif(p_datos ->> 'comuna', '')::int,
      nullif(p_datos ->> 'jornada_lre', '')::smallint, nullif(trim(p_datos ->> 'fun'), ''), v_uid)
    returning id into v_id;
    perform private.log_event(p_company, 'remuneraciones.trabajador_creado', v_id::text, jsonb_build_object('rut', upper(p_datos ->> 'rut')));
  else
    select to_jsonb(t) - 'creado' - 'actualizado' into v_antes from public.rem_trabajadores t
      where t.id = p_id and t.company_id = p_company for update;
    if v_antes is null then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
    update public.rem_trabajadores set nombre = v_nombre, cargo = nullif(trim(p_datos ->> 'cargo'), ''),
      fecha_ingreso = (p_datos ->> 'fecha_ingreso')::date, tipo_contrato = p_datos ->> 'tipo_contrato',
      sueldo_base = (p_datos ->> 'sueldo_base')::bigint, jornada_horas = (p_datos ->> 'jornada_horas')::numeric,
      afp = p_datos ->> 'afp', salud = p_datos ->> 'salud', isapre = nullif(trim(p_datos ->> 'isapre'), ''),
      plan_isapre_uf = nullif(p_datos ->> 'plan_isapre_uf', '')::numeric, colacion = coalesce((p_datos ->> 'colacion')::bigint, 0),
      movilizacion = coalesce((p_datos ->> 'movilizacion')::bigint, 0), gratificacion = coalesce(p_datos ->> 'gratificacion', 'art50'),
      apellido_paterno = nullif(trim(p_datos ->> 'apellido_paterno'), ''), apellido_materno = nullif(trim(p_datos ->> 'apellido_materno'), ''),
      nombres = nullif(trim(p_datos ->> 'nombres'), ''), sexo = nullif(p_datos ->> 'sexo', ''),
      extranjero = coalesce((p_datos ->> 'extranjero')::boolean, false), comuna = nullif(p_datos ->> 'comuna', '')::int,
      jornada_lre = nullif(p_datos ->> 'jornada_lre', '')::smallint, fun = nullif(trim(p_datos ->> 'fun'), ''),
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

drop function if exists public.rem_baja_trabajador(uuid, date, text);
create or replace function public.rem_baja_trabajador(p_id uuid, p_fecha date, p_causal smallint, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_company uuid;
begin
  select company_id into v_company from public.rem_trabajadores where id = p_id and activo for update;
  if v_company is null then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if not private.rem_puede(v_company) or private.is_staff(array['ai_agent']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_fecha is null or p_causal is null then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  update public.rem_trabajadores set activo = false, fecha_baja = p_fecha, causal_termino = p_causal,
    motivo_baja = nullif(left(trim(coalesce(p_motivo, '')), 300), ''), actualizado = now()
    where id = p_id;
  perform private.log_event(v_company, 'remuneraciones.trabajador_baja', p_id::text,
    jsonb_build_object('fecha', p_fecha, 'causal', p_causal, 'motivo', p_motivo, 'por', v_uid));
exception
  when check_violation then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

-- ---------- 3. Empresa ----------
alter table public.rem_empresa
  add column if not exists ccaf smallint not null default 0 check (ccaf between 0 and 4),
  add column if not exists mutual_sucursal smallint check (mutual_sucursal is null or mutual_sucursal between 1 and 999);

drop function if exists public.rem_guardar_empresa(uuid, text, numeric);
create or replace function public.rem_guardar_empresa(p_company uuid, p_mutual text, p_tasa numeric, p_ccaf smallint, p_sucursal smallint)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
begin
  if not private.rem_puede(p_company) or private.is_staff(array['ai_agent']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  insert into public.rem_empresa (company_id, mutual, tasa_mutual, ccaf, mutual_sucursal, actualizado_por)
  values (p_company, p_mutual, p_tasa, coalesce(p_ccaf, 0), p_sucursal, v_uid)
  on conflict (company_id) do update set mutual = excluded.mutual, tasa_mutual = excluded.tasa_mutual, ccaf = excluded.ccaf,
    mutual_sucursal = excluded.mutual_sucursal, actualizado_por = v_uid, actualizado = now();
  perform private.log_event(p_company, 'remuneraciones.empresa', p_mutual || ' ' || p_tasa || '%',
    jsonb_build_object('ccaf', p_ccaf, 'sucursal', p_sucursal));
exception
  when check_violation then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

-- ---------- 4. Registro de archivos generados ----------
create table if not exists public.rem_exportaciones (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  periodo text not null check (periodo ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  tipo text not null check (tipo in ('previred', 'lre')),
  trabajadores int not null check (trabajadores between 1 and 10000),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  generado_por uuid references auth.users (id) on delete set null,
  creado timestamptz not null default now()
);
create index if not exists rem_exportaciones_idx on public.rem_exportaciones (company_id, periodo, creado desc);
alter table public.rem_exportaciones enable row level security;
revoke all on public.rem_exportaciones from anon, authenticated;
grant select on public.rem_exportaciones to authenticated;
drop policy if exists rem_exportaciones_ver on public.rem_exportaciones;
create policy rem_exportaciones_ver on public.rem_exportaciones for select to authenticated
  using (private.has_role(company_id, array['owner', 'admin', 'accountant']) or private.works_company(company_id));
drop trigger if exists rem_exportaciones_no_borrar on public.rem_exportaciones;
create trigger rem_exportaciones_no_borrar before delete on public.rem_exportaciones
  for each row execute function private.rem_no_borrar();
create or replace function private.rem_exportacion_inmutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'ENQ_NO_SE_BORRA';
end
$$;
revoke execute on function private.rem_exportacion_inmutable() from public, anon, authenticated;
drop trigger if exists rem_exportaciones_inmutable on public.rem_exportaciones;
create trigger rem_exportaciones_inmutable before update on public.rem_exportaciones
  for each row execute function private.rem_exportacion_inmutable();

create or replace function public.rem_registrar_exportacion(p_company uuid, p_periodo text, p_tipo text, p_trabajadores int, p_sha256 text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_id uuid;
begin
  if not private.rem_puede(p_company) then raise exception 'ENQ_SIN_PERMISO'; end if;
  insert into public.rem_exportaciones (company_id, periodo, tipo, trabajadores, sha256, generado_por)
  values (p_company, p_periodo, p_tipo, p_trabajadores, lower(p_sha256), v_uid)
  returning id into v_id;
  perform private.log_event(p_company, 'remuneraciones.archivo_' || p_tipo, p_periodo,
    jsonb_build_object('id', v_id, 'trabajadores', p_trabajadores, 'sha256', lower(p_sha256)));
  return v_id;
exception
  when check_violation then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

do $$
declare f text;
begin
  foreach f in array array['public.rem_guardar_trabajador(uuid, uuid, jsonb)', 'public.rem_baja_trabajador(uuid, date, smallint, text)',
    'public.rem_guardar_empresa(uuid, text, numeric, smallint, smallint)', 'public.rem_registrar_exportacion(uuid, text, text, int, text)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$$;
