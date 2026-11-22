-- =====================================================================
-- ENQORA · 0083 · Remuneraciones: Certificado N° 6 y resumen anual para la DJ 1887
-- 1. rem_factores: factores de actualización mensuales que publica el SII. Los carga el equipo con su fuente.
-- 2. private.rem_cert_calcular: suma por mes las liquidaciones APROBADAS del año y el finiquito aprobado.
--    El cálculo se hace en la base de datos: el certificado no depende de montos enviados por el navegador.
--    Columnas (instrucciones SII del Certificado N° 6): (2) renta bruta, (3) cotizaciones de cargo del trabajador
--    (incluye APV régimen B), (4) = (2) - (3), (5) impuesto único retenido, (6) mayor retención art. 88, (7) renta
--    exenta, (8) renta no gravada (colación, movilización, asignación familiar e indemnizaciones del finiquito),
--    (9) rebaja zonas extremas, (10) factor, (11) a (16) = (4) a (9) por el factor.
-- 3. rem_certificados: certificados emitidos, numerados en forma correlativa por empresa y año. Inmutables; uno
--    nuevo reemplaza al anterior del mismo trabajador y año.
-- Requiere la 0082. Se puede ejecutar más de una vez.
-- =====================================================================

-- ---------- 1. Factores de actualización ----------
create table if not exists public.rem_factores (
  anio int not null check (anio between 2020 and 2100),
  mes int not null check (mes between 1 and 12),
  factor numeric(6, 3) not null check (factor between 0.9 and 2),
  fuente text not null check (char_length(fuente) between 3 and 300),
  creado_por uuid references auth.users (id) on delete set null,
  creado timestamptz not null default now(),
  primary key (anio, mes)
);
alter table public.rem_factores enable row level security;
revoke all on public.rem_factores from anon, authenticated;
grant select on public.rem_factores to authenticated;
drop policy if exists rem_factores_ver on public.rem_factores;
create policy rem_factores_ver on public.rem_factores for select to authenticated using (true);

