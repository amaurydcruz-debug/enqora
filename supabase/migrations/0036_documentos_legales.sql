-- =====================================================================
-- ENQORA · 0036 · Documentos legales y ficha legal de cada trámite
-- 1) Biblioteca de documentos legales con versiones: contrato de servicios, tratamiento de datos
--    personales, declaración de veracidad, mandato especial (plantilla) y revocación. Cada versión
--    nace como borrador, pasa a revisión del estudio jurídico y solo la supervisión de ENQORA la
--    aprueba, dejando registrado qué estudio la revisó y cuándo. Un texto aprobado no se puede editar:
--    los cambios son una versión nueva, que el cliente debe volver a firmar.
-- 2) Ficha legal de cada servicio del catálogo: ante qué organismos se actúa, si ENQORA representa
--    al cliente, qué formalidad exige el mandato, la base legal y si está confirmada en fuente oficial.
-- 3) Firma electrónica simple dentro de ENQORA: firma el Propietario o Administrador de la empresa con
--    su segundo factor reciente. Se guarda el texto exacto firmado (con los datos de la empresa y de
--    quien firma), su huella SHA-256, la versión y la evidencia (sesión, rol, IP y navegador).
-- 4) Ningún caso pasa a «En ejecución» si falta firmar un documento legal exigido o si el documento
--    aún no está aprobado por el estudio jurídico.
-- Se puede ejecutar más de una vez. Los textos iniciales quedan como BORRADOR (no se pueden firmar).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Documentos legales (versiones)
-- ---------------------------------------------------------------------
create table if not exists public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^DOC-[A-Z0-9-]{2,30}$'),
  kind text not null check (kind in ('contrato', 'datos', 'veracidad', 'mandato', 'revocacion')),
  -- empresa: se firma una vez por empresa · caso: se firma en cada caso
  -- institucion: plantilla de mandato (se firma en el módulo Mandatos) · referencia: solo consulta
  scope text not null check (scope in ('empresa', 'caso', 'institucion', 'referencia')),
  institution text check (char_length(institution) <= 30),
  title text not null check (char_length(title) between 5 and 160),
  version integer not null check (version > 0),
  body text not null check (char_length(body) between 50 and 60000),
  body_hash text not null default '',
  status text not null default 'borrador' check (status in ('borrador', 'en_revision', 'aprobado', 'reemplazado', 'retirado')),
  review_firm text check (char_length(review_firm) <= 160),
  review_reference text check (char_length(review_reference) <= 300),
  reviewed_on date,
  review_note text check (char_length(review_note) <= 2000),
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (code, version)
);
create unique index if not exists legal_documents_one_approved on public.legal_documents (code) where status = 'aprobado';

-- La huella se calcula siempre en la base; un texto que salió de borrador no se modifica.
create or replace function private.on_legal_document_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.status <> 'borrador' and (new.body <> old.body or new.title <> old.title) then
    raise exception 'ENQ_DOCUMENTO_NO_EDITABLE';
  end if;
  new.body_hash := encode(extensions.digest(new.body, 'sha256'), 'hex');
  new.updated_at := now();
  return new;
end
$$;
drop trigger if exists legal_documents_write on public.legal_documents;
create trigger legal_documents_write before insert or update on public.legal_documents
  for each row execute function private.on_legal_document_write();

