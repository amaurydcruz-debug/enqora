-- =====================================================================
-- ENQORA · 0047 · Cotizaciones y cobros de PRUEBA
-- Las tarifas de prueba ([PRUEBA], 0038) sirven para recorrer la secuencia completa. Pero una cotización
-- hecha con ellas podía aceptarse y generar un cobro real: el cliente podía pagar $10.000 por pasarela o
-- transferencia, y el cobro contaba en las finanzas del Command Center.
-- Ahora:
--  1) La cotización hecha con una tarifa de prueba queda marcada «de prueba» y el cliente lo ve.
--  2) Su cobro queda marcado «de prueba» (con «[PRUEBA]» en la descripción): NO se puede pagar por pasarela
--     ni informar transferencia; el equipo puede registrar un pago manual para completar la prueba.
--  3) Los cobros de prueba no cuentan en las finanzas del Command Center.
-- Se puede ejecutar más de una vez.
-- =====================================================================
alter table public.quotes add column if not exists es_prueba boolean not null default false;
alter table public.charges add column if not exists es_prueba boolean not null default false;

create or replace function private.on_quote_test() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.es_prueba := coalesce((select private.is_test_tariff(t.notes) from public.service_tariffs t where t.id = new.tariff_id), false);
  return new;
end
$$;
drop trigger if exists quotes_test on public.quotes;
create trigger quotes_test before insert on public.quotes for each row execute function private.on_quote_test();

create or replace function private.on_charge_test() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.quote_id is not null and coalesce((select q.es_prueba from public.quotes q where q.id = new.quote_id), false) then
    new.es_prueba := true;
    if new.description not like '[PRUEBA]%' then new.description := left('[PRUEBA] ' || new.description, 300); end if;
  end if;
  return new;
end
$$;
drop trigger if exists charges_test on public.charges;
create trigger charges_test before insert on public.charges for each row execute function private.on_charge_test();

-- Un cobro de prueba no se paga con dinero real (pasarela ni transferencia informada por el cliente).
create or replace function private.on_payment_test() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.method in ('pasarela', 'transferencia') and coalesce((select c.es_prueba from public.charges c where c.id = new.charge_id), false) then
    raise exception 'ENQ_COBRO_DE_PRUEBA';
  end if;
  return new;
end
$$;
drop trigger if exists payments_test on public.payments;
create trigger payments_test before insert on public.payments for each row execute function private.on_payment_test();

-- Marcar lo que ya existe.
update public.quotes q set es_prueba = true from public.service_tariffs t
where t.id = q.tariff_id and private.is_test_tariff(t.notes) and not q.es_prueba;
update public.charges c set es_prueba = true, description = case when c.description like '[PRUEBA]%' then c.description else left('[PRUEBA] ' || c.description, 300) end
from public.quotes q where q.id = c.quote_id and q.es_prueba and not c.es_prueba;
