-- =====================================================================
-- ENQORA · 0087 · Reglamento Interno de Orden, Higiene y Seguridad
-- Nuevo tipo «reglamento_interno» en documentos_laborales: mismo flujo que la Ley Karin y la política de datos
-- (borrador de la empresa → revisión y aprobación de un abogado de ENQORA → impresión). Los datos del borrador pueden
-- pesar hasta 8.000 bytes (antes 4.000): el reglamento lleva horario, riesgos y emergencias descritos por la empresa.
-- Requiere la 0076. Se puede ejecutar más de una vez.
-- =====================================================================

alter table public.documentos_laborales drop constraint if exists documentos_laborales_tipo_check;
alter table public.documentos_laborales add constraint documentos_laborales_tipo_check
  check (tipo in ('protocolo_karin', 'procedimiento_karin', 'politica_datos', 'reglamento_interno'));

create or replace function public.doc_laboral_generar(p_company uuid, p_tipo text, p_plantilla text, p_datos jsonb, p_contenido text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_version int;
  v_id uuid;
begin
  if not (private.has_role(p_company, array['owner', 'admin']) or private.works_company(p_company)) or private.is_staff(array['ai_agent']) then
    raise exception 'ENQ_SIN_PERMISO';
  end if;
  if coalesce(jsonb_typeof(p_datos), '') <> 'object' or octet_length(p_datos::text) > 8000 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  perform pg_advisory_xact_lock(hashtext('doc_laboral:' || p_company || ':' || p_tipo));
  -- Una versión nueva deja sin efecto la que aún esperaba revisión.
  update public.documentos_laborales set estado = 'anulado', observacion = coalesce(observacion, 'Reemplazada por una versión nueva de la empresa')
    where company_id = p_company and tipo = p_tipo and estado = 'en_revision';
  select coalesce(max(version), 0) + 1 into v_version from public.documentos_laborales where company_id = p_company and tipo = p_tipo;
  insert into public.documentos_laborales (company_id, tipo, version, plantilla, datos, contenido, creado_por)
  values (p_company, p_tipo, v_version, p_plantilla, p_datos, p_contenido, v_uid)
  returning id into v_id;
  perform private.log_event(p_company, 'laboral.documento_generado', p_tipo || ' v' || v_version, jsonb_build_object('id', v_id));
  return v_id;
exception
  when check_violation then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