-- ---------------------------------------------------------------------
-- 2. Ficha legal de cada servicio
-- ---------------------------------------------------------------------
create table if not exists public.service_legal_profiles (
  service_code text primary key references public.services (code) on delete cascade,
  institutions text[] not null default '{}',
  represents boolean not null default false,          -- ENQORA actúa a nombre del cliente ante un organismo
  formalidad text not null check (char_length(formalidad) between 10 and 1500),
  base_legal text check (char_length(base_legal) <= 600),
  verificacion text not null default 'por_confirmar' check (verificacion in ('confirmada', 'por_confirmar', 'no_aplica')),
  fuente_url text check (fuente_url is null or fuente_url ~ '^https://'),
  nota text check (char_length(nota) <= 1000),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. Firmas
-- ---------------------------------------------------------------------
create table if not exists public.legal_signatures (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.legal_documents (id),
  code text not null,
  version integer not null,
  template_hash text not null,
  signed_text text not null,
  signed_hash text not null,
  company_id uuid not null references public.companies (id) on delete cascade,
  case_id uuid references public.cases (id) on delete cascade,
  signer_id uuid not null references auth.users (id),
  signer_name text not null check (char_length(signer_name) between 3 and 160),
  signer_rut text not null,
  signer_role text not null check (char_length(signer_role) between 3 and 80),
  evidence jsonb not null,
  status text not null default 'vigente' check (status in ('vigente', 'revocada')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null
);
create unique index if not exists legal_signatures_company_once on public.legal_signatures (company_id, document_id)
  where case_id is null and status = 'vigente';
create unique index if not exists legal_signatures_case_once on public.legal_signatures (case_id, document_id)
  where case_id is not null and status = 'vigente';
create index if not exists legal_signatures_company_idx on public.legal_signatures (company_id, created_at desc);

-- Bitácora del caso: nuevo tipo de evento «legal».
alter table public.case_events drop constraint if exists case_events_kind_check;
alter table public.case_events add constraint case_events_kind_check check (kind in (
  'creado', 'estado', 'comentario', 'nota_interna', 'documento', 'asignacion', 'tarea', 'prioridad',
  'aprobacion', 'autorizacion', 'cotizacion', 'diagnostico', 'plan', 'pago', 'actuacion', 'legal'
));

-- ---------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------
alter table public.legal_documents enable row level security;
alter table public.service_legal_profiles enable row level security;
alter table public.legal_signatures enable row level security;

revoke all on public.legal_documents, public.service_legal_profiles, public.legal_signatures from anon, authenticated;
grant select on public.legal_documents, public.service_legal_profiles, public.legal_signatures to authenticated;

drop policy if exists mfa_requerido on public.legal_documents;
create policy mfa_requerido on public.legal_documents as restrictive for all to authenticated using (private.is_mfa()) with check (private.is_mfa());
drop policy if exists mfa_requerido on public.service_legal_profiles;
create policy mfa_requerido on public.service_legal_profiles as restrictive for all to authenticated using (private.is_mfa()) with check (private.is_mfa());
drop policy if exists mfa_requerido on public.legal_signatures;
create policy mfa_requerido on public.legal_signatures as restrictive for all to authenticated using (private.is_mfa()) with check (private.is_mfa());

-- El cliente ve los textos aprobados; el equipo ve todas las versiones.
drop policy if exists legal_documents_select on public.legal_documents;
create policy legal_documents_select on public.legal_documents for select to authenticated
  using (status = 'aprobado' or private.is_staff());
drop policy if exists service_legal_profiles_select on public.service_legal_profiles;
create policy service_legal_profiles_select on public.service_legal_profiles for select to authenticated using (true);
drop policy if exists legal_signatures_select on public.legal_signatures;
create policy legal_signatures_select on public.legal_signatures for select to authenticated
  using (private.is_member(company_id) or private.is_staff());

-- ---------------------------------------------------------------------
-- 5. Qué falta para ejecutar un caso
-- ---------------------------------------------------------------------
-- Devuelve los códigos que faltan: 'DOC-X' (falta firmar) o 'DOC-X:sin_aprobar' (no hay versión aprobada).
create or replace function private.legal_missing(p_case uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  with req as (
    select distinct d.code, d.scope from public.legal_documents d
    where d.scope in ('empresa', 'caso') and d.status <> 'retirado'
  ), cur as (
    select r.code, r.scope, a.id as doc_id
    from req r left join public.legal_documents a on a.code = r.code and a.status = 'aprobado'
  )
  select coalesce(array_agg(case when cur.doc_id is null then cur.code || ':sin_aprobar' else cur.code end order by cur.code), '{}')
  from cur, public.cases c
  where c.id = p_case
    and (cur.doc_id is null or not exists (
      select 1 from public.legal_signatures s
      where s.document_id = cur.doc_id and s.status = 'vigente' and s.company_id = c.company_id
        and ((cur.scope = 'empresa' and s.case_id is null) or (cur.scope = 'caso' and s.case_id = c.id))))
$$;

create or replace function private.on_case_legal_gate() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'en_ejecucion' and old.status is distinct from 'en_ejecucion'
     and coalesce(array_length(private.legal_missing(new.id), 1), 0) > 0 then
    raise exception 'ENQ_FALTAN_DOCUMENTOS_LEGALES';
  end if;
  return new;
end
$$;
drop trigger if exists cases_legal_gate on public.cases;
create trigger cases_legal_gate before update of status on public.cases
  for each row execute function private.on_case_legal_gate();

-- Pone los datos reales en la plantilla. Lo usa la firma y la vista previa del cliente.
create or replace function private.render_legal(
  p_body text, p_company uuid, p_case uuid, p_name text, p_rut text, p_role text
) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_c public.companies;
  v_folio text;
  v_t text := p_body;
begin
  select * into v_c from public.companies where id = p_company;
  select folio into v_folio from public.cases where id = p_case;
  v_t := replace(v_t, '{{EMPRESA}}', coalesce(v_c.legal_name, '[empresa]'));
  v_t := replace(v_t, '{{RUT_EMPRESA}}', coalesce(v_c.rut, '[RUT]'));
  v_t := replace(v_t, '{{FIRMANTE}}', coalesce(nullif(trim(p_name), ''), '[nombre de quien firma]'));
  v_t := replace(v_t, '{{RUN_FIRMANTE}}', coalesce(nullif(trim(p_rut), ''), '[RUN]'));
  v_t := replace(v_t, '{{CARGO}}', coalesce(nullif(trim(p_role), ''), '[cargo]'));
  v_t := replace(v_t, '{{CASO}}', coalesce(v_folio, '[caso]'));
  v_t := replace(v_t, '{{FECHA}}', to_char((now() at time zone 'America/Santiago')::date, 'DD-MM-YYYY'));
  return v_t;
end
$$;

-- Estado legal de un caso, para la página del caso (cliente y equipo).
create or replace function public.legal_case_status(p_case uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_case public.cases;
begin
  perform private.require_session();
  select * into v_case from public.cases where id = p_case;
  if not found or not private.can_see_case(p_case) then raise exception 'ENQ_SIN_PERMISO'; end if;
  return jsonb_build_object(
    'faltan', to_jsonb(private.legal_missing(p_case)),
    'documentos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', r.code, 'scope', r.scope, 'title', coalesce(a.title, r.title),
        'document_id', a.id, 'version', a.version,
        'firma', (select jsonb_build_object('id', s.id, 'fecha', s.created_at, 'firmante', s.signer_name)
                  from public.legal_signatures s
                  where a.id is not null and s.document_id = a.id and s.status = 'vigente' and s.company_id = v_case.company_id
                    and ((r.scope = 'empresa' and s.case_id is null) or (r.scope = 'caso' and s.case_id = v_case.id))
                  order by s.created_at desc limit 1)
      ) order by r.scope, r.code)
      from (select distinct on (code) code, scope, title from public.legal_documents
            where scope in ('empresa', 'caso') and status <> 'retirado' order by code, version desc) r
      left join public.legal_documents a on a.code = r.code and a.status = 'aprobado'), '[]'::jsonb),
    'fichas', coalesce((
      select jsonb_agg(to_jsonb(p) || jsonb_build_object('service_name', q.service_name))
      from (select distinct on (service_code) service_code, service_name from public.quotes
            where case_id = p_case and status in ('enviada', 'aceptada') order by service_code, created_at desc) q
      join public.service_legal_profiles p on p.service_code = q.service_code), '[]'::jsonb));
