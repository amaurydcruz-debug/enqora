-- =====================================================================
-- ENQORA · 0081 · Remuneraciones: asignación familiar y licencias médicas
-- Ficha del trabajador: tramo de la resolución del IPS o de la CCAF y cargas simples, maternales y por invalidez
-- (Previred campos 18 a 22; LRE 1111 a 1114 y 2311). Parámetros del mes: monto por carga de los tramos A, B y C
-- (opcionales). Las licencias médicas se guardan en las novedades de la liquidación (días, fechas, tipo y RIMA).
-- Requiere la 0080. Se puede ejecutar más de una vez.
-- =====================================================================

alter table public.rem_trabajadores
  add column if not exists tramo_af text check (tramo_af is null or tramo_af in ('A', 'B', 'C', 'D')),
  add column if not exists cargas_simples smallint not null default 0 check (cargas_simples between 0 and 30),
  add column if not exists cargas_maternales smallint not null default 0 check (cargas_maternales between 0 and 5),
  add column if not exists cargas_invalidez smallint not null default 0 check (cargas_invalidez between 0 and 30);
alter table public.rem_trabajadores drop constraint if exists rem_trabajadores_cargas_con_tramo;
alter table public.rem_trabajadores add constraint rem_trabajadores_cargas_con_tramo
  check (cargas_simples + cargas_maternales + cargas_invalidez = 0 or tramo_af is not null);

-- ---------- Parámetros: montos de la asignación familiar ----------
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
  -- Asignación familiar (0081): monto por carga de los tramos A, B y C; opcionales, pero si vienen deben ser números válidos.
  foreach k in array array['af_a', 'af_b', 'af_c'] loop
    if v ? k and (coalesce(jsonb_typeof(v -> k), '') <> 'number' or (v ->> k)::numeric not between 0 and 200000) then return false; end if;
  end loop;
  if coalesce(jsonb_typeof(v -> 'afp'), '') <> 'object' or (select count(*) from jsonb_object_keys(v -> 'afp')) = 0 then return false; end if;
  for k in select jsonb_object_keys(v -> 'afp') loop
    if coalesce(jsonb_typeof(v -> 'afp' -> k), '') <> 'number' or (v -> 'afp' ->> k)::numeric not between 10 and 15 then return false; end if;
  end loop;
  return true;
end
$$;
revoke execute on function private.rem_valores_ok(jsonb) from public, anon, authenticated;

-- ---------- Guardar ficha con las cargas ----------
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
      extranjero, comuna, jornada_lre, fun, apv_regimen, apv_monto, apv_afp, apv_contrato, apv_forma,
      tramo_af, cargas_simples, cargas_maternales, cargas_invalidez, creado_por)
    values (p_company, upper(p_datos ->> 'rut'), v_nombre, nullif(trim(p_datos ->> 'cargo'), ''),
      (p_datos ->> 'fecha_ingreso')::date, p_datos ->> 'tipo_contrato', (p_datos ->> 'sueldo_base')::bigint,
      (p_datos ->> 'jornada_horas')::numeric, p_datos ->> 'afp', p_datos ->> 'salud', nullif(trim(p_datos ->> 'isapre'), ''),
      nullif(p_datos ->> 'plan_isapre_uf', '')::numeric, coalesce((p_datos ->> 'colacion')::bigint, 0),
      coalesce((p_datos ->> 'movilizacion')::bigint, 0), coalesce(p_datos ->> 'gratificacion', 'art50'),
      nullif(trim(p_datos ->> 'apellido_paterno'), ''), nullif(trim(p_datos ->> 'apellido_materno'), ''), nullif(trim(p_datos ->> 'nombres'), ''),
      nullif(p_datos ->> 'sexo', ''), coalesce((p_datos ->> 'extranjero')::boolean, false), nullif(p_datos ->> 'comuna', '')::int,
      nullif(p_datos ->> 'jornada_lre', '')::smallint, nullif(trim(p_datos ->> 'fun'), ''),
      nullif(p_datos ->> 'apv_regimen', ''), nullif(p_datos ->> 'apv_monto', '')::bigint, nullif(p_datos ->> 'apv_afp', ''),
      nullif(trim(p_datos ->> 'apv_contrato'), ''), nullif(p_datos ->> 'apv_forma', '')::smallint,
      nullif(p_datos ->> 'tramo_af', ''), coalesce((p_datos ->> 'cargas_simples')::smallint, 0),
      coalesce((p_datos ->> 'cargas_maternales')::smallint, 0), coalesce((p_datos ->> 'cargas_invalidez')::smallint, 0), v_uid)
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
      apv_regimen = nullif(p_datos ->> 'apv_regimen', ''), apv_monto = nullif(p_datos ->> 'apv_monto', '')::bigint,
      apv_afp = nullif(p_datos ->> 'apv_afp', ''), apv_contrato = nullif(trim(p_datos ->> 'apv_contrato'), ''),
      apv_forma = nullif(p_datos ->> 'apv_forma', '')::smallint,
      tramo_af = nullif(p_datos ->> 'tramo_af', ''), cargas_simples = coalesce((p_datos ->> 'cargas_simples')::smallint, 0),
      cargas_maternales = coalesce((p_datos ->> 'cargas_maternales')::smallint, 0),
      cargas_invalidez = coalesce((p_datos ->> 'cargas_invalidez')::smallint, 0),
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

revoke execute on function public.rem_guardar_trabajador(uuid, uuid, jsonb) from public, anon;
grant execute on function public.rem_guardar_trabajador(uuid, uuid, jsonb) to authenticated;
