-- =====================================================================
-- ENQORA · 0053 · Despacho en terreno (encargos presenciales)
-- Un trámite que exige ir a una oficina (notaría, Conservador, municipalidad, SII o TGR en casos presenciales)
-- se maneja como un despacho:
--   preparación → revisión jurídica (si corresponde) → listo → asignado a un gestor → en camino (con hora
--   estimada de llegada) → en oficina → realizado / no realizado → verificado por otra persona → liquidación.
-- Reglas:
--   · No se despacha sin autorización vigente del cliente para el caso, ni sin mandato vigente que cubra la
--     institución cuando el tipo de encargo lo exige.
--   · Si el tipo exige revisión jurídica, la aprueba un abogado (o el Administrador) distinto de quien lo preparó.
--   · El gestor conoce el pago ANTES de aceptar: no se asigna un encargo sin tarifa definida por el dueño.
--     Rechazar un encargo no tiene castigo.
--   · El gestor ve solo sus encargos y lo mínimo para hacerlos. No hay seguimiento GPS: él declara su
--     hora estimada y marca cada estado.
--   · Cada documento físico tiene cadena de custodia (por recibir → con el gestor → entregado en la oficina
--     → devuelto al cliente).
--   · Lo realizado lo verifica otra persona (cuatro ojos) antes de contar para la liquidación. ENQORA no paga
--     solo: la liquidación la aprueba el Administrador y el pago se registra a mano.
--   · El esquema de contrato y pago de los gestores debe validarlo el estudio jurídico (Código del Trabajo
--     o Ley 21.431) antes de usarse con personas reales.
-- Requiere 0052. Se puede ejecutar más de una vez.
-- =====================================================================

