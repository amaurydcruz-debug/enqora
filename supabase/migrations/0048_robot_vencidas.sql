-- =====================================================================
-- ENQORA · 0048 · Robot investigador: investigaciones colgadas
-- Si la plataforma corta una investigación a mitad de camino, quedaba «en curso» para siempre hasta que alguien
-- abriera Centro de Mando → Investigador. Mientras tanto, ese RUT no podía investigarse de nuevo y la consulta
-- pública esperaba resultados que nunca llegarían.
-- Ahora una investigación en cola o en curso por más de 6 minutos se cierra como fallida automáticamente:
-- al encolar una nueva, en la tarea diaria y al consultar su estado.
-- Se puede ejecutar más de una vez.
-- =====================================================================
create or replace function private.research_vencer() returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare n integer;
begin
  update public.research_runs set status = 'fallida', finished_at = now(),
    error = coalesce(error, 'Interrumpida: la ejecución superó el tiempo máximo de la plataforma.')
  where status in ('en_cola', 'en_curso') and created_at < now() - interval '6 minutes';
  get diagnostics n = row_count;
  return n;
end
$$;

create or replace function public.svc_research_vencer(p_token text) returns integer
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  return private.research_vencer();
end
$$;
revoke execute on function public.svc_research_vencer(text) from public;
grant execute on function public.svc_research_vencer(text) to anon, authenticated;

-- Al encolar: primero se cierran las colgadas (así un RUT bloqueado vuelve a poder investigarse).
create or replace function public.svc_research_enqueue(p_token text, p_rut text, p_razon text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_rut text := private.normalize_rut(p_rut);
  v_run public.research_runs;
  v_id uuid;
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  if v_rut is null or not private.rut_is_valid(v_rut) then raise exception 'ENQ_RUT_INVALIDO'; end if;
  if split_part(v_rut, '-', 1)::bigint < 50000000 then return jsonb_build_object('estado', 'persona'); end if;
  perform private.research_vencer();
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

-- Estado público: una investigación colgada no se informa como «en curso».
create or replace function public.research_public_status(p_rut text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select case when r.status in ('en_cola', 'en_curso') and r.created_at > now() - interval '6 minutes' then 'en_curso'
                               when r.status in ('en_cola', 'en_curso') then 'ninguna' else 'lista' end
    from public.research_runs r
    where r.rut = p_rut and r.modo = 'investigacion' and (r.status in ('en_cola', 'en_curso') or (r.status = 'completada' and r.finished_at > now() - interval '30 days'))
    order by r.created_at desc limit 1), 'ninguna')
$$;
