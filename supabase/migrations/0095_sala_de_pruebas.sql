-- 0095 · Sala de pruebas para los agentes: una empresa FICTICIA dentro de ENQORA donde el equipo pone a trabajar a
-- los agentes (tributario, contable, legal, financiero, investigador, estratégico), prueba el cierre contable, las
-- alertas de gastos y las remuneraciones, sin tocar clientes reales.
--   · companies.es_prueba marca la empresa; nombre, RUT, trabajadores y gastos son ficticios.
--   · La empresa no tiene miembros cliente: ningún aviso de casos, cobros ni ENQORA Informa llega a un cliente.
--   · Los casos de prueba llevan «[PRUEBA]» en el título y quedan asignados a quien los prepara.
--   · Solo supervisión y administración la preparan. Nada se borra: preparar de nuevo agrega casos nuevos.

alter table public.companies add column if not exists es_prueba boolean not null default false;
create index if not exists companies_es_prueba_idx on public.companies (es_prueba) where es_prueba;

-- Casos ficticios: módulo, título y relato (lo que leerán los agentes).
create or replace function private.sala_pruebas_casos() returns table (modulo text, titulo text, relato text)
language sql immutable set search_path = '' as $$
  values
    ('contabilidad', '[PRUEBA] F29 de septiembre presentado fuera de plazo',
     'Caso ficticio de prueba. La empresa (Pro Pyme general) presentó el F29 de septiembre el 28 de octubre, con IVA por pagar de $1.250.000 y PPM de $180.000. Quiere saber qué multa e intereses corresponden, si puede pedir condonación y cómo evitar que se repita.'),
    ('legal', '[PRUEBA] Despido por necesidades de la empresa',
     'Caso ficticio de prueba. La empresa quiere desvincular a una vendedora con contrato indefinido desde marzo de 2023, sueldo base de $650.000 y gratificación legal, por baja de ventas. Pregunta qué causal usar, qué plazos de aviso tiene, qué indemnizaciones corresponden y qué documentos debe entregar.'),
    ('gestion', '[PRUEBA] Flujo de caja y crédito para capital de trabajo',
     'Caso ficticio de prueba. Ventas mensuales cercanas a $18.000.000 con margen bruto de 32%. Le ofrecen un crédito de $10.000.000 a 24 meses para comprar mercadería antes de diciembre. Quiere saber si su flujo lo soporta y qué alternativas públicas de financiamiento existen.'),
    ('formaliza', '[PRUEBA] ¿Conviene pasar al régimen Pro Pyme transparente?',
     'Caso ficticio de prueba. SpA de un solo socio en régimen Pro Pyme general, con utilidades que el socio retira casi completas cada año. Pregunta si le conviene cambiarse al régimen transparente, desde cuándo y qué trámites requiere ante el SII.')
$$;

create or replace function public.sala_pruebas_preparar() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_co uuid;
  v_hoy date := (now() at time zone 'America/Santiago')::date;
  v_mes date := date_trunc('month', (now() at time zone 'America/Santiago'))::date;
  v_caso uuid;
  v_folio text;
  v_casos jsonb := '[]'::jsonb;
  c record;
  i int;
