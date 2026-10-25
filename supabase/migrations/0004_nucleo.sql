-- =====================================================================
-- ENQORA · Etapa 4 · Núcleo operativo
-- Equipo ENQORA, casos (folio ENQ-AAAA-NNNNN), asignaciones, historial,
-- tareas y expedientes con documentos en almacenamiento privado.
-- Requiere 0002 y 0003. Ejecutar UNA vez en Supabase → SQL Editor.
--
-- Reglas:
--   · Los miembros de una empresa ven los casos de su empresa.
--   · El equipo ENQORA solo ve un caso si está asignado a él.
--     Administrador ENQORA y Director de operaciones ven todos (triage).
--   · Las notas internas y documentos internos nunca los ve el cliente.
--   · Asignar profesionales o cambiar el equipo exige reautenticación.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Equipo ENQORA
-- ---------------------------------------------------------------------

create table public.staff_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in (
    'enqora_admin', 'ops_director', 'accountant_pro', 'lawyer_pro', 'field_agent', 'ai_agent'
  )),
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. Casos
-- ---------------------------------------------------------------------

create sequence public.case_folio_seq;

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique,
  company_id uuid not null references public.companies (id) on delete cascade,
  module text not null check (module in (
    'idea', 'create', 'brand', 'formaliza', 'contabilidad', 'gestion', 'crece', 'legal', 'general'
  )),
  title text not null check (char_length(title) between 3 and 160),
  description text check (char_length(description) <= 4000),
  status text not null default 'recibido' check (status in (
    'recibido', 'en_investigacion', 'diagnostico', 'revision_profesional', 'devuelto',
    'esperando_cliente', 'autorizacion_cliente', 'en_ejecucion', 'verificacion', 'cerrado', 'cancelado'
  )),
  priority text not null default 'normal' check (priority in ('baja', 'normal', 'alta', 'urgente')),
  due_date date,
  responsible_id uuid references auth.users (id) on delete set null,
  result_summary text check (char_length(result_summary) <= 4000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);
create index cases_company_idx on public.cases (company_id, created_at desc);
create index cases_status_idx on public.cases (status);

