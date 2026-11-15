-- =====================================================================
-- ENQORA · 0060 · ENQORA SIGN — Fase 1: firma electrónica simple propia, sobre la Bóveda
-- Ley 19.799: la firma electrónica simple vale como firma manuscrita (art. 3), salvo los actos que la ley excluye
-- (escrituras públicas, actos que exigen presencia personal, derecho de familia). El finiquito con valor de
-- ratificación se firma en el portal de la Dirección del Trabajo (Ley 21.361), no aquí.
-- Reglas:
--   · Solo se firma un documento de la Bóveda ya autorizado y congelado (versión final con huella SHA-256).
--   · Cada firmante firma desde su cuenta ENQORA, después de leer el documento completo y con un código
--     del autenticador ingresado en ese momento (segundo factor reciente). Nunca ClaveÚnica ni biometría guardada.
--   · Cada firma guarda su expediente de evidencia (momento, sesión, método, dispositivo e IP informados por el
--     servidor, huella del documento) y su propia huella; al completarse, la solicitud recibe un sello final.
--   · Todo queda en la bitácora encadenada de la Bóveda. Nada se borra: se anula o se rechaza con motivo.
--   · Preparado para firma avanzada: nivel y proveedor por solicitud, y datos de certificado por firma (vacíos hoy).
-- Se puede ejecutar más de una vez.
-- =====================================================================

create sequence if not exists public.sign_folio_seq;

create table if not exists public.sign_requests (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique default ('FIR-' || to_char(now() at time zone 'America/Santiago', 'YYYY') || '-' || lpad(nextval('public.sign_folio_seq')::text, 6, '0')),
  document_id uuid not null references public.vault_documents (id) on delete restrict,
  company_id uuid not null references public.companies (id) on delete restrict,
  case_id uuid references public.cases (id) on delete restrict,
  version int not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  nivel text not null default 'simple' check (nivel in ('simple', 'avanzada')),
  proveedor text not null default 'enqora_simple' check (proveedor ~ '^[a-z0-9_]{3,40}$'),
  secuencial boolean not null default true,
  mensaje text check (char_length(mensaje) <= 500),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'completada', 'rechazada', 'anulada')),
  vence_at timestamptz not null,
  creado_por uuid references auth.users (id) on delete set null,
  completada_at timestamptz,
  sello text check (sello ~ '^[0-9a-f]{64}$'),
  anulado_motivo text check (char_length(anulado_motivo) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sign_requests_doc_idx on public.sign_requests (document_id, created_at desc);
create index if not exists sign_requests_company_idx on public.sign_requests (company_id, created_at desc);
-- Una sola solicitud en curso por documento.
create unique index if not exists sign_requests_una_pendiente on public.sign_requests (document_id) where estado = 'pendiente';

create table if not exists public.sign_signers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.sign_requests (id) on delete restrict,
  orden smallint not null check (orden between 1 and 10),
  -- Si la cuenta se elimina (derechos sobre datos), la firma conserva nombre y correo como evidencia legal.
  user_id uuid references auth.users (id) on delete set null,
  nombre text not null check (char_length(nombre) between 2 and 160),
  correo text not null check (char_length(correo) between 3 and 254),
  calidad text not null check (calidad in ('cliente', 'representante_legal', 'profesional_enqora', 'contraparte', 'trabajador', 'empleador')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'firmado', 'rechazado')),
  leido_at timestamptz,
  firmado_at timestamptz,
  metodo text check (metodo in ('codigo_autenticador', 'llave_acceso')),
  evidencia jsonb not null default '{}'::jsonb check (jsonb_typeof(evidencia) = 'object' and octet_length(evidencia::text) <= 8000),
  firma_hash text check (firma_hash ~ '^[0-9a-f]{64}$'),
  rechazo_motivo text check (char_length(rechazo_motivo) <= 500),
  -- Firma avanzada (fase 2): datos del certificado del prestador acreditado. Vacíos en firma simple.
  cert_serie text check (char_length(cert_serie) <= 120),
  cert_emisor text check (char_length(cert_emisor) <= 200),
  created_at timestamptz not null default now(),
  unique (request_id, orden),
  unique (request_id, correo)
);
create index if not exists sign_signers_user_idx on public.sign_signers (user_id, estado);

