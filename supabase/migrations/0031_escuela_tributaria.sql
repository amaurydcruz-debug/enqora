-- =====================================================================
-- ENQORA · 0031 · Escuela Tributaria (piloto) · memoria académica
-- Guarda cada examen de la escuela (comparado con el agente individual), el detalle de cada misión
-- (alumnos, tribunal, errores, tokens, tiempo y costo) y las estrategias que el tribunal propone.
-- Gobernanza: ninguna estrategia se usa hasta que una persona de supervisión la aprueba; una estrategia
-- aprobada puede revertirse. Solo hay misiones ficticias: aquí no entra ningún dato de clientes.
-- Solo supervisión y administración leen y escriben. Se puede ejecutar más de una vez.
-- =====================================================================

create table if not exists private.escuela_examenes (
  id uuid primary key default gen_random_uuid(),
  escuela text not null default 'tributaria',
  creado timestamptz not null default now(),
  creado_por uuid,
  proveedor text not null,
  modelo text not null,
  tribunal_proveedor text not null,
  tribunal_modelo text not null,
  independencia text not null,
  version_conocimiento text not null,
  total integer not null check (total > 0),
  aciertos_escuela integer not null check (aciertos_escuela between 0 and total),
  aciertos_agente integer not null check (aciertos_agente between 0 and total),
  tokens_escuela integer not null default 0,
  tokens_agente integer not null default 0,
  ms_escuela integer not null default 0,
  ms_agente integer not null default 0,
  costo_escuela numeric,
  costo_agente numeric,
  presupuesto jsonb not null default '{}'::jsonb
);
create index if not exists escuela_examenes_creado_idx on private.escuela_examenes (escuela, creado desc);
alter table private.escuela_examenes enable row level security;

create table if not exists private.escuela_misiones (
  id uuid primary key default gen_random_uuid(),
  examen_id uuid not null references private.escuela_examenes (id) on delete cascade,
  mision text not null,
  problema text not null,
  complejidad text not null check (complejidad in ('simple', 'media', 'compleja')),
  esperado text not null,
  respuesta_escuela text not null,
  correcto_escuela boolean not null,
  correcto_agente boolean not null,
  alumnos jsonb not null default '[]'::jsonb,
  tribunal jsonb not null default '{}'::jsonb,
  agente jsonb not null default '{}'::jsonb,
  errores_detectados integer not null default 0,
  tokens integer not null default 0,
  ms integer not null default 0,
  costo numeric
);
create index if not exists escuela_misiones_examen_idx on private.escuela_misiones (examen_id);
alter table private.escuela_misiones enable row level security;

create table if not exists private.escuela_estrategias (
  id uuid primary key default gen_random_uuid(),
  escuela text not null default 'tributaria',
  texto text not null check (char_length(texto) between 20 and 300),
  version integer not null default 1,
  estado text not null default 'propuesta' check (estado in ('propuesta', 'aprobada', 'descartada', 'revertida')),
  examen_id uuid references private.escuela_examenes (id) on delete set null,
  mision text,
  propuesta timestamptz not null default now(),
  decidida timestamptz,
  decidida_por uuid,
  nota text check (char_length(nota) <= 500)
);
create index if not exists escuela_estrategias_estado_idx on private.escuela_estrategias (escuela, estado, propuesta desc);
alter table private.escuela_estrategias enable row level security;

-- Registra un examen completo y las lecciones propuestas por el tribunal (quedan «propuesta»).
create or replace function public.escuela_registrar_examen(p jsonb) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid; m jsonb; l jsonb; v_texto text; v_version integer;
begin
  if not private.is_supervisor() then raise exception 'ENQ_SIN_PERMISO'; end if;
  insert into private.escuela_examenes (escuela, creado_por, proveedor, modelo, tribunal_proveedor, tribunal_modelo, independencia,
    version_conocimiento, total, aciertos_escuela, aciertos_agente, tokens_escuela, tokens_agente, ms_escuela, ms_agente,
    costo_escuela, costo_agente, presupuesto)
  values ('tributaria', (select auth.uid()), left(p ->> 'proveedor', 20), left(p ->> 'modelo', 120), left(p ->> 'tribunal_proveedor', 20),
    left(p ->> 'tribunal_modelo', 120), left(p ->> 'independencia', 200), left(p ->> 'version_conocimiento', 40),
    (p ->> 'total')::int, (p ->> 'aciertos_escuela')::int, (p ->> 'aciertos_agente')::int,
    coalesce((p ->> 'tokens_escuela')::int, 0), coalesce((p ->> 'tokens_agente')::int, 0),
    coalesce((p ->> 'ms_escuela')::int, 0), coalesce((p ->> 'ms_agente')::int, 0),
    (p ->> 'costo_escuela')::numeric, (p ->> 'costo_agente')::numeric, coalesce(p -> 'presupuesto', '{}'::jsonb))
  returning id into v_id;

  for m in select * from jsonb_array_elements(coalesce(p -> 'misiones', '[]'::jsonb)) loop
    insert into private.escuela_misiones (examen_id, mision, problema, complejidad, esperado, respuesta_escuela, correcto_escuela,
      correcto_agente, alumnos, tribunal, agente, errores_detectados, tokens, ms, costo)
    values (v_id, left(m ->> 'mision', 20), left(m ->> 'problema', 2000), m ->> 'complejidad', left(m ->> 'esperado', 400),
      left(m ->> 'respuesta_escuela', 200), (m ->> 'correcto_escuela')::boolean, (m -> 'agente' ->> 'correcto')::boolean,
      coalesce(m -> 'alumnos', '[]'::jsonb), coalesce(m -> 'tribunal', '{}'::jsonb), coalesce(m -> 'agente', '{}'::jsonb),
      coalesce((m ->> 'errores_detectados')::int, 0), coalesce((m ->> 'tokens_escuela')::int, 0),
      coalesce((m ->> 'ms_escuela')::int, 0), (m ->> 'costo_escuela')::numeric);
  end loop;

  for l in select * from jsonb_array_elements(coalesce(p -> 'lecciones', '[]'::jsonb)) loop
    v_texto := btrim(left(l ->> 'texto', 300));
    continue when char_length(v_texto) < 20;
    -- No duplicar una estrategia vigente (propuesta o aprobada). Si estaba revertida o descartada, vuelve como nueva versión.
    continue when exists (select 1 from private.escuela_estrategias e where e.escuela = 'tributaria' and lower(e.texto) = lower(v_texto) and e.estado in ('propuesta', 'aprobada'));
    select coalesce(max(e.version), 0) + 1 into v_version from private.escuela_estrategias e where e.escuela = 'tributaria' and lower(e.texto) = lower(v_texto);
    insert into private.escuela_estrategias (escuela, texto, version, examen_id, mision) values ('tributaria', v_texto, v_version, v_id, left(l ->> 'mision', 20));
  end loop;
  return v_id;