-- p_factores: {"1": 1.034, "2": 1.031, ...} (año comercial). Reemplaza los meses enviados y deja la bitácora.
create or replace function public.rem_factores_guardar(p_anio int, p_factores jsonb, p_fuente text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  k text;
  v_antes jsonb;
begin
  if not private.is_staff(array['enqora_admin', 'ops_director', 'accountant_pro']) or private.is_staff(array['ai_agent']) then
    raise exception 'ENQ_SIN_PERMISO';
  end if;
  if coalesce(jsonb_typeof(p_factores), '') <> 'object' or p_factores = '{}'::jsonb then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  select jsonb_object_agg(mes::text, factor) into v_antes from public.rem_factores where anio = p_anio;
  for k in select jsonb_object_keys(p_factores) loop
    if k !~ '^(1[0-2]|[1-9])$' or coalesce(jsonb_typeof(p_factores -> k), '') <> 'number' then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
    insert into public.rem_factores (anio, mes, factor, fuente, creado_por)
    values (p_anio, k::int, (p_factores ->> k)::numeric, trim(p_fuente), v_uid)
    on conflict (anio, mes) do update set factor = excluded.factor, fuente = excluded.fuente, creado_por = v_uid, creado = now();
  end loop;
  perform private.log_event(null, 'remuneraciones.factores_guardados', p_anio::text,
    jsonb_build_object('antes', v_antes, 'nuevos', p_factores, 'fuente', p_fuente));
exception
  when check_violation or not_null_violation or numeric_value_out_of_range then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

-- ---------- 2. Cálculo ----------
create or replace function private.rem_cert_calcular(p_trabajador uuid, p_anio int) returns jsonb
language sql stable security definer set search_path = '' as $$
  with liq as (
    select substr(l.periodo, 6, 2)::int as mes,
      sum(l.total_imponible) as bruto,
      sum(coalesce((l.detalle ->> 'base_tributable')::bigint, 0)) as base,
      sum(coalesce((l.detalle -> 'montos' ->> 'impuesto')::bigint, 0)) as impuesto,
      sum(coalesce((l.detalle -> 'montos' ->> 'colacion')::bigint, 0) + coalesce((l.detalle -> 'montos' ->> 'movilizacion')::bigint, 0)
          + coalesce((l.detalle -> 'montos' ->> 'asig_familiar')::bigint, 0)) as no_gravada
    from public.rem_liquidaciones l
    where l.trabajador_id = p_trabajador and l.estado = 'aprobada' and l.periodo like p_anio::text || '-%'
    group by 1
  ), fin as (
    select extract(month from t.fecha_baja)::int as mes,
      sum(coalesce((f.detalle ->> 'ias')::bigint, 0) + coalesce((f.detalle ->> 'aviso')::bigint, 0) + coalesce((f.detalle ->> 'feriado')::bigint, 0)) as indem
    from public.rem_finiquitos f join public.rem_trabajadores t on t.id = f.trabajador_id
    where f.trabajador_id = p_trabajador and f.estado = 'aprobado' and extract(year from t.fecha_baja) = p_anio
    group by 1
  ), m as (
    select coalesce(liq.mes, fin.mes) as mes, coalesce(liq.bruto, 0) as bruto, coalesce(liq.bruto, 0) - coalesce(liq.base, 0) as cotiz,
      coalesce(liq.base, 0) as base, coalesce(liq.impuesto, 0) as impuesto, coalesce(liq.no_gravada, 0) + coalesce(fin.indem, 0) as no_gravada,
      fx.factor
    from liq full join fin on fin.mes = liq.mes
    left join public.rem_factores fx on fx.anio = p_anio and fx.mes = coalesce(liq.mes, fin.mes)
  ), a as (
    select m.*, round(m.base * coalesce(m.factor, 0))::bigint as base_act, round(m.impuesto * coalesce(m.factor, 0))::bigint as impuesto_act,
      round(m.no_gravada * coalesce(m.factor, 0))::bigint as no_gravada_act
    from m
  )
  select jsonb_build_object(
    'anio', p_anio, 'motor', 'cert6-2026-11',
    'meses', coalesce((select jsonb_agg(jsonb_build_object('mes', mes, 'bruto', bruto, 'cotiz', cotiz, 'base', base, 'impuesto', impuesto,
        'mayor', 0, 'exenta', 0, 'no_gravada', no_gravada, 'zona', 0, 'factor', factor,
        'base_act', base_act, 'impuesto_act', impuesto_act, 'mayor_act', 0, 'exenta_act', 0, 'no_gravada_act', no_gravada_act, 'zona_act', 0)
        order by mes) from a), '[]'::jsonb),
    'totales', (select jsonb_build_object('bruto', coalesce(sum(bruto), 0), 'cotiz', coalesce(sum(cotiz), 0), 'base', coalesce(sum(base), 0),
        'impuesto', coalesce(sum(impuesto), 0), 'no_gravada', coalesce(sum(no_gravada), 0), 'base_act', coalesce(sum(base_act), 0),
        'impuesto_act', coalesce(sum(impuesto_act), 0), 'no_gravada_act', coalesce(sum(no_gravada_act), 0)) from a),
    'faltan_factores', coalesce((select jsonb_agg(mes order by mes) from a where factor is null), '[]'::jsonb),
    'finiquitado', exists (select 1 from public.rem_trabajadores t where t.id = p_trabajador and extract(year from t.fecha_baja) = p_anio)
  )
$$;

-- Resumen anual por trabajador de una empresa (cuadratura con la propuesta de la DJ 1887 que arma el SII).
create or replace function public.rem_resumen_anual(p_company uuid, p_anio int) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_session();
  if not (private.rem_puede(p_company) or private.is_staff(array['enqora_admin', 'ops_director', 'accountant_pro'])) then
    raise exception 'ENQ_SIN_PERMISO';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('trabajador_id', t.id, 'rut', t.rut, 'nombre', t.nombre, 'fecha_baja', t.fecha_baja,
      'calculo', private.rem_cert_calcular(t.id, p_anio)) order by t.nombre)
    from public.rem_trabajadores t
    where t.company_id = p_company
      and (exists (select 1 from public.rem_liquidaciones l where l.trabajador_id = t.id and l.estado = 'aprobada' and l.periodo like p_anio::text || '-%')
           or exists (select 1 from public.rem_finiquitos f where f.trabajador_id = t.id and f.estado = 'aprobado' and extract(year from t.fecha_baja) = p_anio))
  ), '[]'::jsonb);
end
$$;

