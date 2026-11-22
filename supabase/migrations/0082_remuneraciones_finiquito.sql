-- =====================================================================
-- ENQORA · 0082 · Remuneraciones: finiquito
-- 1. rem_feriados: festivos nacionales (los usa el feriado proporcional y el plazo de pago). Los mantiene el equipo.
-- 2. rem_finiquitos: propuesta de finiquito por trabajador dado de baja. La empresa la calcula y la envía a revisión;
--    una persona del equipo ENQORA (contador o abogado, nunca un agente) la aprueba u observa. Solo la aprobada se
--    imprime. Cada versión es inmutable; una corrección es una versión nueva. Nada se borra.
-- Requiere la 0081. Se puede ejecutar más de una vez.
-- =====================================================================

-- ---------- 1. Festivos ----------
create table if not exists public.rem_feriados (
  fecha date primary key,
  nombre text not null check (char_length(nombre) between 3 and 120),
  fuente text not null check (char_length(fuente) between 3 and 300),
  creado_por uuid references auth.users (id) on delete set null,
  creado timestamptz not null default now()
);
alter table public.rem_feriados enable row level security;
revoke all on public.rem_feriados from anon, authenticated;
grant select on public.rem_feriados to authenticated;
drop policy if exists rem_feriados_ver on public.rem_feriados;
create policy rem_feriados_ver on public.rem_feriados for select to authenticated using (true);

-- Festivos nacionales 2026 y 2027 (Ley 2.977 y modificaciones; 21-06 Ley 21.357; 17-09-2027 Ley 20.983).
insert into public.rem_feriados (fecha, nombre, fuente) values
  ('2026-01-01', 'Año Nuevo', 'Ley 2.977 y Ley 19.973'), ('2026-04-03', 'Viernes Santo', 'Ley 2.977'), ('2026-04-04', 'Sábado Santo', 'Ley 2.977'),
  ('2026-05-01', 'Día Nacional del Trabajo', 'Ley 2.977 y Ley 19.973'), ('2026-05-21', 'Día de las Glorias Navales', 'Ley 2.977'),
  ('2026-06-21', 'Día Nacional de los Pueblos Indígenas', 'Ley 21.357'), ('2026-06-29', 'San Pedro y San Pablo', 'Ley 2.977 y Ley 19.668'),
  ('2026-07-16', 'Virgen del Carmen', 'Ley 20.148'), ('2026-08-15', 'Asunción de la Virgen', 'Ley 2.977'),
  ('2026-09-18', 'Independencia Nacional', 'Ley 2.977 y Ley 19.973'), ('2026-09-19', 'Día de las Glorias del Ejército', 'Ley 2.977 y Ley 20.629'),
  ('2026-10-12', 'Encuentro de Dos Mundos', 'Ley 2.977 y Ley 19.668'), ('2026-10-31', 'Día de las Iglesias Evangélicas y Protestantes', 'Ley 20.299'),
  ('2026-11-01', 'Día de Todos los Santos', 'Ley 2.977'), ('2026-12-08', 'Inmaculada Concepción', 'Ley 2.977'),
  ('2026-12-25', 'Navidad', 'Ley 2.977 y Ley 19.973'),
  ('2027-01-01', 'Año Nuevo', 'Ley 2.977 y Ley 19.973'), ('2027-03-26', 'Viernes Santo', 'Ley 2.977'), ('2027-03-27', 'Sábado Santo', 'Ley 2.977'),
  ('2027-05-01', 'Día Nacional del Trabajo', 'Ley 2.977 y Ley 19.973'), ('2027-05-21', 'Día de las Glorias Navales', 'Ley 2.977'),
  ('2027-06-21', 'Día Nacional de los Pueblos Indígenas', 'Ley 21.357'), ('2027-06-28', 'San Pedro y San Pablo (trasladado)', 'Ley 2.977 y Ley 19.668'),
  ('2027-07-16', 'Virgen del Carmen', 'Ley 20.148'), ('2027-08-15', 'Asunción de la Virgen', 'Ley 2.977'),
  ('2027-09-17', 'Feriado adicional de Fiestas Patrias', 'Ley 20.983'), ('2027-09-18', 'Independencia Nacional', 'Ley 2.977 y Ley 19.973'),
  ('2027-09-19', 'Día de las Glorias del Ejército', 'Ley 2.977 y Ley 20.629'), ('2027-10-11', 'Encuentro de Dos Mundos (trasladado)', 'Ley 2.977 y Ley 19.668'),
  ('2027-10-31', 'Día de las Iglesias Evangélicas y Protestantes', 'Ley 20.299'), ('2027-11-01', 'Día de Todos los Santos', 'Ley 2.977'),
  ('2027-12-08', 'Inmaculada Concepción', 'Ley 2.977'), ('2027-12-25', 'Navidad', 'Ley 2.977 y Ley 19.973')
