-- =====================================================================
-- ENQORA · 0085 · Remuneraciones: contrato de trabajo y anexos con revisión de un abogado
-- La empresa arma el borrador con la plantilla de ENQORA (art. 10 del Código del Trabajo) desde la ficha del
-- trabajador. Queda «en revisión» hasta que un abogado de ENQORA (persona, nunca un agente) lo aprueba u observa.
-- Solo lo aprobado se imprime. Versiones inmutables; nada se borra. Un trabajador tiene un solo contrato aprobado
-- vigente; los anexos se numeran por trabajador.
-- Requiere la 0084. Se puede ejecutar más de una vez.
-- =====================================================================

create table if not exists public.rem_contratos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  trabajador_id uuid not null references public.rem_trabajadores (id) on delete cascade,
  tipo text not null check (tipo in ('contrato', 'anexo')),
  version int not null check (version >= 1),
  numero_anexo int check ((tipo = 'anexo') = (numero_anexo is not null)),
  plantilla text not null check (char_length(plantilla) between 4 and 30),
  datos jsonb not null,
  contenido text not null check (char_length(contenido) between 100 and 30000),
  avisos jsonb not null default '[]'::jsonb,
  estado text not null default 'en_revision' check (estado in ('en_revision', 'observado', 'aprobado', 'anulado')),
  creado_por uuid references auth.users (id) on delete set null,
  creado timestamptz not null default now(),
  revisado_por uuid references auth.users (id) on delete set null,
  revisado_at timestamptz,
  observacion text check (observacion is null or char_length(observacion) <= 2000),
  anulado_por uuid references auth.users (id) on delete set null,
  anulado_at timestamptz,
  motivo_anulacion text check (motivo_anulacion is null or char_length(motivo_anulacion) <= 300),
  unique (trabajador_id, tipo, version)
);
create unique index if not exists rem_contratos_un_aprobado on public.rem_contratos (trabajador_id) where tipo = 'contrato' and estado = 'aprobado';
create index if not exists rem_contratos_revision on public.rem_contratos (estado, creado) where estado = 'en_revision';
create index if not exists rem_contratos_empresa on public.rem_contratos (company_id, trabajador_id);
alter table public.rem_contratos enable row level security;
revoke all on public.rem_contratos from anon, authenticated;
grant select on public.rem_contratos to authenticated;
drop policy if exists rem_contratos_ver on public.rem_contratos;
create policy rem_contratos_ver on public.rem_contratos for select to authenticated
  using (private.has_role(company_id, array['owner', 'admin', 'accountant']) or private.works_company(company_id)
         or private.is_staff(array['enqora_admin', 'ops_director', 'lawyer_pro']));
drop trigger if exists rem_contratos_no_borrar on public.rem_contratos;
create trigger rem_contratos_no_borrar before delete on public.rem_contratos
  for each row execute function private.rem_no_borrar();

create or replace function private.rem_contrato_inmutable() returns trigger
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
drop trigger if exists rem_contratos_inmutable on public.rem_contratos;
create trigger rem_contratos_inmutable before update on public.rem_contratos
  for each row execute function private.rem_contrato_inmutable();

