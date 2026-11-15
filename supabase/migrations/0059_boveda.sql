-- =====================================================================
-- ENQORA · 0059 · Bóveda de archivos ENQORA
-- Registro único de documentos (ISO 15489: auténticos, confiables, íntegros y utilizables).
-- Todo documento de ENQORA tiene aquí su folio, caso, clase, estado, responsable, versiones con huella
-- SHA-256, plazo de conservación y una bitácora encadenada que no se puede editar ni borrar.
-- Flujo de un documento generado:
--   pedido al Archivero → Secretaria reúne antecedentes → Redactor prepara borrador → previsualización →
--   revisión profesional (abogado o contador, después de verlo) → autorización y envío → archivo.
-- Los agentes de IA solo preparan (antecedentes y borradores): nunca aprueban, autorizan ni envían.
-- Los archivos que ya se suben a los casos (case_documents) quedan registrados en la Bóveda automáticamente.
-- Se puede ejecutar más de una vez.
-- =====================================================================

create sequence if not exists public.vault_folio_seq;

create table if not exists public.vault_documents (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique default ('DOC-' || to_char(now() at time zone 'America/Santiago', 'YYYY') || '-' || lpad(nextval('public.vault_folio_seq')::text, 6, '0')),
  company_id uuid not null references public.companies (id) on delete restrict,
  case_id uuid references public.cases (id) on delete restrict,
  tipo text not null check (tipo ~ '^[a-z0-9_]{2,40}$'),
  clase text not null check (clase in ('escrito_legal', 'contrato', 'poder_mandato', 'solicitud_tramite', 'declaracion', 'informe',
    'correspondencia', 'respaldo_tributario', 'respaldo_contable', 'respaldo_laboral', 'identidad', 'evidencia', 'otro')),
  titulo text not null check (char_length(titulo) between 3 and 200),
  proposito text check (char_length(proposito) <= 500),
  destinatario text check (char_length(destinatario) <= 200),
  origen text not null check (origen in ('generado', 'subido')),
  estado text not null default 'solicitado' check (estado in ('solicitado', 'antecedentes', 'borrador', 'en_revision', 'observado',
    'aprobado', 'enviado', 'archivado', 'anulado')),
  confidencialidad text not null default 'cliente' check (confidencialidad in ('cliente', 'interno', 'reservado')),
  revisor_requerido text not null default 'profesional' check (revisor_requerido in ('abogado', 'contador', 'profesional')),
  responsable_id uuid references auth.users (id) on delete set null,
  revisor_id uuid references auth.users (id) on delete set null,
  autorizado_por uuid references auth.users (id) on delete set null,
  autorizado_at timestamptz,
  enviado_via text check (enviado_via in ('cliente', 'descarga', 'institucion')),
  version_actual int not null default 0,
  version_final int,
  storage_path text unique,
  mime_type text,
  size_bytes bigint,
  sha256 text,
  antecedentes jsonb not null default '{}'::jsonb check (jsonb_typeof(antecedentes) = 'object' and octet_length(antecedentes::text) <= 60000),
  retencion_hasta date not null default ((now() at time zone 'America/Santiago')::date + interval '6 years')::date,
  retencion_motivo text not null default 'Política ENQORA: 6 años (plazo de revisión del SII, arts. 17 y 200 del Código Tributario)',
  retencion_legal boolean not null default false,
  anulado_motivo text,
  solicitado_por uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vault_documents_company_idx on public.vault_documents (company_id, created_at desc);
create index if not exists vault_documents_case_idx on public.vault_documents (case_id, created_at desc);
create index if not exists vault_documents_estado_idx on public.vault_documents (estado);

create table if not exists public.vault_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.vault_documents (id) on delete restrict,
  version int not null,
  cuerpo text check (char_length(cuerpo) <= 120000),
  faltantes text[] not null default '{}',
  normas text[] not null default '{}',
  sha256 text not null,
  autor_tipo text not null check (autor_tipo in ('persona', 'agente')),
  autor_agente text,
  autor_id uuid references auth.users (id) on delete set null,
  nota text check (char_length(nota) <= 1000),
  created_at timestamptz not null default now(),
  unique (document_id, version)
);

