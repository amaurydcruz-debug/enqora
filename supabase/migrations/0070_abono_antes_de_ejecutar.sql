-- =====================================================================
-- ENQORA · 0070 · Abono del 50% antes de ejecutar (decisión de Amaury, 20-11-2026)
-- Regla de cobro: nunca se bloquea el acceso a la cuenta ni a los documentos; lo que se cobra es EJECUTAR.
--   1) Al aceptar una cotización se emite el ABONO (50% por defecto, configurable) con vencimiento a 5 días.
--   2) Un caso con cotización aceptada no pasa a «En ejecución» hasta que el abono esté PAGADO y confirmado.
--      Cuando se confirma el pago y el cliente ya autorizó (y firmó sus documentos legales), el caso arranca solo.
--   3) Al pasar a «Verificación» (trabajo terminado) se emite el SALDO; el caso se cierra con el saldo pagado.
--   4) Sin cotización aceptada, el caso solo se ejecuta si la empresa tiene un plan activo que lo cubra.
--   5) Excepción (p. ej., caso pro bono o acuerdo especial): la supervisión la registra con su motivo; queda trazada.
-- Cobros ya emitidos por el total (antes de esta migración) siguen valiendo como pago completo.
-- Se puede ejecutar más de una vez.
-- =====================================================================

alter table public.billing_settings add column if not exists abono_pct integer not null default 50 check (abono_pct between 10 and 100);

alter table public.charges add column if not exists etapa text not null default 'total';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'charges_etapa_chk') then
    alter table public.charges add constraint charges_etapa_chk check (etapa in ('total', 'abono', 'saldo'));
  end if;
end $$;
drop index if exists public.charges_one_per_quote;
create unique index if not exists charges_one_per_quote_etapa on public.charges (quote_id, etapa) where quote_id is not null and status <> 'anulado';

create table if not exists private.case_pago_exenciones (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  tipo text not null check (tipo in ('abono', 'saldo')),
  motivo text not null check (char_length(motivo) between 10 and 500),
  registrado_por uuid references auth.users (id) on delete set null,
  registrado timestamptz not null default now(),
  unique (case_id, tipo)
);
alter table private.case_pago_exenciones enable row level security;

-- ¿Puede ejecutarse el caso? (abono o total pagado de cada cotización aceptada; sin cotización: plan activo)
create or replace function private.pago_ok_ejecutar(p_case uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from private.case_pago_exenciones e where e.case_id = p_case and e.tipo = 'abono') then true
    when exists (select 1 from public.quotes q where q.case_id = p_case and q.status = 'aceptada') then
      not exists (select 1 from public.quotes q where q.case_id = p_case and q.status = 'aceptada'
        and not exists (select 1 from public.charges ch where ch.quote_id = q.id and ch.etapa in ('abono', 'total') and ch.status = 'pagado'))
    else exists (select 1 from public.subscriptions s join public.cases c on c.company_id = s.company_id
      where c.id = p_case and s.status = 'activa')
  end
$$;

-- ¿Puede cerrarse? (sin saldos pendientes)
create or replace function private.saldo_ok_cerrar(p_case uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.case_pago_exenciones e where e.case_id = p_case and e.tipo = 'saldo')
      or not exists (select 1 from public.charges ch where ch.case_id = p_case and ch.etapa = 'saldo' and ch.status not in ('pagado', 'anulado'))
$$;

-- Al aceptar la cotización: abono (o total si el porcentaje es 100).
create or replace function private.on_quote_accepted() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_folio text;
  v_pct int := coalesce((select abono_pct from public.billing_settings limit 1), 50);
  v_abono int;
begin
  if new.status <> 'aceptada' or old.status = 'aceptada' then return new; end if;
  if exists (select 1 from public.charges where quote_id = new.id and status <> 'anulado') then return new; end if;
  select folio into v_folio from public.cases where id = new.case_id;
  if v_pct >= 100 then
    perform private.new_charge(new.company_id, 'cotizacion', new.service_name || ' · caso ' || v_folio, new.final_price,
      private.today_cl() + 5, new.id, null, new.case_id);
  else
    v_abono := ceil(new.final_price * v_pct / 100.0)::int;
    perform private.new_charge(new.company_id, 'cotizacion', 'Abono ' || v_pct || '% · ' || new.service_name || ' · caso ' || v_folio,
      v_abono, private.today_cl() + 5, new.id, null, new.case_id);
    update public.charges set etapa = 'abono' where quote_id = new.id and status <> 'anulado' and etapa = 'total';
  end if;
  return new;
end
$$;