create table public.case_assignments (
  case_id uuid not null references public.cases (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role_in_case text not null check (role_in_case in ('responsable', 'apoyo', 'gestor', 'agente_ia')),
  assigned_by uuid references auth.users (id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (case_id, user_id)
);
create index case_assignments_user_idx on public.case_assignments (user_id);

-- Historial y comentarios. visibility = 'cliente' (lo ven todos) | 'interno' (solo equipo).
create table public.case_events (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.cases (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in (
    'creado', 'estado', 'comentario', 'nota_interna', 'documento', 'asignacion', 'tarea', 'prioridad'
  )),
  body text check (char_length(body) <= 4000),
  visibility text not null default 'cliente' check (visibility in ('cliente', 'interno')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index case_events_case_idx on public.case_events (case_id, created_at);

create table public.case_tasks (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 200),
  assignee_id uuid references auth.users (id) on delete set null,
  status text not null default 'pendiente' check (status in ('pendiente', 'en_curso', 'hecha', 'bloqueada')),
  visibility text not null default 'cliente' check (visibility in ('cliente', 'interno')),
  due_date date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index case_tasks_case_idx on public.case_tasks (case_id);

create table public.case_documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime_type text,
  size_bytes bigint check (size_bytes >= 0),
  visibility text not null default 'cliente' check (visibility in ('cliente', 'interno')),
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index case_documents_case_idx on public.case_documents (case_id);

-- ---------------------------------------------------------------------
-- 3. Funciones de acceso
-- ---------------------------------------------------------------------

create or replace function private.staff_role() returns text
language sql stable security definer set search_path = '' as $$
  select s.role from public.staff_members s where s.user_id = (select auth.uid()) and s.active
$$;

create or replace function private.is_staff(p_roles text[] default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    case when p_roles is null then private.staff_role() is not null
         else private.staff_role() = any (p_roles) end, false)
$$;

-- Supervisión: Administrador ENQORA y Director de operaciones.
create or replace function private.is_supervisor() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_staff(array['enqora_admin', 'ops_director'])
$$;

create or replace function private.case_company(p_case uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select company_id from public.cases where id = p_case
$$;

create or replace function private.is_assigned(p_case uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_staff() and exists (
    select 1 from public.case_assignments a where a.case_id = p_case and a.user_id = (select auth.uid())
  )
$$;

-- Puede trabajar el caso como equipo ENQORA (ve lo interno).
create or replace function private.can_work_case(p_case uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_supervisor() or private.is_assigned(p_case)
$$;

-- Puede ver el caso (cliente miembro de la empresa o equipo con acceso).
create or replace function private.can_see_case(p_case uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_member(private.case_company(p_case)) or private.can_work_case(p_case)
$$;

-- Puede aportar (comentar, subir documentos): equipo con acceso o miembro que no sea solo lectura.
create or replace function private.can_post_case(p_case uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.cases c where c.id = p_case and c.status not in ('cerrado', 'cancelado'))
     and (private.can_work_case(p_case)
          or private.has_role(private.case_company(p_case), array['owner', 'admin', 'accountant']))
$$;

create or replace function private.can_see_item(p_case uuid, p_visibility text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_see_case(p_case) and (p_visibility = 'cliente' or private.can_work_case(p_case))
$$;

-- ¿El usuario actual comparte un caso con p_user? (para ver nombres en la ficha)
create or replace function private.shares_case(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.case_assignments a
    where a.user_id = p_user and private.can_see_case(a.case_id)
  ) or exists (
    select 1 from public.case_assignments a
    join public.cases c on c.id = a.case_id
    join public.company_members m on m.company_id = c.company_id
    where a.user_id = (select auth.uid()) and m.user_id = p_user
  ) or (private.is_supervisor() and exists (select 1 from public.staff_members s where s.user_id = p_user))
$$;

-- Ruta de un documento: "<empresa>/<caso>/<archivo>". Devuelve el caso si la ruta es coherente.
create or replace function private.path_case(p_name text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  parts text[] := string_to_array(coalesce(p_name, ''), '/');
  v_case uuid;
begin
  if array_length(parts, 1) <> 3
     or parts[1] !~ '^[0-9a-f-]{36}$' or parts[2] !~ '^[0-9a-f-]{36}$'
     or parts[3] = '' then
    return null;
  end if;
  select c.id into v_case from public.cases c where c.id = parts[2]::uuid and c.company_id = parts[1]::uuid;
  return v_case;
end
$$;

create or replace function private.log_case(
  p_case uuid, p_kind text, p_body text default null, p_visibility text default 'cliente', p_metadata jsonb default '{}'::jsonb
) returns void
language sql security definer set search_path = '' as $$
  insert into public.case_events (case_id, actor_id, kind, body, visibility, metadata)
  values (p_case, (select auth.uid()), p_kind, p_body, p_visibility, coalesce(p_metadata, '{}'::jsonb));
  update public.cases set updated_at = now() where id = p_case;
$$;

-- ---------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------

alter table public.staff_members enable row level security;
alter table public.cases enable row level security;
alter table public.case_assignments enable row level security;
alter table public.case_events enable row level security;
alter table public.case_tasks enable row level security;
alter table public.case_documents enable row level security;

revoke all on public.staff_members, public.cases, public.case_assignments, public.case_events,
              public.case_tasks, public.case_documents from anon, authenticated;
grant select on public.staff_members, public.cases, public.case_assignments, public.case_events,
               public.case_tasks, public.case_documents to authenticated;
revoke all on sequence public.case_folio_seq from anon, authenticated;

create policy mfa_requerido on public.staff_members as restrictive for all to authenticated
  using (private.is_mfa()) with check (private.is_mfa());
create policy mfa_requerido on public.cases as restrictive for all to authenticated
  using (private.is_mfa()) with check (private.is_mfa());
create policy mfa_requerido on public.case_assignments as restrictive for all to authenticated
  using (private.is_mfa()) with check (private.is_mfa());
create policy mfa_requerido on public.case_events as restrictive for all to authenticated
  using (private.is_mfa()) with check (private.is_mfa());
create policy mfa_requerido on public.case_tasks as restrictive for all to authenticated
  using (private.is_mfa()) with check (private.is_mfa());
create policy mfa_requerido on public.case_documents as restrictive for all to authenticated
  using (private.is_mfa()) with check (private.is_mfa());

create policy equipo_propio_o_supervision on public.staff_members for select to authenticated
  using (user_id = (select auth.uid()) or private.is_supervisor() or private.shares_case(user_id));

create policy casos_visibles on public.cases for select to authenticated
  using (private.can_see_case(id));

create policy asignaciones_visibles on public.case_assignments for select to authenticated
  using (private.can_see_case(case_id));

create policy eventos_visibles on public.case_events for select to authenticated
  using (private.can_see_item(case_id, visibility));

create policy tareas_visibles on public.case_tasks for select to authenticated
  using (private.can_see_item(case_id, visibility));

create policy documentos_visibles on public.case_documents for select to authenticated
  using (private.can_see_item(case_id, visibility));

-- El equipo ve los datos básicos (RUT, razón social, régimen) de las empresas de sus casos.
create or replace function private.staff_sees_company(p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_supervisor() or exists (
    select 1 from public.cases c join public.case_assignments a on a.case_id = c.id
    where c.company_id = p_company and a.user_id = (select auth.uid()) and private.is_staff()
  )
$$;

create policy equipo_lee_empresas_de_sus_casos on public.companies for select to authenticated
  using (private.staff_sees_company(id));

-- Perfiles: además de colegas de empresa, quienes comparten un caso.
drop policy if exists perfil_propio_o_colegas on public.profiles;
create policy perfil_propio_o_colegas on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_company(id) or private.shares_case(id));

-- ---------------------------------------------------------------------
-- 5. Almacenamiento privado de expedientes
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expedientes', 'expedientes', false, 20971520, array[
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/xml', 'application/xml',
  'text/csv', 'text/plain',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy enqora_expedientes_subir on storage.objects for insert to authenticated
  with check (
    bucket_id = 'expedientes' and private.is_mfa()
    and private.path_case(name) is not null
    and private.can_post_case(private.path_case(name))
  );

create policy enqora_expedientes_leer on storage.objects for select to authenticated
  using (
    bucket_id = 'expedientes' and private.is_mfa()
    and exists (
      select 1 from public.case_documents d
      where d.storage_path = storage.objects.name and private.can_see_item(d.case_id, d.visibility)
    )
  );

-- ---------------------------------------------------------------------
-- 6. Operaciones (RPC)
-- ---------------------------------------------------------------------

-- Equipo: alta, cambio de rol o desactivación (rol null). Solo Administrador ENQORA.
create or replace function public.set_staff_role(p_email text, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
  v_target uuid;
begin
  if not private.is_staff(array['enqora_admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  select id into v_target from public.profiles where email = lower(trim(coalesce(p_email, '')));
  if v_target is null then raise exception 'ENQ_USUARIO_NO_EXISTE'; end if;

  if p_role is null then
    if v_target = v_uid then raise exception 'ENQ_ULTIMO_ADMIN'; end if;
    update public.staff_members set active = false, updated_at = now() where user_id = v_target;
  else
    if p_role not in ('enqora_admin', 'ops_director', 'accountant_pro', 'lawyer_pro', 'field_agent', 'ai_agent') then
      raise exception 'ENQ_DATOS_INVALIDOS';
    end if;
    if v_target = v_uid and p_role <> 'enqora_admin'
       and (select count(*) from public.staff_members where role = 'enqora_admin' and active) <= 1 then
      raise exception 'ENQ_ULTIMO_ADMIN';
    end if;
    insert into public.staff_members (user_id, role, created_by) values (v_target, p_role, v_uid)
    on conflict (user_id) do update set role = excluded.role, active = true, updated_at = now();
  end if;
end
$$;

create or replace function public.create_case(
  p_company uuid, p_module text, p_title text, p_description text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_id uuid;
  v_folio text;
begin
  if not private.has_role(p_company, array['owner', 'admin', 'accountant']) and not private.is_supervisor() then
    raise exception 'ENQ_SIN_PERMISO';
  end if;
  if char_length(trim(coalesce(p_title, ''))) < 3 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;

  v_folio := 'ENQ-' || to_char(now() at time zone 'America/Santiago', 'YYYY') || '-'
             || lpad(nextval('public.case_folio_seq')::text, 5, '0');

  insert into public.cases (folio, company_id, module, title, description, created_by)
  values (v_folio, p_company, coalesce(nullif(p_module, ''), 'general'), trim(p_title),
          nullif(trim(coalesce(p_description, '')), ''), v_uid)
  returning id into v_id;

  perform private.log_case(v_id, 'creado', null, 'cliente');
  perform private.log_event(p_company, 'caso.creado', v_folio);
  return v_id;
end
$$;

create or replace function public.add_case_comment(p_case uuid, p_body text, p_internal boolean default false)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_session();
  if char_length(trim(coalesce(p_body, ''))) = 0 or char_length(p_body) > 4000 then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  if p_internal then
    if not private.can_work_case(p_case) then raise exception 'ENQ_SIN_PERMISO'; end if;
    perform private.log_case(p_case, 'nota_interna', trim(p_body), 'interno');
  else
    if not private.can_post_case(p_case) then raise exception 'ENQ_SIN_PERMISO'; end if;
    perform private.log_case(p_case, 'comentario', trim(p_body), 'cliente');
  end if;
end
$$;

create or replace function public.change_case_status(p_case uuid, p_status text, p_note text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_case public.cases;
  v_client boolean;
begin
  select * into v_case from public.cases where id = p_case for update;
  if not found or not private.can_see_case(p_case) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_status not in ('recibido', 'en_investigacion', 'diagnostico', 'revision_profesional', 'devuelto',
                      'esperando_cliente', 'autorizacion_cliente', 'en_ejecucion', 'verificacion',
                      'cerrado', 'cancelado') or p_status = v_case.status then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;

  v_client := not private.can_work_case(p_case);

  if v_client then
    -- El cliente solo puede cancelar una solicitud que aún no se trabaja.
    if p_status <> 'cancelado' or v_case.status not in ('recibido', 'esperando_cliente')
       or not private.has_role(v_case.company_id, array['owner', 'admin']) then
      raise exception 'ENQ_SIN_PERMISO';
    end if;
  else
    if v_case.status in ('cerrado', 'cancelado') and not private.is_supervisor() then
      raise exception 'ENQ_CASO_CERRADO';
    end if;
    if p_status = 'cerrado' then
      if not (private.is_supervisor() or v_case.responsible_id = v_uid) then raise exception 'ENQ_SIN_PERMISO'; end if;
      if char_length(trim(coalesce(p_note, ''))) < 10 then raise exception 'ENQ_CIERRE_SIN_RESULTADO'; end if;
    end if;
  end if;

  update public.cases set
    status = p_status,
    updated_at = now(),
    closed_at = case when p_status in ('cerrado', 'cancelado') then now() else null end,
    result_summary = case when p_status = 'cerrado' then trim(p_note) else result_summary end
  where id = p_case;

  perform private.log_case(p_case, 'estado', nullif(trim(coalesce(p_note, '')), ''), 'cliente',
    jsonb_build_object('de', v_case.status, 'a', p_status));
end
$$;

create or replace function public.set_case_priority(p_case uuid, p_priority text, p_due date default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_session();
  if not private.can_work_case(p_case) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_priority not in ('baja', 'normal', 'alta', 'urgente') then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  update public.cases set priority = p_priority, due_date = p_due, updated_at = now() where id = p_case;
  perform private.log_case(p_case, 'prioridad', null, 'interno',
    jsonb_build_object('prioridad', p_priority, 'vence', p_due));
end
$$;

-- Asignar equipo: da acceso a la información de la empresa → reautenticación.
create or replace function public.assign_case(p_case uuid, p_user uuid, p_role_in_case text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
begin
  if not private.is_supervisor() then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_role_in_case not in ('responsable', 'apoyo', 'gestor', 'agente_ia') then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if not exists (select 1 from public.staff_members where user_id = p_user and active) then
    raise exception 'ENQ_NO_ES_EQUIPO';
  end if;
  if not exists (select 1 from public.cases where id = p_case) then raise exception 'ENQ_DATOS_INVALIDOS'; end if;

  insert into public.case_assignments (case_id, user_id, role_in_case, assigned_by)
  values (p_case, p_user, p_role_in_case, v_uid)
  on conflict (case_id, user_id) do update set role_in_case = excluded.role_in_case,
    assigned_by = excluded.assigned_by, assigned_at = now();

  if p_role_in_case = 'responsable' then
    update public.case_assignments set role_in_case = 'apoyo'
    where case_id = p_case and role_in_case = 'responsable' and user_id <> p_user;
    update public.cases set responsible_id = p_user, updated_at = now() where id = p_case;
  elsif (select responsible_id from public.cases where id = p_case) = p_user then
    update public.cases set responsible_id = null where id = p_case;
  end if;

  perform private.log_case(p_case, 'asignacion', null, 'cliente',
    jsonb_build_object('usuario', p_user, 'rol', p_role_in_case));
end
$$;

create or replace function public.unassign_case(p_case uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_session(true);
  if not private.is_supervisor() then raise exception 'ENQ_SIN_PERMISO'; end if;
  delete from public.case_assignments where case_id = p_case and user_id = p_user;
  update public.cases set responsible_id = null where id = p_case and responsible_id = p_user;
  perform private.log_case(p_case, 'asignacion', null, 'interno', jsonb_build_object('usuario', p_user, 'rol', 'retirado'));
end
$$;

create or replace function public.create_task(
  p_case uuid, p_title text, p_assignee uuid default null, p_due date default null, p_visibility text default 'cliente'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_id uuid;
begin
  if not private.can_work_case(p_case) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if char_length(trim(coalesce(p_title, ''))) < 3 or p_visibility not in ('cliente', 'interno') then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  -- La persona asignada debe tener acceso al caso.
  if p_assignee is not null and not (
       exists (select 1 from public.case_assignments where case_id = p_case and user_id = p_assignee)
       or exists (select 1 from public.company_members m where m.user_id = p_assignee
                  and m.company_id = private.case_company(p_case))
     ) then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;

  insert into public.case_tasks (case_id, title, assignee_id, due_date, visibility, created_by)
  values (p_case, trim(p_title), p_assignee, p_due, p_visibility, v_uid)
  returning id into v_id;
  perform private.log_case(p_case, 'tarea', trim(p_title), p_visibility, jsonb_build_object('accion', 'creada'));
  return v_id;
end
$$;

create or replace function public.update_task_status(p_task uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_task public.case_tasks;
begin
  select * into v_task from public.case_tasks where id = p_task;
  if not found or not private.can_see_item(v_task.case_id, v_task.visibility) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if not (private.can_work_case(v_task.case_id) or v_task.assignee_id = v_uid) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_status not in ('pendiente', 'en_curso', 'hecha', 'bloqueada') then raise exception 'ENQ_DATOS_INVALIDOS'; end if;

  update public.case_tasks set status = p_status, done_at = case when p_status = 'hecha' then now() else null end
  where id = p_task;
  perform private.log_case(v_task.case_id, 'tarea', v_task.title, v_task.visibility,
    jsonb_build_object('accion', p_status));
end
$$;

-- Registrar un documento ya subido al almacenamiento privado.
create or replace function public.register_document(
  p_case uuid, p_path text, p_name text, p_mime text default null, p_size bigint default null,
  p_visibility text default 'cliente'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_company uuid := private.case_company(p_case);
  v_visibility text := coalesce(p_visibility, 'cliente');
  v_id uuid;
begin
  if not private.can_post_case(p_case) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if private.path_case(p_path) is distinct from p_case then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if v_visibility not in ('cliente', 'interno') then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if not private.can_work_case(p_case) then v_visibility := 'cliente'; end if; -- el cliente no sube "internos"
  if not exists (select 1 from storage.objects o where o.bucket_id = 'expedientes' and o.name = p_path) then
    raise exception 'ENQ_ARCHIVO_NO_SUBIDO';
  end if;

  insert into public.case_documents (case_id, company_id, storage_path, file_name, mime_type, size_bytes, visibility, uploaded_by)
  values (p_case, v_company, p_path, left(coalesce(nullif(trim(p_name), ''), 'documento'), 200), left(p_mime, 120),
          p_size, v_visibility, v_uid)
  returning id into v_id;

  perform private.log_case(p_case, 'documento', left(p_name, 200), v_visibility, jsonb_build_object('documento', v_id));
  return v_id;
end
$$;

-- ---------------------------------------------------------------------
-- 7. Primer Administrador ENQORA (se ejecuta a mano UNA vez, ver docs)
-- ---------------------------------------------------------------------

create or replace function private.bootstrap_enqora_admin(p_email text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_target uuid;
begin
  if exists (select 1 from public.staff_members where role = 'enqora_admin' and active) then
    raise exception 'Ya existe un Administrador ENQORA. Usa la pantalla Equipo.';
  end if;
  select id into v_target from public.profiles where email = lower(trim(p_email));
  if v_target is null then raise exception 'No existe una cuenta con ese correo.'; end if;
  insert into public.staff_members (user_id, role) values (v_target, 'enqora_admin')
  on conflict (user_id) do update set role = 'enqora_admin', active = true, updated_at = now();
  return 'Administrador ENQORA creado';
end
$$;

-- ---------------------------------------------------------------------
-- 8. Permisos de ejecución
-- ---------------------------------------------------------------------

revoke execute on all functions in schema private from public, anon;
grant execute on function
  private.is_mfa(), private.recent_mfa(int), private.is_member(uuid), private.member_role(uuid),
  private.has_role(uuid, text[]), private.shares_company(uuid), private.rut_is_valid(text),
  private.current_session_id(),
  private.staff_role(), private.is_staff(text[]), private.is_supervisor(), private.case_company(uuid),
  private.is_assigned(uuid), private.can_work_case(uuid), private.can_see_case(uuid),
  private.can_post_case(uuid), private.can_see_item(uuid, text), private.shares_case(uuid),
  private.path_case(text), private.staff_sees_company(uuid)
to authenticated;
revoke execute on function private.bootstrap_enqora_admin(text) from authenticated;

revoke execute on function
  public.set_staff_role(text, text),
  public.create_case(uuid, text, text, text),
  public.add_case_comment(uuid, text, boolean),
  public.change_case_status(uuid, text, text),
  public.set_case_priority(uuid, text, date),
  public.assign_case(uuid, uuid, text),
  public.unassign_case(uuid, uuid),
  public.create_task(uuid, text, uuid, date, text),
  public.update_task_status(uuid, text),
  public.register_document(uuid, text, text, text, bigint, text)
from public, anon;

grant execute on function
  public.set_staff_role(text, text),
  public.create_case(uuid, text, text, text),
  public.add_case_comment(uuid, text, boolean),
  public.change_case_status(uuid, text, text),
  public.set_case_priority(uuid, text, date),
  public.assign_case(uuid, uuid, text),
  public.unassign_case(uuid, uuid),
  public.create_task(uuid, text, uuid, date, text),
  public.update_task_status(uuid, text),
  public.register_document(uuid, text, text, text, bigint, text)
to authenticated;
