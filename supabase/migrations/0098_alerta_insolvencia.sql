-- 0098 · Alerta interna de posible insolvencia: cuando un caso nuevo (o su descripción) trae señales claras de que
-- el cliente no puede pagar sus deudas (quiebra, insolvencia, embargo, cobranza judicial, «no puedo pagar»…),
-- se avisa a los abogados y a la administración de ENQORA. Es solo para el equipo: al cliente no le llega nada.
-- El abogado evalúa (Mando → Insolvencia, habilidad enqora-insolvencia) y decide qué se le propone.
-- Un aviso por caso. Los casos de la sala de pruebas no avisan.

create or replace function private.insolvencia_texto(p text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p, '') ~* ('(quiebra|insolvencia|insolvente|embarg|demanda (ejecutiva|de cobro|de liquidaci)|cobranza judicial|juicio ejecutivo'
    || '|liquidaci(ó|o)n (voluntaria|forzosa)|reorganizaci(ó|o)n judicial|no (puedo|podemos|alcanzo|alcanzamos) (a )?pagar'
    || '|sobre ?endeudad|no (tengo|tenemos) (plata|dinero|fondos) para (pagar|regulariz))')
$$;

create or replace function private.insolvencia_avisar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not private.insolvencia_texto(coalesce(new.title, '') || ' ' || coalesce(new.description, '')) then return new; end if;
  if exists (select 1 from public.companies c where c.id = new.company_id and c.es_prueba) then return new; end if;
  perform private.notify(private.staff_users(array['lawyer_pro', 'enqora_admin']), new.company_id, new.id, 'equipo',
    'Posible insolvencia · ' || new.folio,
    'El caso trae señales de que el cliente no puede pagar sus deudas. Evalúa rutas (reorganización o liquidación simplificada, renegociación) antes de proponer nada al cliente.',
    '/casos/' || new.id, 'insolvencia-' || new.id);
  return new;
end
$$;
revoke execute on function private.insolvencia_avisar(), private.insolvencia_texto(text) from public, anon;

drop trigger if exists insolvencia_avisar on public.cases;
create trigger insolvencia_avisar after insert or update of description, title on public.cases
  for each row execute function private.insolvencia_avisar();
