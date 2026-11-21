-- =====================================================================
-- ENQORA · 0076 · Política de tratamiento de datos personales (Ley 21.719, art. 14 ter) para empresas cliente
-- Usa el mismo flujo de documentos con revisión jurídica de la 0075: la empresa genera el borrador, un abogado
-- de ENQORA lo aprueba u observa, y solo la versión aprobada se publica. Requiere la 0075.
-- Se puede ejecutar más de una vez.
-- =====================================================================

alter table public.documentos_laborales drop constraint if exists documentos_laborales_tipo_check;
alter table public.documentos_laborales add constraint documentos_laborales_tipo_check
  check (tipo in ('protocolo_karin', 'procedimiento_karin', 'politica_datos'));

create or replace function public.doc_laboral_revisar(p_id uuid, p_decision text, p_observacion text default null, p_contenido text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_doc public.documentos_laborales;
  v_final uuid := p_id;
  v_version int;
begin
  if not private.is_staff(array['enqora_admin', 'lawyer_pro']) or private.is_staff(array['ai_agent']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  select * into v_doc from public.documentos_laborales where id = p_id for update;
  if not found then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if v_doc.estado <> 'en_revision' then raise exception 'ENQ_YA_DECIDIDA'; end if;
  if p_decision = 'observar' then
    if char_length(coalesce(trim(p_observacion), '')) < 5 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
    update public.documentos_laborales set estado = 'observado', revisado_por = v_uid, revisado_at = now(), observacion = left(trim(p_observacion), 2000)
      where id = p_id;
  elsif p_decision = 'aprobar' then
    update public.documentos_laborales set estado = 'reemplazado' where company_id = v_doc.company_id and tipo = v_doc.tipo and estado = 'aprobado';
    if p_contenido is not null and trim(p_contenido) <> '' and p_contenido <> v_doc.contenido then
      update public.documentos_laborales set estado = 'corregido', revisado_por = v_uid, revisado_at = now(),
        observacion = nullif(left(trim(coalesce(p_observacion, '')), 2000), '') where id = p_id;
      select max(version) + 1 into v_version from public.documentos_laborales where company_id = v_doc.company_id and tipo = v_doc.tipo;
      insert into public.documentos_laborales (company_id, tipo, version, plantilla, datos, contenido, estado, origen, creado_por, revisado_por, revisado_at, observacion)
      values (v_doc.company_id, v_doc.tipo, v_version, v_doc.plantilla, v_doc.datos, p_contenido, 'aprobado', p_id, v_uid, v_uid, now(),
              nullif(left(trim(coalesce(p_observacion, '')), 2000), ''))
      returning id into v_final;
    else
      update public.documentos_laborales set estado = 'aprobado', revisado_por = v_uid, revisado_at = now(),
        observacion = nullif(left(trim(coalesce(p_observacion, '')), 2000), '') where id = p_id;
    end if;
  else
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  perform private.log_event(v_doc.company_id, 'laboral.documento_' || p_decision, v_doc.tipo || ' v' || v_doc.version,
    jsonb_build_object('id', p_id, 'final', v_final, 'corregido', v_final <> p_id));
  perform private.notify(
    array(select m.user_id from public.company_members m where m.company_id = v_doc.company_id and m.role in ('owner', 'admin')),
    v_doc.company_id, null, 'casos',
    case when p_decision = 'aprobar' then case when v_doc.tipo = 'politica_datos' then 'Política de datos aprobada' else 'Documento laboral aprobado' end else 'Tu documento tiene observaciones' end,
    case when p_decision = 'aprobar' then 'El equipo legal de ENQORA aprobó tu documento. Ya puedes imprimirlo, firmarlo y difundirlo.'
         else 'El equipo legal de ENQORA dejó observaciones. Revísalas y genera una versión nueva.' end,
    case when v_doc.tipo = 'politica_datos' then '/datos-personales' else '/laboral' end, 'doc_laboral:' || p_id || ':' || p_decision);
  return v_final;
exception
  when check_violation then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

revoke execute on function public.doc_laboral_revisar(uuid, text, text, text) from public, anon;
grant execute on function public.doc_laboral_revisar(uuid, text, text, text) to authenticated;
