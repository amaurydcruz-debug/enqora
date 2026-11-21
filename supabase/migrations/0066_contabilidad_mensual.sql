-- =====================================================================
-- ENQORA · 0066 · Contabilidad mensual · Etapa 1 («Tu mes»)
-- El cliente casi no registra nada: sus ventas y compras vienen del Registro de Compras y Ventas (RCV) que
-- trae ENQORA con el Mandato Digital o que el cliente sube, y la cartola del banco. Cada mes:
--   1) datos recibidos → 2) en revisión (agentes preparan, contador revisa: 0013) → 3) listo para aprobar →
--   4) el cliente aprueba su mes (queda la constancia con el monto) → 5) presentado (folio del SII).
-- Reglas nuevas:
--   · El equipo ENQORA no registra como presentado un F29 que el cliente no aprobó (el cliente sí puede
--     registrar el suyo propio, como antes).
--   · Si el cliente tiene dudas, «Tengo una observación» devuelve el F29 al borrador con su nota.
--   · Recordatorios automáticos (cron diario): días 1–5 faltantes del mes; días 13–17 aprobación pendiente.
-- Se puede ejecutar más de una vez.
-- =====================================================================

alter table public.vat_returns add column if not exists cliente_aprobo_at timestamptz;
alter table public.vat_returns add column if not exists cliente_aprobo_por uuid references auth.users (id) on delete set null;
alter table public.vat_returns add column if not exists cliente_aprobo_texto text check (char_length(cliente_aprobo_texto) <= 500);
alter table public.vat_returns add column if not exists cliente_observacion text check (char_length(cliente_observacion) <= 1000);
alter table public.vat_returns add column if not exists cliente_observo_at timestamptz;

create or replace function private.clp_texto(p bigint) returns text
language sql immutable set search_path = '' as $$
  select '$' || replace(to_char(coalesce(p, 0), 'FM999G999G999G999'), ',', '.')
$$;

-- ¿La empresa lleva su contabilidad mensual con ENQORA? (plan de contabilidad o datos cargados en los últimos 90 días)
create or replace function private.lleva_contabilidad(p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.subscriptions s where s.company_id = p_company and s.line = 'contabilidad_profesional' and s.status in ('activa', 'pendiente_pago'))
      or exists (select 1 from public.acc_imports i where i.company_id = p_company and i.created_at > now() - interval '90 days')
      or exists (select 1 from public.vat_returns v where v.company_id = p_company and v.prepared_at > now() - interval '90 days')
$$;

-- Período que se está cerrando: el mes anterior al actual (hora de Chile).
create or replace function private.periodo_en_curso() returns date
language sql stable set search_path = '' as $$
  select (date_trunc('month', (now() at time zone 'America/Santiago')::date) - interval '1 month')::date
$$;

