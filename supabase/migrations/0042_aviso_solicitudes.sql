-- =====================================================================
-- ENQORA · 0042 · Aviso al equipo cuando llega una solicitud pública
-- Cada solicitud nueva («Quiero esta solución» / «Tu caso») avisa al equipo ENQORA (Administrador,
-- Dirección de operaciones y profesionales) en la plataforma y, según sus preferencias, por correo y
-- WhatsApp. El aviso no incluye el contacto ni el relato: solo el nombre y el enlace a la bandeja.
-- Se puede ejecutar más de una vez.
-- =====================================================================
create or replace function private.on_solicitud_caso_nueva() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.notify(
    (select array_agg(s.user_id) from public.staff_members s
      where s.active and s.role in ('enqora_admin', 'ops_director', 'accountant_pro', 'lawyer_pro')),
    null, null, 'equipo',
    'Nueva solicitud: ' || left(new.nombre, 80),
    'Responder dentro de 24 horas hábiles por ' || case when new.canal = 'whatsapp' then 'WhatsApp' else 'correo' end || '.',
    '/mando/solicitudes', 'solicitud-' || new.id);
  return new;
end
$$;
drop trigger if exists solicitudes_caso_aviso on private.solicitudes_caso;
create trigger solicitudes_caso_aviso after insert on private.solicitudes_caso
  for each row execute function private.on_solicitud_caso_nueva();
