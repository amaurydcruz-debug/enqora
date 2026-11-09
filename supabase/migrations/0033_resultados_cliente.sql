-- =====================================================================
-- ENQORA · 0033 · Resultados para el cliente: calificación del servicio y ahorro verificado
-- 1) Calificación: al cerrar un caso, la empresa responde si se resolvió (sí, en parte, no), su
--    satisfacción (1 a 5) y un comentario. Puede corregirla durante 30 días.
-- 2) Ahorro verificado: el equipo registra el ahorro económico que logró el caso, con concepto,
--    fundamento (norma o cálculo) y, cuando existe, un documento de evidencia del caso. Solo cuenta
--    —y solo lo ve el cliente— cuando la supervisión lo verifica. Quien lo registró solo puede
--    verificarlo si adjuntó un documento de evidencia.
-- Se puede ejecutar más de una vez.
-- =====================================================================

create table if not exists public.case_ratings (
  case_id uuid primary key references public.cases (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  resuelto text not null check (resuelto in ('si', 'parcial', 'no')),
  satisfaccion smallint not null check (satisfaccion between 1 and 5),
  comentario text check (char_length(comentario) <= 1000),
  rated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists case_ratings_company_idx on public.case_ratings (company_id);
alter table public.case_ratings enable row level security;
drop policy if exists case_ratings_select on public.case_ratings;
create policy case_ratings_select on public.case_ratings for select to authenticated
  using (private.is_member(company_id) or private.is_staff());

create table if not exists public.case_savings (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  monto bigint not null check (monto > 0 and monto < 1000000000000),
  concepto text not null check (char_length(concepto) between 10 and 300),
  fundamento text not null check (char_length(fundamento) between 30 and 1500),
  evidencia_document_id uuid references public.case_documents (id) on delete set null,
  estado text not null default 'propuesto' check (estado in ('propuesto', 'verificado', 'rechazado')),
  registrado_por uuid references auth.users (id) on delete set null,
  verificado_por uuid references auth.users (id) on delete set null,
  verificado_en timestamptz,
  nota text check (char_length(nota) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists case_savings_case_idx on public.case_savings (case_id);
create index if not exists case_savings_company_idx on public.case_savings (company_id) where estado = 'verificado';
alter table public.case_savings enable row level security;
drop policy if exists case_savings_select on public.case_savings;
-- El cliente solo ve el ahorro verificado; el equipo ve todo.
create policy case_savings_select on public.case_savings for select to authenticated
  using (private.is_staff() or (estado = 'verificado' and private.is_member(company_id)));

-- Calificación del cliente (miembro de la empresa con permiso de edición; caso cerrado).
create or replace function public.rate_case(p_case uuid, p_resuelto text, p_satisfaccion integer, p_comentario text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_case public.cases;
  v_prev public.case_ratings;
begin
  select * into v_case from public.cases where id = p_case;
  if not found then raise exception 'ENQ_SIN_PERMISO'; end if;
  if not exists (select 1 from public.company_members m where m.company_id = v_case.company_id and m.user_id = v_uid and m.role <> 'viewer') then
    raise exception 'ENQ_SIN_PERMISO';
  end if;
  if v_case.status <> 'cerrado' then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  select * into v_prev from public.case_ratings where case_id = p_case;
  if found and v_prev.created_at < now() - interval '30 days' then raise exception 'ENQ_YA_DECIDIDA'; end if;
  insert into public.case_ratings (case_id, company_id, resuelto, satisfaccion, comentario, rated_by)
  values (p_case, v_case.company_id, p_resuelto, p_satisfaccion, nullif(btrim(left(coalesce(p_comentario, ''), 1000)), ''), v_uid)
  on conflict (case_id) do update set resuelto = excluded.resuelto, satisfaccion = excluded.satisfaccion,
    comentario = excluded.comentario, rated_by = excluded.rated_by, updated_at = now();
exception
  when check_violation or not_null_violation then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

-- El equipo del caso registra un ahorro (queda «propuesto» hasta su verificación).
create or replace function public.record_case_saving(p_case uuid, p_monto bigint, p_concepto text, p_fundamento text, p_documento uuid default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_case public.cases;
  v_id uuid;
begin
  select * into v_case from public.cases where id = p_case;
  if not found or not private.can_work_case(p_case) or private.is_staff(array['ai_agent']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_case.status not in ('verificacion', 'cerrado') then raise exception 'ENQ_CASO_SIN_RESOLVER'; end if;
  if p_documento is not null and not exists (select 1 from public.case_documents d where d.id = p_documento and d.case_id = p_case) then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  insert into public.case_savings (case_id, company_id, monto, concepto, fundamento, evidencia_document_id, registrado_por)
  values (p_case, v_case.company_id, p_monto, btrim(p_concepto), btrim(p_fundamento), p_documento, v_uid)
  returning id into v_id;
  return v_id;
exception
  when check_violation or not_null_violation then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

-- La supervisión verifica o rechaza. Quien registró solo puede verificar si hay documento de evidencia.
create or replace function public.verify_case_saving(p_saving uuid, p_aprobar boolean, p_nota text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_s public.case_savings;
begin
  if not private.is_supervisor() then raise exception 'ENQ_SIN_PERMISO'; end if;
  select * into v_s from public.case_savings where id = p_saving for update;
  if not found then raise exception 'ENQ_NO_ENCONTRADO'; end if;
  if v_s.estado <> 'propuesto' then raise exception 'ENQ_YA_DECIDIDA'; end if;
  if p_aprobar and v_s.registrado_por = v_uid and v_s.evidencia_document_id is null then raise exception 'ENQ_CUATRO_OJOS'; end if;
  update public.case_savings
     set estado = case when p_aprobar then 'verificado' else 'rechazado' end, verificado_por = v_uid, verificado_en = now(),
         nota = nullif(btrim(left(coalesce(p_nota, ''), 500)), '')
   where id = p_saving;
end
$$;

revoke execute on function public.rate_case(uuid, text, integer, text) from public;
revoke execute on function public.record_case_saving(uuid, bigint, text, text, uuid) from public;
revoke execute on function public.verify_case_saving(uuid, boolean, text) from public;
grant execute on function public.rate_case(uuid, text, integer, text) to authenticated;
grant execute on function public.record_case_saving(uuid, bigint, text, text, uuid) to authenticated;
grant execute on function public.verify_case_saving(uuid, boolean, text) to authenticated;
grant select on public.case_ratings, public.case_savings to authenticated;