-- Intenta iniciar la ejecución: solo si el cliente autorizó, firmó lo necesario y pagó el abono.
create or replace function private.intentar_ejecucion(p_case uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_c public.cases;
begin
  select * into v_c from public.cases where id = p_case for update;
  if v_c.id is null or v_c.status <> 'autorizacion_cliente' then return false; end if;
  if exists (select 1 from public.client_authorizations where case_id = p_case and status = 'pendiente')
     or not private.autorizacion_vigente(p_case)
     or coalesce(array_length(private.legal_missing(p_case), 1), 0) > 0 then
    return false;
  end if;
  if not private.pago_ok_ejecutar(p_case) then
    perform private.log_case(p_case, 'estado', 'Autorización lista: el trabajo comienza cuando se confirme el abono.', 'cliente',
      jsonb_build_object('espera', 'abono'));
    return false;
  end if;
  update public.cases set status = 'en_ejecucion', updated_at = now() where id = p_case;
  perform private.log_case(p_case, 'estado', 'Autorización, documentos y abono confirmados: el trabajo comienza.', 'cliente',
    jsonb_build_object('de', v_c.status, 'a', 'en_ejecucion'));
  return true;
end
$$;

-- Puerta de pago: nadie mueve a mano un caso a «En ejecución» sin abono, ni lo cierra con saldo pendiente.
create or replace function private.on_case_payment_gate() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'en_ejecucion' and old.status is distinct from 'en_ejecucion' and not private.pago_ok_ejecutar(new.id) then
    raise exception 'ENQ_FALTA_ABONO';
  end if;
  if new.status = 'cerrado' and old.status is distinct from 'cerrado' and not private.saldo_ok_cerrar(new.id) then
    raise exception 'ENQ_FALTA_SALDO';
  end if;
  return new;
end
$$;
drop trigger if exists cases_payment_gate on public.cases;
create trigger cases_payment_gate before update of status on public.cases
  for each row execute function private.on_case_payment_gate();

-- Trabajo terminado («Verificación»): se emite el saldo de cada cotización con abono.
create or replace function private.on_case_verificacion_saldo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  q record;
begin
  if new.status <> 'verificacion' or old.status = 'verificacion' then return new; end if;
  for q in
    select qq.id, qq.company_id, qq.service_name, qq.final_price, coalesce(ab.list_amount, ab.amount) as abono
    from public.quotes qq join public.charges ab on ab.quote_id = qq.id and ab.etapa = 'abono' and ab.status <> 'anulado'
    where qq.case_id = new.id and qq.status = 'aceptada'
      and not exists (select 1 from public.charges s where s.quote_id = qq.id and s.etapa = 'saldo' and s.status <> 'anulado')
  loop
    -- El saldo se calcula sobre el precio de lista del abono; el descuento de bienvenida (si sigue vigente) lo aplica new_charge.
    if q.final_price - q.abono > 0 then
      perform private.new_charge(q.company_id, 'cotizacion', 'Saldo · ' || q.service_name || ' · caso ' || new.folio,
        q.final_price - q.abono, private.today_cl() + 5, q.id, null, new.id);
      -- new_charge no recibe la etapa: el cobro recién creado (etapa «total») se marca como saldo.
      update public.charges set etapa = 'saldo' where quote_id = q.id and etapa = 'total' and status <> 'anulado';
      perform private.log_case(new.id, 'pago', 'Trabajo terminado: se emitió el saldo.', 'cliente', jsonb_build_object('cotizacion', q.id, 'monto', q.final_price - q.abono));
    end if;
  end loop;
  return new;
end
$$;
drop trigger if exists cases_verificacion_saldo on public.cases;
create trigger cases_verificacion_saldo after update of status on public.cases
  for each row execute function private.on_case_verificacion_saldo();

-- Al confirmarse un pago de abono (o total): si el caso solo esperaba eso, arranca.
create or replace function private.on_charge_paid_advance() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'pagado' and old.status is distinct from 'pagado' and new.case_id is not null and new.etapa in ('abono', 'total') then
    perform private.intentar_ejecucion(new.case_id);
  end if;
  return new;
end
$$;
drop trigger if exists charges_paid_advance on public.charges;
create trigger charges_paid_advance after update of status on public.charges
  for each row execute function private.on_charge_paid_advance();

-- Autorización del cliente (0006) y firma de documentos legales (0045): ahora pasan por la misma puerta.
create or replace function public.decide_client_authorization(p_auth uuid, p_decision text, p_note text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
  v_auth public.client_authorizations;
  v_case public.cases;
  v_status text;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select * into v_auth from public.client_authorizations where id = p_auth for update;
  if not found or not private.has_role(v_auth.company_id, array['owner', 'admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_auth.status <> 'pendiente' then raise exception 'ENQ_YA_DECIDIDA'; end if;
  v_status := case p_decision when 'autorizar' then 'autorizada' when 'rechazar' then 'rechazada' else null end;
  if v_status is null or char_length(coalesce(v_note, '')) > 2000 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if v_status = 'autorizada' and v_auth.valid_until is not null
     and v_auth.valid_until < (now() at time zone 'America/Santiago')::date then
    raise exception 'ENQ_AUTORIZACION_VENCIDA';
  end if;

  update public.client_authorizations set
    status = v_status, decided_by = v_uid, decided_at = now(), decision_note = v_note,
    evidence = jsonb_build_object(
      'usuario', v_uid,
      'rol_en_empresa', private.member_role(v_auth.company_id),
      'sesion', private.current_session_id(),
      'segundo_factor', 'reciente',
      'momento', now(),
      'alcance', v_auth.scope,
      'institucion', v_auth.institution,
      'vigencia', v_auth.valid_until)
  where id = p_auth;

  perform private.log_case(v_auth.case_id, 'autorizacion', v_note, 'cliente',
    jsonb_build_object('accion', v_status, 'autorizacion', p_auth, 'titulo', v_auth.title));
  perform private.log_event(v_auth.company_id, 'autorizacion.' || v_status, v_auth.title,
    jsonb_build_object('caso', v_auth.case_id, 'autorizacion', p_auth));

  select * into v_case from public.cases where id = v_auth.case_id for update;
  if v_case.status = 'autorizacion_cliente' then
    if v_status = 'rechazada' then
      update public.cases set status = 'devuelto', updated_at = now() where id = v_case.id;
      perform private.log_case(v_case.id, 'estado', null, 'cliente', jsonb_build_object('de', v_case.status, 'a', 'devuelto'));
    else
      perform private.intentar_ejecucion(v_case.id);
    end if;
  end if;
end
$$;

create or replace function private.on_legal_signature_advance() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  c record;
begin
  for c in
    select x.id from public.cases x
    where x.company_id = new.company_id and x.status = 'autorizacion_cliente' and (new.case_id is null or x.id = new.case_id)
  loop
    perform private.intentar_ejecucion(c.id);
  end loop;
  return new;
end
$$;

-- Supervisión: excepción de abono o saldo con su motivo (queda en la bitácora del caso).
create or replace function public.eximir_pago_caso(p_case uuid, p_tipo text, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
begin
  if not private.is_supervisor() then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_tipo not in ('abono', 'saldo') or char_length(btrim(coalesce(p_motivo, ''))) < 10 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  insert into private.case_pago_exenciones (case_id, tipo, motivo, registrado_por) values (p_case, p_tipo, btrim(p_motivo), v_uid)
  on conflict (case_id, tipo) do nothing;
  perform private.log_case(p_case, 'pago', 'Excepción de ' || p_tipo || ': ' || btrim(p_motivo), 'interno', jsonb_build_object('exencion', p_tipo));
  if p_tipo = 'abono' then perform private.intentar_ejecucion(p_case); end if;
end
$$;

-- Datos de cobro (0011) + porcentaje del abono (si viene en el formulario).
create or replace function public.save_billing_settings(p_data jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session(true);
begin
  if not private.is_staff(array['enqora_admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  update public.billing_settings set
    bank_name = nullif(trim(coalesce(p_data ->> 'bank_name', '')), ''),
    account_type = nullif(trim(coalesce(p_data ->> 'account_type', '')), ''),
    account_number = nullif(trim(coalesce(p_data ->> 'account_number', '')), ''),
    holder_name = nullif(trim(coalesce(p_data ->> 'holder_name', '')), ''),
    holder_rut = nullif(trim(coalesce(p_data ->> 'holder_rut', '')), ''),
    notify_email = nullif(trim(coalesce(p_data ->> 'notify_email', '')), ''),
    transfer_note = nullif(trim(coalesce(p_data ->> 'transfer_note', '')), ''),
    abono_pct = coalesce(nullif(p_data ->> 'abono_pct', '')::int, abono_pct),
    updated_by = v_uid, updated_at = now()
  where id;
  if p_data ? 'abono_pct' then
    perform private.log_event(null, 'cobros.abono_pct', p_data ->> 'abono_pct', '{}'::jsonb);
  end if;
exception
  when check_violation or invalid_text_representation then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

-- Estado de pago del caso (para la ficha del caso y el inicio del cliente).
create or replace function public.caso_estado_pago(p_case uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_see_case(p_case) then raise exception 'ENQ_SIN_PERMISO'; end if;
  return jsonb_build_object(
    'puede_ejecutar', private.pago_ok_ejecutar(p_case),
    'puede_cerrar', private.saldo_ok_cerrar(p_case),
    'cotizacion_aceptada', exists (select 1 from public.quotes q where q.case_id = p_case and q.status = 'aceptada'),
    'exenciones', coalesce((select jsonb_agg(jsonb_build_object('tipo', e.tipo, 'motivo', e.motivo, 'fecha', e.registrado)) from private.case_pago_exenciones e where e.case_id = p_case), '[]'::jsonb),
    'cobros', coalesce((select jsonb_agg(jsonb_build_object('id', ch.id, 'folio', ch.folio, 'etapa', ch.etapa, 'monto', ch.amount, 'estado', ch.status, 'vence', ch.due_date)
      order by ch.created_at) from public.charges ch where ch.case_id = p_case and ch.status <> 'anulado'), '[]'::jsonb));
end
$$;

revoke execute on function private.pago_ok_ejecutar(uuid), private.saldo_ok_cerrar(uuid), private.intentar_ejecucion(uuid),
  private.on_case_payment_gate(), private.on_case_verificacion_saldo(), private.on_charge_paid_advance() from public, anon, authenticated;
revoke execute on function public.eximir_pago_caso(uuid, text, text), public.caso_estado_pago(uuid) from public, anon;
grant execute on function public.eximir_pago_caso(uuid, text, text), public.caso_estado_pago(uuid) to authenticated;
