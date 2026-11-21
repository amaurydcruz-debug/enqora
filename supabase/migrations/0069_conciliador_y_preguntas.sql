-- =====================================================================
-- ENQORA · 0069 · Contabilidad mensual · Etapa 4: conciliador y preguntas al cliente
-- El agente conciliador PROPONE (no aplica): qué movimiento del banco corresponde a qué factura, qué cargos son
-- comisiones, sueldos, impuestos o créditos, y qué abonos son liquidaciones de ventas con tarjeta. Una persona
-- marca las propuestas y las aplica; cada lote queda en la bitácora.
-- Lo que nadie puede explicar se convierte en una PREGUNTA al cliente con opciones de un toque («¿Qué fue este
-- cargo?»). El cliente responde desde su inicio; el contador aplica la respuesta (queda escrita en la conciliación).
-- Se puede ejecutar más de una vez.
-- =====================================================================

create table if not exists public.preguntas_mes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  period date not null check (period = date_trunc('month', period)::date),
  movement_id uuid references public.bank_movements (id) on delete set null,
  pregunta text not null check (char_length(pregunta) between 10 and 400),
  opciones text[] not null check (cardinality(opciones) between 2 and 10),
  respuesta text,
  nota text check (char_length(nota) <= 500),
  estado text not null default 'abierta' check (estado in ('abierta', 'respondida', 'aplicada', 'anulada')),
  creada_por uuid references auth.users (id) on delete set null,
  creada timestamptz not null default now(),
  respondida_por uuid references auth.users (id) on delete set null,
  respondida_at timestamptz,
  aplicada_por uuid references auth.users (id) on delete set null,
  aplicada_at timestamptz
);
create unique index if not exists preguntas_mes_mov_un on public.preguntas_mes (movement_id) where estado <> 'anulada' and movement_id is not null;
create index if not exists preguntas_mes_company_idx on public.preguntas_mes (company_id, period, estado);
alter table public.preguntas_mes enable row level security;
revoke all on public.preguntas_mes from anon, authenticated;
grant select on public.preguntas_mes to authenticated;
drop policy if exists preguntas_mes_ver on public.preguntas_mes;
create policy preguntas_mes_ver on public.preguntas_mes for select to authenticated using (private.can_read_books(company_id));