on conflict (fecha) do nothing;

create or replace function public.rem_feriado_guardar(p_fecha date, p_nombre text, p_fuente text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
begin
  if not private.is_staff(array['enqora_admin', 'ops_director', 'accountant_pro', 'lawyer_pro']) or private.is_staff(array['ai_agent']) then
    raise exception 'ENQ_SIN_PERMISO';
  end if;
  insert into public.rem_feriados (fecha, nombre, fuente, creado_por) values (p_fecha, trim(p_nombre), trim(p_fuente), v_uid)
  on conflict (fecha) do update set nombre = excluded.nombre, fuente = excluded.fuente, creado_por = v_uid, creado = now();
  perform private.log_event(null, 'remuneraciones.feriado_guardado', p_fecha::text, jsonb_build_object('nombre', p_nombre, 'fuente', p_fuente));
exception
  when check_violation or not_null_violation then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

create or replace function public.rem_feriado_quitar(p_fecha date, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_antes jsonb;
begin
  if not private.is_staff(array['enqora_admin', 'ops_director', 'accountant_pro', 'lawyer_pro']) or private.is_staff(array['ai_agent']) then
    raise exception 'ENQ_SIN_PERMISO';
  end if;
  if char_length(coalesce(trim(p_motivo), '')) < 3 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  delete from public.rem_feriados where fecha = p_fecha returning to_jsonb(rem_feriados) into v_antes;
  if v_antes is null then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  perform private.log_event(null, 'remuneraciones.feriado_quitado', p_fecha::text, jsonb_build_object('antes', v_antes, 'motivo', p_motivo));
end
$$;

-- ---------- 2. Finiquitos ----------
create table if not exists public.rem_finiquitos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  trabajador_id uuid not null references public.rem_trabajadores (id) on delete cascade,
  version int not null check (version >= 1),
  motor text not null check (char_length(motor) between 4 and 30),
  datos jsonb not null,
  detalle jsonb not null,
  contenido text not null check (char_length(contenido) between 50 and 20000),
  total bigint not null,
  estado text not null default 'en_revision' check (estado in ('en_revision', 'observado', 'aprobado', 'anulado')),
  creado_por uuid references auth.users (id) on delete set null,
  creado timestamptz not null default now(),
  revisado_por uuid references auth.users (id) on delete set null,
  revisado_at timestamptz,
  observacion text check (observacion is null or char_length(observacion) <= 2000),
  anulado_por uuid references auth.users (id) on delete set null,
  anulado_at timestamptz,
  motivo_anulacion text check (motivo_anulacion is null or char_length(motivo_anulacion) <= 300),
  unique (trabajador_id, version)
);
create unique index if not exists rem_finiquitos_un_aprobado on public.rem_finiquitos (trabajador_id) where estado = 'aprobado';
create index if not exists rem_finiquitos_revision on public.rem_finiquitos (estado, creado) where estado = 'en_revision';
create index if not exists rem_finiquitos_empresa on public.rem_finiquitos (company_id, trabajador_id);
alter table public.rem_finiquitos enable row level security;
revoke all on public.rem_finiquitos from anon, authenticated;
grant select on public.rem_finiquitos to authenticated;
drop policy if exists rem_finiquitos_ver on public.rem_finiquitos;
create policy rem_finiquitos_ver on public.rem_finiquitos for select to authenticated
  using (private.has_role(company_id, array['owner', 'admin', 'accountant']) or private.works_company(company_id)
         or private.is_staff(array['enqora_admin', 'ops_director', 'accountant_pro', 'lawyer_pro']));
drop trigger if exists rem_finiquitos_no_borrar on public.rem_finiquitos;
create trigger rem_finiquitos_no_borrar before delete on public.rem_finiquitos
  for each row execute function private.rem_no_borrar();

create or replace function private.rem_finiquito_inmutable() returns trigger
language plpgsql set search_path = '' as $$
declare
  k text[] := array['estado', 'revisado_por', 'revisado_at', 'observacion', 'anulado_por', 'anulado_at', 'motivo_anulacion'];
begin
  if (to_jsonb(new) - k) is distinct from (to_jsonb(old) - k) then raise exception 'ENQ_DOCUMENTO_INMUTABLE'; end if;
  if not ((old.estado = 'en_revision' and new.estado in ('observado', 'aprobado', 'anulado'))
          or (old.estado in ('observado', 'aprobado') and new.estado = 'anulado')
          or old.estado = new.estado) then
    raise exception 'ENQ_DOCUMENTO_INMUTABLE';
  end if;
  return new;
end
$$;
drop trigger if exists rem_finiquitos_inmutable on public.rem_finiquitos;
create trigger rem_finiquitos_inmutable before update on public.rem_finiquitos
  for each row execute function private.rem_finiquito_inmutable();

-- La empresa (o el equipo asignado) guarda una versión y la envía a revisión. Exige que el trabajador esté dado de baja
-- con la misma fecha y causal. Una versión nueva deja sin efecto la que esperaba revisión o estaba observada.
create or replace function public.rem_finiquito_guardar(p_trabajador uuid, p_motor text, p_datos jsonb, p_detalle jsonb,
  p_contenido text, p_total bigint) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_trab public.rem_trabajadores;
  v_version int;
  v_id uuid;
begin
  select * into v_trab from public.rem_trabajadores where id = p_trabajador;
  if not found then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if not private.rem_puede(v_trab.company_id) or private.is_staff(array['ai_agent']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_trab.fecha_baja is null or v_trab.causal_termino is null then raise exception 'ENQ_FINIQUITO_SIN_BAJA'; end if;
  if coalesce(jsonb_typeof(p_datos), '') <> 'object' or coalesce(jsonb_typeof(p_detalle), '') <> 'object'
     or octet_length(p_datos::text) > 4000 or octet_length(p_detalle::text) > 20000
     or (p_datos ->> 'fecha_termino') is distinct from v_trab.fecha_baja::text
     or (p_datos ->> 'causal') is distinct from v_trab.causal_termino::text then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  perform pg_advisory_xact_lock(hashtext('rem_fin:' || p_trabajador));
  if exists (select 1 from public.rem_finiquitos where trabajador_id = p_trabajador and estado = 'aprobado') then
    raise exception 'ENQ_FINIQUITO_YA_APROBADO';
  end if;
  select coalesce(max(version), 0) + 1 into v_version from public.rem_finiquitos where trabajador_id = p_trabajador;
  update public.rem_finiquitos set estado = 'anulado', anulado_por = v_uid, anulado_at = now(),
    motivo_anulacion = 'Reemplazado por la versión ' || v_version
  where trabajador_id = p_trabajador and estado in ('en_revision', 'observado');
  insert into public.rem_finiquitos (company_id, trabajador_id, version, motor, datos, detalle, contenido, total, creado_por)
  values (v_trab.company_id, p_trabajador, v_version, left(p_motor, 30), p_datos, p_detalle, p_contenido, p_total, v_uid)
  returning id into v_id;
  perform private.log_event(v_trab.company_id, 'remuneraciones.finiquito_enviado', v_trab.rut || ' v' || v_version,
    jsonb_build_object('id', v_id, 'trabajador', p_trabajador, 'total', p_total));
  return v_id;
exception
  when check_violation then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

-- Revisión del equipo: aprobar u observar (con comentario). Solo personas: contador o abogado de ENQORA.
create or replace function public.rem_finiquito_revisar(p_id uuid, p_decision text, p_observacion text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_row public.rem_finiquitos;
begin
  if not private.is_staff(array['enqora_admin', 'accountant_pro', 'lawyer_pro']) or private.is_staff(array['ai_agent']) then
    raise exception 'ENQ_SIN_PERMISO';
  end if;
  select * into v_row from public.rem_finiquitos where id = p_id for update;
  if not found then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if v_row.estado <> 'en_revision' then raise exception 'ENQ_YA_DECIDIDA'; end if;
  if p_decision = 'observar' then
    if char_length(coalesce(trim(p_observacion), '')) < 5 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
    update public.rem_finiquitos set estado = 'observado', revisado_por = v_uid, revisado_at = now(), observacion = left(trim(p_observacion), 2000)
      where id = p_id;
  elsif p_decision = 'aprobar' then
    update public.rem_finiquitos set estado = 'aprobado', revisado_por = v_uid, revisado_at = now(),
      observacion = nullif(left(trim(coalesce(p_observacion, '')), 2000), '') where id = p_id;
  else
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  perform private.log_event(v_row.company_id, 'remuneraciones.finiquito_' || p_decision, 'v' || v_row.version,
    jsonb_build_object('id', p_id, 'trabajador', v_row.trabajador_id));
  perform private.notify(
    array(select m.user_id from public.company_members m where m.company_id = v_row.company_id and m.role in ('owner', 'admin', 'accountant')),
    v_row.company_id, null, 'casos',
    case when p_decision = 'aprobar' then 'Finiquito revisado y aprobado' else 'El finiquito tiene observaciones' end,
    case when p_decision = 'aprobar' then 'El equipo ENQORA aprobó la propuesta de finiquito. Ya puedes imprimirla para firmarla ante un ministro de fe o cargarla en el portal de la Dirección del Trabajo.'
         else 'El equipo ENQORA dejó observaciones en la propuesta de finiquito. Revísalas y calcula una versión nueva.' end,
    '/remuneraciones', 'rem_finiquito:' || p_id || ':' || p_decision);
exception
  when check_violation then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

create or replace function public.rem_finiquito_anular(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_row public.rem_finiquitos;
begin
  select * into v_row from public.rem_finiquitos where id = p_id for update;
  if not found then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if not (private.rem_puede(v_row.company_id) or private.is_staff(array['enqora_admin', 'accountant_pro', 'lawyer_pro']))
     or private.is_staff(array['ai_agent']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_row.estado = 'anulado' then raise exception 'ENQ_YA_DECIDIDA'; end if;
  if char_length(coalesce(trim(p_motivo), '')) < 3 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  update public.rem_finiquitos set estado = 'anulado', anulado_por = v_uid, anulado_at = now(), motivo_anulacion = left(trim(p_motivo), 300)
    where id = p_id;
  perform private.log_event(v_row.company_id, 'remuneraciones.finiquito_anulado', 'v' || v_row.version,
    jsonb_build_object('id', p_id, 'motivo', p_motivo, 'estaba', v_row.estado));
end
$$;

-- ---------- Permisos ----------
revoke execute on function private.rem_finiquito_inmutable() from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'public.rem_feriado_guardar(date, text, text)', 'public.rem_feriado_quitar(date, text)',
    'public.rem_finiquito_guardar(uuid, text, jsonb, jsonb, text, bigint)', 'public.rem_finiquito_revisar(uuid, text, text)',
    'public.rem_finiquito_anular(uuid, text)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$$;
