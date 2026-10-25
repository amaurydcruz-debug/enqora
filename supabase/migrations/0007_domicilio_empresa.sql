-- =====================================================================
-- ENQORA · 0007 · Domicilio de la empresa (M03: ficha de empresa)
-- Agrega domicilio y comuna a la empresa y los incorpora a update_company.
-- Seguro de ejecutar más de una vez. Ejecutar en Supabase → SQL Editor.
-- =====================================================================

alter table public.companies
  add column if not exists address text check (char_length(address) <= 200),
  add column if not exists commune text check (char_length(commune) <= 80);

-- La versión anterior (5 parámetros) se reemplaza por una con domicilio y comuna.
drop function if exists public.update_company(uuid, text, text, text, text);

create or replace function public.update_company(
  p_company uuid, p_legal_name text, p_trade_name text default null,
  p_activity text default null, p_tax_regime text default 'por_definir',
  p_address text default null, p_commune text default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_session();
  if not private.has_role(p_company, array['owner', 'admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if char_length(trim(coalesce(p_legal_name, ''))) < 2 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  if char_length(trim(coalesce(p_address, ''))) > 200 or char_length(trim(coalesce(p_commune, ''))) > 80 then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;

  update public.companies set
    legal_name = trim(p_legal_name),
    trade_name = nullif(trim(coalesce(p_trade_name, '')), ''),
    activity = nullif(trim(coalesce(p_activity, '')), ''),
    tax_regime = coalesce(nullif(p_tax_regime, ''), 'por_definir'),
    address = nullif(trim(coalesce(p_address, '')), ''),
    commune = nullif(trim(coalesce(p_commune, '')), ''),
    updated_at = now()
  where id = p_company;

  perform private.log_event(p_company, 'empresa.actualizada');
end
$$;

revoke execute on function public.update_company(uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.update_company(uuid, text, text, text, text, text, text) to authenticated;