-- «Tu mes»: estado del cierre mensual de una empresa, para el cliente y el equipo.
create or replace function public.tu_mes(p_company uuid, p_period date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_period date := date_trunc('month', coalesce(p_period, private.periodo_en_curso()))::date;
  v_ventas int; v_compras int; v_banco int; v_vat public.vat_returns; v_mandato boolean; v_plan text; v_etapa text;
  v_faltan text[] := '{}';
  v_sig date := (v_period + interval '1 month')::date;
begin
  perform private.require_session();
  if not private.can_read_books(p_company) then raise exception 'ENQ_SIN_PERMISO'; end if;
  select count(*) filter (where book = 'venta'), count(*) filter (where book = 'compra') into v_ventas, v_compras
    from public.acc_documents where company_id = p_company and period = v_period;
  select count(*) into v_banco from public.bank_movements where company_id = p_company and period = v_period;
  select * into v_vat from public.vat_returns where company_id = p_company and period = v_period and status <> 'anulado'
    order by version desc limit 1;
  select exists (select 1 from public.sii_mandates m where m.company_id = p_company and m.status = 'aceptado'
                 and m.vence >= (now() at time zone 'America/Santiago')::date) into v_mandato;
  select s.plan_name into v_plan from public.subscriptions s where s.company_id = p_company and s.line = 'contabilidad_profesional'
    and s.status in ('activa', 'pendiente_pago') limit 1;

  -- Registros del SII: con importaciones del período cuentan aunque el mes no tenga documentos (sin movimiento).
  if v_ventas = 0 and not exists (select 1 from public.acc_imports where company_id = p_company and period = v_period and kind = 'ventas') then
    v_faltan := v_faltan || 'ventas'::text; end if;
  if v_compras = 0 and not exists (select 1 from public.acc_imports where company_id = p_company and period = v_period and kind = 'compras') then
    v_faltan := v_faltan || 'compras'::text; end if;
  if v_banco = 0 and not exists (select 1 from public.acc_imports where company_id = p_company and period = v_period and kind = 'banco') then
    v_faltan := v_faltan || 'cartola'::text; end if;

  v_etapa := case
    when v_vat.status = 'presentado' then 'presentado'
    when v_vat.status = 'aprobado' and v_vat.cliente_aprobo_at is not null then 'aprobado_cliente'
    when v_vat.status = 'aprobado' then 'por_aprobar'
    when v_vat.status in ('borrador', 'en_revision') then 'revision'
    when cardinality(v_faltan) < 3 then 'datos'
    else 'esperando_datos' end;

  return jsonb_build_object(
    'periodo', v_period, 'etapa', v_etapa, 'lleva', private.lleva_contabilidad(p_company), 'faltan', to_jsonb(v_faltan),
    'ventas', v_ventas, 'compras', v_compras, 'movimientos', v_banco,
    'mandato', v_mandato, 'plan', v_plan,
    'vence_12', (v_sig + 11), 'vence_20', (v_sig + 19),
    'f29', case when v_vat.id is null then null else jsonb_build_object(
      'id', v_vat.id, 'estado', v_vat.status, 'version', v_vat.version, 'debito', v_vat.debit, 'credito', v_vat.credit,
      'iva', v_vat.iva_determinado, 'remanente', v_vat.remanente_siguiente, 'ppm', v_vat.ppm, 'retenciones', v_vat.retenciones,
      'total', v_vat.total_pagar, 'nota_revision', v_vat.decision_note, 'aprobado_cliente', v_vat.cliente_aprobo_at,
      'texto_aprobacion', v_vat.cliente_aprobo_texto, 'folio', v_vat.presented_folio, 'presentado', v_vat.presented_on,
      'observacion', v_vat.cliente_observacion) end);
end
$$;

-- El cliente aprueba su mes: solo un F29 ya revisado por un contador ENQORA. Queda la constancia con el monto.
create or replace function public.aprobar_mi_mes(p_return uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_v public.vat_returns;
  v_texto text;
begin
  select * into v_v from public.vat_returns where id = p_return for update;
  if v_v.id is null or not private.has_role(v_v.company_id, array['owner', 'admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_v.status <> 'aprobado' then raise exception 'ENQ_MES_NO_LISTO'; end if;
  if v_v.cliente_aprobo_at is not null then return; end if;
  v_texto := 'Apruebo el F29 de ' || to_char(v_v.period, 'MM-YYYY') || ' (versión ' || v_v.version || ') con un total a pagar referencial de '
    || private.clp_texto(v_v.total_pagar) || case when v_v.remanente_siguiente > 0 then ' y un remanente de ' || private.clp_texto(v_v.remanente_siguiente) else '' end
    || '. Autorizo a ENQORA a presentarlo con el Mandato Digital vigente, si existe.';
  update public.vat_returns set cliente_aprobo_at = now(), cliente_aprobo_por = v_uid, cliente_aprobo_texto = v_texto where id = p_return;
  perform private.log_event(v_v.company_id, 'f29.aprobado_cliente', to_char(v_v.period, 'MM-YYYY'), jsonb_build_object('f29', p_return, 'total', v_v.total_pagar));
  perform private.notify(coalesce(nullif(array(select distinct a.user_id from public.case_assignments a join public.cases c on c.id = a.case_id
      where c.company_id = v_v.company_id), '{}'), private.staff_users(array['accountant_pro', 'ops_director'])),
    v_v.company_id, null, 'equipo', 'Cliente aprobó su mes · ' || to_char(v_v.period, 'MM-YYYY'),
    'Ya se puede presentar el F29 con el Mandato Digital.', '/contabilidad/' || to_char(v_v.period, 'YYYY-MM') || '?empresa=' || v_v.company_id || '#f29',
    'mes:' || v_v.id || ':aprobado');
end
$$;

-- El cliente tiene una duda u observación: el F29 vuelve al borrador con su nota y el equipo recibe el aviso.
create or replace function public.observar_mi_mes(p_return uuid, p_nota text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_v public.vat_returns;
  v_nota text := left(btrim(coalesce(p_nota, '')), 1000);
begin
  perform private.require_session();
  select * into v_v from public.vat_returns where id = p_return for update;
  if v_v.id is null or not private.has_role(v_v.company_id, array['owner', 'admin', 'accountant']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_v.status <> 'aprobado' or v_v.cliente_aprobo_at is not null then raise exception 'ENQ_MES_NO_LISTO'; end if;
  if char_length(v_nota) < 5 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  update public.vat_returns set status = 'borrador', cliente_observacion = v_nota, cliente_observo_at = now(),
    decision_note = left('Observación del cliente: ' || v_nota, 1000) where id = p_return;
  perform private.log_event(v_v.company_id, 'f29.observado_cliente', to_char(v_v.period, 'MM-YYYY'), jsonb_build_object('f29', p_return));
  perform private.notify(coalesce(nullif(array(select distinct a.user_id from public.case_assignments a join public.cases c on c.id = a.case_id
      where c.company_id = v_v.company_id), '{}'), private.staff_users(array['accountant_pro', 'ops_director'])),
    v_v.company_id, null, 'equipo', 'Observación del cliente en su mes · ' || to_char(v_v.period, 'MM-YYYY'), v_nota,
    '/contabilidad/' || to_char(v_v.period, 'YYYY-MM') || '?empresa=' || v_v.company_id || '#f29', 'mes:' || v_v.id || ':obs:' || extract(epoch from now())::bigint);
end
$$;

-- Registrar la presentación (0013) + regla nueva: el equipo solo presenta lo que el cliente aprobó.
create or replace function public.register_vat_presented(p_return uuid, p_folio text, p_presented_on date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
  v_v public.vat_returns;
  v_cliente boolean;
begin
  select * into v_v from public.vat_returns where id = p_return for update;
  v_cliente := private.has_role(v_v.company_id, array['owner', 'admin', 'accountant']);
  if v_v.id is null or not (v_cliente or (private.works_company(v_v.company_id) and not private.is_staff(array['ai_agent']))) then
    raise exception 'ENQ_SIN_PERMISO';
  end if;
  if v_v.status not in ('borrador', 'aprobado') then raise exception 'ENQ_F29_NO_EDITABLE'; end if;
  if not v_cliente and v_v.cliente_aprobo_at is null then raise exception 'ENQ_FALTA_APROBACION_CLIENTE'; end if;
  if char_length(trim(coalesce(p_folio, ''))) not between 3 and 40 or p_presented_on is null
     or p_presented_on > (now() at time zone 'America/Santiago')::date or p_presented_on < v_v.period then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  update public.vat_returns set status = 'presentado', presented_folio = trim(p_folio), presented_on = p_presented_on,
    presented_by = v_uid, flags = case when v_v.status = 'borrador' then array_append(flags, 'sin_revision_profesional') else flags end
  where id = p_return;
  perform private.log_event(v_v.company_id, 'f29.presentado', to_char(v_v.period, 'MM-YYYY'),
    jsonb_build_object('f29', p_return, 'folio', trim(p_folio), 'aprobado_cliente', v_v.cliente_aprobo_at));
  perform private.notify(private.company_users(v_v.company_id, array['owner', 'admin', 'accountant']), v_v.company_id, null, 'casos',
    'F29 presentado · ' || to_char(v_v.period, 'MM-YYYY'), 'Folio SII ' || trim(p_folio) || '. El comprobante queda en tu contabilidad.',
    '/contabilidad/' || to_char(v_v.period, 'YYYY-MM') || '#f29', 'mes:' || v_v.id || ':presentado');
end
$$;

-- Recordatorios del ciclo mensual (cron diario con la clave de servicio). Sin duplicados: un aviso por empresa,
-- período y tipo. Días 1–5: faltan datos. Días 13–17: el mes espera la aprobación del cliente.
create or replace function public.svc_recordatorios_mes(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_dia int := extract(day from (now() at time zone 'America/Santiago'))::int;
  v_period date := private.periodo_en_curso();
  c record;
  v_faltan text[];
  n_datos int := 0; n_aprobar int := 0;
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_SIN_PERMISO'; end if;
  for c in select co.id from public.companies co where private.lleva_contabilidad(co.id) loop
    if v_dia between 1 and 5 then
      v_faltan := '{}';
      if not exists (select 1 from public.acc_imports i where i.company_id = c.id and i.period = v_period and i.kind = 'ventas') then v_faltan := v_faltan || 'ventas'::text; end if;
      if not exists (select 1 from public.acc_imports i where i.company_id = c.id and i.period = v_period and i.kind = 'compras') then v_faltan := v_faltan || 'compras'::text; end if;
      if not exists (select 1 from public.acc_imports i where i.company_id = c.id and i.period = v_period and i.kind = 'banco') then v_faltan := v_faltan || 'cartola'::text; end if;
      if cardinality(v_faltan) > 0 then
        perform private.notify(private.company_users(c.id, array['owner', 'admin', 'accountant']), c.id, null, 'casos',
          'Tu mes de ' || to_char(v_period, 'MM-YYYY') || ': faltan datos',
          'Falta: ' || array_to_string(v_faltan, ', ') || '. Con el Mandato Digital, ENQORA trae ventas y compras del SII; la cartola la subes tú.',
          '/panel#tu-mes', 'mes:' || c.id || ':' || v_period || ':faltan');
        n_datos := n_datos + 1;
      end if;
    elsif v_dia between 13 and 17 then
      if exists (select 1 from public.vat_returns v where v.company_id = c.id and v.period = v_period and v.status = 'aprobado' and v.cliente_aprobo_at is null) then
        perform private.notify(private.company_users(c.id, array['owner', 'admin']), c.id, null, 'casos',
          'Tu mes de ' || to_char(v_period, 'MM-YYYY') || ' está listo para aprobar',
          'Revisa el resumen y apruébalo para presentar el F29 a tiempo.', '/panel#tu-mes', 'mes:' || c.id || ':' || v_period || ':aprobar');
        n_aprobar := n_aprobar + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('dia', v_dia, 'periodo', v_period, 'faltan_datos', n_datos, 'por_aprobar', n_aprobar);
end
$$;

revoke execute on function private.clp_texto(bigint), private.lleva_contabilidad(uuid), private.periodo_en_curso() from public, anon, authenticated;
revoke execute on function public.tu_mes(uuid, date), public.aprobar_mi_mes(uuid), public.observar_mi_mes(uuid, text) from public, anon;
grant execute on function public.tu_mes(uuid, date), public.aprobar_mi_mes(uuid), public.observar_mi_mes(uuid, text) to authenticated;
revoke execute on function public.svc_recordatorios_mes(text) from public;
grant execute on function public.svc_recordatorios_mes(text) to anon, authenticated;