-- Nada se borra; una firma hecha (o rechazada) no se modifica; la solicitud no cambia de documento ni de huella.
drop trigger if exists sign_requests_no_borrar on public.sign_requests;
create trigger sign_requests_no_borrar before delete on public.sign_requests for each row execute function private.vault_no_borrar();
drop trigger if exists sign_signers_no_borrar on public.sign_signers;
create trigger sign_signers_no_borrar before delete on public.sign_signers for each row execute function private.vault_no_borrar();

create or replace function private.sign_inmutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'sign_requests' then
    -- Única excepción en una solicitud cerrada: la cuenta de quien la creó se eliminó (queda en null).
    if new.creado_por is null and old.creado_por is not null
       and (to_jsonb(new) - 'creado_por' - 'updated_at') = (to_jsonb(old) - 'creado_por' - 'updated_at') then
      return new;
    end if;
    if new.document_id <> old.document_id or new.version <> old.version or new.sha256 <> old.sha256 or new.folio <> old.folio
       or new.nivel <> old.nivel or new.company_id <> old.company_id or old.estado <> 'pendiente' then
      raise exception 'ENQ_BITACORA_INMUTABLE';
    end if;
    new.updated_at := now();
  else
    -- Única excepción en una firma hecha: la cuenta del firmante se eliminó (nombre y correo se conservan como evidencia).
    if new.user_id is null and old.user_id is not null and (to_jsonb(new) - 'user_id') = (to_jsonb(old) - 'user_id') then
      return new;
    end if;
    if old.estado <> 'pendiente' or new.request_id <> old.request_id or new.user_id is distinct from old.user_id
       or new.correo <> old.correo or new.orden <> old.orden or new.nombre <> old.nombre or new.calidad <> old.calidad then
      raise exception 'ENQ_BITACORA_INMUTABLE';
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists sign_requests_inmutable on public.sign_requests;
create trigger sign_requests_inmutable before update on public.sign_requests for each row execute function private.sign_inmutable();
drop trigger if exists sign_signers_inmutable on public.sign_signers;
create trigger sign_signers_inmutable before update on public.sign_signers for each row execute function private.sign_inmutable();

-- ---------------------------------------------------------------------
-- Lectura: el equipo del documento y quienes pueden verlo ven las solicitudes; cada firmante ve su firma.
-- La evidencia (IP, dispositivo) la ven solo el propio firmante y el equipo.
-- ---------------------------------------------------------------------
alter table public.sign_requests enable row level security;
alter table public.sign_signers enable row level security;
revoke all on public.sign_requests, public.sign_signers from anon, authenticated;
grant select on public.sign_requests, public.sign_signers to authenticated;
drop policy if exists sign_requests_leer on public.sign_requests;
create policy sign_requests_leer on public.sign_requests for select to authenticated using (private.vault_puede_ver(document_id));
drop policy if exists sign_signers_leer on public.sign_signers;
create policy sign_signers_leer on public.sign_signers for select to authenticated using (
  user_id = (select auth.uid())
  or exists (select 1 from public.sign_requests r where r.id = request_id and private.vault_es_equipo(r.document_id)));