end
$$;

-- Vista previa con los datos de la empresa y del caso (sin datos de quien firma).
create or replace function public.legal_preview(p_document uuid, p_company uuid, p_case uuid default null) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_d public.legal_documents;
begin
  perform private.require_session();
  select * into v_d from public.legal_documents where id = p_document;
  if not found or (v_d.status <> 'aprobado' and not private.is_staff()) then raise exception 'ENQ_NO_ENCONTRADO'; end if;
  if not (private.is_member(p_company) or private.is_staff()) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_case is not null and private.case_company(p_case) is distinct from p_company then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  return private.render_legal(v_d.body, p_company, p_case, null, null, null);
end
$$;

-- ---------------------------------------------------------------------
-- 6. Firma del cliente
-- ---------------------------------------------------------------------
create or replace function public.sign_legal_document(
  p_document uuid, p_company uuid, p_case uuid, p_hash text,
  p_name text, p_rut text, p_role text, p_client jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
  v_d public.legal_documents;
  v_case public.cases;
  v_rut text := private.normalize_rut(p_rut);
  v_text text;
  v_id uuid;
  v_email text;
begin
  select * into v_d from public.legal_documents where id = p_document;
  if not found or v_d.status <> 'aprobado' then raise exception 'ENQ_DOCUMENTO_NO_APROBADO'; end if;
  if v_d.scope not in ('empresa', 'caso') then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if not private.has_role(p_company, array['owner', 'admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if coalesce(p_hash, '') <> v_d.body_hash then raise exception 'ENQ_DOCUMENTO_CAMBIO'; end if;
  if v_d.scope = 'caso' then
    select * into v_case from public.cases where id = p_case;
    if not found or v_case.company_id <> p_company then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
    if v_case.status in ('cerrado', 'cancelado') then raise exception 'ENQ_CASO_CERRADO'; end if;
  elsif p_case is not null then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 3 and 160 or char_length(trim(coalesce(p_role, ''))) not between 3 and 80 then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  if v_rut is null or not private.rut_is_valid(v_rut) then raise exception 'ENQ_RUT_INVALIDO'; end if;
  if exists (select 1 from public.legal_signatures s where s.document_id = v_d.id and s.company_id = p_company and s.status = 'vigente'
             and s.case_id is not distinct from (case when v_d.scope = 'caso' then p_case else null end)) then
    raise exception 'ENQ_YA_FIRMADO';
  end if;

  v_text := private.render_legal(v_d.body, p_company, case when v_d.scope = 'caso' then p_case else null end, p_name, v_rut, p_role);
  select email into v_email from auth.users where id = v_uid;

  insert into public.legal_signatures (document_id, code, version, template_hash, signed_text, signed_hash, company_id, case_id,
    signer_id, signer_name, signer_rut, signer_role, evidence)
  values (v_d.id, v_d.code, v_d.version, v_d.body_hash, v_text, encode(extensions.digest(v_text, 'sha256'), 'hex'), p_company,
    case when v_d.scope = 'caso' then p_case else null end, v_uid, trim(p_name), v_rut, trim(p_role),
    jsonb_build_object(
      'tipo_firma', 'electronica_simple',
      'usuario', v_uid, 'correo', v_email, 'rol_en_empresa', private.member_role(p_company),
      'sesion', private.current_session_id(), 'segundo_factor', 'reciente', 'momento', now(),
      'ip', left(coalesce(p_client ->> 'ip', ''), 64), 'navegador', left(coalesce(p_client ->> 'ua', ''), 300),
      'documento', v_d.code, 'version', v_d.version, 'revisado_por', v_d.review_firm))
  returning id into v_id;

  perform private.log_event(p_company, 'legal.firmado', v_d.title, jsonb_build_object('documento', v_d.code, 'version', v_d.version, 'firma', v_id));
  if v_d.scope = 'caso' then
    perform private.log_case(p_case, 'legal', null, 'cliente',
      jsonb_build_object('accion', 'firmado', 'titulo', v_d.title, 'documento', v_d.code, 'version', v_d.version, 'firma', v_id));
  end if;
  -- Copia para la empresa (Propietarios y Administradores) y aviso al equipo del caso.
  perform private.notify(
    (select array_agg(m.user_id) from public.company_members m where m.company_id = p_company and m.role in ('owner', 'admin'))
      || coalesce(case when v_d.scope = 'caso' then private.case_team(p_case) end, '{}'),
    p_company, case when v_d.scope = 'caso' then p_case end, 'casos',
    'Documento firmado: ' || v_d.title,
    trim(p_name) || ' firmó la versión ' || v_d.version || '. La copia queda disponible en ENQORA.',
    '/legal/firma/' || v_id, 'legal-firma-' || v_id);
  return v_id;
end
$$;

-- ---------------------------------------------------------------------
-- 7. Equipo: versiones, revisión jurídica y aprobación
-- ---------------------------------------------------------------------
-- Crea una versión nueva (borrador) o corrige el borrador más reciente.
create or replace function public.save_legal_document(
  p_code text, p_kind text, p_scope text, p_institution text, p_title text, p_body text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_last public.legal_documents;
  v_id uuid;
begin
  if not private.is_staff(array['enqora_admin', 'ops_director', 'lawyer_pro']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  select * into v_last from public.legal_documents where code = upper(trim(p_code)) order by version desc limit 1;
  if found and v_last.status = 'borrador' then
    update public.legal_documents set title = trim(p_title), body = p_body,
      institution = nullif(trim(coalesce(p_institution, '')), '')
    where id = v_last.id;
    v_id := v_last.id;
  else
    insert into public.legal_documents (code, kind, scope, institution, title, version, body, created_by)
    values (upper(trim(p_code)), coalesce(v_last.kind, p_kind), coalesce(v_last.scope, p_scope),
            nullif(trim(coalesce(p_institution, '')), ''), trim(p_title), coalesce(v_last.version, 0) + 1, p_body, v_uid)
    returning id into v_id;
  end if;
  perform private.log_event(null, 'legal.version_guardada', upper(trim(p_code)), jsonb_build_object('documento', v_id));
  return v_id;
end
$$;

create or replace function public.send_legal_document_review(p_document uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
begin
  if not private.is_staff(array['enqora_admin', 'ops_director', 'lawyer_pro']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  update public.legal_documents set status = 'en_revision' where id = p_document and status = 'borrador';
  if not found then raise exception 'ENQ_DOCUMENTO_NO_EDITABLE'; end if;
  perform private.log_event(null, 'legal.enviado_revision', p_document::text, '{}'::jsonb);
end
$$;

-- Solo la supervisión aprueba, y solo con la revisión del estudio jurídico registrada.
create or replace function public.approve_legal_document(
  p_document uuid, p_firm text, p_reference text, p_reviewed_on date, p_note text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
  v_d public.legal_documents;
begin
  if not private.is_supervisor() then raise exception 'ENQ_SIN_PERMISO'; end if;
  select * into v_d from public.legal_documents where id = p_document for update;
  if not found then raise exception 'ENQ_NO_ENCONTRADO'; end if;
  if v_d.status <> 'en_revision' then raise exception 'ENQ_DOCUMENTO_NO_EN_REVISION'; end if;
  if char_length(trim(coalesce(p_firm, ''))) < 3 or char_length(trim(coalesce(p_reference, ''))) < 5
     or p_reviewed_on is null or p_reviewed_on > (now() at time zone 'America/Santiago')::date then
    raise exception 'ENQ_FALTA_REVISION_JURIDICA';
  end if;
  update public.legal_documents set status = 'reemplazado' where code = v_d.code and status = 'aprobado';
  update public.legal_documents set status = 'aprobado', review_firm = trim(p_firm), review_reference = trim(p_reference),
    reviewed_on = p_reviewed_on, review_note = nullif(trim(coalesce(p_note, '')), ''), approved_by = v_uid, approved_at = now()
  where id = p_document;
  perform private.log_event(null, 'legal.aprobado', v_d.code || ' v' || v_d.version,
    jsonb_build_object('documento', p_document, 'estudio', trim(p_firm), 'referencia', trim(p_reference)));
end
$$;

-- Devolver a borrador una versión en revisión (por observaciones del estudio) o retirar un documento.
create or replace function public.return_legal_document(p_document uuid, p_retire boolean, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_d public.legal_documents;
begin
  select * into v_d from public.legal_documents where id = p_document for update;
  if not found then raise exception 'ENQ_NO_ENCONTRADO'; end if;
  if char_length(trim(coalesce(p_note, ''))) < 10 then raise exception 'ENQ_FALTA_OBSERVACION'; end if;
  if p_retire then
    if not private.is_supervisor() then raise exception 'ENQ_SIN_PERMISO'; end if;
    update public.legal_documents set status = 'retirado', review_note = left(trim(p_note), 2000) where id = p_document;
  else
    if not private.is_staff(array['enqora_admin', 'ops_director', 'lawyer_pro']) then raise exception 'ENQ_SIN_PERMISO'; end if;
    if v_d.status <> 'en_revision' then raise exception 'ENQ_DOCUMENTO_NO_EN_REVISION'; end if;
    update public.legal_documents set status = 'borrador', review_note = left(trim(p_note), 2000) where id = p_document;
  end if;
  perform private.log_event(null, case when p_retire then 'legal.retirado' else 'legal.devuelto' end, v_d.code, jsonb_build_object('documento', p_document));
end
$$;

create or replace function public.save_service_legal_profile(p_code text, p_data jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
begin
  if not private.is_staff(array['enqora_admin', 'ops_director', 'lawyer_pro']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  insert into public.service_legal_profiles (service_code, institutions, represents, formalidad, base_legal, verificacion, fuente_url, nota, updated_by)
  values (p_code,
    coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_data -> 'institutions', '[]'::jsonb)) x), '{}'),
    coalesce((p_data ->> 'represents')::boolean, false), trim(p_data ->> 'formalidad'),
    nullif(trim(coalesce(p_data ->> 'base_legal', '')), ''), coalesce(p_data ->> 'verificacion', 'por_confirmar'),
    nullif(trim(coalesce(p_data ->> 'fuente_url', '')), ''), nullif(trim(coalesce(p_data ->> 'nota', '')), ''), v_uid)
  on conflict (service_code) do update set institutions = excluded.institutions, represents = excluded.represents,
    formalidad = excluded.formalidad, base_legal = excluded.base_legal, verificacion = excluded.verificacion,
    fuente_url = excluded.fuente_url, nota = excluded.nota, updated_by = v_uid, updated_at = now();
  perform private.log_event(null, 'legal.ficha_guardada', p_code, '{}'::jsonb);
end
$$;

revoke execute on function public.legal_case_status(uuid) from public;
revoke execute on function public.legal_preview(uuid, uuid, uuid) from public;
revoke execute on function public.sign_legal_document(uuid, uuid, uuid, text, text, text, text, jsonb) from public;
revoke execute on function public.save_legal_document(text, text, text, text, text, text) from public;
revoke execute on function public.send_legal_document_review(uuid) from public;
revoke execute on function public.approve_legal_document(uuid, text, text, date, text) from public;
revoke execute on function public.return_legal_document(uuid, boolean, text) from public;
revoke execute on function public.save_service_legal_profile(text, jsonb) from public;
grant execute on function public.legal_case_status(uuid) to authenticated;
grant execute on function public.legal_preview(uuid, uuid, uuid) to authenticated;
grant execute on function public.sign_legal_document(uuid, uuid, uuid, text, text, text, text, jsonb) to authenticated;
grant execute on function public.save_legal_document(text, text, text, text, text, text) to authenticated;
grant execute on function public.send_legal_document_review(uuid) to authenticated;
grant execute on function public.approve_legal_document(uuid, text, text, date, text) to authenticated;
grant execute on function public.return_legal_document(uuid, boolean, text) to authenticated;
grant execute on function public.save_service_legal_profile(text, jsonb) to authenticated;
revoke execute on function private.legal_missing(uuid) from public;
revoke execute on function private.render_legal(text, uuid, uuid, text, text, text) from public;

-- ---------------------------------------------------------------------
-- 8. Textos iniciales (BORRADOR, pendientes de revisión jurídica)
-- ---------------------------------------------------------------------
insert into public.legal_documents (code, kind, scope, institution, title, version, body) values
('DOC-CONTRATO', 'contrato', 'empresa', null, 'Contrato de prestación de servicios', 1, $t$CONTRATO DE PRESTACIÓN DE SERVICIOS · ENQORA

Partes. ENQORA SpA, RUT [•], domiciliada en [•] («ENQORA»), y {{EMPRESA}}, RUT {{RUT_EMPRESA}} («el Cliente»), representado por {{FIRMANTE}}, RUN {{RUN_FIRMANTE}}, en calidad de {{CARGO}}, quien declara tener facultades suficientes. Fecha: {{FECHA}}.

PRIMERA. Objeto. ENQORA presta al Cliente servicios de contabilidad, tributación, formalización, cumplimiento legal y crecimiento empresarial, a través de su plataforma y de profesionales responsables. Cada servicio se describe en una Orden de servicio (la cotización aceptada en la plataforma) con su alcance, exclusiones, plazos estimados y precio.

SEGUNDA. Orden de servicio. Antes de iniciar cada caso, el Cliente recibe y acepta una Orden de servicio que indica: el código y nombre del servicio, lo que incluye y lo que no incluye, los documentos que debe entregar, el precio total en pesos y la forma de pago. Ningún trabajo adicional se cobra sin una nueva orden aceptada por el Cliente.

TERCERA. Profesional responsable. Cada caso tiene un profesional responsable identificado, que revisa y aprueba el trabajo antes de presentarlo ante un organismo. Las herramientas automatizadas e inteligencia artificial de ENQORA apoyan el trabajo, pero no presentan nada ante un organismo sin aprobación humana.

CUARTA. Obligaciones del Cliente. Entregar información y documentos veraces, completos y a tiempo; avisar cambios relevantes; pagar el precio acordado; y mantener bajo su control exclusivo sus claves personales. ENQORA NUNCA SOLICITARÁ LA CLAVEÚNICA NI LA CLAVE TRIBUTARIA DEL CLIENTE; si alguien lo hace a nombre de ENQORA, el Cliente debe rechazarlo y avisar.

QUINTA. Representación ante organismos. ENQORA o su profesional solo actúa a nombre del Cliente cuando existe un mandato especial vigente para ese trámite. Sin mandato, ENQORA prepara y el Cliente presenta.

SEXTA. Precio y pago. El precio de cada servicio es el indicado en la Orden de servicio. Los pagos al Estado (impuestos, multas, derechos, aranceles) son de cargo del Cliente y no forman parte del precio, salvo que la orden diga lo contrario. ENQORA no cobra por trámites que el Estado entrega gratis; cobra el trabajo profesional que los acompaña. ENQORA guarda solo los últimos 4 dígitos de las tarjetas.

SÉPTIMA. Resultados. ENQORA se obliga a prestar los servicios con diligencia profesional. Los resultados que dependen de un organismo público —como una condonación, la aprobación de un registro o la adjudicación de un fondo— no están garantizados. Cuando ENQORA informe un ahorro, indicará cómo se calculó y si fue verificado con un documento.

OCTAVA. Responsabilidad. [Por definir con el estudio jurídico.] ENQORA no responde por multas o intereses causados por información falsa o tardía del Cliente.

NOVENA. Confidencialidad. ENQORA y sus profesionales guardan reserva de la información del Cliente, también después de terminado el contrato, salvo requerimiento legal de autoridad competente.

DÉCIMA. Datos personales. El tratamiento de datos personales se rige por el Acuerdo de tratamiento de datos personales y la política de privacidad publicada en la plataforma.

UNDÉCIMA. Duración y término. Plazo indefinido. El Cliente puede terminarlo en cualquier momento; los casos en curso se cierran o se pagan según el avance acordado en su orden. ENQORA puede terminarlo con aviso de [30] días, o de inmediato si el Cliente entrega información falsa a sabiendas. Al terminar, los mandatos se revocan y el Cliente puede descargar sus documentos.

DUODÉCIMA. Comunicaciones y firma electrónica. Las partes aceptan comunicarse por la plataforma y el correo registrado. El Cliente firma este contrato con firma electrónica conforme a la Ley 19.799; ENQORA registra la fecha, hora, cuenta, segundo factor y versión del texto firmado, y entrega una copia.

DECIMOTERCERA. Cambios del contrato. ENQORA avisará cualquier cambio con [30] días de anticipación. Los cambios no afectan las órdenes ya aceptadas y requieren nueva firma del Cliente.

DECIMOCUARTA. Ley aplicable y reclamos. Ley chilena. [Tribunal competente y canal de reclamos: por definir con el estudio jurídico.]$t$),
('DOC-DATOS', 'datos', 'empresa', null, 'Acuerdo de tratamiento de datos personales', 1, $t$ACUERDO DE TRATAMIENTO DE DATOS PERSONALES · ENQORA
(Ley 19.628, modificada por la Ley 21.719)

Entre ENQORA SpA y {{EMPRESA}}, RUT {{RUT_EMPRESA}}, representada por {{FIRMANTE}}, RUN {{RUN_FIRMANTE}}, {{CARGO}}. Fecha: {{FECHA}}.

PARTE A. ENQORA COMO RESPONSABLE (datos de quien usa la cuenta y de los representantes del Cliente)
- Datos: nombre, RUN, correo, teléfono, cargo, registro de accesos y firmas.
- Finalidad: crear y operar la cuenta, prestar los servicios contratados, cobrar y cumplir obligaciones legales.
- Base de licitud: ejecución del contrato y cumplimiento de obligaciones legales. Comunicaciones comerciales: solo con consentimiento, revocable en cualquier momento.
- Derechos: acceso, rectificación, supresión, oposición, portabilidad y bloqueo, desde la plataforma o en [correo]. Plazo de respuesta: [el que fije la ley].
- Conservación: mientras dure el contrato y después solo el tiempo que exijan las obligaciones legales.

PARTE B. ENQORA COMO ENCARGADO DEL TRATAMIENTO (datos que el Cliente entrega para que ENQORA trabaje)
1. Objeto: tratar esos datos solo para prestar los servicios de cada Orden de servicio.
2. Duración: la del contrato de prestación de servicios.
3. Finalidad: contabilidad, remuneraciones, declaraciones, cumplimiento laboral y demás servicios contratados.
4. Tipos de datos: identificación, contacto, laborales, previsionales y remuneraciones. Datos sensibles: solo si el servicio lo exige y con la base de licitud que el Cliente acredite.
5. Titulares: trabajadores, socios, representantes, clientes y proveedores del Cliente.
6. Instrucciones: ENQORA trata los datos solo según las instrucciones documentadas del Cliente; no los usa para fines propios, ni los cede ni los vende.
7. Confidencialidad: deber de secreto para ENQORA y todo su personal.
8. Seguridad: cifrado en tránsito, control de acceso por función, segundo factor para todas las cuentas, registro de auditoría y respaldo.
9. Subencargados: solo con autorización del Cliente. Lista vigente: base de datos y alojamiento (Supabase), despliegue (Vercel), correo transaccional y proveedores de inteligencia artificial que procesan los textos de los casos. ENQORA sigue siendo responsable por ellos.
10. Vulneraciones: ENQORA avisa al Cliente sin demora indebida, con lo que se sabe y las medidas tomadas.
11. Apoyo: ENQORA ayuda al Cliente a responder las solicitudes de los titulares.
12. Fin del servicio: ENQORA devuelve o suprime los datos, a elección del Cliente, salvo los que deba conservar por ley.
13. Auditoría: ENQORA entrega la información necesaria para demostrar el cumplimiento.

Inteligencia artificial. Los asistentes de ENQORA procesan textos y documentos del caso para proponer análisis. No toman decisiones con efectos jurídicos sobre personas sin revisión humana.$t$),
('DOC-VERACIDAD', 'veracidad', 'caso', null, 'Declaración de veracidad y autorización de uso de documentos', 1, $t$DECLARACIÓN DE VERACIDAD Y AUTORIZACIÓN DE USO DE DOCUMENTOS

Yo, {{FIRMANTE}}, RUN {{RUN_FIRMANTE}}, {{CARGO}} de {{EMPRESA}}, RUT {{RUT_EMPRESA}}, para el caso {{CASO}}, el {{FECHA}}, declaro:

1. Que la información y los documentos que entrego a ENQORA para este caso son verdaderos, completos y corresponden a la empresa.
2. Que tengo facultades para entregarlos y para autorizar su uso.
3. Que, cuando entrego datos de otras personas (trabajadores, socios, clientes), cuento con una base legal para hacerlo.
4. Que entiendo que ENQORA trabaja con lo que entrego y no supone datos que falten: si falta algo, lo pedirá o lo marcará como pendiente.
5. Que avisaré cualquier cambio o error que detecte.

Autorizo a ENQORA y al profesional responsable a usar estos documentos solo para este caso, a guardarlos en la plataforma y a presentarlos ante el organismo cuando exista un mandato vigente.

Entiendo que entregar información falsa ante un organismo público puede tener consecuencias legales para la empresa y que ENQORA puede poner término al servicio si lo detecta.$t$),
('DOC-MANDATO', 'mandato', 'institucion', null, 'Mandato especial de representación (plantilla)', 1, $t$MANDATO ESPECIAL DE REPRESENTACIÓN

En [ciudad], a {{FECHA}}, {{EMPRESA}}, RUT {{RUT_EMPRESA}}, representada por {{FIRMANTE}}, RUN {{RUN_FIRMANTE}}, {{CARGO}} («el Mandante»), otorga mandato especial a [nombre del mandatario], RUN [•], [profesión], de ENQORA SpA, RUT [•] («el Mandatario»), para que lo represente ante [organismo] exclusivamente en los siguientes trámites: [trámites].

Facultades. Presentar solicitudes, formularios y antecedentes; requerir y recibir información y certificados; ser notificado; y realizar las gestiones necesarias para esos trámites.

Límites. El Mandatario NO podrá: recibir dinero a nombre del Mandante; pagar, comprometer pagos ni firmar convenios de pago sin la aprobación escrita del Mandante para cada uno; desistirse, transigir ni renunciar a derechos; delegar este mandato; ni realizar trámites distintos de los indicados.

Credenciales. El Mandatario actúa con sus propias credenciales. El Mandante no entrega ni entregará su ClaveÚnica ni su clave tributaria.

Aprobación previa. Antes de presentar cada trámite, el Mandatario enviará al Mandante, por la plataforma, el borrador de lo que presentará, y presentará solo con su aprobación registrada.

Plazo. Desde la fecha de firma hasta [fecha], o hasta el término del caso, lo que ocurra primero.

Revocación. El Mandante puede revocar este mandato en cualquier momento y sin costo. El Mandatario informará la revocación o su renuncia al organismo cuando corresponda.

Rendición de cuentas. El Mandatario informará en la plataforma cada actuación, con su comprobante.$t$),
('DOC-REVOCACION', 'revocacion', 'referencia', null, 'Revocación de mandato', 1, $t$REVOCACIÓN DE MANDATO

En [ciudad], a {{FECHA}}, {{EMPRESA}}, RUT {{RUT_EMPRESA}}, representada por {{FIRMANTE}}, RUN {{RUN_FIRMANTE}}, {{CARGO}}, revoca el mandato especial otorgado el [fecha] a [mandatario], RUN [•], para actuar ante [organismo] en [trámites], con efecto inmediato.

Al recibir la revocación, ENQORA:
1. Detiene cualquier actuación pendiente bajo ese mandato.
2. Informa al organismo cuando corresponda (ante el SII, art. 9 del Código Tributario).
3. Guía al Cliente para eliminar la autorización en línea que haya otorgado (por ejemplo, en sii.cl).
4. Entrega un informe de lo hecho bajo el mandato, con sus comprobantes.

La revocación no tiene costo.$t$)
on conflict (code, version) do nothing;

-- ---------------------------------------------------------------------
-- 9. Fichas legales iniciales (verificadas el 10-11-2026; lo no confirmado queda «por confirmar»)
-- ---------------------------------------------------------------------
insert into public.service_legal_profiles (service_code, institutions, represents, formalidad, base_legal, verificacion, fuente_url, nota)
select v.code, v.inst, v.rep, v.form, v.base, v.ver, v.url, v.nota
from (values
  ('CON-01', array['sii'], true, 'Mandatario Digital del SII (el cliente autoriza en sii.cl a una persona natural, que entra con su propio RUT y clave) o poder escrito. En oficina, para F29, F50 y F3229, poder autorizado ante notario.', 'Código Tributario, art. 9', 'confirmada', 'https://www.sii.cl/preguntas_frecuentes/clave_secr_repr_electr/001_100_8811.htm', null),
  ('CON-02', array['sii'], true, 'Mandatario Digital del SII o poder escrito. En oficina, para F29, poder autorizado ante notario.', 'Código Tributario, art. 9', 'confirmada', 'https://www.sii.cl/iva/poderes.htm', null),
  ('CON-03', array['sii'], true, 'Mandatario Digital del SII o poder escrito. En oficina, para F29, F50 y F3229, poder autorizado ante notario.', 'Código Tributario, art. 9', 'confirmada', 'https://www.sii.cl/iva/poderes.htm', null),
  ('CON-04', array['direccion_trabajo'], true, 'Poder escrito del empleador para los trámites ante la Dirección del Trabajo.', null, 'por_confirmar', null, 'Confirmar con el estudio la formalidad ante la Dirección del Trabajo y la plataforma previsional.'),
  ('CON-05', array['sii'], true, 'Mandatario Digital del SII o poder escrito (art. 9: el mandato debe constar por escrito).', 'Código Tributario, art. 9', 'confirmada', 'https://www.chileatiende.gob.cl/fichas/3241-representacion-electronica-de-otro-contribuyente', null),
  ('CON-06', array['tgr'], false, 'El cliente opera la plataforma de la Tesorería con sus propias credenciales y ENQORA lo acompaña. Si ENQORA actúa a su nombre: poder escrito que no permite firmar convenios ni pagos sin la aprobación del cliente para cada uno.', 'Ley 21.850', 'por_confirmar', null, 'Confirmar con el estudio si la Tesorería exige poder simple o notarial.'),
  ('CON-07', array['sii'], true, 'Mandatario Digital del SII o poder escrito para presentar el aviso de cambio de régimen.', 'Código Tributario, art. 9', 'confirmada', 'https://www.sii.cl/preguntas_frecuentes/clave_secr_repr_electr/001_100_8811.htm', null),
  ('CRC-01', '{}'::text[], false, 'Postula la empresa con sus propias credenciales, según las bases de cada convocatoria. ENQORA prepara.', null, 'no_aplica', null, null),
  ('CRC-02', '{}'::text[], false, 'La empresa usa su propio usuario de Mercado Público y envía la oferta. ENQORA prepara. La inscripción es gratuita y no se cobra.', null, 'no_aplica', null, null),
  ('CRE-01', array['registro_empresas'], false, 'Firman los propios socios en «Tu Empresa en un Día», con firma electrónica avanzada o con firma manuscrita ante notario. ENQORA prepara.', 'Ley 20.659', 'por_confirmar', 'https://www.chileatiende.gob.cl/fichas/21409/1/pdf', 'Confirmar con el estudio si un mandatario puede firmar por un socio.'),
  ('FOR-01', array['sii'], true, 'Mandatario Digital del SII o poder escrito.', 'Código Tributario, art. 9', 'por_confirmar', null, 'Confirmar con el estudio la formalidad del poder para el inicio de actividades presencial.'),
  ('FOR-02', array['municipalidad'], true, 'Poder escrito del representante legal, según exija cada municipalidad.', null, 'por_confirmar', null, 'Varía por municipalidad.'),
  ('FOR-03', array['sii'], true, 'Mandatario Digital del SII o poder escrito.', 'Código Tributario, art. 9', 'por_confirmar', null, 'Confirmar con el estudio la formalidad del poder para el término de giro presencial.'),
  ('GEN-01', '{}'::text[], false, 'Asesoría sin actuación ante organismos.', null, 'no_aplica', null, null),
  ('LEG-01', '{}'::text[], false, 'Revisión de documentos sin actuación ante organismos.', null, 'no_aplica', null, 'La revisión la firma un abogado habilitado.'),
  ('LEG-02', array['direccion_trabajo'], true, 'Poder escrito del empleador para registrar el reglamento interno o el protocolo ante la Dirección del Trabajo.', 'Ley 21.643', 'por_confirmar', null, 'Confirmar con el estudio la formalidad ante la Dirección del Trabajo.'),
  ('LEG-03', '{}'::text[], false, 'Adecuación interna sin actuación ante organismos.', 'Ley 21.719', 'no_aplica', null, null),
  ('BRA-01', array['inapi'], true, 'Poder depositado en la custodia de poderes de INAPI (formulario FPI-50), que asigna un N° de poder. En línea: poder firmado electrónicamente, de preferencia con firma electrónica avanzada. Presencial: copias autorizadas ante notario.', 'Ley 19.039; Ley 21.355; Circular INAPI N° 524 (2020)', 'confirmada', 'https://www.chileatiende.gob.cl/fichas/29202-custodia-de-poderes-y-personerias', null)
) as v(code, inst, rep, form, base, ver, url, nota)
where exists (select 1 from public.services s where s.code = v.code)
on conflict (service_code) do nothing;
