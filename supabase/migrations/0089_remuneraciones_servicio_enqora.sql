-- =====================================================================
-- ENQORA · 0089 · Remuneraciones y Laboral como servicio que presta ENQORA
-- El equipo opera las herramientas por cada empresa desde el Centro de Mando; el cliente informa las novedades del
-- mes, pide trámites, aprueba y firma.
-- 1. log_operacion_empresa: deja en la bitácora cuándo una persona del equipo empieza a operar una empresa.
-- 2. rem_novedades_cliente: novedades del mes que informa la empresa (días, horas extra, bonos, licencias, etc.).
--    El equipo las usa para calcular las liquidaciones.
-- Requiere la 0088. Se puede ejecutar más de una vez.
-- =====================================================================

create or replace function public.log_operacion_empresa(p_company uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_session();
  if not private.is_staff() or private.is_staff(array['ai_agent']) or not private.works_company(p_company) then raise exception 'ENQ_SIN_PERMISO'; end if;
  perform private.log_event(p_company, 'equipo.operar_empresa', 'remuneraciones y laboral', '{}'::jsonb);
end
$$;

create table if not exists public.rem_novedades_cliente (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  trabajador_id uuid not null references public.rem_trabajadores (id) on delete cascade,
  periodo text not null check (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  datos jsonb not null check (jsonb_typeof(datos) = 'object' and octet_length(datos::text) <= 3000),
  enviado_por uuid references auth.users (id) on delete set null,
  enviado timestamptz not null default now(),
  unique (trabajador_id, periodo)
);
create index if not exists rem_novedades_cliente_periodo on public.rem_novedades_cliente (periodo, enviado);
alter table public.rem_novedades_cliente enable row level security;
revoke all on public.rem_novedades_cliente from anon, authenticated;
grant select on public.rem_novedades_cliente to authenticated;
drop policy if exists rem_novedades_cliente_ver on public.rem_novedades_cliente;
create policy rem_novedades_cliente_ver on public.rem_novedades_cliente for select to authenticated
  using (private.has_role(company_id, array['owner', 'admin', 'accountant']) or private.works_company(company_id)
         or private.is_staff(array['enqora_admin', 'ops_director', 'accountant_pro']));
drop trigger if exists rem_novedades_cliente_no_borrar on public.rem_novedades_cliente;
create trigger rem_novedades_cliente_no_borrar before delete on public.rem_novedades_cliente
  for each row execute function private.rem_no_borrar();

-- La empresa informa (o corrige) las novedades de un mes mientras la liquidación de ese mes no esté aprobada.
create or replace function public.rem_novedad_enviar(p_trabajador uuid, p_periodo text, p_datos jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_trab public.rem_trabajadores;
  v_antes jsonb;
  v_id uuid;
begin
  select * into v_trab from public.rem_trabajadores where id = p_trabajador;
  if not found then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if not private.rem_puede(v_trab.company_id) or private.is_staff(array['ai_agent']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if coalesce(p_periodo, '') !~ '^\d{4}-(0[1-9]|1[0-2])$' or coalesce(jsonb_typeof(p_datos), '') <> 'object' or octet_length(p_datos::text) > 3000 then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  if exists (select 1 from public.rem_liquidaciones where trabajador_id = p_trabajador and periodo = p_periodo and estado = 'aprobada') then
    raise exception 'ENQ_NOVEDAD_CERRADA';
  end if;
  select datos into v_antes from public.rem_novedades_cliente where trabajador_id = p_trabajador and periodo = p_periodo;
  insert into public.rem_novedades_cliente (company_id, trabajador_id, periodo, datos, enviado_por)
  values (v_trab.company_id, p_trabajador, p_periodo, p_datos, v_uid)
  on conflict (trabajador_id, periodo) do update set datos = excluded.datos, enviado_por = v_uid, enviado = now()
  returning id into v_id;
  perform private.log_event(v_trab.company_id, 'remuneraciones.novedades_informadas', v_trab.rut || ' ' || p_periodo,
    jsonb_build_object('antes', v_antes, 'nuevas', p_datos));
  return v_id;
end
$$;

do $$
declare f text;
begin
  foreach f in array array['public.log_operacion_empresa(uuid)', 'public.rem_novedad_enviar(uuid, text, jsonb)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$$;
