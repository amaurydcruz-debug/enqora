-- =====================================================================
-- ENQORA · 0075 · Documentos laborales (Ley Karin): protocolo de prevención y procedimiento de investigación
-- La empresa completa sus datos y ENQORA arma un borrador con plantillas fijas. El borrador queda «en revisión»
-- hasta que un abogado de ENQORA (persona, nunca un agente) lo aprueba o lo observa. Solo una versión aprobada se
-- puede imprimir como definitiva. Cada versión es inmutable; una corrección del abogado crea una versión nueva.
-- Se puede ejecutar más de una vez.
-- =====================================================================

create table if not exists public.documentos_laborales (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  tipo text not null check (tipo in ('protocolo_karin', 'procedimiento_karin')),
  version int not null check (version >= 1),
  plantilla text not null check (char_length(plantilla) between 4 and 30),
  datos jsonb not null,
  contenido text not null check (char_length(contenido) between 100 and 60000),
  estado text not null default 'en_revision' check (estado in ('en_revision', 'observado', 'aprobado', 'reemplazado', 'corregido', 'anulado')),
  origen uuid references public.documentos_laborales (id) on delete set null,
  creado_por uuid references auth.users (id) on delete set null,
  creado timestamptz not null default now(),
  revisado_por uuid references auth.users (id) on delete set null,
  revisado_at timestamptz,
  observacion text check (observacion is null or char_length(observacion) <= 2000),
  unique (company_id, tipo, version)
);
create unique index if not exists documentos_laborales_un_aprobado on public.documentos_laborales (company_id, tipo) where estado = 'aprobado';
create index if not exists documentos_laborales_revision on public.documentos_laborales (estado, creado) where estado = 'en_revision';
alter table public.documentos_laborales enable row level security;
revoke all on public.documentos_laborales from anon, authenticated;
grant select on public.documentos_laborales to authenticated;
drop policy if exists documentos_laborales_ver on public.documentos_laborales;
create policy documentos_laborales_ver on public.documentos_laborales for select to authenticated
  using (private.is_member(company_id) or private.works_company(company_id)
         or private.is_staff(array['enqora_admin', 'ops_director', 'lawyer_pro']));

create or replace function private.doc_laboral_inmutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.companies c where c.id = old.company_id) then return old; end if;
    raise exception 'ENQ_NO_SE_BORRA';
  end if;
  if (to_jsonb(new) - array['estado', 'revisado_por', 'revisado_at', 'observacion'])
     is distinct from (to_jsonb(old) - array['estado', 'revisado_por', 'revisado_at', 'observacion']) then
    raise exception 'ENQ_DOCUMENTO_INMUTABLE';
  end if;
  if not ((old.estado = 'en_revision' and new.estado in ('observado', 'aprobado', 'corregido', 'anulado'))
          or (old.estado = 'observado' and new.estado = 'anulado')
          or (old.estado = 'aprobado' and new.estado in ('reemplazado', 'anulado'))
          or old.estado = new.estado) then
    raise exception 'ENQ_DOCUMENTO_INMUTABLE';
  end if;
  return new;
end
$$;
drop trigger if exists documentos_laborales_inmutable on public.documentos_laborales;
create trigger documentos_laborales_inmutable before update or delete on public.documentos_laborales
  for each row execute function private.doc_laboral_inmutable();

-- La empresa (propietario o administrador) o el equipo asignado genera una versión y la envía a revisión.
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
  if coalesce(jsonb_typeof(p_datos), '') <> 'object' or octet_length(p_datos::text) > 4000 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
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

-- Revisión jurídica: aprobar (opcionalmente con el texto corregido por el abogado) u observar con comentario.
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
    case when p_decision = 'aprobar' then 'Documento laboral aprobado' else 'Tu documento laboral tiene observaciones' end,
    case when p_decision = 'aprobar' then 'El equipo legal de ENQORA aprobó tu documento. Ya puedes imprimirlo, firmarlo y difundirlo.'
         else 'El equipo legal de ENQORA dejó observaciones. Revísalas y genera una versión nueva.' end,
    '/laboral', 'doc_laboral:' || p_id || ':' || p_decision);
  return v_final;
exception
  when check_violation then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

revoke execute on function private.doc_laboral_inmutable() from public, anon, authenticated;
revoke execute on function public.doc_laboral_generar(uuid, text, text, jsonb, text) from public, anon;
grant execute on function public.doc_laboral_generar(uuid, text, text, jsonb, text) to authenticated;
revoke execute on function public.doc_laboral_revisar(uuid, text, text, text) from public, anon;
grant execute on function public.doc_laboral_revisar(uuid, text, text, text) to authenticated;
