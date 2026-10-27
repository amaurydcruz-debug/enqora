-- =====================================================================
-- ENQORA · 0018 · Expediente vivo de cumplimiento y calendario de obligaciones (M17)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0002…0017.
--
--  1. Matriz de cumplimiento por empresa: institución, trámite, fundamento, condición, documentos,
--     costo público, plazo (legal o estimado), responsable, estado, evidencia, observaciones,
--     próxima revisión y renovación. Nada se marca presentado u obtenido sin evidencia.
--  2. Calendario de obligaciones: F29, cotizaciones, F22 y obligaciones manuales (patente,
--     renovaciones). Distingue preparada, presentada y pagada; exige comprobante para las dos últimas.
--  3. Alertas diarias (7 días y 1 día antes) y vencimientos dentro de la tarea diaria.
--  4. Integración: al registrar un F29 presentado (M12), la obligación del período queda presentada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Acceso
-- ---------------------------------------------------------------------

-- Equipo que puede gestionar el cumplimiento de una empresa: supervisión o quien trabaja algún caso de ella.
create or replace function private.can_manage_compliance(p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not private.is_staff(array['ai_agent']) and (
    private.is_supervisor()
    or (private.is_staff() and exists (
      select 1 from public.case_assignments a join public.cases c on c.id = a.case_id
      where c.company_id = p_company and a.user_id = (select auth.uid())))
  )
$$;

create or replace function private.can_see_compliance(p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_member(p_company) or private.can_manage_compliance(p_company)
$$;

-- Evidencia válida: un documento de un caso de la misma empresa.
create or replace function private.valid_evidence(p_company uuid, p_doc uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_doc is not null and exists (select 1 from public.case_documents d where d.id = p_doc and d.company_id = p_company)
$$;

-- ---------------------------------------------------------------------
-- 2. Matriz de cumplimiento
-- ---------------------------------------------------------------------

create table public.compliance_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  case_id uuid references public.cases (id) on delete set null,
  stage text not null default 'operacion' check (stage in ('idea', 'constitucion', 'tributaria', 'local', 'inicio', 'operacion', 'crecimiento', 'cierre')),
  institution text not null check (char_length(institution) between 2 and 40),
  title text not null check (char_length(title) between 3 and 200),
  basis text check (char_length(basis) <= 400),               -- fundamento
  source_url text check (source_url ~ '^https://[^\s]+\.[^\s]+$' and char_length(source_url) <= 400),
  condition text check (char_length(condition) <= 400),       -- cuándo aplica
  documents text check (char_length(documents) <= 1000),
  public_cost text check (char_length(public_cost) <= 300),   -- costo público (separado de honorarios)
  deadline date,
  deadline_kind text check (deadline_kind in ('legal', 'estimado')),
  responsible text not null default 'enqora' check (responsible in ('cliente', 'enqora', 'profesional', 'tercero')),
  status text not null default 'por_evaluar' check (status in (
    'por_evaluar', 'no_aplica', 'pendiente', 'en_preparacion', 'presentado', 'observado', 'obtenido', 'vencido')),
  evidence_document_id uuid references public.case_documents (id) on delete set null,
  observations text check (char_length(observations) <= 2000),
  next_review date,
  renewal_date date,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, institution, title)
);
create index compliance_items_case_idx on public.compliance_items (case_id) where case_id is not null;
create index compliance_items_evidence_idx on public.compliance_items (evidence_document_id) where evidence_document_id is not null;
create index compliance_items_created_by_idx on public.compliance_items (created_by);
create index compliance_items_updated_by_idx on public.compliance_items (updated_by);

alter table public.compliance_items enable row level security;
revoke all on public.compliance_items from anon, authenticated;
grant select on public.compliance_items to authenticated;
create policy mfa_requerido on public.compliance_items as restrictive for all to authenticated using (private.is_mfa()) with check (private.is_mfa());
create policy cumplimiento_visible on public.compliance_items for select to authenticated using (private.can_see_compliance(company_id));

-- Carga ítems (por ejemplo, desde el mapa de requisitos del rubro). No duplica.
-- p_items: [{etapa, institucion, tramite, fundamento, url, cuando, documentos, costo_publico, responsable}]
create or replace function public.seed_compliance_items(p_company uuid, p_items jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  p jsonb;
  v_n integer := 0;
begin
  if not private.can_manage_compliance(p_company) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  for p in select * from jsonb_array_elements(p_items) limit 60 loop
    begin
      insert into public.compliance_items (company_id, stage, institution, title, basis, source_url, condition, documents,
        public_cost, responsible, created_by, updated_by)
      values (p_company, coalesce(nullif(p ->> 'etapa', ''), 'operacion'), p ->> 'institucion', trim(p ->> 'tramite'),
        nullif(trim(coalesce(p ->> 'fundamento', '')), ''), nullif(p ->> 'url', ''), nullif(trim(coalesce(p ->> 'cuando', '')), ''),
        nullif(trim(coalesce(p ->> 'documentos', '')), ''), nullif(trim(coalesce(p ->> 'costo_publico', '')), ''),
        coalesce(nullif(p ->> 'responsable', ''), 'enqora'), v_uid, v_uid)
      on conflict (company_id, institution, title) do nothing;
      if found then v_n := v_n + 1; end if;
    exception when check_violation or not_null_violation then
      null;   -- ítem mal formado: se omite
    end;
  end loop;
  return v_n;
end
$$;

-- Actualiza un ítem. p_data: status, responsible, deadline, deadline_kind, observations, next_review,
-- renewal_date, evidence_document_id, case_id, public_cost, documents
create or replace function public.update_compliance_item(p_item uuid, p_data jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_i public.compliance_items;
  v_status text;
  v_evidence uuid;
  v_case uuid;
  v_obs text;
begin
  select * into v_i from public.compliance_items where id = p_item for update;
  if not found or not private.can_manage_compliance(v_i.company_id) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'ENQ_DATOS_INVALIDOS'; end if;

  v_status := coalesce(nullif(p_data ->> 'status', ''), v_i.status);
  v_evidence := case when p_data ? 'evidence_document_id' then nullif(p_data ->> 'evidence_document_id', '')::uuid else v_i.evidence_document_id end;
  v_case := case when p_data ? 'case_id' then nullif(p_data ->> 'case_id', '')::uuid else v_i.case_id end;
  v_obs := case when p_data ? 'observations' then nullif(trim(coalesce(p_data ->> 'observations', '')), '') else v_i.observations end;

  if v_evidence is not null and not private.valid_evidence(v_i.company_id, v_evidence) then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if v_case is not null and not exists (select 1 from public.cases where id = v_case and company_id = v_i.company_id) then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  -- Sin evidencia no hay trámite presentado ni obtenido.
  if v_status in ('presentado', 'obtenido') and v_evidence is null then raise exception 'ENQ_FALTA_EVIDENCIA'; end if;
  -- Descartar un requisito exige explicar por qué no aplica.
  if v_status = 'no_aplica' and char_length(coalesce(v_obs, '')) < 10 then raise exception 'ENQ_FALTA_OBSERVACION'; end if;

  update public.compliance_items set
    status = v_status,
    responsible = coalesce(nullif(p_data ->> 'responsible', ''), responsible),
    deadline = case when p_data ? 'deadline' then nullif(p_data ->> 'deadline', '')::date else deadline end,
    deadline_kind = case when p_data ? 'deadline_kind' then nullif(p_data ->> 'deadline_kind', '') else deadline_kind end,
    observations = v_obs,
    next_review = case when p_data ? 'next_review' then nullif(p_data ->> 'next_review', '')::date else next_review end,
    renewal_date = case when p_data ? 'renewal_date' then nullif(p_data ->> 'renewal_date', '')::date else renewal_date end,
    public_cost = case when p_data ? 'public_cost' then nullif(trim(coalesce(p_data ->> 'public_cost', '')), '') else public_cost end,
    documents = case when p_data ? 'documents' then nullif(trim(coalesce(p_data ->> 'documents', '')), '') else documents end,
    evidence_document_id = v_evidence, case_id = v_case, updated_by = v_uid, updated_at = now()
  where id = p_item;
exception
  when check_violation or invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

-- ---------------------------------------------------------------------
-- 3. Calendario de obligaciones
-- ---------------------------------------------------------------------

create table public.obligations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kind text not null check (kind in ('f29', 'cotizaciones', 'f22', 'patente', 'renovacion', 'otro')),
  title text not null check (char_length(title) between 3 and 200),
  period text not null check (period ~ '^\d{4}(-\d{2})?$'),     -- AAAA-MM (mensual) o AAAA (anual)
  due_date date not null,
  status text not null default 'pendiente' check (status in ('pendiente', 'preparada', 'presentada', 'pagada', 'no_aplica', 'vencida')),
  reference text check (char_length(reference) <= 60),          -- folio o comprobante
  evidence_document_id uuid references public.case_documents (id) on delete set null,
  note text check (char_length(note) <= 1000),
  auto boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, kind, period, title)
);
create index obligations_due_idx on public.obligations (company_id, due_date) where status in ('pendiente', 'preparada');
create index obligations_evidence_idx on public.obligations (evidence_document_id) where evidence_document_id is not null;
create index obligations_created_by_idx on public.obligations (created_by);
create index obligations_updated_by_idx on public.obligations (updated_by);

alter table public.obligations enable row level security;
revoke all on public.obligations from anon, authenticated;
grant select on public.obligations to authenticated;
create policy mfa_requerido on public.obligations as restrictive for all to authenticated using (private.is_mfa()) with check (private.is_mfa());
create policy obligaciones_visibles on public.obligations for select to authenticated using (private.can_see_compliance(company_id));

create or replace function private.can_edit_obligations(p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_manage_compliance(p_company) or private.has_role(p_company, array['owner', 'admin', 'accountant'])
$$;

-- Si el día cae en sábado o domingo, pasa al lunes (los feriados se ajustan a mano).
create or replace function private.business_day(d date) returns date
language sql immutable set search_path = '' as $$
  select case extract(isodow from d)::int when 6 then d + 2 when 7 then d + 1 else d end
$$;

-- Genera las obligaciones recurrentes de los próximos meses. No duplica ni toca las existentes.
--  · F29: día 20 del mes siguiente si declara por internet como facturador electrónico (p_f29_day = 20); si no, día 12.
--  · Cotizaciones: día 13 si declara y paga electrónicamente (aunque sea inhábil); si no, día 10 hábil.
--  · F22: 30 de abril (si cae en fin de semana, verificar el calendario del SII).
create or replace function public.generate_obligations(
  p_company uuid, p_months integer default 3, p_f29_day integer default 20, p_workers boolean default null,
  p_electronic_contrib boolean default true
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_today date := private.today_cl();
  v_workers boolean := p_workers;
  v_m date;
  v_due date;
  v_n integer := 0;
  v_f22 date;
begin
  if not private.can_edit_obligations(p_company) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_months not between 1 and 12 or p_f29_day not in (12, 20) then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if v_workers is null then
    v_workers := coalesce((select o.answers ->> 'trabajadores' not in ('ninguno') from public.company_onboarding o
                           where o.company_id = p_company and o.answers ? 'trabajadores'), false);
  end if;

  for i in 0 .. p_months - 1 loop
    v_m := (date_trunc('month', v_today) - interval '1 month' + make_interval(months => i))::date;   -- período declarado
    v_due := private.business_day((v_m + interval '1 month')::date + (p_f29_day - 1));
    if v_due >= v_today then
      insert into public.obligations (company_id, kind, title, period, due_date, auto, created_by, updated_by)
      values (p_company, 'f29', 'F29 · IVA, PPM y retenciones de ' || to_char(v_m, 'MM-YYYY'), to_char(v_m, 'YYYY-MM'), v_due, true, v_uid, v_uid)
      on conflict do nothing;
      if found then v_n := v_n + 1; end if;
    end if;
    if v_workers then
      v_due := case when p_electronic_contrib then (v_m + interval '1 month')::date + 12
                    else private.business_day((v_m + interval '1 month')::date + 9) end;
      if v_due >= v_today then
        insert into public.obligations (company_id, kind, title, period, due_date, auto, created_by, updated_by)
        values (p_company, 'cotizaciones', 'Cotizaciones previsionales de ' || to_char(v_m, 'MM-YYYY'), to_char(v_m, 'YYYY-MM'), v_due, true, v_uid, v_uid)
        on conflict do nothing;
        if found then v_n := v_n + 1; end if;
      end if;
    end if;
  end loop;

  v_f22 := make_date(extract(year from v_today)::int, 4, 30);
  if v_f22 < v_today then v_f22 := make_date(extract(year from v_today)::int + 1, 4, 30); end if;
  insert into public.obligations (company_id, kind, title, period, due_date, auto, note, created_by, updated_by)
  values (p_company, 'f22', 'Declaración anual de renta (F22) AT ' || extract(year from v_f22)::int, extract(year from v_f22)::text, v_f22, true,
          'Plazo general del 30 de abril; verifica el calendario de la Operación Renta del SII.', v_uid, v_uid)
  on conflict do nothing;
  if found then v_n := v_n + 1; end if;
  return v_n;
end
$$;

-- Obligación manual (patente, renovaciones de autorizaciones o marcas, otras).
create or replace function public.add_obligation(p_company uuid, p_kind text, p_title text, p_due date, p_note text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_id uuid;
begin
  if not private.can_edit_obligations(p_company) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_kind not in ('patente', 'renovacion', 'otro', 'f29', 'cotizaciones', 'f22') or p_due is null then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  insert into public.obligations (company_id, kind, title, period, due_date, note, created_by, updated_by)
  values (p_company, p_kind, trim(p_title), to_char(p_due, 'YYYY-MM'), p_due, nullif(trim(coalesce(p_note, '')), ''), v_uid, v_uid)
  returning id into v_id;
  return v_id;
exception
  when unique_violation then raise exception 'ENQ_YA_SOLICITADA';
  when check_violation or not_null_violation then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

-- Cambia el estado. Presentada o pagada exigen folio/comprobante o un documento de evidencia.
create or replace function public.set_obligation_status(
  p_obligation uuid, p_status text, p_reference text default null, p_evidence uuid default null, p_note text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_o public.obligations;
  v_ref text := nullif(trim(coalesce(p_reference, '')), '');
begin
  select * into v_o from public.obligations where id = p_obligation for update;
  if not found or not private.can_edit_obligations(v_o.company_id) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_status not in ('pendiente', 'preparada', 'presentada', 'pagada', 'no_aplica') then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if p_evidence is not null and not private.valid_evidence(v_o.company_id, p_evidence) then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if p_status in ('presentada', 'pagada') and coalesce(v_ref, v_o.reference) is null and coalesce(p_evidence, v_o.evidence_document_id) is null then
    raise exception 'ENQ_FALTA_EVIDENCIA';
  end if;
  if p_status = 'no_aplica' and char_length(trim(coalesce(p_note, ''))) < 10 then raise exception 'ENQ_FALTA_OBSERVACION'; end if;
  update public.obligations set status = p_status, reference = left(coalesce(v_ref, reference), 60),
    evidence_document_id = coalesce(p_evidence, evidence_document_id),
    note = coalesce(left(nullif(trim(coalesce(p_note, '')), ''), 1000), note), updated_by = v_uid, updated_at = now()
  where id = p_obligation;
end
$$;

-- F29 presentado en ENQORA CONTABILIDAD (M12) → la obligación del período queda presentada con su folio.
create or replace function private.on_vat_presented() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'presentado' and old.status is distinct from 'presentado' then
    update public.obligations set status = 'presentada', reference = left(new.presented_folio, 60), updated_at = now()
    where company_id = new.company_id and kind = 'f29' and period = to_char(new.period, 'YYYY-MM') and status in ('pendiente', 'preparada', 'vencida');
  end if;
  return new;
end
$$;
drop trigger if exists vat_presented_obligation on public.vat_returns;
create trigger vat_presented_obligation after update of status on public.vat_returns
  for each row execute function private.on_vat_presented();

-- ---------------------------------------------------------------------
-- 4. Alertas y vencimientos (se agregan a la tarea diaria)
-- ---------------------------------------------------------------------

create or replace function private.compliance_alerts() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := private.today_cl();
  r record;
  v_overdue integer;
  v_alerts integer := 0;
begin
  update public.obligations set status = 'vencida', updated_at = now()
  where status in ('pendiente', 'preparada') and due_date < v_today;
  get diagnostics v_overdue = row_count;

  update public.compliance_items set status = 'vencido', updated_at = now()
  where status in ('pendiente', 'en_preparacion', 'observado') and deadline is not null and deadline < v_today and deadline_kind = 'legal';

  for r in
    select o.id, o.company_id, o.title, o.due_date, (o.due_date - v_today) as days
    from public.obligations o
    where o.status in ('pendiente', 'preparada') and (o.due_date - v_today) in (7, 1)
  loop
    perform private.notify(private.company_users(r.company_id, array['owner', 'admin', 'accountant']), r.company_id, null, 'pagos',
      left(case when r.days = 1 then 'Vence mañana: ' else 'Vence en 7 días: ' end || r.title, 200),
      'Fecha límite: ' || to_char(r.due_date, 'DD-MM-YYYY') || '. Revisa el calendario de obligaciones.',
      '/empresas/' || r.company_id || '/cumplimiento#calendario', 'obligacion-' || r.id || '-' || r.days);
    v_alerts := v_alerts + 1;
  end loop;

  -- Renovaciones (autorizaciones, marcas, patentes) 30 días antes.
  for r in
    select i.id, i.company_id, i.title, i.renewal_date from public.compliance_items i
    where i.renewal_date is not null and i.renewal_date - v_today = 30 and i.status not in ('no_aplica')
  loop
    perform private.notify(private.company_users(r.company_id, array['owner', 'admin']), r.company_id, null, 'casos',
      left('Renovación en 30 días: ' || r.title, 200), 'Fecha: ' || to_char(r.renewal_date, 'DD-MM-YYYY') || '. ENQORA puede preparar la renovación.',
      '/empresas/' || r.company_id || '/cumplimiento#matriz', 'renovacion-' || r.id || '-' || r.renewal_date);
    v_alerts := v_alerts + 1;
  end loop;
  return jsonb_build_object('obligaciones_vencidas', v_overdue, 'avisos_vencimiento', v_alerts);
end
$$;
revoke execute on function private.compliance_alerts() from public, anon, authenticated;

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

  return v_billing || jsonb_build_object('mandatos_vencidos', v_expired, 'envios_omitidos', v_skipped)
    || private.housekeeping() || private.compliance_alerts();
end
$$;
revoke execute on function public.daily_run(text) from public;
grant execute on function public.daily_run(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Permisos
-- ---------------------------------------------------------------------

revoke execute on function private.can_manage_compliance(uuid), private.can_see_compliance(uuid), private.valid_evidence(uuid, uuid),
  private.can_edit_obligations(uuid), private.business_day(date), private.on_vat_presented()
from public, anon;
grant execute on function private.can_manage_compliance(uuid), private.can_see_compliance(uuid) to authenticated;

revoke execute on function
  public.seed_compliance_items(uuid, jsonb), public.update_compliance_item(uuid, jsonb),
  public.generate_obligations(uuid, integer, integer, boolean, boolean), public.add_obligation(uuid, text, text, date, text),
  public.set_obligation_status(uuid, text, text, uuid, text)
from public, anon;
grant execute on function
  public.seed_compliance_items(uuid, jsonb), public.update_compliance_item(uuid, jsonb),
  public.generate_obligations(uuid, integer, integer, boolean, boolean), public.add_obligation(uuid, text, text, date, text),
  public.set_obligation_status(uuid, text, text, uuid, text)
to authenticated;