-- ---------- 3. Certificados emitidos ----------
create table if not exists public.rem_certificados (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  trabajador_id uuid not null references public.rem_trabajadores (id) on delete cascade,
  anio int not null check (anio between 2020 and 2100),
  numero int not null check (numero >= 1),
  detalle jsonb not null,
  empresa jsonb not null,
  trabajador jsonb not null,
  estado text not null default 'vigente' check (estado in ('vigente', 'reemplazado')),
  emitido_por uuid references auth.users (id) on delete set null,
  emitido timestamptz not null default now(),
  reemplazado_at timestamptz,
  unique (company_id, anio, numero)
);
create unique index if not exists rem_certificados_un_vigente on public.rem_certificados (trabajador_id, anio) where estado = 'vigente';
alter table public.rem_certificados enable row level security;
revoke all on public.rem_certificados from anon, authenticated;
grant select on public.rem_certificados to authenticated;
drop policy if exists rem_certificados_ver on public.rem_certificados;
create policy rem_certificados_ver on public.rem_certificados for select to authenticated
  using (private.has_role(company_id, array['owner', 'admin', 'accountant']) or private.works_company(company_id)
         or private.is_staff(array['enqora_admin', 'ops_director', 'accountant_pro']));
drop trigger if exists rem_certificados_no_borrar on public.rem_certificados;
create trigger rem_certificados_no_borrar before delete on public.rem_certificados
  for each row execute function private.rem_no_borrar();

create or replace function private.rem_certificado_inmutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - array['estado', 'reemplazado_at']) is distinct from (to_jsonb(old) - array['estado', 'reemplazado_at'])
     or not (old.estado = new.estado or (old.estado = 'vigente' and new.estado = 'reemplazado')) then
    raise exception 'ENQ_DOCUMENTO_INMUTABLE';
  end if;
  return new;
end
$$;
drop trigger if exists rem_certificados_inmutable on public.rem_certificados;
create trigger rem_certificados_inmutable before update on public.rem_certificados
  for each row execute function private.rem_certificado_inmutable();

-- Emite el certificado de un año ya cerrado con los factores completos. Numeración correlativa por empresa y año.
create or replace function public.rem_certificado_emitir(p_trabajador uuid, p_anio int) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_trab public.rem_trabajadores;
  v_emp public.companies;
  v_calc jsonb;
  v_num int;
  v_id uuid;
begin
  select * into v_trab from public.rem_trabajadores where id = p_trabajador;
  if not found then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if not private.rem_puede(v_trab.company_id) or private.is_staff(array['ai_agent']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_anio >= extract(year from (now() at time zone 'America/Santiago'))::int then raise exception 'ENQ_ANIO_NO_CERRADO'; end if;
  v_calc := private.rem_cert_calcular(p_trabajador, p_anio);
  if jsonb_array_length(v_calc -> 'meses') = 0 then raise exception 'ENQ_SIN_DATOS_ANIO'; end if;
  if jsonb_array_length(v_calc -> 'faltan_factores') > 0 then raise exception 'ENQ_FALTAN_FACTORES'; end if;
  select * into v_emp from public.companies where id = v_trab.company_id;
  perform pg_advisory_xact_lock(hashtext('rem_cert:' || v_trab.company_id || ':' || p_anio));
  select coalesce(max(numero), 0) + 1 into v_num from public.rem_certificados where company_id = v_trab.company_id and anio = p_anio;
  update public.rem_certificados set estado = 'reemplazado', reemplazado_at = now()
    where trabajador_id = p_trabajador and anio = p_anio and estado = 'vigente';
  insert into public.rem_certificados (company_id, trabajador_id, anio, numero, detalle, empresa, trabajador, emitido_por)
  values (v_trab.company_id, p_trabajador, p_anio, v_num, v_calc,
    jsonb_build_object('nombre', v_emp.legal_name, 'rut', v_emp.rut, 'direccion', concat_ws(', ', v_emp.address, v_emp.commune), 'giro', v_emp.activity),
    jsonb_build_object('nombre', v_trab.nombre, 'rut', v_trab.rut), v_uid)
  returning id into v_id;
  perform private.log_event(v_trab.company_id, 'remuneraciones.certificado6_emitido', v_trab.rut || ' ' || p_anio || ' N° ' || v_num,
    jsonb_build_object('id', v_id, 'trabajador', p_trabajador));
  return v_id;
end
$$;

-- ---------- Permisos ----------
revoke execute on function private.rem_cert_calcular(uuid, int) from public, anon, authenticated;
revoke execute on function private.rem_certificado_inmutable() from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array['public.rem_factores_guardar(int, jsonb, text)', 'public.rem_resumen_anual(uuid, int)',
    'public.rem_certificado_emitir(uuid, int)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$$;
