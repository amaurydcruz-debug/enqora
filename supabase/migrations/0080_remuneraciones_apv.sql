-- =====================================================================
-- ENQORA · 0080 · Remuneraciones: APV individual por planilla (art. 42 bis LIR)
-- Ficha del trabajador: régimen A o B, monto mensual, AFP que lo recibe, número de contrato y forma de pago
-- (Previred, campos 40 a 43). El régimen B rebaja la base del impuesto único hasta 50 UF al mes.
-- Requiere la 0074. Se puede ejecutar más de una vez.
-- =====================================================================

alter table public.rem_trabajadores
  add column if not exists apv_regimen text check (apv_regimen is null or apv_regimen in ('A', 'B')),
  add column if not exists apv_monto bigint check (apv_monto is null or apv_monto between 1 and 20000000),
  add column if not exists apv_afp text check (apv_afp is null or char_length(apv_afp) between 3 and 20),
  add column if not exists apv_contrato text check (apv_contrato is null or char_length(apv_contrato) <= 20),
  add column if not exists apv_forma smallint check (apv_forma is null or apv_forma in (1, 2));
alter table public.rem_trabajadores drop constraint if exists rem_trabajadores_apv_completo;
alter table public.rem_trabajadores add constraint rem_trabajadores_apv_completo
  check (apv_regimen is null or (apv_monto is not null and apv_afp is not null and apv_forma is not null));

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
      extranjero, comuna, jornada_lre, fun, apv_regimen, apv_monto, apv_afp, apv_contrato, apv_forma, creado_por)
    values (p_company, upper(p_datos ->> 'rut'), v_nombre, nullif(trim(p_datos ->> 'cargo'), ''),
      (p_datos ->> 'fecha_ingreso')::date, p_datos ->> 'tipo_contrato', (p_datos ->> 'sueldo_base')::bigint,
      (p_datos ->> 'jornada_horas')::numeric, p_datos ->> 'afp', p_datos ->> 'salud', nullif(trim(p_datos ->> 'isapre'), ''),
      nullif(p_datos ->> 'plan_isapre_uf', '')::numeric, coalesce((p_datos ->> 'colacion')::bigint, 0),
      coalesce((p_datos ->> 'movilizacion')::bigint, 0), coalesce(p_datos ->> 'gratificacion', 'art50'),
      nullif(trim(p_datos ->> 'apellido_paterno'), ''), nullif(trim(p_datos ->> 'apellido_materno'), ''), nullif(trim(p_datos ->> 'nombres'), ''),
      nullif(p_datos ->> 'sexo', ''), coalesce((p_datos ->> 'extranjero')::boolean, false), nullif(p_datos ->> 'comuna', '')::int,
      nullif(p_datos ->> 'jornada_lre', '')::smallint, nullif(trim(p_datos ->> 'fun'), ''),
      nullif(p_datos ->> 'apv_regimen', ''), nullif(p_datos ->> 'apv_monto', '')::bigint, nullif(p_datos ->> 'apv_afp', ''),
      nullif(trim(p_datos ->> 'apv_contrato'), ''), nullif(p_datos ->> 'apv_forma', '')::smallint, v_uid)
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
