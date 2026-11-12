-- =====================================================================
-- ENQORA · 0049 · Registro de uso de IA en TODOS los módulos
-- Antes solo quedaban registradas las ejecuciones de los agentes de casos (agent_runs). Las llamadas de la
-- consulta pública (Consulta Estratégica, «Tu caso»), la lectura de Carpetas Tributarias, el asesor de precios,
-- la vigilancia normativa, el laboratorio y la escuela no dejaban rastro: no se veían su costo, sus fallas
-- ni un uso anómalo.
-- Ahora cada llamada deja una fila con módulo, proveedor, modelo, tokens, búsquedas web, duración y resultado.
-- NUNCA se guarda el contenido (ni preguntas, ni respuestas, ni documentos).
-- Se puede ejecutar más de una vez.
-- =====================================================================
create table if not exists private.ai_usage (
  id bigserial primary key,
  creado timestamptz not null default now(),
  modulo text not null check (char_length(modulo) between 2 and 40),
  proveedor text,
  modelo text,
  entrada integer not null default 0 check (entrada >= 0),
  salida integer not null default 0 check (salida >= 0),
  busquedas integer not null default 0 check (busquedas >= 0),
  ms integer not null default 0 check (ms >= 0),
  ok boolean not null,
  motivo text
);
create index if not exists ai_usage_creado_idx on private.ai_usage (creado desc);
alter table private.ai_usage enable row level security;

create or replace function public.svc_registrar_uso_ia(p_token text, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  insert into private.ai_usage (modulo, proveedor, modelo, entrada, salida, busquedas, ms, ok, motivo)
  values (left(coalesce(p ->> 'modulo', 'otro'), 40), left(p ->> 'proveedor', 20), left(p ->> 'modelo', 80),
    greatest(coalesce((p ->> 'entrada')::integer, 0), 0), greatest(coalesce((p ->> 'salida')::integer, 0), 0),
    greatest(coalesce((p ->> 'busquedas')::integer, 0), 0), greatest(coalesce((p ->> 'ms')::integer, 0), 0),
    coalesce((p ->> 'ok')::boolean, false), left(p ->> 'motivo', 300));
end
$$;

-- Resumen para el equipo: por módulo y proveedor, en los últimos N días.
create or replace function public.ia_uso_resumen(p_dias integer default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_session();
  if not private.is_staff() then raise exception 'ENQ_SIN_PERMISO'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.llamadas desc) from (
      select modulo, coalesce(proveedor, '—') as proveedor, coalesce(max(modelo), '—') as modelo,
        count(*)::int as llamadas, count(*) filter (where not ok)::int as fallidas,
        sum(entrada)::bigint as entrada, sum(salida)::bigint as salida, sum(busquedas)::int as busquedas,
        round(avg(ms))::int as ms_promedio, max(creado) as ultima,
        (array_agg(motivo order by creado desc) filter (where not ok and motivo is not null))[1] as ultimo_motivo
      from (
        select creado, modulo, proveedor, modelo, entrada, salida, busquedas, ms, ok, motivo from private.ai_usage
        union all
        -- Los agentes de casos ya registraban su uso en agent_runs: se suman aquí para ver todo junto.
        select created_at, 'agentes_casos', 'anthropic', model, coalesce(input_tokens, 0), coalesce(output_tokens, 0),
          coalesce(web_searches, 0), coalesce((extract(epoch from (finished_at - created_at)) * 1000)::int, 0),
          status = 'completada', error
        from public.agent_runs where status <> 'en_curso'
      ) u
      where creado > now() - make_interval(days => least(greatest(coalesce(p_dias, 30), 1), 365))
      group by modulo, coalesce(proveedor, '—')
    ) x), '[]'::jsonb);
end
$$;
revoke execute on function public.svc_registrar_uso_ia(text, jsonb), public.ia_uso_resumen(integer) from public;
grant execute on function public.svc_registrar_uso_ia(text, jsonb) to anon, authenticated;
grant execute on function public.ia_uso_resumen(integer) to authenticated;
