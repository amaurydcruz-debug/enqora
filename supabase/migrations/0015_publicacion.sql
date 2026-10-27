-- =====================================================================
-- ENQORA · 0015 · Optimización previa a la publicación (M14)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0002…0014.
--
--  1. Índices para las claves foráneas que no tenían uno (consultas, RLS y borrados en cascada).
--  2. Limpieza diaria de datos operativos vencidos (códigos de verificación, envíos antiguos).
--  3. Estado del sistema para el Administrador: migraciones aplicadas y configuración pendiente
--     antes de abrir a clientes. No revela claves ni datos personales.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Índices
-- ---------------------------------------------------------------------

create index if not exists acc_documents_import_id_fk_idx on public.acc_documents (import_id);
create index if not exists agent_proposals_case_id_fk_idx on public.agent_proposals (case_id);
create index if not exists agent_runs_step_id_fk_idx on public.agent_runs (step_id);
create index if not exists bank_movements_import_id_fk_idx on public.bank_movements (import_id);
create index if not exists case_actions_authorization_id_fk_idx on public.case_actions (authorization_id);
create index if not exists case_actions_company_id_fk_idx on public.case_actions (company_id);
create index if not exists case_actions_mandate_id_fk_idx on public.case_actions (mandate_id);
create index if not exists case_documents_company_id_fk_idx on public.case_documents (company_id);
create index if not exists charges_case_id_fk_idx on public.charges (case_id);
create index if not exists diagnoses_approval_id_fk_idx on public.diagnoses (approval_id);
create index if not exists diagnosis_findings_service_id_fk_idx on public.diagnosis_findings (service_id);
create index if not exists mandates_case_id_fk_idx on public.mandates (case_id);
create index if not exists notification_deliveries_notification_id_fk_idx on public.notification_deliveries (notification_id);
create index if not exists notifications_case_id_fk_idx on public.notifications (case_id);
create index if not exists notifications_company_id_fk_idx on public.notifications (company_id);
create index if not exists payments_company_id_fk_idx on public.payments (company_id);
create index if not exists plan_proposals_approval_id_fk_idx on public.plan_proposals (approval_id);
create index if not exists plan_proposals_company_id_fk_idx on public.plan_proposals (company_id);
create index if not exists plan_proposals_plan_id_fk_idx on public.plan_proposals (plan_id);
create index if not exists plan_proposals_plan_price_id_fk_idx on public.plan_proposals (plan_price_id);
create index if not exists plan_proposals_subscription_id_fk_idx on public.plan_proposals (subscription_id);
create index if not exists public_companies_import_id_fk_idx on public.public_companies (import_id);
create index if not exists public_company_activities_import_id_fk_idx on public.public_company_activities (import_id);
create index if not exists quotes_company_id_fk_idx on public.quotes (company_id);
create index if not exists quotes_service_id_fk_idx on public.quotes (service_id);
create index if not exists quotes_tariff_id_fk_idx on public.quotes (tariff_id);
create index if not exists reconciliations_company_id_fk_idx on public.reconciliations (company_id);
create index if not exists security_events_device_id_fk_idx on public.security_events (device_id);
create index if not exists subscriptions_plan_id_fk_idx on public.subscriptions (plan_id);
create index if not exists subscriptions_plan_price_id_fk_idx on public.subscriptions (plan_price_id);
create index if not exists subscriptions_proposal_id_fk_idx on public.subscriptions (proposal_id);
-- Filtros frecuentes en el Centro de Mando y en «mis tareas».
create index if not exists cases_responsible_idx on public.cases (responsible_id) where responsible_id is not null;
create index if not exists case_tasks_assignee_idx on public.case_tasks (assignee_id) where assignee_id is not null;

-- ---------------------------------------------------------------------
-- 2. Limpieza diaria (se agrega a la tarea diaria existente)
-- ---------------------------------------------------------------------

-- Borra solo datos operativos sin valor de auditoría:
--  · códigos de verificación de teléfono vencidos hace más de un día (solo guardan un hash);
--  · registros de envío de avisos ya terminados con más de 180 días (la notificación sigue en la bandeja).
create or replace function private.housekeeping() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_codes integer;
  v_deliveries integer;
begin
  delete from private.phone_codes where expires_at < now() - interval '1 day';
  get diagnostics v_codes = row_count;
  delete from public.notification_deliveries
  where status in ('enviado', 'fallido', 'omitido') and created_at < now() - interval '180 days';
  get diagnostics v_deliveries = row_count;
  return jsonb_build_object('codigos_eliminados', v_codes, 'envios_archivados', v_deliveries);
end
$$;
revoke execute on function private.housekeeping() from public, anon, authenticated;