exception
  when check_violation or not_null_violation or invalid_text_representation then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

-- Resumen para el Laboratorio: últimos exámenes, ranking de alumnos por enfoque y estrategias.
create or replace function public.escuela_resumen() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_supervisor() then raise exception 'ENQ_SIN_PERMISO'; end if;
  return jsonb_build_object(
    'examenes', coalesce((select jsonb_agg(to_jsonb(x) order by x.creado desc) from (
      select id, creado, proveedor, modelo, tribunal_proveedor, tribunal_modelo, independencia, version_conocimiento, total,
             aciertos_escuela, aciertos_agente, tokens_escuela, tokens_agente, ms_escuela, ms_agente, costo_escuela, costo_agente
      from private.escuela_examenes where escuela = 'tributaria' order by creado desc limit 10) x), '[]'::jsonb),
    'ranking', coalesce((select jsonb_agg(to_jsonb(r) order by r.aciertos::numeric / greatest(r.misiones, 1) desc, r.misiones desc) from (
      select a ->> 'perspectiva' as perspectiva, count(*)::int as misiones,
             count(*) filter (where (a ->> 'correcto')::boolean)::int as aciertos,
             round(avg(nullif(a ->> 'puntaje', '')::numeric), 1) as puntaje_promedio,
             round(avg((a ->> 'tokens')::numeric))::int as tokens_promedio
      from private.escuela_misiones m
      join private.escuela_examenes e on e.id = m.examen_id and e.escuela = 'tributaria'
      cross join lateral jsonb_array_elements(m.alumnos) a
      group by 1) r), '[]'::jsonb),
    'estrategias', coalesce((select jsonb_agg(to_jsonb(s) order by s.propuesta desc) from (
      select id, texto, version, estado, mision, propuesta, decidida, nota
      from private.escuela_estrategias where escuela = 'tributaria' order by propuesta desc limit 60) s), '[]'::jsonb)
  );
end
$$;

-- Decisión humana sobre una estrategia: aprobar, descartar o revertir una aprobada.
create or replace function public.escuela_estrategia_decidir(p_id uuid, p_estado text, p_nota text default null) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_actual text;
begin
  if not private.is_supervisor() then raise exception 'ENQ_SIN_PERMISO'; end if;
  select estado into v_actual from private.escuela_estrategias where id = p_id for update;
  if not found then raise exception 'ENQ_NO_ENCONTRADO'; end if;
  if not ((v_actual = 'propuesta' and p_estado in ('aprobada', 'descartada')) or (v_actual = 'aprobada' and p_estado = 'revertida')) then
    raise exception 'ENQ_YA_DECIDIDA';
  end if;
  update private.escuela_estrategias
     set estado = p_estado, decidida = now(), decidida_por = (select auth.uid()), nota = nullif(btrim(left(coalesce(p_nota, ''), 500)), '')
   where id = p_id;
end
$$;

-- Estrategias aprobadas: memoria que reciben los alumnos en los siguientes exámenes.
create or replace function public.escuela_estrategias_aprobadas() returns setof text
language sql stable security definer set search_path = '' as $$
  select e.texto from private.escuela_estrategias e
  where private.is_supervisor() and e.escuela = 'tributaria' and e.estado = 'aprobada'
  order by e.decidida desc limit 20;
$$;

revoke execute on function public.escuela_registrar_examen(jsonb) from public;
revoke execute on function public.escuela_resumen() from public;
revoke execute on function public.escuela_estrategia_decidir(uuid, text, text) from public;
revoke execute on function public.escuela_estrategias_aprobadas() from public;
grant execute on function public.escuela_registrar_examen(jsonb) to authenticated;
grant execute on function public.escuela_resumen() to authenticated;
grant execute on function public.escuela_estrategia_decidir(uuid, text, text) to authenticated;
grant execute on function public.escuela_estrategias_aprobadas() to authenticated;
