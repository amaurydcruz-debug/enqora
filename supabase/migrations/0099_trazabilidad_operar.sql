-- 0099 · Trazabilidad del equipo al operar empresas. «Operar» NO es entrar a la sesión del cliente: la persona del
-- equipo usa su propia sesión y ve los datos de la empresa con los permisos del servicio (private.works_company).
-- Aquí se registra cada entrada (con la pantalla de destino) y cada salida, y se consulta el historial:
--   · cada persona del equipo ve sus propios accesos;
--   · supervisión y administración ven los de todo el equipo.

create or replace function public.log_operacion(p_company uuid, p_accion text, p_destino text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_session();
  if not private.is_staff() or private.is_staff(array['ai_agent']) then raise exception 'ENQ_SIN_PERMISO' using errcode = '42501'; end if;
  if p_accion not in ('entrar', 'salir') or char_length(coalesce(p_destino, '')) > 120 then raise exception 'ENQ_DATOS_INVALIDOS' using errcode = '22023'; end if;
  if p_accion = 'entrar' and not private.works_company(p_company) then raise exception 'ENQ_SIN_PERMISO' using errcode = '42501'; end if;
  perform private.log_event(p_company, 'equipo.operar.' || p_accion, nullif(p_destino, ''), '{}'::jsonb);
end
$$;

create or replace function public.accesos_operacion(p_limite int default 100) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not private.is_staff() or private.is_staff(array['ai_agent']) then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object(
      'fecha', e.created_at, 'accion', e.action, 'destino', e.target, 'empresa', e.company_id,
      'empresa_nombre', coalesce(c.trade_name, c.legal_name), 'prueba', coalesce(c.es_prueba, false),
      'persona', coalesce(p.full_name, 'Equipo'), 'propio', e.actor_id = auth.uid()) order by e.created_at desc)
    from (select * from public.audit_events a
          where a.action in ('equipo.operar_empresa', 'equipo.operar.entrar', 'equipo.operar.salir')
            and (a.actor_id = auth.uid() or private.is_supervisor())
          order by a.created_at desc limit least(greatest(coalesce(p_limite, 100), 1), 500)) e
    left join public.companies c on c.id = e.company_id
    left join public.profiles p on p.id = e.actor_id), '[]'::jsonb) end
$$;

revoke execute on function public.log_operacion(uuid, text, text), public.accesos_operacion(int) from public, anon;
grant execute on function public.log_operacion(uuid, text, text), public.accesos_operacion(int) to authenticated;