-- ---------------------------------------------------------------------
-- Mapa de firma: qué documentos admiten firma electrónica simple en ENQORA.
-- Devuelve null si se admite; si no, el motivo (y por dónde se firma).
-- ---------------------------------------------------------------------
create or replace function private.sign_no_admitida(p_tipo text, p_clase text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_tipo = 'finiquito' then 'El finiquito con valor de ratificación se firma en el portal de la Dirección del Trabajo (Ley 21.361).'
    when p_tipo in ('escritura_publica', 'escritura') then 'Las escrituras públicas se otorgan ante notario: la ley no admite firma electrónica para ellas.'
    when p_clase in ('identidad', 'evidencia', 'respaldo_tributario', 'respaldo_contable', 'respaldo_laboral') then 'Los respaldos y archivos del caso no se firman: se conservan.'
    else null end
$$;

-- ---------------------------------------------------------------------
-- 1. Solicitar firmas (responsable del caso, responsable del documento o supervisión)
--    p: { firmantes: [{ correo, calidad, nombre? }], secuencial, vence_dias, mensaje }
-- ---------------------------------------------------------------------
create or replace function public.sign_solicitar(p_doc uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
  v_d public.vault_documents;
  v_resp uuid;
  v_req public.sign_requests;
  v_f jsonb;
  v_orden int := 0;
  v_correo text;
  v_calidad text;
  v_user uuid;
  v_nombre text;
  v_dias int := least(greatest(coalesce((p ->> 'vence_dias')::int, 15), 1), 60);
  v_motivo text;
  v_primeros uuid[];
begin
  select * into v_d from public.vault_documents where id = p_doc for update;
  if not found then raise exception 'ENQ_NO_ENCONTRADO'; end if;
  select responsible_id into v_resp from public.cases where id = v_d.case_id;
  if not (private.is_supervisor() or v_resp = v_uid or v_d.responsable_id = v_uid) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_d.origen <> 'generado' or v_d.estado not in ('enviado', 'archivado') or v_d.version_final is null or v_d.sha256 is null then
    raise exception 'ENQ_FIRMA_SIN_VERSION_FINAL';
  end if;
  if v_d.confidencialidad <> 'cliente' then raise exception 'ENQ_FIRMA_CONFIDENCIAL'; end if;
  v_motivo := private.sign_no_admitida(v_d.tipo, v_d.clase);
  if v_motivo is not null then raise exception 'ENQ_FIRMA_NO_ADMITIDA'; end if;
  if jsonb_typeof(p -> 'firmantes') <> 'array' or jsonb_array_length(p -> 'firmantes') not between 1 and 10 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if exists (select 1 from public.sign_requests where document_id = p_doc and estado = 'pendiente') then raise exception 'ENQ_FIRMA_EN_CURSO'; end if;

  insert into public.sign_requests (document_id, company_id, case_id, version, sha256, secuencial, mensaje, vence_at, creado_por)
  values (p_doc, v_d.company_id, v_d.case_id, v_d.version_final, v_d.sha256, coalesce((p ->> 'secuencial')::boolean, true),
    nullif(left(trim(coalesce(p ->> 'mensaje', '')), 500), ''), now() + make_interval(days => v_dias), v_uid)
  returning * into v_req;

  for v_f in select * from jsonb_array_elements(p -> 'firmantes') loop
    v_orden := v_orden + 1;
    v_correo := lower(trim(coalesce(v_f ->> 'correo', '')));
    v_calidad := coalesce(v_f ->> 'calidad', 'cliente');
    v_user := null;
    v_nombre := null;
    if v_correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
    select id, coalesce(nullif(trim(full_name), ''), nullif(trim(coalesce(v_f ->> 'nombre', '')), '')) into v_user, v_nombre
      from public.profiles where lower(email) = v_correo;
    if v_user is null then raise exception 'ENQ_FIRMANTE_SIN_CUENTA'; end if;
    if v_nombre is null or char_length(v_nombre) < 2 then raise exception 'ENQ_FIRMANTE_SIN_NOMBRE'; end if;
    -- Quién puede firmar: el equipo ENQORA en su calidad de profesional; integrantes de la empresa del documento;
    -- y la contraparte o el trabajador, solo con cuenta propia y en esa calidad.
    if v_calidad = 'profesional_enqora' then
      if not private.staff_con_acceso(v_user) then raise exception 'ENQ_FIRMANTE_NO_HABILITADO'; end if;
    elsif v_calidad in ('cliente', 'representante_legal', 'empleador') then
      if not exists (select 1 from public.company_members m where m.company_id = v_d.company_id and m.user_id = v_user) then
        raise exception 'ENQ_FIRMANTE_NO_HABILITADO';
      end if;
    elsif v_calidad not in ('contraparte', 'trabajador') then
      raise exception 'ENQ_DATOS_INVALIDOS';
    end if;
    insert into public.sign_signers (request_id, orden, user_id, nombre, correo, calidad)
    values (v_req.id, v_orden, v_user, left(v_nombre, 160), v_correo, v_calidad);
  end loop;

  perform private.vault_evento(p_doc, 'firma_solicitada', jsonb_build_object('firma', v_req.folio, 'version', v_req.version,
    'sha256', v_req.sha256, 'firmantes', v_orden, 'secuencial', v_req.secuencial, 'vence', v_req.vence_at));
  if v_d.case_id is not null then
    perform private.log_case(v_d.case_id, 'documento', 'Documento ' || v_d.folio || ' enviado a firma electrónica (' || v_req.folio || ').',
      'cliente', jsonb_build_object('vault_document', p_doc, 'sign_request', v_req.id));
  end if;
  -- Avisa a quien le toca firmar ahora (todos, si no es secuencial).
  select array_agg(s.user_id) into v_primeros from public.sign_signers s where s.request_id = v_req.id and (not v_req.secuencial or s.orden = 1);
  perform private.sign_avisar(v_req.id, v_primeros);
  return jsonb_build_object('id', v_req.id, 'folio', v_req.folio);
end
$$;

-- Aviso a firmantes: cada uno recibe el enlace a su propia firma.
create or replace function private.sign_avisar(p_req uuid, p_users uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s record;
begin
  for s in select si.id, si.user_id, r.folio, r.company_id, r.case_id, r.vence_at, d.titulo, d.folio as doc_folio
           from public.sign_signers si join public.sign_requests r on r.id = si.request_id join public.vault_documents d on d.id = r.document_id
           where si.request_id = p_req and si.user_id = any (coalesce(p_users, '{}')) and si.estado = 'pendiente' loop
    perform private.notify(array[s.user_id], s.company_id, null, 'casos', 'Documento para firmar: ' || s.titulo,
      'ENQORA te envió el documento ' || s.doc_folio || ' para firma electrónica. Léelo completo y fírmalo con tu código del autenticador antes del '
        || to_char(s.vence_at at time zone 'America/Santiago', 'DD-MM-YYYY') || '.',
      '/firmas/' || s.id, 'sign:' || s.id);
  end loop;
end
$$;

-- ---------------------------------------------------------------------
-- 2. Lectura completa (el firmante llegó al final del documento)
-- ---------------------------------------------------------------------
create or replace function public.sign_registrar_lectura(p_signer uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_s public.sign_signers;
  v_r public.sign_requests;
begin
  select * into v_s from public.sign_signers where id = p_signer for update;
  if not found or v_s.user_id is distinct from v_uid then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_s.estado <> 'pendiente' or v_s.leido_at is not null then return; end if;
  select * into v_r from public.sign_requests where id = v_s.request_id;
  if v_r.estado <> 'pendiente' then return; end if;
  update public.sign_signers set leido_at = now() where id = p_signer;
  perform private.vault_evento(v_r.document_id, 'leido_para_firma', jsonb_build_object('firma', v_r.folio, 'firmante', p_signer, 'version', v_r.version));
end
$$;

-- ---------------------------------------------------------------------
-- 3. Firmar: cuenta propia, documento leído, huella confirmada, turno respetado y código del autenticador
--    ingresado hace menos de 5 minutos. p_evidencia la arma el servidor (IP, dispositivo, idioma).
-- ---------------------------------------------------------------------
create or replace function public.sign_firmar(p_signer uuid, p_sha text, p_evidencia jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_s public.sign_signers;
  v_r public.sign_requests;
  v_d public.vault_documents;
  v_ahora timestamptz := clock_timestamp();
  v_amr jsonb;
  v_ev jsonb;
  v_hash text;
  v_quedan int;
  v_sello text;
  v_siguientes uuid[];
begin
  if not private.recent_mfa(5) then raise exception 'ENQ_FIRMA_CODIGO'; end if;
  select * into v_s from public.sign_signers where id = p_signer for update;
  if not found or v_s.user_id is distinct from v_uid then raise exception 'ENQ_SIN_PERMISO'; end if;
  select * into v_r from public.sign_requests where id = v_s.request_id for update;
  select * into v_d from public.vault_documents where id = v_r.document_id;
  if v_s.estado <> 'pendiente' or v_r.estado <> 'pendiente' then raise exception 'ENQ_FIRMA_CERRADA'; end if;
  if v_r.vence_at < now() then raise exception 'ENQ_FIRMA_VENCIDA'; end if;
  if v_d.estado = 'anulado' then raise exception 'ENQ_FIRMA_CERRADA'; end if;
  if v_s.leido_at is null then raise exception 'ENQ_FIRMA_SIN_LECTURA'; end if;
  if lower(coalesce(p_sha, '')) <> v_r.sha256 or v_d.sha256 is distinct from v_r.sha256 then raise exception 'ENQ_FIRMA_HUELLA'; end if;
  if v_r.secuencial and exists (select 1 from public.sign_signers o where o.request_id = v_r.id and o.orden < v_s.orden and o.estado <> 'firmado') then
    raise exception 'ENQ_FIRMA_TURNO';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('metodo', e ->> 'method', 'momento', to_timestamp((e ->> 'timestamp')::bigint))), '[]'::jsonb)
    into v_amr from jsonb_array_elements(coalesce((select auth.jwt()) -> 'amr', '[]'::jsonb)) e;
  v_ev := jsonb_build_object(
    'ip', left(coalesce(p_evidencia ->> 'ip', ''), 64),
    'dispositivo', left(coalesce(p_evidencia ->> 'dispositivo', ''), 300),
    'idioma', left(coalesce(p_evidencia ->> 'idioma', ''), 40),
    'texto_aceptado', left(coalesce(p_evidencia ->> 'texto_aceptado', ''), 40),
    'sesion', (select auth.jwt()) ->> 'session_id',
    'nivel_sesion', (select auth.jwt()) ->> 'aal',
    'autenticacion', v_amr,
    'leido_at', v_s.leido_at,
    'documento', jsonb_build_object('folio', v_d.folio, 'version', v_r.version, 'sha256', v_r.sha256),
    'momento', v_ahora);
  v_hash := encode(extensions.digest(v_r.sha256 || '|' || v_r.id::text || '|' || v_s.id::text || '|' || v_uid::text || '|'
    || extract(epoch from v_ahora)::text || '|' || v_ev::text, 'sha256'), 'hex');

  update public.sign_signers set estado = 'firmado', firmado_at = v_ahora, metodo = 'codigo_autenticador', evidencia = v_ev, firma_hash = v_hash
  where id = p_signer;
  perform private.vault_evento(v_r.document_id, 'firmado', jsonb_build_object('firma', v_r.folio, 'firmante', p_signer,
    'calidad', v_s.calidad, 'firma_hash', v_hash, 'version', v_r.version));

  select count(*) into v_quedan from public.sign_signers where request_id = v_r.id and estado <> 'firmado';
  if v_quedan = 0 then
    select encode(extensions.digest(v_r.sha256 || '|' || string_agg(firma_hash, '|' order by orden), 'sha256'), 'hex') into v_sello
      from public.sign_signers where request_id = v_r.id;
    update public.sign_requests set estado = 'completada', completada_at = v_ahora, sello = v_sello where id = v_r.id;
    perform private.vault_evento(v_r.document_id, 'firma_completada', jsonb_build_object('firma', v_r.folio, 'sello', v_sello));
    if v_r.case_id is not null then
      perform private.log_case(v_r.case_id, 'documento', 'Documento ' || v_d.folio || ' firmado por todas las partes (' || v_r.folio || '). Quedó en la Bóveda.',
        'cliente', jsonb_build_object('vault_document', v_r.document_id, 'sign_request', v_r.id));
    end if;
    perform private.notify(
      (select array_agg(distinct u) from (select user_id as u from public.sign_signers where request_id = v_r.id
         union select v_r.creado_por union select responsible_id from public.cases where id = v_r.case_id) x),
      v_r.company_id, v_r.case_id, 'casos', 'Documento firmado: ' || v_d.titulo,
      'Todas las partes firmaron el documento ' || v_d.folio || '. Código de verificación: ' || upper(left(v_sello, 20)) || '.',
      case when v_r.case_id is not null then '/casos/' || v_r.case_id || '#boveda' else '/firmas' end, 'sign-ok:' || v_r.id);
  elsif v_r.secuencial then
    select array_agg(s.user_id) into v_siguientes from public.sign_signers s
      where s.request_id = v_r.id and s.estado = 'pendiente' and s.orden = (select min(orden) from public.sign_signers where request_id = v_r.id and estado = 'pendiente');
    perform private.sign_avisar(v_r.id, v_siguientes);
  end if;
  return jsonb_build_object('firma_hash', v_hash, 'completa', v_quedan = 0, 'sello', v_sello);
end
$$;

-- 4. Rechazar (el firmante, con motivo): la solicitud se cierra y el equipo lo revisa.
create or replace function public.sign_rechazar(p_signer uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_s public.sign_signers;
  v_r public.sign_requests;
begin
  if char_length(trim(coalesce(p_motivo, ''))) < 5 then raise exception 'ENQ_FALTA_OBSERVACION'; end if;
  select * into v_s from public.sign_signers where id = p_signer for update;
  if not found or v_s.user_id is distinct from v_uid then raise exception 'ENQ_SIN_PERMISO'; end if;
  select * into v_r from public.sign_requests where id = v_s.request_id for update;
  if v_s.estado <> 'pendiente' or v_r.estado <> 'pendiente' then raise exception 'ENQ_FIRMA_CERRADA'; end if;
  update public.sign_signers set estado = 'rechazado', rechazo_motivo = left(trim(p_motivo), 500) where id = p_signer;
  update public.sign_requests set estado = 'rechazada' where id = v_r.id;
  perform private.vault_evento(v_r.document_id, 'firma_rechazada', jsonb_build_object('firma', v_r.folio, 'firmante', p_signer, 'nota', left(trim(p_motivo), 500)));
  perform private.notify((select array_agg(distinct u) from (select v_r.creado_por as u union select responsible_id from public.cases where id = v_r.case_id) x),
    v_r.company_id, v_r.case_id, 'casos', 'Firma rechazada: ' || v_r.folio, 'Una de las partes no firmó y explicó el motivo. Revisa el documento en la Bóveda.',
    '/mando/boveda/' || v_r.document_id, 'sign-no:' || v_r.id);
end
$$;

-- 5. Anular una solicitud en curso (quien puede solicitar), con motivo.
create or replace function public.sign_anular(p_req uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
  v_r public.sign_requests;
  v_resp uuid;
  v_dresp uuid;
begin
  if char_length(trim(coalesce(p_motivo, ''))) < 5 then raise exception 'ENQ_FALTA_OBSERVACION'; end if;
  select * into v_r from public.sign_requests where id = p_req for update;
  if not found then raise exception 'ENQ_NO_ENCONTRADO'; end if;
  select responsible_id into v_resp from public.cases where id = v_r.case_id;
  select responsable_id into v_dresp from public.vault_documents where id = v_r.document_id;
  if not (private.is_supervisor() or v_resp = v_uid or v_dresp = v_uid or v_r.creado_por = v_uid) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_r.estado <> 'pendiente' then raise exception 'ENQ_FIRMA_CERRADA'; end if;
  update public.sign_requests set estado = 'anulada', anulado_motivo = left(trim(p_motivo), 500) where id = p_req;
  perform private.vault_evento(v_r.document_id, 'firma_anulada', jsonb_build_object('firma', v_r.folio, 'nota', left(trim(p_motivo), 500)));
end
$$;

-- ---------------------------------------------------------------------
-- 6. Para el firmante: sus firmas y el documento que firma (aunque no sea integrante de la empresa).
-- ---------------------------------------------------------------------
create or replace function public.sign_mis_firmas() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'estado', s.estado, 'firmado_at', s.firmado_at, 'calidad', s.calidad,
    'folio', r.folio, 'solicitud', r.estado, 'vence_at', r.vence_at, 'documento', d.folio, 'titulo', d.titulo,
    'vencida', r.estado = 'pendiente' and r.vence_at < now(),
    'turno', s.estado = 'pendiente' and r.estado = 'pendiente' and (not r.secuencial or not exists (
      select 1 from public.sign_signers o where o.request_id = r.id and o.orden < s.orden and o.estado <> 'firmado')))
    order by (s.estado = 'pendiente' and r.estado = 'pendiente') desc, r.created_at desc), '[]'::jsonb)
  from public.sign_signers s join public.sign_requests r on r.id = s.request_id join public.vault_documents d on d.id = r.document_id
  where s.user_id = (select auth.uid())
$$;

create or replace function public.sign_documento(p_signer uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_s public.sign_signers;
  v_r public.sign_requests;
  v_d public.vault_documents;
  v_cuerpo text;
  v_emp jsonb;
begin
  select * into v_s from public.sign_signers where id = p_signer;
  if not found or v_s.user_id is distinct from (select auth.uid()) then raise exception 'ENQ_SIN_PERMISO'; end if;
  select * into v_r from public.sign_requests where id = v_s.request_id;
  select * into v_d from public.vault_documents where id = v_r.document_id;
  select cuerpo into v_cuerpo from public.vault_versions where document_id = v_d.id and version = v_r.version;
  select jsonb_build_object('nombre', legal_name, 'rut', rut) into v_emp from public.companies where id = v_r.company_id;
  return jsonb_build_object(
    'firmante', jsonb_build_object('id', v_s.id, 'nombre', v_s.nombre, 'calidad', v_s.calidad, 'estado', v_s.estado,
      'leido_at', v_s.leido_at, 'firmado_at', v_s.firmado_at, 'firma_hash', v_s.firma_hash, 'rechazo_motivo', v_s.rechazo_motivo, 'metodo', v_s.metodo),
    'solicitud', jsonb_build_object('id', v_r.id, 'folio', v_r.folio, 'estado', v_r.estado, 'nivel', v_r.nivel, 'mensaje', v_r.mensaje,
      'vence_at', v_r.vence_at, 'vencida', v_r.vence_at < now(), 'secuencial', v_r.secuencial, 'sello', v_r.sello, 'completada_at', v_r.completada_at),
    'documento', jsonb_build_object('id', v_d.id, 'folio', v_d.folio, 'titulo', v_d.titulo, 'clase', v_d.clase, 'version', v_r.version,
      'sha256', v_r.sha256, 'cuerpo', v_cuerpo, 'anulado', v_d.estado = 'anulado', 'case_id', v_d.case_id),
    'empresa', v_emp,
    'turno', v_s.estado = 'pendiente' and v_r.estado = 'pendiente' and (not v_r.secuencial or not exists (
      select 1 from public.sign_signers o where o.request_id = v_r.id and o.orden < v_s.orden and o.estado <> 'firmado')),
    'firmantes', (select coalesce(jsonb_agg(jsonb_build_object('orden', o.orden, 'nombre', o.nombre, 'calidad', o.calidad, 'estado', o.estado,
      'firmado_at', o.firmado_at) order by o.orden), '[]'::jsonb) from public.sign_signers o where o.request_id = v_r.id));
end
$$;

-- Firmas de un documento (para la hoja del documento): sin evidencia técnica, para quien puede ver el documento.
create or replace function public.sign_resumen_documento(p_doc uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.vault_puede_ver(p_doc) then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('folio', r.folio, 'estado', r.estado, 'nivel', r.nivel, 'version', r.version,
    'completada_at', r.completada_at, 'sello', r.sello, 'vence_at', r.vence_at,
    'firmantes', (select coalesce(jsonb_agg(jsonb_build_object('nombre', s.nombre, 'calidad', s.calidad, 'estado', s.estado, 'firmado_at', s.firmado_at,
      'metodo', s.metodo, 'firma_hash', s.firma_hash) order by s.orden), '[]'::jsonb) from public.sign_signers s where s.request_id = r.id))
    order by r.created_at desc), '[]'::jsonb)
    from public.sign_requests r where r.document_id = p_doc);
end
$$;

-- ---------------------------------------------------------------------
-- 7. Verificación pública: con el folio y el código de verificación (o la huella SHA-256 del documento).
--    Sin ambos datos no responde nada (no se pueden recorrer folios). No muestra nombres ni contenido.
-- ---------------------------------------------------------------------
create or replace function public.sign_verificar(p_folio text, p_codigo text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_folio text := upper(trim(coalesce(p_folio, '')));
  v_cod text := lower(regexp_replace(coalesce(p_codigo, ''), '[^0-9a-fA-F]', '', 'g'));
  v_r public.sign_requests;
  v_doc text;
begin
  if char_length(v_cod) < 16 or v_folio !~ '^(FIR|DOC)-\d{4}-\d{6}$' then return jsonb_build_object('encontrado', false); end if;
  select r.* into v_r from public.sign_requests r join public.vault_documents d on d.id = r.document_id
    where (r.folio = v_folio or d.folio = v_folio)
      and ((r.sello is not null and left(r.sello, char_length(v_cod)) = v_cod) or (char_length(v_cod) = 64 and r.sha256 = v_cod))
    order by (r.estado = 'completada') desc, r.created_at desc limit 1;
  if not found then return jsonb_build_object('encontrado', false); end if;
  select folio into v_doc from public.vault_documents where id = v_r.document_id;
  return jsonb_build_object('encontrado', true, 'folio', v_r.folio, 'documento', v_doc, 'version', v_r.version, 'estado', v_r.estado,
    'nivel', v_r.nivel, 'sha256', v_r.sha256, 'sello', v_r.sello, 'completada_at', v_r.completada_at,
    'documento_anulado', exists (select 1 from public.vault_documents where id = v_r.document_id and estado = 'anulado'),
    'firmas', (select coalesce(jsonb_agg(jsonb_build_object('calidad', s.calidad, 'estado', s.estado, 'firmado_at', s.firmado_at, 'metodo', s.metodo)
      order by s.orden), '[]'::jsonb) from public.sign_signers s where s.request_id = v_r.id));
end
$$;

revoke execute on function private.sign_no_admitida(text, text) from public, anon, authenticated;
revoke execute on function private.sign_avisar(uuid, uuid[]) from public, anon, authenticated;
revoke execute on function public.sign_solicitar(uuid, jsonb) from public, anon;
revoke execute on function public.sign_registrar_lectura(uuid) from public, anon;
revoke execute on function public.sign_firmar(uuid, text, jsonb) from public, anon;
revoke execute on function public.sign_rechazar(uuid, text) from public, anon;
revoke execute on function public.sign_anular(uuid, text) from public, anon;
revoke execute on function public.sign_mis_firmas() from public, anon;
revoke execute on function public.sign_documento(uuid) from public, anon;
revoke execute on function public.sign_resumen_documento(uuid) from public, anon;
revoke execute on function public.sign_verificar(text, text) from public;
grant execute on function public.sign_solicitar(uuid, jsonb) to authenticated;
grant execute on function public.sign_registrar_lectura(uuid) to authenticated;
grant execute on function public.sign_firmar(uuid, text, jsonb) to authenticated;
grant execute on function public.sign_rechazar(uuid, text) to authenticated;
grant execute on function public.sign_anular(uuid, text) to authenticated;
grant execute on function public.sign_mis_firmas() to authenticated;
grant execute on function public.sign_documento(uuid) to authenticated;
grant execute on function public.sign_resumen_documento(uuid) to authenticated;
grant execute on function public.sign_verificar(text, text) to anon, authenticated;
