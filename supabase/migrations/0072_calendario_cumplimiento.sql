-- =====================================================================
-- ENQORA · 0072 · Calendario de cumplimiento con avisos
-- Para cada empresa que hizo su diagnóstico «Empresa al día» (0071), el cron diario calcula sus próximos
-- vencimientos (F29, Previred, Libro de Remuneraciones, patente, declaraciones juradas, F22, inclusión, hitos
-- legales) y avisa 7 días y 1 día antes a quienes llevan la empresa. Un aviso por obligación y fecha: nunca
-- se repite. Cada aviso queda registrado (qué, a qué empresa, para qué fecha).
-- Se puede ejecutar más de una vez.
-- =====================================================================

create table if not exists private.avisos_calendario (
  company_id uuid not null references public.companies (id) on delete cascade,
  clave text not null check (char_length(clave) between 3 and 80),
  dias_antes int not null check (dias_antes between 0 and 60),
  fecha date not null,
  enviado timestamptz not null default now(),
  primary key (company_id, clave, dias_antes)
);
alter table private.avisos_calendario enable row level security;

-- Empresas con diagnóstico: su perfil más reciente (para calcular el calendario).
create or replace function public.svc_calendario_empresas(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_SIN_PERMISO'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('company_id', d.company_id, 'perfil', d.perfil)), '[]'::jsonb)
    from (select distinct on (company_id) company_id, perfil from public.diagnosticos_empresa order by company_id, version desc) d);
end
$$;

-- Envía un aviso de calendario (una sola vez por empresa, obligación y anticipación).
create or replace function public.svc_aviso_calendario(p_token text, p_company uuid, p_clave text, p_dias int, p_fecha date,
  p_titulo text, p_texto text, p_link text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_link is not null and p_link !~ '^/[A-Za-z0-9/_#?=&.-]*$' then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  insert into private.avisos_calendario (company_id, clave, dias_antes, fecha) values (p_company, left(p_clave, 80), p_dias, p_fecha)
  on conflict do nothing;
  if not found then return false; end if;
  perform private.notify(private.company_users(p_company, array['owner', 'admin', 'accountant']), p_company, null, 'casos',
    left(p_titulo, 140), left(p_texto, 500), coalesce(p_link, '/empresa-al-dia#calendario'), 'cal:' || p_company || ':' || p_clave || ':' || p_dias);
  return true;
end
$$;

revoke execute on function public.svc_calendario_empresas(text), public.svc_aviso_calendario(text, uuid, text, int, date, text, text, text) from public;
grant execute on function public.svc_calendario_empresas(text), public.svc_aviso_calendario(text, uuid, text, int, date, text, text, text) to anon, authenticated;