-- 1. Tipos de encargo (el dueño define la tarifa del gestor)
create table if not exists public.field_task_types (
  code text primary key check (code ~ '^[A-Z]{3}-[0-9]{2}$'),
  name text not null check (char_length(name) between 5 and 120),
  institution text not null check (institution in ('sii', 'tgr', 'inapi', 'registro_empresas', 'municipalidad',
                                                    'direccion_trabajo', 'cbr', 'notaria', 'tribunal', 'otra')),
  requires_lawyer boolean not null default false,
  requires_mandate boolean not null default true,
  checklist jsonb not null default '[]'::jsonb check (jsonb_typeof(checklist) = 'array'),
  guidance text check (char_length(guidance) <= 2000),
  source_url text check (source_url is null or source_url ~ '^https://'),
  gestor_fee integer check (gestor_fee is null or gestor_fee between 1000 and 1000000),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.field_task_types (code, name, institution, requires_lawyer, requires_mandate, checklist, guidance, source_url) values
  ('NOT-01', 'Firma de poder ante notario', 'notaria', true, false,
   '["Poder redactado y revisado por el abogado", "Cédula de identidad vigente de quien firma (la lleva el cliente)", "Datos de la notaría y horario"]',
   'El gestor acompaña o coordina la firma del cliente ante notario y retira el poder firmado. El cliente firma en persona: el gestor nunca firma por él.',
   null),
  ('SII-01', 'Trámite presencial en el SII (caso exceptuado)', 'sii', true, true,
   '["Formulario del trámite completo", "Poder simple firmado ante notario o ministro de fe del SII", "Cédula del gestor (original y fotocopia autorizada ante notario)", "Antecedentes de domicilio"]',
   'El inicio de actividades se hace en línea desde junio de 2020; la oficina atiende solo casos exceptuados. Confirmar antes que el caso califica.',
   'https://www.chileatiende.gob.cl/fichas/3025-inicio-de-actividades-persona-natural'),
  ('CBR-01', 'Ingreso o retiro en el Conservador de Bienes Raíces', 'cbr', true, true,
   '["Escritura o documento a inscribir", "Comprobante de pago de derechos (lo paga el cliente)", "Número de carátula al ingresar"]',
   'Guardar el número de carátula como comprobante. Los derechos los paga el cliente: ENQORA no paga por él.', null),
  ('MUN-01', 'Trámite de patente municipal', 'municipalidad', false, true,
   '["Formulario municipal", "Inicio de actividades del SII", "Acreditación del domicilio", "Poder del representante"]',
   'Los requisitos cambian por comuna: revisar la página de la municipalidad antes de despachar.', null),
  ('TGR-01', 'Trámite presencial en Tesorería', 'tgr', false, true,
   '["Certificado de deuda actualizado", "Poder del representante", "Cédula del gestor"]',
   'El convenio y el pago los acepta el cliente: el gestor nunca firma convenios ni paga por él.', null)
on conflict (code) do nothing;

-- 2. Encargos
create sequence if not exists public.field_task_folio_seq;

create table if not exists public.field_tasks (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique default ('TER-' || lpad(nextval('public.field_task_folio_seq')::text, 5, '0')),
  case_id uuid not null references public.cases (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  type_code text not null references public.field_task_types (code),
  office_name text not null check (char_length(office_name) between 3 and 160),
  office_address text not null check (char_length(office_address) between 5 and 240),
  comuna text check (char_length(comuna) <= 80),
  instructions text check (char_length(instructions) <= 2000),
  due_date date,
  status text not null default 'preparacion' check (status in (
    'preparacion', 'revision_juridica', 'observado', 'listo', 'asignado', 'en_camino', 'en_oficina',
    'realizado', 'no_realizado', 'verificado', 'cancelado')),
  created_by uuid references auth.users (id) on delete set null,
  lawyer_id uuid references auth.users (id) on delete set null,
  lawyer_note text check (char_length(lawyer_note) <= 1000),
  lawyer_at timestamptz,
  gestor_id uuid references auth.users (id) on delete set null,
  gestor_fee integer,
  assigned_by uuid references auth.users (id) on delete set null,
  assigned_at timestamptz,
  eta timestamptz,
  arrived_at timestamptz,
  done_at timestamptz,
  receipt text check (char_length(receipt) <= 200),
  result text check (char_length(result) <= 2000),
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  payout_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists field_tasks_status_idx on public.field_tasks (status, created_at desc);
create index if not exists field_tasks_gestor_idx on public.field_tasks (gestor_id, status);
create index if not exists field_tasks_case_idx on public.field_tasks (case_id);

create table if not exists public.field_task_docs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.field_tasks (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 200),
  custody text not null default 'por_recibir' check (custody in ('por_recibir', 'con_gestor', 'entregado_oficina', 'devuelto_cliente', 'no_aplica')),
  note text check (char_length(note) <= 300),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists field_task_docs_task_idx on public.field_task_docs (task_id);

create table if not exists public.field_task_events (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.field_tasks (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  from_status text,
  to_status text,
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists field_task_events_task_idx on public.field_task_events (task_id, created_at);

-- 3. Liquidaciones de gestores
create table if not exists public.field_payouts (
  id uuid primary key default gen_random_uuid(),
  gestor_id uuid not null references auth.users (id) on delete restrict,
  period date not null,
  tasks integer not null default 0,
  total integer not null default 0,
  status text not null default 'borrador' check (status in ('borrador', 'aprobada', 'pagada', 'anulada')),
  created_by uuid references auth.users (id) on delete set null,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  paid_reference text check (char_length(paid_reference) <= 120),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists field_payouts_gestor_idx on public.field_payouts (gestor_id, period desc);
do $$ begin
  alter table public.field_tasks add constraint field_tasks_payout_fk foreign key (payout_id) references public.field_payouts (id) on delete set null;
exception when duplicate_object then null; end $$;

-- 4. Permisos de lectura
alter table public.field_task_types enable row level security;
alter table public.field_tasks enable row level security;
alter table public.field_task_docs enable row level security;
alter table public.field_task_events enable row level security;
alter table public.field_payouts enable row level security;
revoke all on public.field_task_types, public.field_tasks, public.field_task_docs, public.field_task_events, public.field_payouts from anon, authenticated;
grant select on public.field_task_types, public.field_tasks, public.field_task_docs, public.field_task_events, public.field_payouts to authenticated;

drop policy if exists mfa_requerido on public.field_tasks;
drop policy if exists mfa_requerido on public.field_task_docs;
drop policy if exists mfa_requerido on public.field_task_events;
drop policy if exists mfa_requerido on public.field_payouts;
create policy mfa_requerido on public.field_tasks as restrictive for all to authenticated using (private.is_mfa()) with check (private.is_mfa());
create policy mfa_requerido on public.field_task_docs as restrictive for all to authenticated using (private.is_mfa()) with check (private.is_mfa());
create policy mfa_requerido on public.field_task_events as restrictive for all to authenticated using (private.is_mfa()) with check (private.is_mfa());
create policy mfa_requerido on public.field_payouts as restrictive for all to authenticated using (private.is_mfa()) with check (private.is_mfa());

drop policy if exists tipos_equipo on public.field_task_types;
create policy tipos_equipo on public.field_task_types for select to authenticated using (private.is_staff());

-- El equipo (salvo gestores y agentes IA) ve todo; el gestor solo lo suyo.
create or replace function private.field_can_see(p_task uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_staff(array['enqora_admin', 'ops_director', 'accountant_pro', 'lawyer_pro'])
      or exists (select 1 from public.field_tasks t where t.id = p_task and t.gestor_id = (select auth.uid())
                 and private.is_staff(array['field_agent']))
$$;
drop policy if exists encargos_ver on public.field_tasks;
create policy encargos_ver on public.field_tasks for select to authenticated using (private.field_can_see(id));
drop policy if exists encargos_docs_ver on public.field_task_docs;
create policy encargos_docs_ver on public.field_task_docs for select to authenticated using (private.field_can_see(task_id));
drop policy if exists encargos_eventos_ver on public.field_task_events;
create policy encargos_eventos_ver on public.field_task_events for select to authenticated using (private.field_can_see(task_id));
drop policy if exists liquidaciones_ver on public.field_payouts;
create policy liquidaciones_ver on public.field_payouts for select to authenticated
  using (private.is_staff(array['enqora_admin']) or gestor_id = (select auth.uid()));

-- 5. Utilidades
create or replace function private.field_log(p_task uuid, p_from text, p_to text, p_note text) returns void
language sql security definer set search_path = '' as $$
  insert into public.field_task_events (task_id, actor_id, from_status, to_status, note)
  values (p_task, (select auth.uid()), p_from, p_to, left(nullif(trim(coalesce(p_note, '')), ''), 1000))
$$;

-- Aviso al cliente en la historia de su caso (y notificación).
create or replace function private.field_client_event(p_task public.field_tasks, p_text text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.case_events (case_id, actor_id, kind, body, visibility, metadata)
  values (p_task.case_id, (select auth.uid()), 'terreno', left(p_text, 4000), 'cliente',
          jsonb_build_object('encargo', p_task.folio, 'estado', p_task.status, 'eta', p_task.eta));
  perform private.notify(private.company_users(p_task.company_id, array['owner', 'admin']), p_task.company_id, p_task.case_id,
    'casos', left('Trámite en terreno ' || p_task.folio || ': ' || p_text, 200), null,
    '/casos/' || p_task.case_id || '#historial', 'terreno-' || p_task.id || '-' || p_task.status);
end
$$;

alter table public.case_events drop constraint if exists case_events_kind_check;
alter table public.case_events add constraint case_events_kind_check check (kind in (
  'creado', 'estado', 'comentario', 'nota_interna', 'documento', 'asignacion', 'tarea', 'prioridad',
  'aprobacion', 'autorizacion', 'cotizacion', 'diagnostico', 'plan', 'pago', 'actuacion', 'legal', 'terreno'
));

-- Habilitantes para despachar: autorización vigente y, si el tipo lo exige, mandato vigente para la institución.
create or replace function private.field_habilitado(p_task public.field_tasks) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_type public.field_task_types;
begin
  select * into v_type from public.field_task_types where code = p_task.type_code;
  if not private.autorizacion_vigente(p_task.case_id) then return 'ENQ_SIN_AUTORIZACION_VIGENTE'; end if;
  if v_type.requires_mandate and not exists (
      select 1 from public.mandates m where m.company_id = p_task.company_id
        and private.mandate_covers(m.id, p_task.company_id, v_type.institution, private.today_cl())) then
    return 'ENQ_SIN_MANDATO_TERRENO';
  end if;
  return null;
end
$$;

-- 6. Operación del equipo
create or replace function public.save_field_task_type(p_code text, p_fee integer, p_active boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_session();
  if not private.is_staff(array['enqora_admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_fee is not null and (p_fee < 1000 or p_fee > 1000000) then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  update public.field_task_types set gestor_fee = p_fee, active = coalesce(p_active, true), updated_at = now() where code = p_code;
  if not found then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
end
$$;

create or replace function public.create_field_task(p_folio text, p_type text, p_data jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_case public.cases;
  v_type public.field_task_types;
  v_id uuid;
  v_item text;
  v_due date;
begin
  if not private.is_staff(array['enqora_admin', 'ops_director', 'accountant_pro', 'lawyer_pro']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  select * into v_case from public.cases where folio = upper(trim(coalesce(p_folio, '')));
  if not found then raise exception 'ENQ_CASO_NO_EXISTE'; end if;
  if v_case.status in ('cerrado', 'cancelado') then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  select * into v_type from public.field_task_types where code = p_type and active;
  if not found then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  begin v_due := nullif(p_data ->> 'vence', '')::date; exception when others then v_due := null; end;

  insert into public.field_tasks (case_id, company_id, type_code, office_name, office_address, comuna, instructions, due_date, created_by)
  values (v_case.id, v_case.company_id, v_type.code, trim(coalesce(p_data ->> 'oficina', '')), trim(coalesce(p_data ->> 'direccion', '')),
    nullif(trim(coalesce(p_data ->> 'comuna', '')), ''), nullif(trim(coalesce(p_data ->> 'instrucciones', '')), ''), v_due, v_uid)
  returning id into v_id;

  for v_item in select jsonb_array_elements_text(v_type.checklist) loop
    insert into public.field_task_docs (task_id, name) values (v_id, left(v_item, 200));
  end loop;
  perform private.field_log(v_id, null, 'preparacion', 'Encargo creado: ' || v_type.name);
  return v_id;
exception
  when check_violation or not_null_violation then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

-- Avance del equipo: enviar a revisión, decisión del abogado, cancelar.
create or replace function public.field_task_review(p_task uuid, p_action text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v public.field_tasks;
  v_type public.field_task_types;
  v_gate text;
  v_to text;
begin
  select * into v from public.field_tasks where id = p_task for update;
  if not found or not private.is_staff(array['enqora_admin', 'ops_director', 'accountant_pro', 'lawyer_pro']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  select * into v_type from public.field_task_types where code = v.type_code;

  if p_action = 'preparado' then
    if v.status not in ('preparacion', 'observado') then raise exception 'ENQ_YA_DECIDIDA'; end if;
    if v_type.requires_lawyer then
      v_to := 'revision_juridica';
      perform private.notify(private.staff_users(array['lawyer_pro', 'enqora_admin']), v.company_id, v.case_id, 'equipo',
        'Encargo en terreno por revisar · ' || v.folio, v_type.name, '/mando/terreno/' || v.id, 'terreno-rev-' || v.id || '-' || now()::date);
    else
      v_gate := private.field_habilitado(v);
      if v_gate is not null then raise exception '%', v_gate; end if;
      v_to := 'listo';
    end if;
  elsif p_action in ('aprobar', 'observar') then
    if v.status <> 'revision_juridica' then raise exception 'ENQ_YA_DECIDIDA'; end if;
    if not private.is_staff(array['lawyer_pro', 'enqora_admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
    if v.created_by = v_uid then raise exception 'ENQ_CUATRO_OJOS'; end if;
    if p_action = 'observar' and char_length(trim(coalesce(p_note, ''))) < 10 then raise exception 'ENQ_FALTA_OBSERVACION'; end if;
    if p_action = 'aprobar' then
      v_gate := private.field_habilitado(v);
      if v_gate is not null then raise exception '%', v_gate; end if;
    end if;
    v_to := case p_action when 'aprobar' then 'listo' else 'observado' end;
    update public.field_tasks set lawyer_id = v_uid, lawyer_note = left(nullif(trim(coalesce(p_note, '')), ''), 1000), lawyer_at = now() where id = p_task;
  elsif p_action = 'cancelar' then
    if not private.is_supervisor() then raise exception 'ENQ_SIN_PERMISO'; end if;
    if v.status in ('verificado', 'cancelado') then raise exception 'ENQ_YA_DECIDIDA'; end if;
    if char_length(trim(coalesce(p_note, ''))) < 10 then raise exception 'ENQ_FALTA_OBSERVACION'; end if;
    v_to := 'cancelado';
  else
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;

  update public.field_tasks set status = v_to, updated_at = now() where id = p_task returning * into v;
  perform private.field_log(p_task, case when p_action in ('aprobar', 'observar') then 'revision_juridica' else null end, v_to, p_note);
  if v_to = 'listo' then
    perform private.notify(private.staff_users(array['ops_director', 'enqora_admin']), v.company_id, v.case_id, 'equipo',
      'Encargo listo para despachar · ' || v.folio, v_type.name, '/mando/terreno/' || v.id, 'terreno-listo-' || v.id || '-' || now()::date);
  end if;
end
$$;

-- Despacho: asignar a un gestor con acceso vigente. La tarifa se fija en ese momento y el gestor la ve antes de aceptar.
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
  if not exists (select 1 from public.staff_members s where s.user_id = p_gestor and s.role = 'field_agent' and s.active)
     or not private.staff_con_acceso(p_gestor) then raise exception 'ENQ_GESTOR_SIN_ACCESO'; end if;
  select * into v_type from public.field_task_types where code = v.type_code;
  if v_type.gestor_fee is null then raise exception 'ENQ_TARIFA_GESTOR_SIN_DEFINIR'; end if;
  v_gate := private.field_habilitado(v);
  if v_gate is not null then raise exception '%', v_gate; end if;

  update public.field_tasks set status = 'asignado', gestor_id = p_gestor, gestor_fee = v_type.gestor_fee,
    assigned_by = v_uid, assigned_at = now(), eta = null, updated_at = now() where id = p_task;
  perform private.field_log(p_task, 'listo', 'asignado', 'Tarifa del encargo: ' || private.money_cl(v_type.gestor_fee));
  perform private.notify(array[p_gestor], null, v.case_id, 'equipo', 'Nuevo encargo en terreno · ' || v.folio,
    v_type.name || ' · ' || v.office_name || ' · pago ' || private.money_cl(v_type.gestor_fee) || '. Acéptalo o recházalo.',
    '/mando/terreno/' || v.id, 'terreno-asig-' || v.id || '-' || extract(epoch from now())::bigint);
end
$$;

-- Acciones del gestor sobre SU encargo.
create or replace function public.field_task_gestor(p_task uuid, p_action text, p_eta timestamptz default null,
  p_receipt text default null, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v public.field_tasks;
  v_to text;
begin
  select * into v from public.field_tasks where id = p_task for update;
  if not found or v.gestor_id is distinct from v_uid or not private.is_staff(array['field_agent']) then raise exception 'ENQ_SIN_PERMISO'; end if;

  if p_action = 'aceptar' then
    if v.status <> 'asignado' then raise exception 'ENQ_YA_DECIDIDA'; end if;
    if p_eta is null or p_eta < now() - interval '5 minutes' or p_eta > now() + interval '12 hours' then raise exception 'ENQ_ETA_INVALIDA'; end if;
    v_to := 'en_camino';
    update public.field_tasks set status = v_to, eta = p_eta, updated_at = now() where id = p_task returning * into v;
    perform private.field_client_event(v, 'un gestor ENQORA va en camino a ' || v.office_name || '. Llegada estimada: '
      || to_char(p_eta at time zone 'America/Santiago', 'HH24:MI') || '.');
  elsif p_action = 'rechazar' then
    -- Rechazar no tiene castigo: vuelve a la bandeja de despacho.
    if v.status <> 'asignado' then raise exception 'ENQ_YA_DECIDIDA'; end if;
    v_to := 'listo';
    update public.field_tasks set status = v_to, gestor_id = null, gestor_fee = null, assigned_at = null, eta = null, updated_at = now() where id = p_task;
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

-- Cadena de custodia de un documento físico (gestor asignado o equipo).
create or replace function public.field_task_doc(p_doc uuid, p_custody text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_task uuid;
begin
  if p_custody not in ('por_recibir', 'con_gestor', 'entregado_oficina', 'devuelto_cliente', 'no_aplica') then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  select task_id into v_task from public.field_task_docs where id = p_doc;
  if v_task is null or not private.field_can_see(v_task) then raise exception 'ENQ_SIN_PERMISO'; end if;
  update public.field_task_docs set custody = p_custody, note = left(nullif(trim(coalesce(p_note, '')), ''), 300),
    updated_by = v_uid, updated_at = now() where id = p_doc;
  perform private.field_log(v_task, null, null, 'Custodia: ' || (select name from public.field_task_docs where id = p_doc) || ' → ' || p_custody);
end
$$;

-- Verificación (cuatro ojos): solo lo verificado cuenta para la liquidación y se informa al cliente como hecho.
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
      arrived_at = null, done_at = null, receipt = null, updated_at = now() where id = p_task returning * into v;
    perform private.field_log(p_task, null, 'listo', 'Vuelve a despacho: ' || p_note);
    perform private.field_client_event(v, 'el trámite en ' || v.office_name || ' no se completó y se reprogramará.');
  end if;
end
$$;

-- Bandeja del gestor: solo sus encargos activos y lo mínimo para hacerlos.
create or replace function public.mis_encargos_terreno() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
begin
  if not private.is_staff(array['field_agent']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  return coalesce((select jsonb_agg(x order by x ->> 'estado', x ->> 'asignado') from (
    select jsonb_build_object('id', t.id, 'folio', t.folio, 'estado', t.status, 'tipo', ty.name, 'oficina', t.office_name,
      'direccion', t.office_address, 'comuna', t.comuna, 'instrucciones', t.instructions, 'vence', t.due_date,
      'pago', t.gestor_fee, 'eta', t.eta, 'asignado', t.assigned_at, 'guia', ty.guidance,
      'empresa', co.legal_name,
      'documentos', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'nombre', d.name, 'custodia', d.custody) order by d.name)
                              from public.field_task_docs d where d.task_id = t.id), '[]'::jsonb)) as x
    from public.field_tasks t join public.field_task_types ty on ty.code = t.type_code
    join public.companies co on co.id = t.company_id
    where t.gestor_id = v_uid and t.status in ('asignado', 'en_camino', 'en_oficina')) s), '[]'::jsonb);
end
$$;

-- 7. Liquidaciones (el Administrador las genera y aprueba; el pago se registra a mano)
create or replace function public.create_field_payout(p_gestor uuid, p_period date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_id uuid;
  v_start date := date_trunc('month', p_period)::date;
  v_n integer;
  v_total integer;
begin
  if not private.is_staff(array['enqora_admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  select count(*), coalesce(sum(gestor_fee), 0) into v_n, v_total from public.field_tasks
  where gestor_id = p_gestor and status = 'verificado' and payout_id is null
    and verified_at >= v_start and verified_at < v_start + interval '1 month';
  if v_n = 0 then raise exception 'ENQ_SIN_ENCARGOS_POR_LIQUIDAR'; end if;
  insert into public.field_payouts (gestor_id, period, tasks, total, created_by) values (p_gestor, v_start, v_n, v_total, v_uid)
  returning id into v_id;
  update public.field_tasks set payout_id = v_id
  where gestor_id = p_gestor and status = 'verificado' and payout_id is null
    and verified_at >= v_start and verified_at < v_start + interval '1 month';
  return v_id;
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
      v.tasks || ' encargo(s) verificados por ' || private.money_cl(v.total) || '.', '/mando/terreno', 'liq-' || v.id || '-aprobada');
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

-- 8. Permisos de ejecución
revoke execute on function private.field_can_see(uuid), private.field_log(uuid, text, text, text),
  private.field_client_event(public.field_tasks, text), private.field_habilitado(public.field_tasks) from public, anon;
grant execute on function private.field_can_see(uuid) to authenticated;
revoke execute on function public.save_field_task_type(text, integer, boolean), public.create_field_task(text, text, jsonb),
  public.field_task_review(uuid, text, text), public.assign_field_task(uuid, uuid),
  public.field_task_gestor(uuid, text, timestamptz, text, text), public.field_task_doc(uuid, text, text),
  public.verify_field_task(uuid, boolean, text), public.mis_encargos_terreno(),
  public.create_field_payout(uuid, date), public.decide_field_payout(uuid, text, text) from public, anon;
grant execute on function public.save_field_task_type(text, integer, boolean), public.create_field_task(text, text, jsonb),
  public.field_task_review(uuid, text, text), public.assign_field_task(uuid, uuid),
  public.field_task_gestor(uuid, text, timestamptz, text, text), public.field_task_doc(uuid, text, text),
  public.verify_field_task(uuid, boolean, text), public.mis_encargos_terreno(),
  public.create_field_payout(uuid, date), public.decide_field_payout(uuid, text, text) to authenticated;

-- 9. Gestores disponibles hoy (supervisión): con acceso vigente y su carga actual.
create or replace function public.gestores_disponibles() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_session();
  if not private.is_supervisor() then raise exception 'ENQ_SIN_PERMISO'; end if;
  return coalesce((select jsonb_agg(x order by x ->> 'nombre') from (
    select jsonb_build_object('id', s.user_id, 'nombre', coalesce(p.full_name, p.email), 'hasta', s.access_until,
      'activos', (select count(*) from public.field_tasks t where t.gestor_id = s.user_id and t.status in ('asignado', 'en_camino', 'en_oficina'))) as x
    from public.staff_members s left join public.profiles p on p.id = s.user_id
    where s.role = 'field_agent' and private.staff_con_acceso(s.user_id)) g), '[]'::jsonb);
end
$$;
revoke execute on function public.gestores_disponibles() from public, anon;
grant execute on function public.gestores_disponibles() to authenticated;
