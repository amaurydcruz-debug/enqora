-- 0096 · Computador del enjambre: cada agente tiene un computador Linux en la nube (contenedor de ejecución de código
-- de la API de Claude, sin acceso a internet) por caso, que conserva sus archivos y programas hasta 30 días, y carga
-- habilidades (método, programas y plantillas de ENQORA). Aquí se guarda:
--   · agente_computadores: el contenedor de cada agente en cada caso y qué documentos del expediente ya tiene copiados.
--   · agente_habilidades: las habilidades propias subidas a la API (identificador, versión y huella del contenido).
-- Los archivos que el agente crea quedan en el expediente como documentos internos (register_document, 0004).

create table if not exists public.agente_computadores (
  case_id uuid not null references public.cases (id) on delete cascade,
  agent text not null check (agent in ('tributario', 'contable', 'legal', 'financiero', 'investigador', 'estrategico')),
  container_id text not null check (container_id ~ '^[A-Za-z0-9_-]{6,120}$'),
  expira timestamptz,
  documentos uuid[] not null default '{}',
  ejecuciones int not null default 1,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  primary key (case_id, agent)
);
alter table public.agente_computadores enable row level security;
revoke all on public.agente_computadores from anon, authenticated;

create table if not exists public.agente_habilidades (
  nombre text primary key check (nombre ~ '^[a-z0-9-]{3,64}$'),
  skill_id text not null check (skill_id ~ '^[A-Za-z0-9_-]{6,120}$'),
  version text check (char_length(version) <= 120),
  huella text not null check (huella ~ '^[0-9a-f]{64}$'),
  actualizado timestamptz not null default now(),
  actualizado_por uuid references auth.users (id) on delete set null
);
alter table public.agente_habilidades enable row level security;
revoke all on public.agente_habilidades from anon, authenticated;
grant select on public.agente_habilidades to authenticated;
drop policy if exists agente_habilidades_equipo on public.agente_habilidades;
create policy agente_habilidades_equipo on public.agente_habilidades for select to authenticated using (private.is_staff());

-- Computador vigente del agente en el caso (o nada si no hay o venció).
create or replace function public.agente_computador_obtener(p_case uuid, p_agent text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v public.agente_computadores;
begin
  if not private.can_work_case(p_case) or private.is_staff(array['ai_agent']) then raise exception 'ENQ_SIN_PERMISO' using errcode = '42501'; end if;
  select * into v from public.agente_computadores where case_id = p_case and agent = p_agent;
  if not found or (v.expira is not null and v.expira < now() + interval '10 minutes') then return null; end if;
  return jsonb_build_object('container_id', v.container_id, 'expira', v.expira, 'documentos', to_jsonb(v.documentos), 'ejecuciones', v.ejecuciones);
end
$$;

create or replace function public.agente_computador_guardar(p_case uuid, p_agent text, p_container text, p_expira timestamptz, p_documentos uuid[])
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_work_case(p_case) or private.is_staff(array['ai_agent']) then raise exception 'ENQ_SIN_PERMISO' using errcode = '42501'; end if;
  if p_container !~ '^[A-Za-z0-9_-]{6,120}$' or cardinality(coalesce(p_documentos, '{}')) > 200 then raise exception 'ENQ_DATOS_INVALIDOS' using errcode = '22023'; end if;
  insert into public.agente_computadores (case_id, agent, container_id, expira, documentos)
  values (p_case, p_agent, p_container, p_expira, coalesce(p_documentos, '{}'))
  on conflict (case_id, agent) do update set
    ejecuciones = case when public.agente_computadores.container_id = excluded.container_id then public.agente_computadores.ejecuciones + 1 else 1 end,
    creado = case when public.agente_computadores.container_id = excluded.container_id then public.agente_computadores.creado else now() end,
    container_id = excluded.container_id, expira = excluded.expira, documentos = excluded.documentos, actualizado = now();
end
$$;

-- Registrar una habilidad subida a la API (supervisión).
create or replace function public.agente_habilidad_guardar(p_nombre text, p_skill text, p_version text, p_huella text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_supervisor() then raise exception 'ENQ_SIN_PERMISO' using errcode = '42501'; end if;
  insert into public.agente_habilidades (nombre, skill_id, version, huella, actualizado_por)
  values (p_nombre, p_skill, nullif(p_version, ''), p_huella, auth.uid())
  on conflict (nombre) do update set skill_id = excluded.skill_id, version = excluded.version, huella = excluded.huella,
    actualizado = now(), actualizado_por = excluded.actualizado_por;
  perform private.log_event(null, 'enjambre.habilidad', p_nombre, jsonb_build_object('skill', p_skill, 'version', p_version));
end
$$;

-- Resumen para el Centro de Mando.
create or replace function public.enjambre_estado() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not private.is_staff() then '{}'::jsonb else jsonb_build_object(
    'computadores_activos', (select count(*) from public.agente_computadores where expira is null or expira > now()),
    'por_agente', coalesce((select jsonb_object_agg(agent, n) from (select agent, count(*) n from public.agente_computadores
                   where expira is null or expira > now() group by agent) s), '{}'::jsonb),
    'ejecuciones_30d', (select coalesce(sum(ejecuciones), 0) from public.agente_computadores where actualizado > now() - interval '30 days'),
    'habilidades', coalesce((select jsonb_agg(jsonb_build_object('nombre', nombre, 'version', version, 'huella', huella, 'actualizado', actualizado) order by nombre)
                   from public.agente_habilidades), '[]'::jsonb)
  ) end
$$;

revoke execute on function public.agente_computador_obtener(uuid, text), public.agente_computador_guardar(uuid, text, text, timestamptz, uuid[]),
  public.agente_habilidad_guardar(text, text, text, text), public.enjambre_estado() from public, anon;
grant execute on function public.agente_computador_obtener(uuid, text), public.agente_computador_guardar(uuid, text, text, timestamptz, uuid[]),
  public.agente_habilidad_guardar(text, text, text, text), public.enjambre_estado() to authenticated;
