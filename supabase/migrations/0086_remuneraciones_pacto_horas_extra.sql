-- =====================================================================
-- ENQORA · 0086 · Remuneraciones: pacto de horas extraordinarias (art. 32 del Código del Trabajo)
-- Nuevo tipo «pacto_he» en rem_contratos, con la misma revisión de un abogado de ENQORA. La base valida la
-- vigencia (máximo tres meses, renovable con otro pacto) y el máximo de 2 horas extraordinarias por día.
-- Las liquidaciones con horas extra avisan cuando el mes no está cubierto por un pacto aprobado.
-- Requiere la 0085. Se puede ejecutar más de una vez.
-- =====================================================================

alter table public.rem_contratos drop constraint if exists rem_contratos_tipo_check;
alter table public.rem_contratos add constraint rem_contratos_tipo_check check (tipo in ('contrato', 'anexo', 'pacto_he'));

create or replace function public.rem_contrato_guardar(p_trabajador uuid, p_tipo text, p_plantilla text, p_datos jsonb,
  p_contenido text, p_avisos jsonb, p_reemplaza uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_trab public.rem_trabajadores;
  v_prev public.rem_contratos;
  v_version int;
  v_numero int;
  v_id uuid;
begin
  select * into v_trab from public.rem_trabajadores where id = p_trabajador;
  if not found then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if not private.rem_puede(v_trab.company_id) or private.is_staff(array['ai_agent']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_tipo not in ('contrato', 'anexo', 'pacto_he') or coalesce(jsonb_typeof(p_datos), '') <> 'object' or octet_length(p_datos::text) > 6000
     or coalesce(jsonb_typeof(p_avisos), '') <> 'array' or octet_length(p_avisos::text) > 4000 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  perform pg_advisory_xact_lock(hashtext('rem_contrato:' || p_trabajador));
  if p_tipo = 'contrato' then
    if exists (select 1 from public.rem_contratos where trabajador_id = p_trabajador and tipo = 'contrato' and estado = 'aprobado') then
      raise exception 'ENQ_CONTRATO_YA_APROBADO';
    end if;
    update public.rem_contratos set estado = 'anulado', anulado_por = v_uid, anulado_at = now(), motivo_anulacion = 'Reemplazado por una versión nueva'
      where trabajador_id = p_trabajador and tipo = 'contrato' and estado in ('en_revision', 'observado');
  elsif p_tipo = 'pacto_he' then
    -- Art. 32: vigencia transitoria no superior a tres meses (renovable con un pacto nuevo), hasta 2 horas por día.
    if coalesce(p_datos ->> 'desde', '') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(p_datos ->> 'hasta', '') !~ '^\d{4}-\d{2}-\d{2}$'
       or (p_datos ->> 'hasta')::date < (p_datos ->> 'desde')::date
       or (p_datos ->> 'hasta')::date >= ((p_datos ->> 'desde')::date + interval '3 months')::date
       or (p_datos ->> 'desde')::date < v_trab.fecha_ingreso
       or coalesce((p_datos ->> 'horas_dia')::numeric, 0) not between 0.5 and 2 then
      raise exception 'ENQ_PACTO_HE_FECHAS';
    end if;
    if p_reemplaza is not null then
      select * into v_prev from public.rem_contratos where id = p_reemplaza and trabajador_id = p_trabajador and tipo = 'pacto_he' for update;
      if not found or v_prev.estado not in ('en_revision', 'observado') then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
      update public.rem_contratos set estado = 'anulado', anulado_por = v_uid, anulado_at = now(), motivo_anulacion = 'Reemplazado por una versión nueva'
        where id = p_reemplaza;
    end if;
  else
    if p_reemplaza is not null then
      select * into v_prev from public.rem_contratos where id = p_reemplaza and trabajador_id = p_trabajador and tipo = 'anexo' for update;
      if not found or v_prev.estado not in ('en_revision', 'observado') then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
      update public.rem_contratos set estado = 'anulado', anulado_por = v_uid, anulado_at = now(), motivo_anulacion = 'Reemplazado por una versión nueva'
        where id = p_reemplaza;
      v_numero := v_prev.numero_anexo;
    else
      select coalesce(max(numero_anexo), 0) + 1 into v_numero from public.rem_contratos where trabajador_id = p_trabajador and tipo = 'anexo';
    end if;
  end if;
  select coalesce(max(version), 0) + 1 into v_version from public.rem_contratos where trabajador_id = p_trabajador and tipo = p_tipo;
  insert into public.rem_contratos (company_id, trabajador_id, tipo, version, numero_anexo, plantilla, datos, contenido, avisos, creado_por)
  values (v_trab.company_id, p_trabajador, p_tipo, v_version, v_numero, left(p_plantilla, 30), p_datos, p_contenido, p_avisos, v_uid)
  returning id into v_id;
  perform private.log_event(v_trab.company_id, 'laboral.' || p_tipo || '_enviado', v_trab.rut || ' v' || v_version,
    jsonb_build_object('id', v_id, 'trabajador', p_trabajador, 'numero_anexo', v_numero));
  return v_id;
exception
  when check_violation then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

