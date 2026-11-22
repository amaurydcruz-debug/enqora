-- =====================================================================
-- ENQORA · 0084 · Remuneraciones: control de vacaciones (feriado anual)
-- Registro por trabajador de: días tomados (desde-hasta; los días hábiles los cuenta la base de datos: lunes a
-- viernes sin festivos, porque el sábado es siempre inhábil para el feriado, art. 69), saldo inicial al empezar a
-- usar ENQORA y días de feriado progresivo acreditados (art. 68). Cada registro es inmutable; se anula con motivo.
-- El saldo alimenta los días pendientes del finiquito.
-- Requiere la 0083. Se puede ejecutar más de una vez.
-- =====================================================================

create or replace function private.rem_dias_habiles(p_desde date, p_hasta date) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int
  from generate_series(p_desde, p_hasta, interval '1 day') as g(d)
  where extract(isodow from g.d) < 6
    and not exists (select 1 from public.rem_feriados f where f.fecha = g.d::date)
$$;

create table if not exists public.rem_vacaciones (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  trabajador_id uuid not null references public.rem_trabajadores (id) on delete cascade,
  tipo text not null check (tipo in ('tomado', 'saldo_inicial', 'progresivo')),
  desde date not null,
  hasta date,
  dias numeric(6, 2) not null check (dias > 0 and dias <= 120),
  nota text check (nota is null or char_length(nota) <= 300),
  estado text not null default 'vigente' check (estado in ('vigente', 'anulado')),
  creado_por uuid references auth.users (id) on delete set null,
  creado timestamptz not null default now(),
  anulado_por uuid references auth.users (id) on delete set null,
  anulado_at timestamptz,
  motivo_anulacion text check (motivo_anulacion is null or char_length(motivo_anulacion) <= 300),
  check ((tipo = 'tomado') = (hasta is not null)),
  check (hasta is null or hasta >= desde)
);
create unique index if not exists rem_vacaciones_un_saldo_inicial on public.rem_vacaciones (trabajador_id)
  where tipo = 'saldo_inicial' and estado = 'vigente';
create index if not exists rem_vacaciones_trab on public.rem_vacaciones (company_id, trabajador_id, desde);
alter table public.rem_vacaciones enable row level security;
revoke all on public.rem_vacaciones from anon, authenticated;
grant select on public.rem_vacaciones to authenticated;
drop policy if exists rem_vacaciones_ver on public.rem_vacaciones;
create policy rem_vacaciones_ver on public.rem_vacaciones for select to authenticated
  using (private.has_role(company_id, array['owner', 'admin', 'accountant']) or private.works_company(company_id)
         or private.is_staff(array['enqora_admin', 'ops_director', 'accountant_pro', 'lawyer_pro']));
drop trigger if exists rem_vacaciones_no_borrar on public.rem_vacaciones;
create trigger rem_vacaciones_no_borrar before delete on public.rem_vacaciones
  for each row execute function private.rem_no_borrar();

create or replace function private.rem_vacacion_inmutable() returns trigger
language plpgsql set search_path = '' as $$
declare
  k text[] := array['estado', 'anulado_por', 'anulado_at', 'motivo_anulacion'];
begin
  if (to_jsonb(new) - k) is distinct from (to_jsonb(old) - k)
     or not (old.estado = new.estado or (old.estado = 'vigente' and new.estado = 'anulado')) then
    raise exception 'ENQ_DOCUMENTO_INMUTABLE';
  end if;
  return new;
end
$$;
drop trigger if exists rem_vacaciones_inmutable on public.rem_vacaciones;
create trigger rem_vacaciones_inmutable before update on public.rem_vacaciones
  for each row execute function private.rem_vacacion_inmutable();

