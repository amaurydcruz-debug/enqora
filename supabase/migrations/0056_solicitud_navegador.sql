-- =====================================================================
-- ENQORA · 0056 · Solicitud por WhatsApp → cuenta (mismo navegador)
-- Hasta ahora, solo las solicitudes por CORREO se unían solas a la cuenta (0043, por el mismo correo verificado).
-- Las de WhatsApp quedaban sueltas hasta que el equipo las unía a mano con el código SOL-XXXXXX.
-- Ahora: al enviar la solicitud, el navegador guarda su identificador (cookie httpOnly, 24 horas). Si la persona
-- crea su cuenta en ese mismo navegador y entra a su servicio, la solicitud se une a su cuenta y la cookie se borra.
-- Seguridad: el identificador es un UUID aleatorio que nunca se muestra; solo une solicitudes sin cuenta y de
-- menos de 24 horas; queda marcado vinculada_via = 'navegador' para que el equipo lo confirme con la persona
-- (por ejemplo, en un computador compartido). Se puede ejecutar más de una vez.
-- =====================================================================
alter table private.solicitudes_caso add column if not exists vinculada_via text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'solicitudes_caso_vinculada_via_chk') then
    alter table private.solicitudes_caso add constraint solicitudes_caso_vinculada_via_chk
      check (vinculada_via is null or vinculada_via in ('correo', 'navegador', 'equipo'));
  end if;
end $$;

create or replace function public.vincular_solicitud_navegador(p_id uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or p_id is null then return false; end if;
  update private.solicitudes_caso
     set user_id = v_uid, vinculada = now(), vinculada_via = 'navegador', actualizada = now()
   where id = p_id and user_id is null and creada > now() - interval '24 hours';
  return found;
end
$$;

revoke execute on function public.vincular_solicitud_navegador(uuid) from public, anon;
grant execute on function public.vincular_solicitud_navegador(uuid) to authenticated;
