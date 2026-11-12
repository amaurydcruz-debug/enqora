-- =====================================================================
-- ENQORA · 0052 · Centro de Mando, equipo y estado
--  1. Acceso del equipo coherente en todo el sistema: quien tiene el pase diario vencido o el acceso cortado ya
--     no recibe avisos de trabajo (con datos de casos) por correo o WhatsApp, ni entra en la lista de un caso.
--  2. Casos con un responsable que ya no tiene acceso se tratan como «sin responsable»: la vigilancia diaria
--     avisa a la supervisión para reasignarlos, y los vencidos le llegan a la supervisión, no a quien ya no está.
--  3. El panel de equipo muestra cuántos casos abiertos tiene cada persona, para reasignarlos antes de cortar
--     su acceso.
--  4. Estado del sistema detecta TODAS las migraciones (0017 a 0052), no solo hasta la 0016: se ve cuál falta
--     pegar en Supabase.
-- Se puede ejecutar más de una vez.
-- =====================================================================

create or replace function private.staff_con_acceso(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff_members s where s.user_id = p_user and s.active and s.role <> 'ai_agent'
                 and (s.role = 'enqora_admin' or s.access_until > now()))
$$;

create or replace function private.staff_users(p_roles text[]) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(s.user_id), '{}') from public.staff_members s
  where s.active and s.role = any (p_roles) and private.staff_con_acceso(s.user_id)
$$;

create or replace function private.case_team(p_case uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct a.user_id), '{}')
  from public.case_assignments a
  where a.case_id = p_case and private.staff_con_acceso(a.user_id)
$$;

