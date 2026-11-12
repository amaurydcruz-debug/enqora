-- =====================================================================
-- ENQORA · 0051 · Notificaciones: entrega coherente
--  1. Los avisos de la cuenta (categoría «cuenta»: seguridad y derechos sobre datos) se envían siempre por correo,
--     como promete la pantalla de Notificaciones. Antes, quien apagaba el correo no los recibía.
--  2. Si un canal (correo o WhatsApp) no está configurado en Vercel, sus envíos ya no se gastan en 5 intentos
--     fallidos: quedan pendientes hasta que se configure (o vencen a los 3 días como «omitido»).
--  3. Envíos sin destinatario posible (sin correo, o WhatsApp sin número verificado) se marcan «omitido» de
--     inmediato, en vez de quedar bloqueados reintentándose.
--  4. Resumen de entregas para el equipo: enviados, pendientes, fallidos y omitidos por canal, con el último error.
-- Se puede ejecutar más de una vez.
-- =====================================================================

create or replace function private.notify(
  p_users uuid[], p_company uuid, p_case uuid, p_category text, p_title text, p_body text, p_link text, p_dedupe text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_user uuid;
  v_id bigint;
  v_pref public.notification_preferences;
begin
  for v_user in select distinct u from unnest(coalesce(p_users, '{}')) u where u is not null and u is distinct from v_actor loop
    insert into public.notifications (user_id, company_id, case_id, category, title, body, link, dedupe_key)
    values (v_user, p_company, p_case, p_category, left(p_title, 200), left(p_body, 500), p_link, p_dedupe)
    on conflict (user_id, dedupe_key) do nothing
    returning id into v_id;
    continue when v_id is null;

    select * into v_pref from public.notification_preferences where user_id = v_user;
    -- Los avisos de la cuenta (seguridad, derechos sobre datos) llegan siempre por correo: no se pueden silenciar.
    if p_category = 'cuenta' then
      insert into public.notification_deliveries (notification_id, channel) values (v_id, 'email');
    elsif not (p_category = any (coalesce(v_pref.muted, '{}'))) then
      if coalesce(v_pref.email, true) then
        insert into public.notification_deliveries (notification_id, channel) values (v_id, 'email');
      end if;
      if coalesce(v_pref.whatsapp, false) and v_pref.phone_verified_at is not null then
        insert into public.notification_deliveries (notification_id, channel) values (v_id, 'whatsapp');
      end if;
    end if;
    v_id := null;
  end loop;
end
$$;

drop function if exists public.claim_deliveries(text, integer);
create or replace function public.claim_deliveries(p_token text, p_limit integer default 20, p_channels text[] default null)
returns table (id bigint, channel text, recipient text, title text, body text, link text)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  -- Sin destinatario posible: se omite de inmediato (no se reintenta).
  update public.notification_deliveries d set status = 'omitido', last_error = 'Sin destinatario: correo inexistente o WhatsApp sin número verificado'
  from public.notifications n
  join auth.users u on u.id = n.user_id
  left join public.notification_preferences p on p.user_id = n.user_id
  where d.notification_id = n.id and d.status = 'pendiente'
    and ((d.channel = 'email' and u.email is null)
      or (d.channel = 'whatsapp' and (p.phone is null or p.phone_verified_at is null or not coalesce(p.whatsapp, false))));

  return query
  with picked as (
    select d.id from public.notification_deliveries d
    where d.status = 'pendiente' and (d.locked_at is null or d.locked_at < now() - interval '5 minutes') and d.attempts < 5
      and d.created_at > now() - interval '3 days'
      and (p_channels is null or d.channel = any (p_channels))
    order by d.created_at
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
    for update skip locked
  ), upd as (
    update public.notification_deliveries d set locked_at = now(), attempts = d.attempts + 1
    from picked where d.id = picked.id
    returning d.id, d.channel, d.notification_id
  )
  select upd.id, upd.channel,
    case upd.channel when 'email' then u.email::text else p.phone end,
    n.title, n.body, n.link
  from upd
  join public.notifications n on n.id = upd.notification_id
  join auth.users u on u.id = n.user_id
  left join public.notification_preferences p on p.user_id = n.user_id;
end
$$;
revoke execute on function public.claim_deliveries(text, integer, text[]) from public;
grant execute on function public.claim_deliveries(text, integer, text[]) to anon, authenticated;

-- Resumen de entregas (equipo), últimos N días.
create or replace function public.avisos_entregas(p_dias integer default 7) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_session();
  if not private.is_staff() then raise exception 'ENQ_SIN_PERMISO'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.canal) from (
    select d.channel as canal,
      count(*) filter (where d.status = 'enviado')::int as enviados,
      count(*) filter (where d.status = 'pendiente')::int as pendientes,
      count(*) filter (where d.status = 'fallido')::int as fallidos,
      count(*) filter (where d.status = 'omitido')::int as omitidos,
      max(d.sent_at) as ultimo_envio,
      (array_agg(d.last_error order by d.created_at desc) filter (where d.last_error is not null and d.status <> 'enviado'))[1] as ultimo_error
    from public.notification_deliveries d
    where d.created_at > now() - make_interval(days => least(greatest(coalesce(p_dias, 7), 1), 90))
    group by d.channel) x), '[]'::jsonb);
end
$$;
revoke execute on function public.avisos_entregas(integer) from public;
grant execute on function public.avisos_entregas(integer) to authenticated;
