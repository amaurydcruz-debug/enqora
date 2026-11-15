-- =====================================================================
-- ENQORA · 0061 · ENQORA SIGN — firma con huella o Face ID (llaves de acceso / passkeys)
-- Cada persona registra en Seguridad una llave de acceso de su teléfono o computador (WebAuthn).
-- La huella o el rostro nunca salen del dispositivo: ENQORA guarda solo la llave pública.
-- Al firmar, el dispositivo firma un desafío que incluye la huella SHA-256 del documento; el servidor
-- de ENQORA verifica esa firma y recién entonces llama a la base con la clave de servicio.
-- Requiere 0060. Se puede ejecutar más de una vez.
-- =====================================================================

create table if not exists public.signing_passkeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  credential_id text not null unique check (credential_id ~ '^[A-Za-z0-9_-]+$' and char_length(credential_id) between 16 and 1400),
  public_key text not null check (char_length(public_key) between 40 and 2000),
  alg int not null check (alg in (-7, -8, -257)),
  rp_id text not null check (char_length(rp_id) between 3 and 253),
  sign_count bigint not null default 0,
  nombre text not null check (char_length(nombre) between 2 and 80),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists signing_passkeys_user_idx on public.signing_passkeys (user_id) where revoked_at is null;

alter table public.signing_passkeys enable row level security;
revoke all on public.signing_passkeys from anon, authenticated;
grant select on public.signing_passkeys to authenticated;
drop policy if exists signing_passkeys_propias on public.signing_passkeys;
create policy signing_passkeys_propias on public.signing_passkeys for select to authenticated using (user_id = (select auth.uid()));

-- Registrar una llave: solo después de que el servidor verificó el registro (clave de servicio), con sesión
-- y segundo factor recientes. Hasta 5 llaves activas por persona.
create or replace function public.passkey_registrar(p_token text, p_credential text, p_public_key text, p_alg int, p_rp_id text, p_nombre text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
  v_id uuid;
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  if (select count(*) from public.signing_passkeys where user_id = v_uid and revoked_at is null) >= 5 then raise exception 'ENQ_LLAVE_LIMITE'; end if;
  insert into public.signing_passkeys (user_id, credential_id, public_key, alg, rp_id, nombre)
  values (v_uid, p_credential, p_public_key, p_alg, lower(p_rp_id), left(coalesce(nullif(trim(p_nombre), ''), 'Mi dispositivo'), 80))
  returning id into v_id;
  return v_id;
end
$$;

create or replace function public.passkey_revocar(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
begin
  update public.signing_passkeys set revoked_at = now() where id = p_id and user_id = v_uid and revoked_at is null;
  if not found then raise exception 'ENQ_NO_ENCONTRADO'; end if;
end
$$;

-- ---------------------------------------------------------------------
-- Núcleo de la firma (compartido por código del autenticador y llave de acceso)
-- ---------------------------------------------------------------------
create or replace function private.sign_ejecutar(p_signer uuid, p_sha text, p_evidencia jsonb, p_metodo text, p_extra jsonb) returns jsonb
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
    'momento', v_ahora) || coalesce(p_extra, '{}'::jsonb);
  v_hash := encode(extensions.digest(v_r.sha256 || '|' || v_r.id::text || '|' || v_s.id::text || '|' || v_uid::text || '|'
    || extract(epoch from v_ahora)::text || '|' || v_ev::text, 'sha256'), 'hex');

  update public.sign_signers set estado = 'firmado', firmado_at = v_ahora, metodo = p_metodo, evidencia = v_ev, firma_hash = v_hash
  where id = p_signer;
  perform private.vault_evento(v_r.document_id, 'firmado', jsonb_build_object('firma', v_r.folio, 'firmante', p_signer,
    'calidad', v_s.calidad, 'firma_hash', v_hash, 'version', v_r.version, 'metodo', p_metodo));

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


-- Firma con código del autenticador (0060): mismo comportamiento, ahora sobre el núcleo compartido.
create or replace function public.sign_firmar(p_signer uuid, p_sha text, p_evidencia jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_session();
  if not private.recent_mfa(5) then raise exception 'ENQ_FIRMA_CODIGO'; end if;
  return private.sign_ejecutar(p_signer, p_sha, p_evidencia, 'codigo_autenticador', '{}'::jsonb);
end
$$;

-- Firma con llave de acceso: el servidor ya verificó la firma del dispositivo sobre el desafío
-- (que contiene la huella del documento). Aquí se comprueba que la llave es de quien firma y que su
-- contador avanzó (una llave copiada se detecta).
create or replace function public.sign_firmar_llave(p_token text, p_signer uuid, p_sha text, p_credential text, p_count bigint, p_desafio text, p_evidencia jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_k public.signing_passkeys;
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  select * into v_k from public.signing_passkeys where credential_id = p_credential and user_id = v_uid and revoked_at is null for update;
  if not found then raise exception 'ENQ_LLAVE_NO_VALIDA'; end if;
  if v_k.sign_count > 0 and coalesce(p_count, 0) <= v_k.sign_count then raise exception 'ENQ_LLAVE_NO_VALIDA'; end if;
  update public.signing_passkeys set sign_count = greatest(coalesce(p_count, 0), sign_count), last_used_at = now() where id = v_k.id;
  return private.sign_ejecutar(p_signer, p_sha, p_evidencia, 'llave_acceso', jsonb_build_object(
    'llave', jsonb_build_object('id', v_k.id, 'nombre', v_k.nombre, 'alg', v_k.alg, 'rp_id', v_k.rp_id, 'contador', p_count, 'desafio', left(coalesce(p_desafio, ''), 200),
      'verificacion_usuario', true)));
end
$$;

revoke execute on function private.sign_ejecutar(uuid, text, jsonb, text, jsonb) from public, anon, authenticated;
revoke execute on function public.passkey_registrar(text, text, text, int, text, text) from public, anon;
revoke execute on function public.passkey_revocar(uuid) from public, anon;
revoke execute on function public.sign_firmar_llave(text, uuid, text, text, bigint, text, jsonb) from public, anon;
grant execute on function public.passkey_registrar(text, text, text, int, text, text) to authenticated;
grant execute on function public.passkey_revocar(uuid) to authenticated;
grant execute on function public.sign_firmar_llave(text, uuid, text, text, bigint, text, jsonb) to authenticated;