create or replace function public.daily_run(p_token text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_billing jsonb;
  v_expired integer;
  v_skipped integer;
begin
  v_billing := public.billing_run(p_token);   -- comprueba la clave de servicio o la sesión del Administrador

  update public.mandates set status = 'vencido', updated_at = now()
  where status = 'vigente' and valid_until < (now() at time zone 'America/Santiago')::date;
  get diagnostics v_expired = row_count;

  update public.notification_deliveries set status = 'omitido', last_error = coalesce(last_error, 'Vencido sin enviar')
  where status = 'pendiente' and created_at < now() - interval '3 days';
  get diagnostics v_skipped = row_count;

  return v_billing || jsonb_build_object('mandatos_vencidos', v_expired, 'envios_omitidos', v_skipped) || private.housekeeping();
end
$$;
-- La tarea diaria corre sin sesión (rol anon) y se protege con la clave de servicio (como en 0012).
revoke execute on function public.daily_run(text) from public;
grant execute on function public.daily_run(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Estado del sistema (Administrador ENQORA y Dirección de operaciones)
-- ---------------------------------------------------------------------

create or replace function public.system_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_mfa_missing integer;
begin
  perform private.require_session();
  if not private.is_staff(array['enqora_admin', 'ops_director']) then raise exception 'ENQ_SIN_PERMISO'; end if;

  -- Personas del equipo sin segundo factor verificado (solo si la tabla de Supabase Auth existe).
  if to_regclass('auth.mfa_factors') is not null then
    execute $q$
      select count(*)::int from public.staff_members s
      where s.active and not exists (
        select 1 from auth.mfa_factors f where f.user_id = s.user_id and f.status = 'verified')
    $q$ into v_mfa_missing;
  end if;

  return jsonb_build_object(
    'migraciones', jsonb_build_object(
      '0002', to_regclass('public.profiles') is not null,
      '0003', to_regclass('public.known_devices') is not null,
      '0004', to_regclass('public.staff_members') is not null,
      '0005', to_regclass('public.case_analysis_steps') is not null,
      '0006', to_regclass('public.approvals') is not null,
      '0007', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'companies' and column_name = 'commune'),
      '0008', to_regclass('public.services') is not null,
      '0009', to_regclass('public.public_data_imports') is not null,
      '0010', to_regclass('public.company_onboarding') is not null,
      '0011', to_regclass('public.plans') is not null,
      '0012', to_regclass('public.mandates') is not null,
      '0013', to_regclass('public.acc_imports') is not null,
      '0014', to_regclass('public.agent_runs') is not null,
      '0015', true),
    'administradores_activos', (select count(*) from public.staff_members where role = 'enqora_admin' and active),
    'equipo_activo', (select count(*) from public.staff_members where active and role <> 'ai_agent'),
    'equipo_sin_mfa', v_mfa_missing,
    'clave_servicio', exists (select 1 from private.service_secrets where id and token_hash is not null),
    'datos_transferencia', exists (select 1 from public.billing_settings where bank_name is not null and account_number is not null),
    'servicios_activos', (select count(*) from public.services where active),
    'servicios_con_tarifa', (select count(distinct t.service_id) from public.service_tariffs t join public.services s on s.id = t.service_id
                             where s.active and t.status = 'vigente'),
    'planes_activos', (select count(*) from public.plans where active),
    'planes_con_precio', (select count(distinct p.plan_id) from public.plan_prices p join public.plans pl on pl.id = p.plan_id
                          where pl.active and p.status = 'vigente'),
    'empresas_publicas', (select count(*) from public.public_companies),
    'ultima_importacion_publica', (select max(finished_at) from public.public_data_imports),
    'empresas', (select count(*) from public.companies),
    'casos_abiertos', (select count(*) from public.cases where status not in ('cerrado', 'cancelado')),
    'avisos_pendientes', (select count(*) from public.notification_deliveries where status = 'pendiente'),
    'avisos_fallidos_7d', (select count(*) from public.notification_deliveries where status = 'fallido' and created_at > now() - interval '7 days'),
    'agentes_30d', (select jsonb_build_object('ejecuciones', count(*), 'fallidas', count(*) filter (where status = 'fallida'),
                     'tokens', coalesce(sum(coalesce(input_tokens, 0) + coalesce(output_tokens, 0)), 0))
                    from public.agent_runs where created_at > now() - interval '30 days')
  );
end
$$;
revoke execute on function public.system_status() from public, anon;
grant execute on function public.system_status() to authenticated;

-- Estadísticas actualizadas para el planificador tras crear los índices.
analyze;

-- ---------------------------------------------------------------------
-- Reversión (solo si fuera necesario): los índices pueden eliminarse con drop index;
-- private.housekeeping y public.system_status con drop function; daily_run se restaura
-- ejecutando nuevamente su definición de 0012.
-- ---------------------------------------------------------------------