-- La empresa guarda un borrador y lo envía a revisión. Contrato: deja sin efecto el que esperaba revisión u estaba
-- observado, y no se permite si ya hay uno aprobado (para cambiarlo se usa un anexo o se anula con motivo).
-- Anexo: se numera en el orden en que se crea; una versión nueva de un anexo se pide con p_reemplaza.
create or replace function public.rem_contrato_guardar(p_trabajador uuid, p_tipo text, p_plantilla text, p_datos jsonb,
  p_contenido text, p_avisos jsonb, p_reemplaza uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_trab public.rem_trabajadores;
  v_prev public.rem_contratos;
  v_version int;
  v_numero int;
  v_id uuid;
begin
  select * into v_trab from public.rem_trabajadores where id = p_trabajador;
  if not found then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if not private.rem_puede(v_trab.company_id) or private.is_staff(array['ai_agent']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_tipo not in ('contrato', 'anexo') or coalesce(jsonb_typeof(p_datos), '') <> 'object' or octet_length(p_datos::text) > 6000
     or coalesce(jsonb_typeof(p_avisos), '') <> 'array' or octet_length(p_avisos::text) > 4000 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  perform pg_advisory_xact_lock(hashtext('rem_contrato:' || p_trabajador));
  if p_tipo = 'contrato' then
    if exists (select 1 from public.rem_contratos where trabajador_id = p_trabajador and tipo = 'contrato' and estado = 'aprobado') then
      raise exception 'ENQ_CONTRATO_YA_APROBADO';
    end if;
    update public.rem_contratos set estado = 'anulado', anulado_por = v_uid, anulado_at = now(), motivo_anulacion = 'Reemplazado por una versión nueva'
      where trabajador_id = p_trabajador and tipo = 'contrato' and estado in ('en_revision', 'observado');
  else
    if p_reemplaza is not null then
      select * into v_prev from public.rem_contratos where id = p_reemplaza and trabajador_id = p_trabajador and tipo = 'anexo' for update;
      if not found or v_prev.estado not in ('en_revision', 'observado') then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
      update public.rem_contratos set estado = 'anulado', anulado_por = v_uid, anulado_at = now(), motivo_anulacion = 'Reemplazado por una versión nueva'
        where id = p_reemplaza;
      v_numero := v_prev.numero_anexo;
    else
      select coalesce(max(numero_anexo), 0) + 1 into v_numero from public.rem_contratos where trabajador_id = p_trabajador and tipo = 'anexo';
    end if;
  end if;
  select coalesce(max(version), 0) + 1 into v_version from public.rem_contratos where trabajador_id = p_trabajador and tipo = p_tipo;
  insert into public.rem_contratos (company_id, trabajador_id, tipo, version, numero_anexo, plantilla, datos, contenido, avisos, creado_por)
  values (v_trab.company_id, p_trabajador, p_tipo, v_version, v_numero, left(p_plantilla, 30), p_datos, p_contenido, p_avisos, v_uid)
  returning id into v_id;
  perform private.log_event(v_trab.company_id, 'laboral.' || p_tipo || '_enviado', v_trab.rut || ' v' || v_version,
    jsonb_build_object('id', v_id, 'trabajador', p_trabajador, 'numero_anexo', v_numero));
  return v_id;
exception
  when check_violation then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

-- Revisión jurídica: solo un abogado de ENQORA o la administración, nunca un agente.
create or replace function public.rem_contrato_revisar(p_id uuid, p_decision text, p_observacion text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_row public.rem_contratos;
begin
  if not private.is_staff(array['enqora_admin', 'lawyer_pro']) or private.is_staff(array['ai_agent']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  select * into v_row from public.rem_contratos where id = p_id for update;
  if not found then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if v_row.estado <> 'en_revision' then raise exception 'ENQ_YA_DECIDIDA'; end if;
  if p_decision = 'observar' then
    if char_length(coalesce(trim(p_observacion), '')) < 5 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
    update public.rem_contratos set estado = 'observado', revisado_por = v_uid, revisado_at = now(), observacion = left(trim(p_observacion), 2000) where id = p_id;
  elsif p_decision = 'aprobar' then
    update public.rem_contratos set estado = 'aprobado', revisado_por = v_uid, revisado_at = now(),
      observacion = nullif(left(trim(coalesce(p_observacion, '')), 2000), '') where id = p_id;
  else
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  perform private.log_event(v_row.company_id, 'laboral.' || v_row.tipo || '_' || p_decision, 'v' || v_row.version,
    jsonb_build_object('id', p_id, 'trabajador', v_row.trabajador_id));
  perform private.notify(
    array(select m.user_id from public.company_members m where m.company_id = v_row.company_id and m.role in ('owner', 'admin', 'accountant')),
    v_row.company_id, null, 'casos',
    case when p_decision = 'aprobar' then (case v_row.tipo when 'contrato' then 'Contrato de trabajo aprobado' else 'Anexo de contrato aprobado' end)
         else (case v_row.tipo when 'contrato' then 'El contrato de trabajo tiene observaciones' else 'El anexo de contrato tiene observaciones' end) end,
    case when p_decision = 'aprobar' then 'Un abogado de ENQORA lo revisó y aprobó. Ya puedes imprimirlo y firmarlo con el trabajador.'
         else 'Un abogado de ENQORA dejó observaciones. Revísalas y prepara una versión nueva.' end,
    '/remuneraciones', 'rem_contrato:' || p_id || ':' || p_decision);
exception
  when unique_violation then raise exception 'ENQ_CONTRATO_YA_APROBADO';
  when check_violation then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

create or replace function public.rem_contrato_anular(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_row public.rem_contratos;
begin
  select * into v_row from public.rem_contratos where id = p_id for update;
  if not found then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if not (private.rem_puede(v_row.company_id) or private.is_staff(array['enqora_admin', 'lawyer_pro'])) or private.is_staff(array['ai_agent']) then
    raise exception 'ENQ_SIN_PERMISO';
  end if;
  if v_row.estado = 'anulado' then raise exception 'ENQ_YA_DECIDIDA'; end if;
  if char_length(coalesce(trim(p_motivo), '')) < 3 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  update public.rem_contratos set estado = 'anulado', anulado_por = v_uid, anulado_at = now(), motivo_anulacion = left(trim(p_motivo), 300) where id = p_id;
  perform private.log_event(v_row.company_id, 'laboral.' || v_row.tipo || '_anulado', 'v' || v_row.version,
    jsonb_build_object('id', p_id, 'motivo', p_motivo, 'estaba', v_row.estado));
end
$$;

revoke execute on function private.rem_contrato_inmutable() from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array['public.rem_contrato_guardar(uuid, text, text, jsonb, text, jsonb, uuid)',
    'public.rem_contrato_revisar(uuid, text, text)', 'public.rem_contrato_anular(uuid, text)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$$;