-- tomado: p_desde y p_hasta (los días los calcula la base). saldo_inicial: p_desde = fecha de corte y p_dias.
-- progresivo: p_desde = fecha desde la que rige, p_dias por año y p_nota con la acreditación.
create or replace function public.rem_vacacion_registrar(p_trabajador uuid, p_tipo text, p_desde date, p_hasta date,
  p_dias numeric, p_nota text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_trab public.rem_trabajadores;
  v_dias numeric;
  v_id uuid;
begin
  select * into v_trab from public.rem_trabajadores where id = p_trabajador;
  if not found then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if not private.rem_puede(v_trab.company_id) or private.is_staff(array['ai_agent']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_desde is null or p_desde < v_trab.fecha_ingreso or (v_trab.fecha_baja is not null and p_desde > v_trab.fecha_baja) then
    raise exception 'ENQ_VACACION_FECHAS';
  end if;
  perform pg_advisory_xact_lock(hashtext('rem_vac:' || p_trabajador));
  if p_tipo = 'tomado' then
    if p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 120
       or (v_trab.fecha_baja is not null and p_hasta > v_trab.fecha_baja) then raise exception 'ENQ_VACACION_FECHAS'; end if;
    if exists (select 1 from public.rem_vacaciones where trabajador_id = p_trabajador and tipo = 'tomado' and estado = 'vigente'
               and daterange(desde, hasta, '[]') && daterange(p_desde, p_hasta, '[]')) then raise exception 'ENQ_VACACION_TRASLAPE'; end if;
    v_dias := private.rem_dias_habiles(p_desde, p_hasta);
    if v_dias = 0 then raise exception 'ENQ_VACACION_FECHAS'; end if;
  elsif p_tipo = 'saldo_inicial' then
    if p_hasta is not null or p_dias is null or p_dias <= 0 or p_dias > 120 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
    v_dias := round(p_dias, 2);
  elsif p_tipo = 'progresivo' then
    if p_hasta is not null or p_dias is null or p_dias < 1 or p_dias > 30 or p_dias <> trunc(p_dias)
       or char_length(coalesce(trim(p_nota), '')) < 5 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
    v_dias := p_dias;
  else
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  insert into public.rem_vacaciones (company_id, trabajador_id, tipo, desde, hasta, dias, nota, creado_por)
  values (v_trab.company_id, p_trabajador, p_tipo, p_desde, p_hasta, v_dias, nullif(left(trim(coalesce(p_nota, '')), 300), ''), v_uid)
  returning id into v_id;
  perform private.log_event(v_trab.company_id, 'remuneraciones.vacacion_' || p_tipo, v_trab.rut,
    jsonb_build_object('id', v_id, 'desde', p_desde, 'hasta', p_hasta, 'dias', v_dias));
  return v_id;
exception
  when unique_violation then raise exception 'ENQ_VACACION_SALDO_DUPLICADO';
  when check_violation then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

create or replace function public.rem_vacacion_anular(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_row public.rem_vacaciones;
begin
  select * into v_row from public.rem_vacaciones where id = p_id for update;
  if not found then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if not private.rem_puede(v_row.company_id) or private.is_staff(array['ai_agent']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_row.estado = 'anulado' then raise exception 'ENQ_YA_DECIDIDA'; end if;
  if char_length(coalesce(trim(p_motivo), '')) < 3 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  update public.rem_vacaciones set estado = 'anulado', anulado_por = v_uid, anulado_at = now(), motivo_anulacion = left(trim(p_motivo), 300)
    where id = p_id;
  perform private.log_event(v_row.company_id, 'remuneraciones.vacacion_anulada', v_row.tipo,
    jsonb_build_object('id', p_id, 'motivo', p_motivo, 'antes', to_jsonb(v_row)));
end
$$;

revoke execute on function private.rem_dias_habiles(date, date) from public, anon, authenticated;
revoke execute on function private.rem_vacacion_inmutable() from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array['public.rem_vacacion_registrar(uuid, text, date, date, numeric, text)', 'public.rem_vacacion_anular(uuid, text)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$$;
