-- 0094 · ENQORA Informa: al publicar (o publicar una actualización o rectificación) se avisa a los clientes.
-- Antes, publicar solo dejaba la novedad visible en /informa, sin notificación. Ahora:
--   · si la publicación tiene rubros, se avisa a dueños y administradores de las empresas de esos rubros;
--   · si no tiene rubros, a dueños y administradores de todas las empresas.
-- Categoría nueva «novedades» (cada persona la puede silenciar en Notificaciones). Un aviso por publicación,
-- versión y empresa (sin duplicados). Solo publica una persona del equipo: los agentes nunca publican (0058).

alter table public.notifications drop constraint if exists notifications_category_check;
alter table public.notifications add constraint notifications_category_check
  check (category in ('casos', 'cotizaciones', 'pagos', 'mandatos', 'equipo', 'cuenta', 'novedades'));

alter table public.notification_preferences drop constraint if exists notification_preferences_muted_check;
alter table public.notification_preferences add constraint notification_preferences_muted_check
  check (muted <@ array['casos', 'cotizaciones', 'pagos', 'mandatos', 'equipo', 'novedades']);

create or replace function private.info_avisar_publicacion() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_co record;
  v_prefijo text := case new.etapa when 'actualizado' then 'Actualización · ' when 'rectificado' then 'Rectificación · ' else '' end;
  v_hoy date := (now() at time zone 'America/Santiago')::date;
begin
  if new.etapa not in ('publicado', 'actualizado', 'rectificado') or not new.client_visible then return new; end if;
  if new.vigente_hasta is not null and new.vigente_hasta < v_hoy then return new; end if;
  for v_co in
    select c.id from public.companies c
    where cardinality(new.rubros) = 0
       or exists (select 1 from public.company_onboarding o where o.company_id = c.id and o.answers ->> 'actividad' = any (new.rubros))
  loop
    perform private.notify(private.company_users(v_co.id, array['owner', 'admin']), v_co.id, null, 'novedades',
      left('ENQORA Informa · ' || v_prefijo || new.title, 200),
      left(new.summary || coalesce(' Vigente desde el ' || to_char(new.vigente_desde, 'DD-MM-YYYY') || '.', ''), 500),
      '/informa/' || new.id, 'informa-' || new.id || '-v' || new.version || '-' || new.etapa || '-' || v_co.id);
  end loop;
  return new;
end
$$;
revoke execute on function private.info_avisar_publicacion() from public, anon;

drop trigger if exists info_avisar_publicacion on public.regulatory_updates;
-- Se avisa al pasar a publicado, actualizado o rectificado, y cuando una publicación ya visible cambia de versión
-- (corrección con motivo, 0058).
create trigger info_avisar_publicacion after update on public.regulatory_updates
  for each row when (new.etapa in ('publicado', 'actualizado', 'rectificado')
    and (old.etapa is distinct from new.etapa or old.version is distinct from new.version))
  execute function private.info_avisar_publicacion();