-- El contador (o el equipo ENQORA) envía las preguntas que preparó el conciliador. Avisa al cliente una vez por lote.
create or replace function public.crear_preguntas_mes(p_company uuid, p_period date, p jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  q jsonb;
  n int := 0;
  v_period date := date_trunc('month', p_period)::date;
begin
  if not (private.works_company(p_company) or private.has_role(p_company, array['accountant'])) or private.is_staff(array['ai_agent']) then
    raise exception 'ENQ_SIN_PERMISO';
  end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 40 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  for q in select * from jsonb_array_elements(p) loop
    if (q ->> 'movement_id') is not null and not exists (select 1 from public.bank_movements m where m.id = (q ->> 'movement_id')::uuid
        and m.company_id = p_company and m.period = v_period) then
      raise exception 'ENQ_DATOS_INVALIDOS';
    end if;
    insert into public.preguntas_mes (company_id, period, movement_id, pregunta, opciones, creada_por)
    values (p_company, v_period, nullif(q ->> 'movement_id', '')::uuid, left(btrim(q ->> 'pregunta'), 400),
            array(select left(x, 80) from jsonb_array_elements_text(q -> 'opciones') x), v_uid)
    on conflict do nothing;
    if found then n := n + 1; end if;
  end loop;
  if n > 0 then
    perform private.log_event(p_company, 'conciliacion.preguntas', to_char(v_period, 'MM-YYYY'), jsonb_build_object('preguntas', n));
    perform private.notify(private.company_users(p_company, array['owner', 'admin', 'accountant']), p_company, null, 'casos',
      'Tu contador tiene ' || n || ' pregunta(s) sobre ' || to_char(v_period, 'MM-YYYY'),
      'Respóndelas con un toque desde tu inicio para cerrar tu mes.', '/panel#preguntas',
      'preguntas:' || p_company || ':' || v_period || ':' || extract(epoch from now())::bigint);
  end if;
  return n;
exception
  when check_violation or invalid_text_representation then raise exception 'ENQ_DATOS_INVALIDOS';
end
$$;

-- El cliente responde con una de las opciones (y una nota si quiere).
create or replace function public.responder_pregunta(p_id uuid, p_respuesta text, p_nota text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_q public.preguntas_mes;
begin
  select * into v_q from public.preguntas_mes where id = p_id for update;
  if v_q.id is null or not private.has_role(v_q.company_id, array['owner', 'admin', 'accountant']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_q.estado not in ('abierta', 'respondida') then raise exception 'ENQ_YA_DECIDIDA'; end if;
  if not (p_respuesta = any (v_q.opciones)) then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  update public.preguntas_mes set respuesta = p_respuesta, nota = nullif(left(btrim(coalesce(p_nota, '')), 500), ''),
    estado = 'respondida', respondida_por = v_uid, respondida_at = now() where id = p_id;
end
$$;

-- El contador aplica la respuesta: concilia el movimiento con la categoría y deja escrita la respuesta del cliente.
create or replace function public.aplicar_pregunta(p_id uuid, p_categoria text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_q public.preguntas_mes;
begin
  select * into v_q from public.preguntas_mes where id = p_id for update;
  if v_q.id is null or not (private.works_company(v_q.company_id) or private.has_role(v_q.company_id, array['accountant']))
     or private.is_staff(array['ai_agent']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_q.estado <> 'respondida' then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if v_q.movement_id is not null and p_categoria is not null then
    perform public.reconcile_other(v_q.movement_id, p_categoria,
      left('Respuesta del cliente: ' || v_q.respuesta || coalesce(' · ' || v_q.nota, ''), 300));
  end if;
  update public.preguntas_mes set estado = 'aplicada', aplicada_por = v_uid, aplicada_at = now() where id = p_id;
end
$$;

create or replace function public.anular_pregunta(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_q public.preguntas_mes;
begin
  perform private.require_session();
  select * into v_q from public.preguntas_mes where id = p_id for update;
  if v_q.id is null or not (private.works_company(v_q.company_id) or private.has_role(v_q.company_id, array['accountant'])) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if v_q.estado = 'aplicada' then raise exception 'ENQ_YA_DECIDIDA'; end if;
  update public.preguntas_mes set estado = 'anulada' where id = p_id;
end
$$;

-- Bitácora de cada lote de propuestas del conciliador aplicado por una persona.
create or replace function public.registrar_conciliacion_agente(p_company uuid, p_period date, p_aplicadas int, p_detalle jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_session();
  if not private.can_book(p_company) then raise exception 'ENQ_SIN_PERMISO'; end if;
  perform private.log_event(p_company, 'conciliacion.agente', to_char(date_trunc('month', p_period), 'MM-YYYY'),
    jsonb_build_object('aplicadas', p_aplicadas, 'detalle', case when octet_length(coalesce(p_detalle, '[]')::text) <= 20000 then p_detalle end));
end
$$;

revoke execute on function public.crear_preguntas_mes(uuid, date, jsonb), public.responder_pregunta(uuid, text, text),
  public.aplicar_pregunta(uuid, text), public.anular_pregunta(uuid), public.registrar_conciliacion_agente(uuid, date, int, jsonb) from public, anon;
grant execute on function public.crear_preguntas_mes(uuid, date, jsonb), public.responder_pregunta(uuid, text, text),
  public.aplicar_pregunta(uuid, text), public.anular_pregunta(uuid), public.registrar_conciliacion_agente(uuid, date, int, jsonb) to authenticated;
