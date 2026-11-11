-- =====================================================================
-- ENQORA · 0041 · El robot investigador trabaja en cada consulta de empresa
-- Cuando alguien consulta el RUT de una EMPRESA (persona jurídica) y no hay una investigación reciente,
-- se lanza sola una investigación en los portales oficiales (cada portal es un agente que trabaja en
-- paralelo). Para personas naturales NUNCA se lanza (regla de privacidad).
-- Las investigaciones automáticas se escriben con la clave de servicio ENQORA (sin la clave service_role) y
-- tienen límites: una por RUT cada 7 días y como máximo 12 por hora en total, para no cargar los portales.
-- Las automáticas no guardan captura (la captura queda para las que lanza el equipo).
-- Se puede ejecutar más de una vez.
-- =====================================================================
alter table public.research_runs add column if not exists origen text not null default 'equipo';
alter table public.research_runs drop constraint if exists research_runs_origen_check;
alter table public.research_runs add constraint research_runs_origen_check check (origen in ('equipo', 'consulta'));

-- Encola (o informa la que ya existe). Devuelve {estado: nueva | en_curso | reciente | limite | persona, id}.
create or replace function public.svc_research_enqueue(p_token text, p_rut text, p_razon text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_rut text := private.normalize_rut(p_rut);
  v_run public.research_runs;
  v_id uuid;
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  if v_rut is null or not private.rut_is_valid(v_rut) then raise exception 'ENQ_RUT_INVALIDO'; end if;
  -- Personas naturales: nunca (privacidad).
  if split_part(v_rut, '-', 1)::bigint < 50000000 then return jsonb_build_object('estado', 'persona'); end if;
  select * into v_run from public.research_runs
  where rut = v_rut and modo = 'investigacion' and (status in ('en_cola', 'en_curso') or (status = 'completada' and finished_at > now() - interval '7 days'))
  order by created_at desc limit 1;
  if found then
    return jsonb_build_object('estado', case when v_run.status = 'completada' then 'reciente' else 'en_curso' end, 'id', v_run.id);
  end if;
  if (select count(*) from public.research_runs where origen = 'consulta' and created_at > now() - interval '1 hour') >= 12 then
    return jsonb_build_object('estado', 'limite');
  end if;
  insert into public.research_runs (rut, razon_social, modo, status, requested_by, origen)
  values (v_rut, left(nullif(trim(coalesce(p_razon, '')), ''), 200), 'investigacion', 'en_cola', null, 'consulta')
  returning id into v_id;
  return jsonb_build_object('estado', 'nueva', 'id', v_id);
end
$$;

-- Toma una investigación automática en cola (la marca en curso). Devuelve sus datos o null.
create or replace function public.svc_research_claim(p_token text, p_run uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_run public.research_runs;
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  update public.research_runs set status = 'en_curso', started_at = now()
  where id = p_run and status = 'en_cola' and origen = 'consulta'
  returning * into v_run;
  if not found then return null; end if;
  return jsonb_build_object('id', v_run.id, 'rut', v_run.rut, 'razon_social', v_run.razon_social, 'modo', v_run.modo);
end
$$;

create or replace function public.svc_research_evidence(p_token text, p_run uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  if not exists (select 1 from public.research_runs where id = p_run and status = 'en_curso' and origen = 'consulta') then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  insert into public.research_evidence (run_id, portal, procedure_version, query, url, status, result, screenshot_path, duration_ms, detail)
  values (p_run, left(p ->> 'portal', 60), left(p ->> 'procedure_version', 40), coalesce(p -> 'query', '{}'::jsonb),
          left(coalesce(p ->> 'url', ''), 500), p ->> 'status', p -> 'result', null,
          greatest(coalesce((p ->> 'duration_ms')::integer, 0), 0), left(p ->> 'detail', 1000));
end
$$;

create or replace function public.svc_research_finish(p_token text, p_run uuid, p_status text, p_metrics jsonb, p_error text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  if p_status not in ('completada', 'fallida') then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  update public.research_runs set status = p_status, finished_at = now(), metrics = p_metrics, error = left(p_error, 1000)
  where id = p_run and status = 'en_curso' and origen = 'consulta';
end
$$;

-- Estado público de la investigación de un RUT de empresa (para que la consulta sepa si esperar resultados).
create or replace function public.research_public_status(p_rut text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select case when r.status in ('en_cola', 'en_curso') then 'en_curso' else 'lista' end
    from public.research_runs r
    where r.rut = p_rut and r.modo = 'investigacion' and (r.status in ('en_cola', 'en_curso') or (r.status = 'completada' and r.finished_at > now() - interval '30 days'))
    order by r.created_at desc limit 1), 'ninguna')
$$;

revoke execute on function public.svc_research_enqueue(text, text, text), public.svc_research_claim(text, uuid),
  public.svc_research_evidence(text, uuid, jsonb), public.svc_research_finish(text, uuid, text, jsonb, text),
  public.research_public_status(text) from public;
grant execute on function public.svc_research_enqueue(text, text, text), public.svc_research_claim(text, uuid),
  public.svc_research_evidence(text, uuid, jsonb), public.svc_research_finish(text, uuid, text, jsonb, text),
  public.research_public_status(text) to anon, authenticated;