create or replace function private.notify(
  p_users uuid[], p_company uuid, p_case uuid, p_category text, p_title text, p_body text, p_link text, p_dedupe text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_user uuid;
  v_id bigint;
  v_pref public.notification_preferences;
begin
  for v_user in select distinct u from unnest(coalesce(p_users, '{}')) u where u is not null and u is distinct from v_actor loop
    -- Personas del equipo sin acceso vigente (pase diario terminado o acceso cortado) no reciben avisos de trabajo:
    -- solo los de su cuenta o los de una empresa de la que son integrantes.
    continue when p_category <> 'cuenta'
      and exists (select 1 from public.staff_members s where s.user_id = v_user)
      and not private.staff_con_acceso(v_user)
      and not (p_company is not null and exists (select 1 from public.company_members m where m.company_id = p_company and m.user_id = v_user));
    insert into public.notifications (user_id, company_id, case_id, category, title, body, link, dedupe_key)
    values (v_user, p_company, p_case, p_category, left(p_title, 200), left(p_body, 500), p_link, p_dedupe)
    on conflict (user_id, dedupe_key) do nothing
    returning id into v_id;
    continue when v_id is null;

    select * into v_pref from public.notification_preferences where user_id = v_user;
    -- Los avisos de la cuenta (seguridad, derechos sobre datos) llegan siempre por correo: no se pueden silenciar.
    if p_category = 'cuenta' then
      insert into public.notification_deliveries (notification_id, channel) values (v_id, 'email');
    elsif not (p_category = any (coalesce(v_pref.muted, '{}'))) then
      if coalesce(v_pref.email, true) then
        insert into public.notification_deliveries (notification_id, channel) values (v_id, 'email');
      end if;
      if coalesce(v_pref.whatsapp, false) and v_pref.phone_verified_at is not null then
        insert into public.notification_deliveries (notification_id, channel) values (v_id, 'whatsapp');
      end if;
    end if;
    v_id := null;
  end loop;
end
$$;

create or replace function public.svc_casos_vigilar(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_hoy date := (now() at time zone 'America/Santiago')::date;
  c record;
  n_sin integer := 0;
  n_venc integer := 0;
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  for c in
    select x.id, x.folio, x.title, x.company_id, x.created_at from public.cases x
    where (x.responsible_id is null or not private.staff_con_acceso(x.responsible_id))
      and x.status not in ('cerrado', 'cancelado') and x.created_at < now() - interval '24 hours'
  loop
    perform private.notify(private.staff_users(array['ops_director', 'enqora_admin']), c.company_id, c.id, 'equipo',
      'Caso sin responsable con acceso · ' || c.folio,
      c.title || ' · lleva ' || greatest(1, extract(day from now() - c.created_at)::int) || ' día(s): sin responsable o con un responsable sin acceso vigente. Reasígnalo.',
      '/casos/' || c.id, 'sinresp-' || c.id || '-' || v_hoy);
    n_sin := n_sin + 1;
  end loop;
  for c in
    select x.id, x.folio, x.title, x.company_id, x.responsible_id, x.due_date from public.cases x
    where x.due_date < v_hoy and x.status not in ('cerrado', 'cancelado')
  loop
    perform private.notify(
      coalesce(case when c.responsible_id is not null and private.staff_con_acceso(c.responsible_id) then array[c.responsible_id] end,
               private.staff_users(array['ops_director', 'enqora_admin'])),
      c.company_id, c.id, 'equipo', 'Caso vencido · ' || c.folio,
      c.title || ' · venció el ' || to_char(c.due_date, 'DD-MM-YYYY') || '.', '/casos/' || c.id, 'vencido-' || c.id || '-' || v_hoy);
    n_venc := n_venc + 1;
  end loop;
  return jsonb_build_object('sin_responsable', n_sin, 'vencidos', n_venc);
end
$$;

-- Equipo con sus casos abiertos como responsable.
drop function if exists public.team_overview();
create or replace function public.team_overview()
returns table (user_id uuid, email text, full_name text, role text, active boolean, access_until timestamptz, has_access boolean, casos_abiertos integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_session();
  if not private.is_staff(array['enqora_admin']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  return query
    select s.user_id, p.email, p.full_name, s.role, s.active, s.access_until,
           s.active and (s.role in ('enqora_admin', 'ai_agent') or coalesce(s.access_until > now(), false)),
           (select count(*)::int from public.cases c where c.responsible_id = s.user_id and c.status not in ('cerrado', 'cancelado'))
    from public.staff_members s left join public.profiles p on p.id = s.user_id
    order by (s.role = 'enqora_admin') desc, p.email;
end
$$;
revoke execute on function public.team_overview() from public, anon;
grant execute on function public.team_overview() to authenticated;

-- Migraciones aplicadas (por un objeto que cada una crea). Solo para el equipo.
create or replace function public.migraciones_estado() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  r record;
  v_ok boolean;
  v_out jsonb := '{}'::jsonb;
  v_a text;
  v_b text;
begin
  perform private.require_session();
  if not private.is_staff(array['enqora_admin', 'ops_director']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  for r in select * from (values
      ('0017', 't', 'public.case_learnings'),
      ('0018', 't', 'public.compliance_items'),
      ('0019', 't', 'public.public_company_profiles'),
      ('0020', 't', 'public.public_sync_runs'),
      ('0021', 't', 'private.sync_trigger'),
      ('0022', 't', 'public.team_passes'),
      ('0023', 'f', 'private.public_profile'),
      ('0024', 't', 'private.pricing_policy'),
      ('0025', 'f', 'public.price_advice'),
      ('0026', 't', 'public.research_runs'),
      ('0027', 'f', 'public.research_public_findings'),
      ('0028', 't', 'private.res_actuaciones'),
      ('0029', 'src', 'public.res_registro|%completo%'),
      ('0030', 't', 'private.solicitudes_caso'),
      ('0031', 't', 'private.escuela_examenes'),
      ('0032', 'f', 'public.svc_public_sync_state'),
      ('0033', 't', 'public.case_ratings'),
      ('0034', 'svc', 'CON-06'),
      ('0035', 'src', 'public.svc_services_for_research|%or not exists%'),
      ('0036', 't', 'public.legal_documents'),
      ('0037', 'chk', 'companies_tax_regime_check|%sin_inicio%'),
      ('0038', 'f', 'private.is_test_tariff'),
      ('0039', 'svc', 'LEG-04'),
      ('0040', 'f', 'public.public_regulatory_news'),
      ('0041', 'c', 'public.research_runs.origen'),
      ('0042', 'f', 'private.on_solicitud_caso_nueva'),
      ('0043', 'c', 'private.solicitudes_caso.referencia'),
      ('0044', 't', 'private.consentimientos'),
      ('0045', 'f', 'public.svc_casos_vigilar'),
      ('0046', 'c', 'public.mandates.accepted_hash'),
      ('0047', 'c', 'public.charges.es_prueba'),
      ('0048', 'f', 'public.svc_research_vencer'),
      ('0049', 't', 'private.ai_usage'),
      ('0050', 'c', 'public.regulatory_updates.vigente_hasta'),
      ('0051', 'f', 'public.avisos_entregas'),
      ('0052', 'f', 'public.migraciones_estado')
    ) m(version, kind, ref)
  loop
    v_a := split_part(r.ref, '|', 1);
    v_b := split_part(r.ref, '|', 2);
    v_ok := case r.kind
      when 't' then to_regclass(r.ref) is not null
      when 'f' then exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                            where n.nspname = split_part(r.ref, '.', 1) and p.proname = split_part(r.ref, '.', 2))
      when 'c' then exists (select 1 from information_schema.columns c where c.table_schema = split_part(r.ref, '.', 1)
                            and c.table_name = split_part(r.ref, '.', 2) and c.column_name = split_part(r.ref, '.', 3))
      when 'src' then exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                              where n.nspname = split_part(v_a, '.', 1) and p.proname = split_part(v_a, '.', 2) and p.prosrc ilike v_b)
      when 'svc' then exists (select 1 from public.services s where s.code = r.ref)
      when 'chk' then exists (select 1 from pg_constraint k where k.conname = v_a and pg_get_constraintdef(k.oid) ilike v_b)
      else false end;
    v_out := v_out || jsonb_build_object(r.version, coalesce(v_ok, false));
  end loop;
  return v_out;
end
$$;
revoke execute on function private.staff_con_acceso(uuid) from public, anon, authenticated;
revoke execute on function public.migraciones_estado() from public;
grant execute on function public.migraciones_estado() to authenticated;