-- Bitácora encadenada: cada evento guarda la huella del anterior. No se edita ni se borra.
create table if not exists public.vault_events (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.vault_documents (id) on delete restrict,
  accion text not null check (char_length(accion) between 3 and 40),
  actor_id uuid references auth.users (id) on delete set null,
  actor_tipo text not null default 'persona' check (actor_tipo in ('persona', 'agente', 'sistema')),
  actor_agente text,
  detalle jsonb not null default '{}'::jsonb,
  hash_previo text,
  hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists vault_events_doc_idx on public.vault_events (document_id, id);

create or replace function private.vault_no_editar() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'ENQ_BITACORA_INMUTABLE';
end
$$;
drop trigger if exists vault_events_inmutable on public.vault_events;
create trigger vault_events_inmutable before update or delete on public.vault_events
  for each row execute function private.vault_no_editar();
drop trigger if exists vault_versions_inmutable on public.vault_versions;
create trigger vault_versions_inmutable before update or delete on public.vault_versions
  for each row execute function private.vault_no_editar();

-- Un documento nunca se borra: se anula con motivo (y se conserva hasta su plazo).
create or replace function private.vault_no_borrar() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'ENQ_DOCUMENTO_NO_BORRABLE';
end
$$;
drop trigger if exists vault_documents_no_borrar on public.vault_documents;
create trigger vault_documents_no_borrar before delete on public.vault_documents
  for each row execute function private.vault_no_borrar();

create or replace function private.vault_evento(p_doc uuid, p_accion text, p_detalle jsonb default '{}'::jsonb,
  p_actor_tipo text default 'persona', p_agente text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_prev text;
  v_ahora timestamptz := clock_timestamp();
  v_actor uuid := auth.uid();
begin
  select hash into v_prev from public.vault_events where document_id = p_doc order by id desc limit 1;
  insert into public.vault_events (document_id, accion, actor_id, actor_tipo, actor_agente, detalle, hash_previo, hash, created_at)
  values (p_doc, p_accion, v_actor, p_actor_tipo, p_agente, coalesce(p_detalle, '{}'::jsonb), v_prev,
    encode(extensions.digest(coalesce(v_prev, '') || '|' || p_doc::text || '|' || p_accion || '|' || coalesce(v_actor::text, '') || '|'
      || coalesce(p_agente, '') || '|' || coalesce(p_detalle, '{}'::jsonb)::text || '|' || extract(epoch from v_ahora)::text, 'sha256'), 'hex'),
    v_ahora);
  update public.vault_documents set updated_at = now() where id = p_doc;
end
$$;

-- Verificación de la cadena: recalcula cada huella.
create or replace function public.vault_verificar_cadena(p_doc uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  e record;
  v_prev text := null;
begin
  if not private.vault_puede_ver(p_doc) then raise exception 'ENQ_SIN_PERMISO'; end if;
  for e in select * from public.vault_events where document_id = p_doc order by id loop
    if e.hash_previo is distinct from v_prev or e.hash <> encode(extensions.digest(coalesce(e.hash_previo, '') || '|' || e.document_id::text || '|'
       || e.accion || '|' || coalesce(e.actor_id::text, '') || '|' || coalesce(e.actor_agente, '') || '|' || e.detalle::text || '|'
       || extract(epoch from e.created_at)::text, 'sha256'), 'hex') then
      return false;
    end if;
    v_prev := e.hash;
  end loop;
  return true;
end
$$;

-- ---------------------------------------------------------------------
-- Acceso
-- ---------------------------------------------------------------------
create or replace function private.vault_es_equipo(p_doc uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.vault_documents d where d.id = p_doc and (
    private.is_supervisor()
    or d.responsable_id = auth.uid() or d.revisor_id = auth.uid()
    or (d.confidencialidad <> 'reservado' and d.case_id is not null and private.can_work_case(d.case_id))))
$$;

create or replace function private.vault_puede_ver(p_doc uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.vault_es_equipo(p_doc) or exists (
    select 1 from public.vault_documents d where d.id = p_doc and d.confidencialidad = 'cliente' and private.is_member(d.company_id)
      and (d.origen = 'subido' or d.estado in ('solicitado', 'antecedentes', 'borrador', 'en_revision', 'observado', 'aprobado', 'enviado', 'archivado')))
$$;

alter table public.vault_documents enable row level security;
alter table public.vault_versions enable row level security;
alter table public.vault_events enable row level security;
revoke all on public.vault_documents, public.vault_versions, public.vault_events from anon, authenticated;
grant select on public.vault_documents, public.vault_versions, public.vault_events to authenticated;
drop policy if exists vault_documents_leer on public.vault_documents;
create policy vault_documents_leer on public.vault_documents for select to authenticated using (private.vault_puede_ver(id));
-- El cliente ve el contenido solo de la versión final enviada; el equipo ve todas las versiones.
drop policy if exists vault_versions_leer on public.vault_versions;
create policy vault_versions_leer on public.vault_versions for select to authenticated using (
  private.vault_es_equipo(document_id)
  or exists (select 1 from public.vault_documents d where d.id = document_id and d.version_final = version and private.vault_puede_ver(d.id)));
drop policy if exists vault_events_leer on public.vault_events;
create policy vault_events_leer on public.vault_events for select to authenticated using (private.vault_es_equipo(document_id));

-- ---------------------------------------------------------------------
-- Archivos subidos a los casos: quedan registrados en la Bóveda
-- ---------------------------------------------------------------------
create or replace function private.vault_registrar_subida() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  insert into public.vault_documents (company_id, case_id, tipo, clase, titulo, origen, estado, confidencialidad, storage_path,
    mime_type, size_bytes, solicitado_por, created_at)
  values (new.company_id, new.case_id, 'archivo_subido', 'evidencia', left(new.file_name, 200), 'subido', 'archivado',
    case when new.visibility = 'interno' then 'interno' else 'cliente' end, new.storage_path, new.mime_type, new.size_bytes,
    new.uploaded_by, new.created_at)
  on conflict (storage_path) do nothing
  returning id into v_id;
  if v_id is not null then
    perform private.vault_evento(v_id, 'registrado', jsonb_build_object('origen', 'subida al caso', 'archivo', new.file_name), 'sistema');
  end if;
  return new;
end
$$;
drop trigger if exists vault_registrar_subida on public.case_documents;
create trigger vault_registrar_subida after insert on public.case_documents
  for each row execute function private.vault_registrar_subida();

-- Lo ya subido antes de la Bóveda también queda registrado (una vez).
insert into public.vault_documents (company_id, case_id, tipo, clase, titulo, origen, estado, confidencialidad, storage_path, mime_type,
  size_bytes, solicitado_por, created_at, retencion_hasta)
select cd.company_id, cd.case_id, 'archivo_subido', 'evidencia', left(cd.file_name, 200), 'subido', 'archivado',
  case when cd.visibility = 'interno' then 'interno' else 'cliente' end, cd.storage_path, cd.mime_type, cd.size_bytes, cd.uploaded_by,
  cd.created_at, ((cd.created_at at time zone 'America/Santiago')::date + interval '6 years')::date
from public.case_documents cd
on conflict (storage_path) do nothing;

-- ---------------------------------------------------------------------
-- Flujo de un documento generado
-- ---------------------------------------------------------------------
-- 1. Pedido al Archivero (cliente con permiso en el caso, o el equipo).
create or replace function public.vault_pedir(p_case uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
  v_case public.cases;
  v_d public.vault_documents;
  v_equipo boolean;
begin
  select * into v_case from public.cases where id = p_case;
  if not found then raise exception 'ENQ_NO_ENCONTRADO'; end if;
  if not private.can_post_case(p_case) then raise exception 'ENQ_SIN_PERMISO'; end if;
  v_equipo := private.can_work_case(p_case);
  if coalesce(p ->> 'tipo', '') !~ '^[a-z0-9_]{2,40}$' or char_length(trim(coalesce(p ->> 'titulo', ''))) < 3
     or coalesce(p ->> 'clase', '') not in ('escrito_legal', 'contrato', 'poder_mandato', 'solicitud_tramite', 'declaracion', 'informe', 'correspondencia', 'otro')
     or coalesce(p ->> 'revisor', 'profesional') not in ('abogado', 'contador', 'profesional') then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  insert into public.vault_documents (company_id, case_id, tipo, clase, titulo, proposito, destinatario, origen, estado,
    confidencialidad, revisor_requerido, responsable_id, solicitado_por)
  values (v_case.company_id, p_case, p ->> 'tipo', p ->> 'clase', left(trim(p ->> 'titulo'), 200), left(nullif(trim(p ->> 'proposito'), ''), 500),
    left(nullif(trim(p ->> 'destinatario'), ''), 200), 'generado', 'solicitado',
    case when v_equipo and p ->> 'confidencialidad' in ('interno', 'reservado') then p ->> 'confidencialidad' else 'cliente' end,
    coalesce(p ->> 'revisor', 'profesional'), coalesce(v_case.responsible_id, case when v_equipo then v_uid end), v_uid)
  returning * into v_d;
  perform private.vault_evento(v_d.id, 'pedido', jsonb_build_object('tipo', v_d.tipo, 'proposito', v_d.proposito,
    'pedido_por', case when v_equipo then 'equipo' else 'cliente' end));
  perform private.log_case(p_case, 'documento', 'Se pidió el documento ' || v_d.folio || ': ' || v_d.titulo || '.', 'cliente',
    jsonb_build_object('vault_document', v_d.id));
  return jsonb_build_object('id', v_d.id, 'folio', v_d.folio);
end
$$;

-- 2. Secretaria: guarda la carpeta de antecedentes (la prepara un agente a pedido de una persona del equipo).
create or replace function public.vault_guardar_antecedentes(p_doc uuid, p jsonb, p_agente text default 'secretaria') returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
begin
  if not private.vault_es_equipo(p_doc) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if jsonb_typeof(p) <> 'object' or octet_length(p::text) > 60000 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  update public.vault_documents set antecedentes = p,
    estado = case when estado in ('solicitado', 'antecedentes', 'observado') then 'antecedentes' else estado end,
    responsable_id = coalesce(responsable_id, v_uid)
  where id = p_doc and origen = 'generado' and estado not in ('aprobado', 'enviado', 'archivado', 'anulado');
  if not found then raise exception 'ENQ_DOCUMENTO_NO_EDITABLE'; end if;
  perform private.vault_evento(p_doc, 'antecedentes', jsonb_build_object('faltantes', coalesce(jsonb_array_length(p -> 'faltantes'), 0)),
    'agente', p_agente);
end
$$;

-- 3. Redactor (agente) o una persona: nueva versión del borrador.
create or replace function public.vault_guardar_borrador(p_doc uuid, p_cuerpo text, p_faltantes text[], p_normas text[],
  p_agente text default null, p_nota text default null) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
  v_v int;
begin
  if not private.vault_es_equipo(p_doc) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if char_length(coalesce(p_cuerpo, '')) not between 50 and 120000 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  update public.vault_documents set version_actual = version_actual + 1, estado = 'borrador', revisor_id = null
  where id = p_doc and origen = 'generado' and estado in ('solicitado', 'antecedentes', 'borrador', 'observado', 'en_revision')
  returning version_actual into v_v;
  if v_v is null then raise exception 'ENQ_DOCUMENTO_NO_EDITABLE'; end if;
  insert into public.vault_versions (document_id, version, cuerpo, faltantes, normas, sha256, autor_tipo, autor_agente, autor_id, nota)
  values (p_doc, v_v, p_cuerpo, coalesce(p_faltantes, '{}'), coalesce(p_normas, '{}'),
    encode(extensions.digest(p_cuerpo, 'sha256'), 'hex'), case when p_agente is null then 'persona' else 'agente' end,
    p_agente, v_uid, left(p_nota, 1000));
  perform private.vault_evento(p_doc, 'borrador', jsonb_build_object('version', v_v, 'faltantes', coalesce(array_length(p_faltantes, 1), 0)),
    case when p_agente is null then 'persona' else 'agente' end, p_agente);
  return v_v;
end
$$;

-- Previsualización: queda registrada (quien aprueba debe haber visto la versión que aprueba).
create or replace function public.vault_registrar_vista(p_doc uuid, p_version int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_session();
  if not private.vault_puede_ver(p_doc) then raise exception 'ENQ_SIN_PERMISO'; end if;
  perform private.vault_evento(p_doc, 'visualizado', jsonb_build_object('version', p_version));
end
$$;

-- 4. Enviar a revisión: el documento no puede tener datos por completar.
create or replace function public.vault_enviar_revision(p_doc uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_d public.vault_documents;
  v_cuerpo text;
begin
  perform private.require_session(true);
  if not private.vault_es_equipo(p_doc) then raise exception 'ENQ_SIN_PERMISO'; end if;
  select * into v_d from public.vault_documents where id = p_doc for update;
  if v_d.estado not in ('borrador', 'observado') or v_d.version_actual < 1 then raise exception 'ENQ_DOCUMENTO_NO_EDITABLE'; end if;
  select cuerpo into v_cuerpo from public.vault_versions where document_id = p_doc and version = v_d.version_actual;
  if v_cuerpo ~ '\[COMPLETAR' then raise exception 'ENQ_DOCUMENTO_INCOMPLETO'; end if;
  update public.vault_documents set estado = 'en_revision' where id = p_doc;
  perform private.vault_evento(p_doc, 'enviado_a_revision', jsonb_build_object('version', v_d.version_actual));
end
$$;

-- 5. Revisión profesional: abogado o contador (según el documento), después de previsualizar esa versión.
create or replace function public.vault_revisar(p_doc uuid, p_decision text, p_nota text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
  v_d public.vault_documents;
  v_rol text := private.staff_role();
  v_redacto boolean;
begin
  select * into v_d from public.vault_documents where id = p_doc for update;
  if not found then raise exception 'ENQ_NO_ENCONTRADO'; end if;
  if not private.vault_es_equipo(p_doc) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if not (v_rol = 'enqora_admin'
          or (v_d.revisor_requerido = 'abogado' and v_rol = 'lawyer_pro')
          or (v_d.revisor_requerido = 'contador' and v_rol = 'accountant_pro')
          or (v_d.revisor_requerido = 'profesional' and v_rol in ('lawyer_pro', 'accountant_pro'))) then
    raise exception 'ENQ_SIN_PERMISO';
  end if;
  if v_d.estado <> 'en_revision' then raise exception 'ENQ_DOCUMENTO_NO_EDITABLE'; end if;
  if p_decision not in ('aprobar', 'observar') or char_length(trim(coalesce(p_nota, ''))) < 5 then raise exception 'ENQ_FALTA_OBSERVACION'; end if;
  -- Revisión visual obligatoria de la versión que se aprueba.
  if not exists (select 1 from public.vault_events e where e.document_id = p_doc and e.accion = 'visualizado' and e.actor_id = v_uid
                   and (e.detalle ->> 'version')::int = v_d.version_actual) then
    raise exception 'ENQ_SIN_PREVISUALIZAR';
  end if;
  -- Nadie aprueba lo que redactó él mismo (los borradores de agentes los aprueba una persona).
  select exists (select 1 from public.vault_versions v where v.document_id = p_doc and v.version = v_d.version_actual
                   and v.autor_tipo = 'persona' and v.autor_id = v_uid) into v_redacto;
  if p_decision = 'aprobar' and v_redacto then raise exception 'ENQ_BOVEDA_CUATRO_OJOS'; end if;
  update public.vault_documents set estado = case when p_decision = 'aprobar' then 'aprobado' else 'observado' end,
    revisor_id = v_uid where id = p_doc;
  perform private.vault_evento(p_doc, case when p_decision = 'aprobar' then 'aprobado' else 'observado' end,
    jsonb_build_object('version', v_d.version_actual, 'nota', left(trim(p_nota), 1000)));
end
$$;

-- 6. Autorizar y enviar: supervisión o responsable del caso. Congela la versión final (huella SHA-256).
create or replace function public.vault_autorizar_enviar(p_doc uuid, p_via text, p_nota text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
  v_d public.vault_documents;
  v_hash text;
  v_resp uuid;
begin
  select * into v_d from public.vault_documents where id = p_doc for update;
  if not found then raise exception 'ENQ_NO_ENCONTRADO'; end if;
  select responsible_id into v_resp from public.cases where id = v_d.case_id;
  if not (private.is_supervisor() or v_resp = v_uid or v_d.responsable_id = v_uid) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_d.estado <> 'aprobado' then raise exception 'ENQ_BOVEDA_NO_APROBADO'; end if;
  if p_via not in ('cliente', 'descarga', 'institucion') then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  select sha256 into v_hash from public.vault_versions where document_id = p_doc and version = v_d.version_actual;
  update public.vault_documents set estado = 'enviado', version_final = version_actual, sha256 = v_hash, autorizado_por = v_uid,
    autorizado_at = now(), enviado_via = p_via,
    confidencialidad = case when p_via = 'cliente' then 'cliente' else confidencialidad end
  where id = p_doc;
  perform private.vault_evento(p_doc, 'autorizado_enviado', jsonb_build_object('version', v_d.version_actual, 'via', p_via,
    'sha256', v_hash, 'nota', left(nullif(trim(coalesce(p_nota, '')), ''), 500)));
  if v_d.case_id is not null then
    perform private.log_case(v_d.case_id, 'documento', 'Documento ' || v_d.folio || ' autorizado y ' ||
      case p_via when 'cliente' then 'enviado a tu espacio ENQORA' when 'institucion' then 'presentado ante la institución' else 'listo para descargar' end || '.',
      case when v_d.confidencialidad = 'cliente' or p_via = 'cliente' then 'cliente' else 'interno' end, jsonb_build_object('vault_document', p_doc));
  end if;
  if p_via = 'cliente' then
    perform private.notify(private.company_users(v_d.company_id, array['owner', 'admin', 'accountant']), v_d.company_id, v_d.case_id, 'casos',
      'Documento listo: ' || v_d.titulo, 'El documento ' || v_d.folio || ' fue revisado, autorizado y está en tu Bóveda.',
      '/casos/' || v_d.case_id || '#boveda', 'vault:' || p_doc);
  end if;
end
$$;

-- Asignar responsable y revisor (supervisión o responsable del caso).
create or replace function public.vault_asignar(p_doc uuid, p_responsable uuid, p_revisor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_d public.vault_documents;
begin
  perform private.require_session(true);
  select * into v_d from public.vault_documents where id = p_doc for update;
  if not found then raise exception 'ENQ_NO_ENCONTRADO'; end if;
  if not (private.is_supervisor() or v_d.responsable_id = auth.uid()) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if (p_responsable is not null and not private.staff_con_acceso(p_responsable)) or (p_revisor is not null and not private.staff_con_acceso(p_revisor)) then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  update public.vault_documents set responsable_id = coalesce(p_responsable, responsable_id), revisor_id = coalesce(p_revisor, revisor_id) where id = p_doc;
  perform private.vault_evento(p_doc, 'asignado', jsonb_build_object('responsable', p_responsable, 'revisor', p_revisor));
end
$$;

-- Anular (nunca borrar): supervisión, con motivo.
create or replace function public.vault_anular(p_doc uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_session(true);
  if not private.is_supervisor() then raise exception 'ENQ_SIN_PERMISO'; end if;
  if char_length(trim(coalesce(p_motivo, ''))) < 5 then raise exception 'ENQ_FALTA_OBSERVACION'; end if;
  update public.vault_documents set estado = 'anulado', anulado_motivo = left(trim(p_motivo), 500) where id = p_doc and estado <> 'anulado';
  if not found then raise exception 'ENQ_NO_ENCONTRADO'; end if;
  perform private.vault_evento(p_doc, 'anulado', jsonb_build_object('motivo', left(trim(p_motivo), 500)));
end
$$;

-- Retención legal (bloquea cualquier eliminación futura, aunque venza el plazo): supervisión.
create or replace function public.vault_retencion(p_doc uuid, p_retencion_legal boolean, p_hasta date, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_session(true);
  if not private.is_supervisor() then raise exception 'ENQ_SIN_PERMISO'; end if;
  if char_length(trim(coalesce(p_motivo, ''))) < 5 then raise exception 'ENQ_FALTA_OBSERVACION'; end if;
  update public.vault_documents set retencion_legal = coalesce(p_retencion_legal, retencion_legal),
    retencion_hasta = greatest(coalesce(p_hasta, retencion_hasta), retencion_hasta), retencion_motivo = left(trim(p_motivo), 300)
  where id = p_doc;
  if not found then raise exception 'ENQ_NO_ENCONTRADO'; end if;
  perform private.vault_evento(p_doc, 'retencion', jsonb_build_object('retencion_legal', p_retencion_legal, 'hasta', p_hasta, 'motivo', left(trim(p_motivo), 300)));
end
$$;

-- Descarga de un archivo subido: queda en la bitácora.
create or replace function public.vault_registrar_descarga(p_doc uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_path text;
begin
  perform private.require_session();
  if not private.vault_puede_ver(p_doc) then raise exception 'ENQ_SIN_PERMISO'; end if;
  select storage_path into v_path from public.vault_documents where id = p_doc;
  perform private.vault_evento(p_doc, 'descargado', '{}'::jsonb);
  return v_path;
end
$$;

-- Tablero del Archivero.
create or replace function public.vault_tablero() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_staff() then raise exception 'ENQ_SIN_PERMISO'; end if;
  return (select jsonb_object_agg(estado, n) from (
    select estado, count(*) as n from public.vault_documents d where private.vault_es_equipo(d.id) group by estado) x);
end
$$;

revoke execute on function public.vault_verificar_cadena(uuid) from public, anon;
revoke execute on function public.vault_pedir(uuid, jsonb) from public, anon;
revoke execute on function public.vault_guardar_antecedentes(uuid, jsonb, text) from public, anon;
revoke execute on function public.vault_guardar_borrador(uuid, text, text[], text[], text, text) from public, anon;
revoke execute on function public.vault_registrar_vista(uuid, int) from public, anon;
revoke execute on function public.vault_enviar_revision(uuid) from public, anon;
revoke execute on function public.vault_revisar(uuid, text, text) from public, anon;
revoke execute on function public.vault_autorizar_enviar(uuid, text, text) from public, anon;
revoke execute on function public.vault_asignar(uuid, uuid, uuid) from public, anon;
revoke execute on function public.vault_anular(uuid, text) from public, anon;
revoke execute on function public.vault_retencion(uuid, boolean, date, text) from public, anon;
revoke execute on function public.vault_registrar_descarga(uuid) from public, anon;
revoke execute on function public.vault_tablero() from public, anon;
grant execute on function public.vault_verificar_cadena(uuid) to authenticated;
grant execute on function public.vault_pedir(uuid, jsonb) to authenticated;
grant execute on function public.vault_guardar_antecedentes(uuid, jsonb, text) to authenticated;
grant execute on function public.vault_guardar_borrador(uuid, text, text[], text[], text, text) to authenticated;
grant execute on function public.vault_registrar_vista(uuid, int) to authenticated;
grant execute on function public.vault_enviar_revision(uuid) to authenticated;
grant execute on function public.vault_revisar(uuid, text, text) to authenticated;
grant execute on function public.vault_autorizar_enviar(uuid, text, text) to authenticated;
grant execute on function public.vault_asignar(uuid, uuid, uuid) to authenticated;
grant execute on function public.vault_anular(uuid, text) to authenticated;
grant execute on function public.vault_retencion(uuid, boolean, date, text) to authenticated;
grant execute on function public.vault_registrar_descarga(uuid) to authenticated;
grant execute on function public.vault_tablero() to authenticated;