begin
  if not private.is_supervisor() then raise exception 'ENQ_SIN_PERMISO' using errcode = '42501'; end if;

  select id into v_co from public.companies where es_prueba order by created_at limit 1;
  if v_co is null then
    insert into public.companies (rut, legal_name, trade_name, activity, tax_regime, created_by, es_prueba)
    values ('77777777-7', 'ENQORA Sala de Pruebas SpA (ficticia)', 'Sala de pruebas', 'Comercio al por menor de artículos de ferretería (ficticio)',
            'pro_pyme_general', v_uid, true)
    returning id into v_co;
  end if;

  -- Trabajadores ficticios (solo si aún no hay).
  if not exists (select 1 from public.rem_trabajadores where company_id = v_co) then
    insert into public.rem_trabajadores (company_id, rut, nombre, cargo, fecha_ingreso, tipo_contrato, sueldo_base, jornada_horas, afp, salud, gratificacion, creado_por)
    values
      (v_co, '11111111-1', 'Trabajadora Ficticia Uno', 'Vendedora', date '2023-03-01', 'indefinido', 650000, 42, 'Habitat', 'fonasa', 'art50', v_uid),
      (v_co, '22222222-2', 'Trabajador Ficticio Dos', 'Bodeguero', date '2025-06-15', 'plazo_fijo', 539000, 42, 'Modelo', 'fonasa', 'art50', v_uid),
      (v_co, '33333333-3', 'Trabajadora Ficticia Tres', 'Administración', date '2021-01-04', 'indefinido', 1250000, 42, 'Provida', 'fonasa', 'art50', v_uid);
  end if;

  -- Gastos ficticios: 6 meses de historial y el mes en curso con un duplicado y un monto atípico (para las alertas).
  if not exists (select 1 from public.gastos where company_id = v_co) then
    for i in 1..6 loop
      insert into public.gastos (company_id, period, fecha, monto, iva, descripcion, categoria, documento, proveedor, folio, uso, origen, estado, created_by)
      values
        (v_co, (v_mes - make_interval(months => i))::date, (v_mes - make_interval(months => i))::date + 4, 14000 + i * 900, null, 'Bencina camioneta', 'combustible', 'boleta', 'Estación de servicio ficticia', null, 'negocio', 'texto', 'revisado', v_uid),
        (v_co, (v_mes - make_interval(months => i))::date, (v_mes - make_interval(months => i))::date + 9, 119000, 19000, 'Arriendo bodega', 'arriendo', 'factura', 'Inmobiliaria Ficticia Ltda.', (500 + i)::text, 'negocio', 'texto', 'revisado', v_uid);
    end loop;
    insert into public.gastos (company_id, period, fecha, monto, iva, descripcion, categoria, documento, proveedor, folio, uso, origen, created_by)
    values
      (v_co, v_mes, least(v_mes + 3, v_hoy), 15990, null, 'Bencina camioneta', 'combustible', 'boleta', 'Estación de servicio ficticia', '9001', 'negocio', 'texto', v_uid),
      (v_co, v_mes, least(v_mes + 4, v_hoy), 15990, null, 'Bencina camioneta (repetida)', 'combustible', 'boleta', 'Estación de servicio ficticia', '9001', 'negocio', 'texto', v_uid),
      (v_co, v_mes, least(v_mes + 6, v_hoy), 98000, null, 'Bencina y peajes viaje a Concepción', 'combustible', 'boleta', 'Estación de servicio ficticia', '9002', 'negocio', 'texto', v_uid),
      (v_co, v_mes, least(v_mes + 7, v_hoy), 60000, null, 'Reparación de estantería', 'mantencion', 'sin_documento', null, null, 'por_confirmar', 'texto', v_uid),
      (v_co, v_mes, least(v_mes + 8, v_hoy), 47600, null, 'Pintura y brochas', 'insumos', 'factura', 'Ferretería Ficticia SpA', '7781', 'negocio', 'texto', v_uid);
  end if;

  -- Casos de prueba nuevos en cada preparación, asignados a quien prepara (para que también un abogado o
  -- contador del equipo pueda trabajarlos si se le asignan después).
  for c in select * from private.sala_pruebas_casos() loop
    v_folio := 'ENQ-' || to_char(now() at time zone 'America/Santiago', 'YYYY') || '-' || lpad(nextval('public.case_folio_seq')::text, 5, '0');
    insert into public.cases (folio, company_id, module, title, description, created_by)
    values (v_folio, v_co, c.modulo, c.titulo, c.relato, v_uid)
    returning id into v_caso;
    insert into public.case_assignments (case_id, user_id, role_in_case, assigned_by) values (v_caso, v_uid, 'responsable', v_uid)
    on conflict do nothing;
    perform private.log_case(v_caso, 'creado', 'Caso ficticio de la sala de pruebas.', 'interno');
    v_casos := v_casos || jsonb_build_object('id', v_caso, 'folio', v_folio, 'titulo', c.titulo);
  end loop;

  perform private.log_event(v_co, 'sala_pruebas.preparada', null, jsonb_build_object('casos', jsonb_array_length(v_casos)));
  return jsonb_build_object('empresa', v_co, 'casos', v_casos);
end
$$;

-- Estado de la sala (equipo): empresa, casos de prueba recientes y cuántas ejecuciones de agentes hubo.
create or replace function public.sala_pruebas_estado() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not private.is_staff() then '{}'::jsonb else coalesce((
    select jsonb_build_object(
      'empresa', c.id, 'nombre', c.legal_name, 'rut', c.rut,
      'trabajadores', (select count(*) from public.rem_trabajadores t where t.company_id = c.id and t.activo),
      'gastos', (select count(*) from public.gastos g where g.company_id = c.id),
      'casos', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'folio', k.folio, 'titulo', k.title, 'estado', k.status, 'modulo', k.module,
                 'ejecuciones', (select count(*) from public.agent_runs r where r.case_id = k.id), 'creado', k.created_at) order by k.created_at desc)
               from (select * from public.cases k where k.company_id = c.id order by k.created_at desc limit 16) k), '[]'::jsonb))
    from public.companies c where c.es_prueba order by c.created_at limit 1), '{}'::jsonb) end
$$;

revoke execute on function public.sala_pruebas_preparar(), public.sala_pruebas_estado(), private.sala_pruebas_casos() from public, anon;
grant execute on function public.sala_pruebas_preparar(), public.sala_pruebas_estado() to authenticated;
