-- =====================================================================
-- ENQORA · 0045 · Casos: coherencia del ciclo y vigilancia diaria
-- 1) Ningún caso pasa a «En ejecución» sin una autorización del cliente vigente. Antes el equipo podía mover
--    el estado a mano y saltarse la autorización (las actuaciones sí la exigían, el estado no).
-- 2) Si el cliente ya autorizó pero faltaban sus documentos legales, al firmar el último el caso pasa solo a
--    «En ejecución» (antes quedaba detenido hasta que alguien lo moviera).
-- 3) Vigilancia diaria (tarea de las 08:00): casos sin responsable por más de 24 horas → aviso a la
--    supervisión; casos vencidos → aviso al responsable. Un aviso por caso y por día.
-- Se puede ejecutar más de una vez.
-- =====================================================================

-- ¿Tiene el caso al menos una autorización del cliente vigente?
create or replace function private.autorizacion_vigente(p_case uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.client_authorizations a
    where a.case_id = p_case and a.status = 'autorizada'
      and (a.valid_until is null or a.valid_until >= (now() at time zone 'America/Santiago')::date))
$$;

create or replace function private.on_case_execution_gate() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'en_ejecucion' and old.status is distinct from 'en_ejecucion' and not private.autorizacion_vigente(new.id) then
    raise exception 'ENQ_SIN_AUTORIZACION_VIGENTE';
  end if;
  return new;
end
$$;
drop trigger if exists cases_execution_gate on public.cases;
create trigger cases_execution_gate before update of status on public.cases
  for each row execute function private.on_case_execution_gate();

-- Al firmar un documento legal: los casos de la empresa que esperaban solo por las firmas avanzan solos.
create or replace function private.on_legal_signature_advance() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  c record;
begin
  for c in
    select x.id, x.status from public.cases x
    where x.company_id = new.company_id and x.status = 'autorizacion_cliente'
      and (new.case_id is null or x.id = new.case_id)
      and not exists (select 1 from public.client_authorizations a where a.case_id = x.id and a.status = 'pendiente')
      and private.autorizacion_vigente(x.id)
      and coalesce(array_length(private.legal_missing(x.id), 1), 0) = 0
  loop
    update public.cases set status = 'en_ejecucion', updated_at = now() where id = c.id;
    perform private.log_case(c.id, 'estado', 'Documentos legales firmados: el trabajo autorizado comienza.', 'cliente',
      jsonb_build_object('de', c.status, 'a', 'en_ejecucion'));
  end loop;
  return new;
end
$$;
drop trigger if exists legal_signatures_advance on public.legal_signatures;
create trigger legal_signatures_advance after insert on public.legal_signatures
  for each row execute function private.on_legal_signature_advance();

-- Vigilancia diaria de casos.
create or replace function public.svc_casos_vigilar(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_hoy date := (now() at time zone 'America/Santiago')::date;
  c record;
  n_sin integer := 0;
  n_venc integer := 0;
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  for c in
    select x.id, x.folio, x.title, x.company_id, x.created_at from public.cases x
    where x.responsible_id is null and x.status not in ('cerrado', 'cancelado') and x.created_at < now() - interval '24 hours'
  loop
    perform private.notify(private.staff_users(array['ops_director', 'enqora_admin']), c.company_id, c.id, 'equipo',
      'Caso sin responsable · ' || c.folio,
      c.title || ' · lleva ' || greatest(1, extract(day from now() - c.created_at)::int) || ' día(s) sin responsable.',
      '/casos/' || c.id, 'sinresp-' || c.id || '-' || v_hoy);
    n_sin := n_sin + 1;
  end loop;
  for c in
    select x.id, x.folio, x.title, x.company_id, x.responsible_id, x.due_date from public.cases x
    where x.due_date < v_hoy and x.status not in ('cerrado', 'cancelado')
  loop
    perform private.notify(
      coalesce(case when c.responsible_id is not null then array[c.responsible_id] end, private.staff_users(array['ops_director', 'enqora_admin'])),
      c.company_id, c.id, 'equipo', 'Caso vencido · ' || c.folio,
      c.title || ' · venció el ' || to_char(c.due_date, 'DD-MM-YYYY') || '.', '/casos/' || c.id, 'vencido-' || c.id || '-' || v_hoy);
    n_venc := n_venc + 1;
  end loop;
  return jsonb_build_object('sin_responsable', n_sin, 'vencidos', n_venc);
end
$$;
revoke execute on function public.svc_casos_vigilar(text) from public;
grant execute on function public.svc_casos_vigilar(text) to anon, authenticated;
