-- =====================================================================
-- ENQORA · 0054 · App del gestor de terreno: registro previo, invitación y descarga autorizada
--  1. Registro previo: el equipo registra al gestor (nombre, RUN, contacto, domicilio y comunas que cubre). Solo un
--     gestor registrado y activo puede recibir encargos. Los gestores ya NO son parte del equipo interno: no ven
--     nada del Centro de Mando, solo sus propios encargos (menor privilegio).
--  2. Invitación: enlace personal de un solo uso (7 días) para el correo registrado. Al abrirlo el gestor instala la
--     app ENQORA Gestor, crea su cuenta con segundo factor, acepta el tratamiento de sus datos y queda activo.
--  3. Documentos del encargo: el equipo adjunta archivos del expediente del caso. El gestor NO puede descargarlos
--     hasta que el equipo (CORA) lo autoriza después de que él acepta el encargo. La autorización vale mientras el
--     encargo está en curso; cada descarga queda registrada.
-- Requiere 0053. Se puede ejecutar más de una vez.
-- =====================================================================

create table if not exists public.field_agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  full_name text not null check (char_length(full_name) between 5 and 120),
  run text check (run is null or run ~ '^[0-9]{7,8}-[0-9K]$'),
  email text not null unique check (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'),
  phone text check (phone is null or phone ~ '^\+569[0-9]{8}$'),
  address text check (char_length(address) <= 240),
  comuna text check (char_length(comuna) <= 80),
  coverage text[] not null default '{}',
  status text not null default 'invitado' check (status in ('invitado', 'activo', 'suspendido', 'retirado')),
  invite_hash text unique,
  invite_expires timestamptz,
  consent_at timestamptz,
  consent_version text,
  note text check (char_length(note) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.field_agents enable row level security;
revoke all on public.field_agents from anon, authenticated;
grant select (id, user_id, full_name, run, email, phone, address, comuna, coverage, status, invite_expires, consent_at, note, created_at, updated_at)
  on public.field_agents to authenticated;
drop policy if exists mfa_requerido on public.field_agents;
create policy mfa_requerido on public.field_agents as restrictive for all to authenticated using (private.is_mfa()) with check (private.is_mfa());
drop policy if exists gestores_ver on public.field_agents;
create policy gestores_ver on public.field_agents for select to authenticated
  using (private.is_supervisor() or user_id = (select auth.uid()));

create or replace function private.es_gestor() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.field_agents g where g.user_id = (select auth.uid()) and g.status = 'activo')
$$;

-- Columnas de autorización de descarga en el encargo
alter table public.field_tasks add column if not exists docs_ok_at timestamptz;
alter table public.field_tasks add column if not exists docs_ok_by uuid references auth.users (id) on delete set null;

-- Archivos del encargo (tomados del expediente del caso) y registro de descargas
create table if not exists public.field_task_files (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.field_tasks (id) on delete cascade,
  document_id uuid not null references public.case_documents (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  added_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (task_id, document_id)
);
create table if not exists public.field_task_downloads (
  id bigint generated always as identity primary key,
  file_id uuid not null references public.field_task_files (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.field_task_files enable row level security;
alter table public.field_task_downloads enable row level security;
revoke all on public.field_task_files, public.field_task_downloads from anon, authenticated;
grant select (id, task_id, document_id, file_name, created_at) on public.field_task_files to authenticated;
grant select on public.field_task_downloads to authenticated;
drop policy if exists mfa_requerido on public.field_task_files;
create policy mfa_requerido on public.field_task_files as restrictive for all to authenticated using (private.is_mfa()) with check (private.is_mfa());
drop policy if exists archivos_ver on public.field_task_files;
create policy archivos_ver on public.field_task_files for select to authenticated using (private.field_can_see(task_id));
drop policy if exists descargas_ver on public.field_task_downloads;
create policy descargas_ver on public.field_task_downloads for select to authenticated using (private.is_supervisor());

-- Reglas de 0053 ajustadas: el gestor es el registrado y activo (ya no un rol del equipo).
create or replace function private.field_can_see(p_task uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_staff(array['enqora_admin', 'ops_director', 'accountant_pro', 'lawyer_pro'])
      or exists (select 1 from public.field_tasks t where t.id = p_task and t.gestor_id = (select auth.uid())
                 and private.es_gestor())
$$;

create or replace function public.assign_field_task(p_task uuid, p_gestor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v public.field_tasks;
  v_type public.field_task_types;
  v_gate text;
begin
  if not private.is_supervisor() then raise exception 'ENQ_SIN_PERMISO'; end if;
  select * into v from public.field_tasks where id = p_task for update;
  if not found then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v.status <> 'listo' then raise exception 'ENQ_YA_DECIDIDA'; end if;
  if not exists (select 1 from public.field_agents g where g.user_id = p_gestor and g.status = 'activo') then
    raise exception 'ENQ_GESTOR_SIN_ACCESO';
  end if;
  select * into v_type from public.field_task_types where code = v.type_code;
  if v_type.gestor_fee is null then raise exception 'ENQ_TARIFA_GESTOR_SIN_DEFINIR'; end if;
  v_gate := private.field_habilitado(v);
  if v_gate is not null then raise exception '%', v_gate; end if;

  update public.field_tasks set status = 'asignado', gestor_id = p_gestor, gestor_fee = v_type.gestor_fee,
    assigned_by = v_uid, assigned_at = now(), eta = null, docs_ok_at = null, docs_ok_by = null, updated_at = now() where id = p_task;
  perform private.field_log(p_task, 'listo', 'asignado', 'Tarifa del encargo: ' || private.money_cl(v_type.gestor_fee));
  perform private.notify(array[p_gestor], null, v.case_id, 'equipo', 'Nuevo encargo en terreno · ' || v.folio,
    v_type.name || ' · ' || v.office_name || ' · pago ' || private.money_cl(v_type.gestor_fee) || '. Acéptalo o recházalo.',
    '/gestor/encargo/' || v.id, 'terreno-asig-' || v.id || '-' || extract(epoch from now())::bigint);
end
$$;

create or replace function public.field_task_gestor(p_task uuid, p_action text, p_eta timestamptz default null,
  p_receipt text default null, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v public.field_tasks;
  v_to text;
begin
  select * into v from public.field_tasks where id = p_task for update;
  if not found or v.gestor_id is distinct from v_uid or not private.es_gestor() then raise exception 'ENQ_SIN_PERMISO'; end if;

  if p_action = 'aceptar' then
    if v.status <> 'asignado' then raise exception 'ENQ_YA_DECIDIDA'; end if;
    if p_eta is null or p_eta < now() - interval '5 minutes' or p_eta > now() + interval '12 hours' then raise exception 'ENQ_ETA_INVALIDA'; end if;
    v_to := 'en_camino';
    update public.field_tasks set status = v_to, eta = p_eta, updated_at = now() where id = p_task returning * into v;
    perform private.field_client_event(v, 'un gestor ENQORA va en camino a ' || v.office_name || '. Llegada estimada: '
      || to_char(p_eta at time zone 'America/Santiago', 'HH24:MI') || '.');
    -- Si el encargo lleva archivos, CORA (el equipo) debe autorizar su descarga.
    if exists (select 1 from public.field_task_files f where f.task_id = v.id) then
      perform private.notify(private.staff_users(array['ops_director', 'enqora_admin']), v.company_id, v.case_id, 'equipo',
        'Autorizar descarga de documentos · ' || v.folio, 'El gestor aceptó el encargo y espera tu autorización para descargar los documentos.',
        '/mando/terreno/' || v.id, 'terreno-desc-' || v.id || '-' || extract(epoch from now())::bigint);
    end if;
  elsif p_action = 'rechazar' then
    -- Rechazar no tiene castigo: vuelve a la bandeja de despacho.
    if v.status <> 'asignado' then raise exception 'ENQ_YA_DECIDIDA'; end if;
    v_to := 'listo';
    update public.field_tasks set status = v_to, gestor_id = null, gestor_fee = null, assigned_at = null, eta = null, docs_ok_at = null, docs_ok_by = null, updated_at = now() where id = p_task;
    perform private.notify(private.staff_users(array['ops_director', 'enqora_admin']), v.company_id, v.case_id, 'equipo',
      'Encargo devuelto por el gestor · ' || v.folio, coalesce(p_note, 'Sin motivo indicado.'), '/mando/terreno/' || v.id,
      'terreno-rech-' || v.id || '-' || extract(epoch from now())::bigint);
  elsif p_action = 'eta' then
    if v.status <> 'en_camino' or p_eta is null or p_eta > now() + interval '12 hours' then raise exception 'ENQ_ETA_INVALIDA'; end if;
    v_to := v.status;
    update public.field_tasks set eta = p_eta, updated_at = now() where id = p_task returning * into v;
    perform private.field_client_event(v, 'nueva hora estimada de llegada: ' || to_char(p_eta at time zone 'America/Santiago', 'HH24:MI') || '.');
  elsif p_action = 'llegue' then
    if v.status <> 'en_camino' then raise exception 'ENQ_YA_DECIDIDA'; end if;
    v_to := 'en_oficina';
    update public.field_tasks set status = v_to, arrived_at = now(), updated_at = now() where id = p_task returning * into v;
    perform private.field_client_event(v, 'el gestor llegó a ' || v.office_name || ' y está haciendo el trámite.');
  elsif p_action = 'realizado' then
    if v.status not in ('en_oficina', 'en_camino') then raise exception 'ENQ_YA_DECIDIDA'; end if;
    if char_length(trim(coalesce(p_receipt, ''))) < 3 then raise exception 'ENQ_FALTA_COMPROBANTE'; end if;
    v_to := 'realizado';
    update public.field_tasks set status = v_to, done_at = now(), receipt = left(trim(p_receipt), 200),
      result = left(nullif(trim(coalesce(p_note, '')), ''), 2000), arrived_at = coalesce(arrived_at, now()), updated_at = now()
    where id = p_task returning * into v;
    perform private.notify(private.staff_users(array['ops_director', 'enqora_admin']), v.company_id, v.case_id, 'equipo',
      'Encargo realizado, por verificar · ' || v.folio, 'Comprobante: ' || v.receipt, '/mando/terreno/' || v.id, 'terreno-real-' || v.id);
  elsif p_action = 'no_realizado' then
    if v.status not in ('en_oficina', 'en_camino') then raise exception 'ENQ_YA_DECIDIDA'; end if;
    if char_length(trim(coalesce(p_note, ''))) < 10 then raise exception 'ENQ_FALTA_OBSERVACION'; end if;
    v_to := 'no_realizado';
    update public.field_tasks set status = v_to, done_at = now(), result = left(trim(p_note), 2000), updated_at = now()
    where id = p_task returning * into v;
    perform private.notify(private.staff_users(array['ops_director', 'enqora_admin']), v.company_id, v.case_id, 'equipo',
      'Encargo NO realizado · ' || v.folio, left(p_note, 300), '/mando/terreno/' || v.id, 'terreno-noreal-' || v.id || '-' || now()::date);
  else
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  perform private.field_log(p_task, null, v_to, coalesce(p_note, p_receipt));
end
$$;

create or replace function public.mis_encargos_terreno() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
begin
  if not private.es_gestor() then raise exception 'ENQ_SIN_PERMISO'; end if;
  return coalesce((select jsonb_agg(x order by x ->> 'estado', x ->> 'asignado') from (
    select jsonb_build_object('id', t.id, 'folio', t.folio, 'estado', t.status, 'tipo', ty.name, 'oficina', t.office_name,
      'direccion', t.office_address, 'comuna', t.comuna, 'instrucciones', t.instructions, 'vence', t.due_date,
      'pago', t.gestor_fee, 'eta', t.eta, 'asignado', t.assigned_at, 'guia', ty.guidance,
      'empresa', co.legal_name,
      'documentos', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'nombre', d.name, 'custodia', d.custody) order by d.name)
                              from public.field_task_docs d where d.task_id = t.id), '[]'::jsonb),
      'archivos', (select count(*) from public.field_task_files f where f.task_id = t.id),
      'descarga_autorizada', t.docs_ok_at is not null) as x
    from public.field_tasks t join public.field_task_types ty on ty.code = t.type_code
    join public.companies co on co.id = t.company_id
    where t.gestor_id = v_uid and t.status in ('asignado', 'en_camino', 'en_oficina')) s), '[]'::jsonb);
end
$$;

create or replace function public.gestores_disponibles() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_session();
  if not private.is_supervisor() then raise exception 'ENQ_SIN_PERMISO'; end if;
  return coalesce((select jsonb_agg(x order by x ->> 'nombre') from (
    select jsonb_build_object('id', g.user_id, 'nombre', g.full_name, 'comuna', g.comuna, 'cobertura', g.coverage,
      'activos', (select count(*) from public.field_tasks t where t.gestor_id = g.user_id and t.status in ('asignado', 'en_camino', 'en_oficina'))) as x
    from public.field_agents g
    where g.status = 'activo' and g.user_id is not null) s), '[]'::jsonb);
end
$$;

create or replace function public.verify_field_task(p_task uuid, p_ok boolean, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v public.field_tasks;
  v_type public.field_task_types;
begin
  if not private.is_supervisor() then raise exception 'ENQ_SIN_PERMISO'; end if;
  select * into v from public.field_tasks where id = p_task for update;
  if not found then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v.status not in ('realizado', 'no_realizado') then raise exception 'ENQ_YA_DECIDIDA'; end if;
  if v.gestor_id = v_uid then raise exception 'ENQ_CUATRO_OJOS'; end if;
  select * into v_type from public.field_task_types where code = v.type_code;

  if v.status = 'realizado' and p_ok then
    update public.field_tasks set status = 'verificado', verified_by = v_uid, verified_at = now(), updated_at = now()
    where id = p_task returning * into v;
    perform private.field_log(p_task, 'realizado', 'verificado', p_note);
    perform private.field_client_event(v, v_type.name || ' realizado en ' || v.office_name || '. Comprobante: ' || v.receipt || '.');
  else
    -- No realizado, o realizado que no se acepta: vuelve a despacho para reintentar (o se cancela aparte).
    if char_length(trim(coalesce(p_note, ''))) < 10 then raise exception 'ENQ_FALTA_OBSERVACION'; end if;
    update public.field_tasks set status = 'listo', gestor_id = null, gestor_fee = null, assigned_at = null, eta = null,
      arrived_at = null, done_at = null, receipt = null, docs_ok_at = null, docs_ok_by = null, updated_at = now() where id = p_task returning * into v;
    perform private.field_log(p_task, null, 'listo', 'Vuelve a despacho: ' || p_note);
    perform private.field_client_event(v, 'el trámite en ' || v.office_name || ' no se completó y se reprogramará.');
  end if;
end
$$;

create or replace function public.decide_field_payout(p_payout uuid, p_action text, p_reference text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
  v public.field_payouts;
begin
  if not private.is_staff(array['enqora_admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  select * into v from public.field_payouts where id = p_payout for update;
  if not found then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_action = 'aprobar' and v.status = 'borrador' then
    update public.field_payouts set status = 'aprobada', approved_by = v_uid, approved_at = now() where id = p_payout;
    perform private.notify(array[v.gestor_id], null, null, 'equipo', 'Liquidación aprobada · ' || to_char(v.period, 'MM-YYYY'),
      v.tasks || ' encargo(s) verificados por ' || private.money_cl(v.total) || '.', '/gestor', 'liq-' || v.id || '-aprobada');
  elsif p_action = 'pagada' and v.status = 'aprobada' then
    if char_length(trim(coalesce(p_reference, ''))) < 3 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
    update public.field_payouts set status = 'pagada', paid_reference = left(trim(p_reference), 120), paid_at = now() where id = p_payout;
  elsif p_action = 'anular' and v.status in ('borrador', 'aprobada') then
    update public.field_payouts set status = 'anulada' where id = p_payout;
    update public.field_tasks set payout_id = null where payout_id = p_payout;
  else
    raise exception 'ENQ_YA_DECIDIDA';
  end if;
end
$$;

-- ¿Puede el usuario actual descargar este archivo ahora? (gestor asignado, encargo en curso y autorizado)
create or replace function private.terreno_puede_descargar(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.field_task_files f join public.field_tasks t on t.id = f.task_id
    where f.storage_path = p_path and t.gestor_id = (select auth.uid()) and private.es_gestor()
      and t.status in ('en_camino', 'en_oficina') and t.docs_ok_at is not null)
$$;

do $$ begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists enqora_terreno_gestor_leer on storage.objects';
    execute $p$create policy enqora_terreno_gestor_leer on storage.objects for select to authenticated
      using (bucket_id = 'expedientes' and private.is_mfa() and private.terreno_puede_descargar(name))$p$;
  end if;
end $$;

-- Equipo: adjuntar un documento del expediente del caso al encargo (antes de despacharlo).
create or replace function public.field_task_attach(p_task uuid, p_document uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v public.field_tasks;
  v_doc public.case_documents;
begin
  if not private.is_staff(array['enqora_admin', 'ops_director', 'accountant_pro', 'lawyer_pro']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  select * into v from public.field_tasks where id = p_task;
  if not found then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v.status in ('realizado', 'no_realizado', 'verificado', 'cancelado') then raise exception 'ENQ_YA_DECIDIDA'; end if;
  select * into v_doc from public.case_documents where id = p_document and case_id = v.case_id;
  if not found then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  insert into public.field_task_files (task_id, document_id, storage_path, file_name, added_by)
  values (p_task, p_document, v_doc.storage_path, v_doc.file_name, v_uid) on conflict (task_id, document_id) do nothing;
  perform private.field_log(p_task, null, null, 'Archivo adjunto: ' || v_doc.file_name);
end
$$;

create or replace function public.field_task_detach(p_file uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_task uuid;
begin
  perform private.require_session();
  if not private.is_staff(array['enqora_admin', 'ops_director', 'accountant_pro', 'lawyer_pro']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  delete from public.field_task_files where id = p_file returning task_id into v_task;
  if v_task is null then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  perform private.field_log(v_task, null, null, 'Archivo quitado del encargo');
end
$$;

-- CORA (supervisión) autoriza o retira la descarga. Solo con el encargo aceptado y en curso.
create or replace function public.field_task_docs_ok(p_task uuid, p_ok boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v public.field_tasks;
begin
  if not private.is_supervisor() then raise exception 'ENQ_SIN_PERMISO'; end if;
  select * into v from public.field_tasks where id = p_task for update;
  if not found then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_ok and v.status not in ('en_camino', 'en_oficina') then raise exception 'ENQ_ENCARGO_NO_ACEPTADO'; end if;
  update public.field_tasks set docs_ok_at = case when p_ok then now() end, docs_ok_by = case when p_ok then v_uid end, updated_at = now()
  where id = p_task;
  perform private.field_log(p_task, null, null, case when p_ok then 'CORA autorizó la descarga de documentos' else 'CORA retiró la autorización de descarga' end);
  if p_ok then
    perform private.notify(array[v.gestor_id], null, v.case_id, 'equipo', 'CORA autorizó tus documentos · ' || v.folio,
      'Ya puedes descargar los documentos del encargo.', '/gestor/encargo/' || v.id, 'terreno-docsok-' || v.id || '-' || extract(epoch from now())::bigint);
  end if;
end
$$;

-- Gestor: pide un archivo. Comprueba la autorización, registra la descarga y entrega la ruta (el enlace firmado
-- lo crea el servidor con la sesión del gestor y vence en 60 segundos).
create or replace function public.field_task_file_get(p_file uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  f public.field_task_files;
begin
  select * into f from public.field_task_files where id = p_file;
  if not found or not private.terreno_puede_descargar(f.storage_path) then raise exception 'ENQ_DESCARGA_NO_AUTORIZADA'; end if;
  insert into public.field_task_downloads (file_id, user_id) values (f.id, v_uid);
  perform private.field_log(f.task_id, null, null, 'Descarga: ' || f.file_name);
  return jsonb_build_object('path', f.storage_path, 'nombre', f.file_name);
end
$$;

-- Registro del gestor (supervisión)
create or replace function public.register_field_agent(p_data jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_id uuid;
  v_run text := upper(regexp_replace(coalesce(p_data ->> 'run', ''), '[^0-9kK-]', '', 'g'));
begin
  if not private.is_supervisor() then raise exception 'ENQ_SIN_PERMISO'; end if;
  insert into public.field_agents (full_name, run, email, phone, address, comuna, coverage, note, created_by)
  values (trim(coalesce(p_data ->> 'nombre', '')), nullif(v_run, ''), lower(trim(coalesce(p_data ->> 'correo', ''))),
    nullif(trim(coalesce(p_data ->> 'telefono', '')), ''), nullif(trim(coalesce(p_data ->> 'direccion', '')), ''),
    nullif(trim(coalesce(p_data ->> 'comuna', '')), ''),
    coalesce((select array_agg(left(trim(x), 80)) from jsonb_array_elements_text(case when jsonb_typeof(p_data -> 'cobertura') = 'array' then p_data -> 'cobertura' else '[]'::jsonb end) x where trim(x) <> ''), '{}'),
    nullif(trim(coalesce(p_data ->> 'nota', '')), ''), v_uid)
  returning id into v_id;
  return v_id;
exception
  when unique_violation then raise exception 'ENQ_GESTOR_YA_REGISTRADO';
  when check_violation or not_null_violation then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

create or replace function public.invite_field_agent(p_agent uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  perform private.require_session();
  if not private.is_supervisor() then raise exception 'ENQ_SIN_PERMISO'; end if;
  update public.field_agents set invite_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
    invite_expires = now() + interval '7 days', updated_at = now()
  where id = p_agent and status in ('invitado', 'activo') and user_id is null;
  if not found then raise exception 'ENQ_YA_DECIDIDA'; end if;
  return v_token;
end
$$;

create or replace function public.set_field_agent_status(p_agent uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  perform private.require_session();
  if not private.is_supervisor() then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_status not in ('activo', 'suspendido', 'retirado') then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  update public.field_agents set status = p_status, invite_hash = case when p_status = 'activo' then invite_hash end, updated_at = now()
  where id = p_agent and (p_status <> 'activo' or user_id is not null) returning user_id into v_user;
  if not found then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  -- Al suspender o retirar, sus encargos que aún no empezó vuelven a despacho.
  if p_status <> 'activo' and v_user is not null then
    update public.field_tasks set status = 'listo', gestor_id = null, gestor_fee = null, assigned_at = null, eta = null,
      docs_ok_at = null, docs_ok_by = null, updated_at = now()
    where gestor_id = v_user and status = 'asignado';
    update public.field_tasks set docs_ok_at = null, docs_ok_by = null where gestor_id = v_user and status in ('en_camino', 'en_oficina');
  end if;
end
$$;

-- Vista previa pública de la invitación: solo el primer nombre y el correo (para confirmar que es para él).
create or replace function public.field_agent_invite_preview(p_token text)
returns table (status text, first_name text, email text)
language plpgsql stable security definer set search_path = '' as $$
declare
  g public.field_agents;
begin
  select * into g from public.field_agents where invite_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if not found then return query select 'invalido'::text, null::text, null::text; return; end if;
  return query select case when g.user_id is not null then 'usado' when g.invite_expires < now() then 'vencido'
                           when g.status not in ('invitado', 'activo') then 'invalido' else 'valido' end,
    split_part(g.full_name, ' ', 1), g.email;
end
$$;

create or replace function public.accept_field_agent_invite(p_token text, p_consent_version text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_email text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
  g public.field_agents;
begin
  if not private.is_mfa() then raise exception 'ENQ_MFA'; end if;
  if char_length(coalesce(p_consent_version, '')) < 4 then raise exception 'ENQ_FALTA_CONSENTIMIENTO'; end if;
  select * into g from public.field_agents where invite_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') for update;
  if not found or g.user_id is not null or g.invite_expires < now() or g.status not in ('invitado', 'activo') then raise exception 'ENQ_INVITACION_INVALIDA'; end if;
  if g.email <> v_email then raise exception 'ENQ_INVITACION_OTRO_CORREO'; end if;
  if exists (select 1 from public.field_agents x where x.user_id = v_uid) then raise exception 'ENQ_YA_MIEMBRO'; end if;
  update public.field_agents set user_id = v_uid, status = 'activo', invite_hash = null, consent_at = now(),
    consent_version = left(p_consent_version, 40), updated_at = now() where id = g.id;
  perform private.notify(private.staff_users(array['ops_director', 'enqora_admin']), null, null, 'equipo',
    'Gestor activo: ' || g.full_name, 'Aceptó la invitación e instaló la app. Ya puede recibir encargos.', '/mando/terreno#gestores', 'gestor-activo-' || g.id);
end
$$;

revoke execute on function private.es_gestor(), private.terreno_puede_descargar(text) from public, anon;
grant execute on function private.es_gestor(), private.terreno_puede_descargar(text) to authenticated;
revoke execute on function public.field_task_attach(uuid, uuid), public.field_task_detach(uuid), public.field_task_docs_ok(uuid, boolean),
  public.field_task_file_get(uuid), public.register_field_agent(jsonb), public.invite_field_agent(uuid),
  public.set_field_agent_status(uuid, text), public.accept_field_agent_invite(text, text) from public, anon;
grant execute on function public.field_task_attach(uuid, uuid), public.field_task_detach(uuid), public.field_task_docs_ok(uuid, boolean),
  public.field_task_file_get(uuid), public.register_field_agent(jsonb), public.invite_field_agent(uuid),
  public.set_field_agent_status(uuid, text), public.accept_field_agent_invite(text, text) to authenticated;
revoke execute on function public.field_agent_invite_preview(text) from public;
grant execute on function public.field_agent_invite_preview(text) to anon, authenticated;
