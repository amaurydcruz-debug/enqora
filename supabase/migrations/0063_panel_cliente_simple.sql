-- =====================================================================
-- ENQORA · 0063 · Panel del cliente simple: «Mis trámites»
-- 1) Una solicitud que el cliente envía con su sesión iniciada queda unida a su cuenta al instante (y a su
--    empresa, si el RUT es de una empresa de la que es integrante). Antes se unía después, solo por correo.
-- 2) public.mis_solicitudes(): el cliente ve sus propias solicitudes (código, área, estado, fecha y caso),
--    sin el relato completo ni datos de contacto. Nada más.
-- Se puede ejecutar más de una vez.
-- =====================================================================

create or replace function private.solicitud_con_sesion() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is not null and new.user_id is null then
    new.user_id := v_uid;
    new.vinculada := now();
    if new.rut is not null and new.company_id is null then
      select c.id into new.company_id from public.companies c join public.company_members m on m.company_id = c.id
        where m.user_id = v_uid and replace(replace(lower(c.rut), '.', ''), '-', '') = replace(replace(lower(new.rut), '.', ''), '-', '')
        limit 1;
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists solicitudes_caso_sesion on private.solicitudes_caso;
create trigger solicitudes_caso_sesion before insert on private.solicitudes_caso for each row execute function private.solicitud_con_sesion();

create or replace function public.mis_solicitudes() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'codigo', s.referencia, 'estado', s.estado, 'creada', s.creada,
      'areas', coalesce(s.analisis -> 'categorias', '[]'::jsonb),
      'resumen', left(coalesce(s.analisis ->> 'resumen', ''), 240),
      'caso', c.id, 'folio', c.folio)
    order by s.creada desc), '[]'::jsonb)
  from (select * from private.solicitudes_caso where user_id = (select auth.uid()) order by creada desc limit 20) s
  left join public.cases c on c.id = s.case_id
$$;

revoke execute on function private.solicitud_con_sesion() from public, anon, authenticated;
revoke execute on function public.mis_solicitudes() from public, anon;
grant execute on function public.mis_solicitudes() to authenticated;
