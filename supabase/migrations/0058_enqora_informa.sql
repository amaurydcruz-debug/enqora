-- =====================================================================
-- ENQORA · 0058 · ENQORA Informa: centro de inteligencia, investigación y vigilancia normativa
-- Crece sobre la vigilancia normativa existente (0017, 0040, 0050): cada hallazgo sigue siendo una fila de
-- public.regulatory_updates (la misma que ya usan los agentes, la consulta pública y los avisos por rubro).
-- Agrega:
--   1) Catálogo de fuentes oficiales (public.info_sources) con departamento, frecuencia y última revisión.
--   2) Misiones de investigación (public.info_missions, folio INF-00001) con estado, origen y evidencia.
--   3) Ficha editorial y estado de verificación en 9 etapas sobre regulatory_updates, con revisión
--      profesional obligatoria para contenido de alto impacto y alerta (informativa → urgente).
--   4) Historial de versiones (public.info_versions): una publicación corregida nunca pierde lo que decía.
--   5) Lectura pública (anónima) solo de lo publicado, vigente y con fuente; RPC de edición para el equipo.
-- Regla de oro: nada se presenta como verificado sin fuente oficial, fecha de consulta y revisión humana.
-- Se puede ejecutar más de una vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Fuentes oficiales
-- ---------------------------------------------------------------------
create table if not exists public.info_sources (
  key text primary key check (key ~ '^[a-z0-9_]{2,40}$'),
  institucion text not null check (char_length(institucion) between 2 and 140),
  url text not null check (url ~ '^https://[^\s]+$' and char_length(url) <= 300),
  dominio text not null check (dominio ~ '^[a-z0-9.-]+$'),
  departamentos text[] not null default '{}',
  tipos text[] not null default '{}',
  frecuencia text not null default 'semanal' check (frecuencia in ('diaria', 'semanal', 'mensual')),
  metodo text not null default 'busqueda_oficial' check (metodo in ('busqueda_oficial', 'rss', 'api', 'manual')),
  confiabilidad text not null default 'primaria' check (confiabilidad in ('primaria', 'secundaria')),
  activa boolean not null default true,
  ultima_revision timestamptz,
  hallazgos int not null default 0,
  notas text check (char_length(notas) <= 500)
);
alter table public.info_sources enable row level security;
revoke all on public.info_sources from anon, authenticated;
grant select on public.info_sources to authenticated;
drop policy if exists info_sources_equipo on public.info_sources;
create policy info_sources_equipo on public.info_sources for select to authenticated using (private.is_staff());

insert into public.info_sources (key, institucion, url, dominio, departamentos, tipos, frecuencia) values
  ('sii', 'Servicio de Impuestos Internos', 'https://www.sii.cl', 'sii.cl', '{tributario,contable}', '{circular,resolucion,plazo,tramite}', 'semanal'),
  ('tgr', 'Tesorería General de la República', 'https://www.tgr.cl', 'tgr.cl', '{tributario}', '{tramite,beneficio,plazo}', 'semanal'),
  ('diario_oficial', 'Diario Oficial', 'https://www.diariooficial.interior.gob.cl', 'diariooficial.interior.gob.cl', '{legal,tributario,laboral,empresas}', '{ley,reglamento,resolucion}', 'semanal'),
  ('bcn', 'Biblioteca del Congreso Nacional (LeyChile)', 'https://www.bcn.cl/leychile', 'bcn.cl', '{legal,laboral,tributario}', '{ley,reglamento}', 'semanal'),
  ('dt', 'Dirección del Trabajo', 'https://www.dt.gob.cl', 'dt.gob.cl', '{laboral}', '{circular,resolucion,tramite,plazo}', 'semanal'),
  ('previred', 'Previred', 'https://www.previred.com', 'previred.com', '{laboral,contable}', '{plazo,tramite}', 'mensual'),
  ('suseso', 'Superintendencia de Seguridad Social', 'https://www.suseso.cl', 'suseso.cl', '{laboral}', '{circular,resolucion}', 'mensual'),
  ('spensiones', 'Superintendencia de Pensiones', 'https://www.spensiones.cl', 'spensiones.cl', '{laboral}', '{circular,resolucion}', 'mensual'),
  ('res', 'Registro de Empresas y Sociedades', 'https://www.registrodeempresasysociedades.cl', 'registrodeempresasysociedades.cl', '{empresas}', '{tramite}', 'mensual'),
  ('economia', 'Ministerio de Economía, Fomento y Turismo', 'https://www.economia.gob.cl', 'economia.gob.cl', '{empresas,financiero}', '{ley,reglamento,beneficio}', 'mensual'),
  ('inapi', 'Instituto Nacional de Propiedad Industrial', 'https://www.inapi.cl', 'inapi.cl', '{marcas}', '{resolucion,tramite,plazo}', 'semanal'),
  ('corfo', 'CORFO', 'https://www.corfo.cl', 'corfo.cl', '{financiero}', '{beneficio}', 'semanal'),
  ('sercotec', 'Sercotec', 'https://www.sercotec.cl', 'sercotec.cl', '{financiero}', '{beneficio}', 'semanal'),
  ('fosis', 'FOSIS', 'https://www.fosis.gob.cl', 'fosis.gob.cl', '{financiero}', '{beneficio}', 'mensual'),
  ('sence', 'SENCE', 'https://sence.gob.cl', 'sence.gob.cl', '{financiero,laboral}', '{beneficio}', 'mensual'),
  ('prochile', 'ProChile', 'https://www.prochile.gob.cl', 'prochile.gob.cl', '{financiero}', '{beneficio}', 'mensual'),
  ('cmf', 'Comisión para el Mercado Financiero', 'https://www.cmfchile.cl', 'cmfchile.cl', '{financiero,contable}', '{circular,resolucion}', 'mensual'),
  ('chileatiende', 'ChileAtiende (municipalidades y trámites)', 'https://www.chileatiende.gob.cl', 'chileatiende.gob.cl', '{municipal,empresas}', '{tramite}', 'mensual'),
  ('minsal', 'SEREMI de Salud (autorizaciones sanitarias)', 'https://seremienlinea.minsal.cl', 'minsal.cl', '{municipal}', '{tramite,resolucion}', 'mensual'),
  ('sag', 'Servicio Agrícola y Ganadero', 'https://www.sag.gob.cl', 'sag.gob.cl', '{municipal}', '{tramite,resolucion}', 'mensual'),
  ('sernac', 'SERNAC', 'https://www.sernac.cl', 'sernac.cl', '{legal}', '{circular,tramite}', 'mensual'),
  ('pjud', 'Poder Judicial', 'https://www.pjud.cl', 'pjud.cl', '{legal,laboral}', '{otro}', 'mensual'),
  ('mercadopublico', 'ChileCompra (Mercado Público)', 'https://www.mercadopublico.cl', 'mercadopublico.cl', '{financiero,empresas}', '{tramite,beneficio}', 'mensual')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 2. Misiones de investigación
-- ---------------------------------------------------------------------
create sequence if not exists public.info_mission_seq;
create table if not exists public.info_missions (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique default ('INF-' || lpad(nextval('public.info_mission_seq')::text, 5, '0')),
  departamento text not null check (departamento in ('tributario', 'contable', 'legal', 'laboral', 'empresas', 'marcas', 'financiero', 'municipal')),
  tema text check (char_length(tema) <= 300),
  origen text not null default 'programada' check (origen in ('programada', 'evento', 'demanda')),
  estado text not null default 'planificada' check (estado in ('planificada', 'en_curso', 'terminada', 'fallida', 'cancelada')),
  agente text not null default 'director_ia',
  solicitada_por uuid references auth.users (id) on delete set null,
  hallazgos int not null default 0,
  nuevas int not null default 0,
  fuentes text[] not null default '{}',
  error text check (char_length(error) <= 300),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz
);
create index if not exists info_missions_dep_idx on public.info_missions (departamento, created_at desc);
create index if not exists info_missions_estado_idx on public.info_missions (estado);
alter table public.info_missions enable row level security;
revoke all on public.info_missions from anon, authenticated;
grant select on public.info_missions to authenticated;
drop policy if exists info_missions_equipo on public.info_missions;
create policy info_missions_equipo on public.info_missions for select to authenticated using (private.is_staff());

-- ---------------------------------------------------------------------
-- 3. Ficha editorial y verificación sobre los hallazgos existentes
-- ---------------------------------------------------------------------
alter table public.regulatory_updates
  add column if not exists departamento text,
  add column if not exists categorias text[] not null default '{}',
  add column if not exists etapa text not null default 'detectado',
  add column if not exists alerta text not null default 'informativa',
  add column if not exists tipo_contenido text not null default 'obligacion',
  add column if not exists confianza text not null default 'media',
  add column if not exists fecha_consulta date,
  add column if not exists vigente_desde date,
  add column if not exists ficha jsonb not null default '{}'::jsonb,
  add column if not exists requiere_revision boolean not null default false,
  add column if not exists revision_prof_por uuid references auth.users (id) on delete set null,
  add column if not exists revision_prof_at timestamptz,
  add column if not exists revision_prof_nota text,
  add column if not exists mission_id uuid references public.info_missions (id) on delete set null,
  add column if not exists publicado_at timestamptz,
  add column if not exists version int not null default 1;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'regulatory_updates_etapa_chk') then
    alter table public.regulatory_updates add constraint regulatory_updates_etapa_chk check (etapa in
      ('detectado', 'en_investigacion', 'pendiente_contraste', 'verificado', 'revision_profesional', 'publicado', 'actualizado', 'rectificado', 'archivado'));
    alter table public.regulatory_updates add constraint regulatory_updates_alerta_chk check (alerta in ('informativa', 'preventiva', 'importante', 'urgente'));
    alter table public.regulatory_updates add constraint regulatory_updates_tipo_contenido_chk check (tipo_contenido in ('obligacion', 'interpretacion', 'recomendacion', 'oportunidad'));
    alter table public.regulatory_updates add constraint regulatory_updates_confianza_chk check (confianza in ('alta', 'media', 'baja'));
    alter table public.regulatory_updates add constraint regulatory_updates_departamento_chk check (departamento is null or departamento in
      ('tributario', 'contable', 'legal', 'laboral', 'empresas', 'marcas', 'financiero', 'municipal'));
    alter table public.regulatory_updates add constraint regulatory_updates_ficha_chk check (jsonb_typeof(ficha) = 'object' and octet_length(ficha::text) <= 20000);
  end if;
end $$;
create index if not exists regulatory_updates_etapa_idx on public.regulatory_updates (etapa, created_at desc);
create index if not exists regulatory_updates_mission_idx on public.regulatory_updates (mission_id);

-- Lo ya existente queda en la etapa que corresponde a su estado.
update public.regulatory_updates set etapa = case status
    when 'verificada' then case when client_visible then 'publicado' else 'verificado' end
    when 'aplicada' then 'publicado' when 'descartada' then 'archivado' else 'detectado' end,
  fecha_consulta = coalesce(fecha_consulta, reviewed_at::date, created_at::date),
  publicado_at = case when status in ('verificada', 'aplicada') and client_visible then coalesce(publicado_at, reviewed_at) else publicado_at end
where etapa = 'detectado' and status <> 'detectada';

-- La revisión de siempre (Mando → Vigilancia) mantiene la etapa al día.
create or replace function private.info_sync_etapa() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status or new.client_visible is distinct from old.client_visible then
    if new.status = 'descartada' then new.etapa := 'archivado';
    elsif new.status in ('verificada', 'aplicada') and new.client_visible and new.etapa not in ('publicado', 'actualizado', 'rectificado') then
      -- Contenido de alto impacto: queda en revisión profesional hasta que un abogado o contador lo revise.
      if new.requiere_revision and new.revision_prof_at is null then new.etapa := 'revision_profesional';
      else new.etapa := 'publicado'; new.publicado_at := coalesce(new.publicado_at, now()); end if;
    elsif new.status in ('verificada', 'aplicada') and not new.client_visible and new.etapa in ('detectado', 'en_investigacion', 'pendiente_contraste') then
      new.etapa := 'verificado';
    end if;
    new.fecha_consulta := coalesce(new.fecha_consulta, (now() at time zone 'America/Santiago')::date);
  end if;
  return new;
end
$$;
drop trigger if exists info_sync_etapa on public.regulatory_updates;
create trigger info_sync_etapa before update of status, client_visible on public.regulatory_updates
  for each row execute function private.info_sync_etapa();

-- ---------------------------------------------------------------------
-- 4. Historial de versiones
-- ---------------------------------------------------------------------
create table if not exists public.info_versions (
  id uuid primary key default gen_random_uuid(),
  update_id uuid not null references public.regulatory_updates (id) on delete cascade,
  version int not null,
  title text not null,
  summary text not null,
  ficha jsonb not null,
  etapa text not null,
  source_url text not null,
  vigente_desde date,
  vigente_hasta date,
  motivo text,
  cambiado_por uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (update_id, version)
);
alter table public.info_versions enable row level security;
revoke all on public.info_versions from anon, authenticated;
grant select on public.info_versions to authenticated;
drop policy if exists info_versions_equipo on public.info_versions;
create policy info_versions_equipo on public.info_versions for select to authenticated using (private.is_staff());

create or replace function private.info_guardar_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.title, new.summary, new.ficha, new.source_url, new.vigente_desde, new.vigente_hasta)
     is distinct from (old.title, old.summary, old.ficha, old.source_url, old.vigente_desde, old.vigente_hasta)
     and old.etapa in ('publicado', 'actualizado', 'rectificado') then
    insert into public.info_versions (update_id, version, title, summary, ficha, etapa, source_url, vigente_desde, vigente_hasta, motivo, cambiado_por)
    values (old.id, old.version, old.title, old.summary, old.ficha, old.etapa, old.source_url, old.vigente_desde, old.vigente_hasta,
            nullif(current_setting('enqora.motivo', true), ''), auth.uid())
    on conflict (update_id, version) do nothing;
    new.version := old.version + 1;
  end if;
  return new;
end
$$;
drop trigger if exists info_guardar_version on public.regulatory_updates;
create trigger info_guardar_version before update on public.regulatory_updates
  for each row execute function private.info_guardar_version();

-- ---------------------------------------------------------------------
-- 5. Departamentos → categorías ENQORA y regla de alto impacto
-- ---------------------------------------------------------------------
create or replace function private.info_categorias(p_dep text) returns text[]
language sql immutable set search_path = '' as $$
  select case p_dep
    when 'tributario' then array['tributario', 'contabilidad']
    when 'contable' then array['contabilidad', 'gestion']
    when 'legal' then array['profesionales', 'constitucion']
    when 'laboral' then array['trabajador', 'empleador', 'gestion']
    when 'empresas' then array['constitucion', 'formalizacion']
    when 'marcas' then array['marcas']
    when 'financiero' then array['crecimiento']
    when 'municipal' then array['formalizacion']
    else '{}'::text[] end
$$;

create or replace function private.info_alto_impacto(p_dep text, p_kind text, p_alerta text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_dep in ('tributario', 'legal', 'laboral') and p_kind in ('ley', 'reglamento', 'circular', 'resolucion'), false)
      or coalesce(p_alerta in ('importante', 'urgente'), false)
$$;

-- ---------------------------------------------------------------------
-- 6. Director IA (servicio): plan, misiones e ingreso de hallazgos
-- ---------------------------------------------------------------------
create or replace function public.svc_informa_plan(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  return jsonb_build_object(
    'pedidas', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'departamento', m.departamento, 'tema', m.tema) order by m.created_at)
       from public.info_missions m where m.estado = 'planificada'), '[]'::jsonb),
    'ultimas', coalesce((select jsonb_object_agg(d.dep, d.ultima) from (
       select x.dep, max(m.created_at) as ultima
       from unnest(array['tributario', 'contable', 'legal', 'laboral', 'empresas', 'marcas', 'financiero', 'municipal']) x(dep)
       left join public.info_missions m on m.departamento = x.dep and m.estado in ('terminada', 'en_curso')
       group by x.dep) d), '{}'::jsonb));
end
$$;

-- Registra una ronda del Director IA: crea o cierra las misiones e ingresa los hallazgos (como «detectado»).
create or replace function public.svc_informa_registrar(p_token text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_m jsonb;
  v_item jsonb;
  v_id uuid;
  v_dep text;
  v_ids jsonb := '{}'::jsonb;
  v_n int := 0;
  v_total int := 0;
  v_hoy date := (now() at time zone 'America/Santiago')::date;
  v_ok boolean := coalesce((p ->> 'ok')::boolean, false);
  v_host text;
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  if jsonb_typeof(p -> 'misiones') <> 'array' then raise exception 'ENQ_DATOS_INVALIDOS'; end if;

  for v_m in select * from jsonb_array_elements(p -> 'misiones') limit 4 loop
    v_dep := v_m ->> 'departamento';
    if v_dep not in ('tributario', 'contable', 'legal', 'laboral', 'empresas', 'marcas', 'financiero', 'municipal') then continue; end if;
    v_id := null;
    if coalesce(v_m ->> 'id', '') ~ '^[0-9a-f-]{36}$' then
      update public.info_missions set estado = 'en_curso', started_at = coalesce((p ->> 'inicio')::timestamptz, now())
      where id = (v_m ->> 'id')::uuid and estado = 'planificada' returning id into v_id;
    end if;
    if v_id is null then
      insert into public.info_missions (departamento, tema, origen, estado, started_at)
      values (v_dep, left(v_m ->> 'tema', 300), coalesce(nullif(v_m ->> 'origen', ''), 'programada'), 'en_curso', coalesce((p ->> 'inicio')::timestamptz, now()))
      returning id into v_id;
    end if;
    v_ids := v_ids || jsonb_build_object(v_dep, v_id);
  end loop;

  if v_ok and jsonb_typeof(p -> 'items') = 'array' then
    for v_item in select * from jsonb_array_elements(p -> 'items') limit 30 loop
      v_dep := coalesce(v_item ->> 'departamento', '');
      v_total := v_total + 1;
      if private.insert_update(v_item, 'vigilancia') then
        v_n := v_n + 1;
        update public.regulatory_updates u set
          departamento = case when v_ids ? v_dep then v_dep else u.departamento end,
          mission_id = case when v_ids ? v_dep then (v_ids ->> v_dep)::uuid else u.mission_id end,
          categorias = case when v_ids ? v_dep then private.info_categorias(v_dep) else u.categorias end,
          fecha_consulta = v_hoy,
          requiere_revision = private.info_alto_impacto(v_dep, u.kind, null),
          tipo_contenido = case when u.kind = 'beneficio' then 'oportunidad' else 'obligacion' end,
          ficha = jsonb_strip_nulls(jsonb_build_object(
            'que_cambio', left(v_item ->> 'que_cambio', 1200), 'afecta_a', left(v_item ->> 'afecta_a', 600),
            'desde', left(v_item ->> 'desde', 40)))
        where u.dedupe_key = md5(lower(v_item ->> 'url') || '|' || lower(trim(v_item ->> 'titulo')));
        if v_ids ? v_dep then update public.info_missions set nuevas = nuevas + 1 where id = (v_ids ->> v_dep)::uuid; end if;
      end if;
      if v_ids ? v_dep then update public.info_missions set hallazgos = hallazgos + 1 where id = (v_ids ->> v_dep)::uuid; end if;
      -- Última revisión de la fuente citada.
      begin
        v_host := lower(substring(v_item ->> 'url' from '^https://([^/]+)'));
        update public.info_sources s set ultima_revision = now(), hallazgos = s.hallazgos + 1
        where v_host = s.dominio or v_host like '%.' || s.dominio;
      exception when others then null;
      end;
    end loop;
  end if;

  update public.info_missions set estado = case when v_ok then 'terminada' else 'fallida' end, ended_at = now(),
    error = case when v_ok then null else left(p ->> 'error', 300) end,
    fuentes = coalesce((select array_agg(distinct s.key) from public.info_sources s where s.activa and s.departamentos && array[departamento]), '{}')
  where id in (select (value #>> '{}')::uuid from jsonb_each(v_ids));
  -- Las fuentes del departamento quedan revisadas aunque no haya novedades.
  if v_ok then
    update public.info_sources s set ultima_revision = now()
    where s.activa and s.departamentos && (select array_agg(key) from jsonb_object_keys(v_ids) key);
  end if;

  if v_n > 0 then
    perform private.notify(private.staff_users(array['enqora_admin', 'ops_director']), null, null, 'equipo',
      'ENQORA Informa: ' || v_n || ' hallazgo' || case when v_n = 1 then '' else 's' end || ' por verificar',
      'El Director IA terminó una ronda de investigación. Verifica cada hallazgo en su fuente antes de publicarlo.',
      '/mando/informa', 'informa-' || to_char(now(), 'YYYY-MM-DD-HH24'));
  end if;
  return jsonb_build_object('misiones', v_ids, 'encontrados', v_total, 'nuevos', v_n);
end
$$;

-- Investigación bajo demanda (supervisión): queda planificada y el Director IA la toma primero.
create or replace function public.informa_pedir_mision(p_departamento text, p_tema text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_id uuid;
begin
  if not private.is_supervisor() then raise exception 'ENQ_SIN_PERMISO'; end if;
  if p_departamento not in ('tributario', 'contable', 'legal', 'laboral', 'empresas', 'marcas', 'financiero', 'municipal')
     or char_length(trim(coalesce(p_tema, ''))) not between 8 and 300 then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
  insert into public.info_missions (departamento, tema, origen, estado, solicitada_por)
  values (p_departamento, trim(p_tema), 'demanda', 'planificada', v_uid) returning id into v_id;
  return v_id;
end
$$;

-- ---------------------------------------------------------------------
-- 7. Centro editorial (equipo)
-- ---------------------------------------------------------------------
-- Editar la ficha y avanzar la etapa. Publicar exige fuente, fecha de consulta, verificación humana y,
-- si es de alto impacto, revisión profesional. Una corrección de algo publicado deja versión y motivo.
create or replace function public.informa_editar(p_update uuid, p jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
  v_u public.regulatory_updates;
  v_etapa text := nullif(p ->> 'etapa', '');
  v_ficha jsonb;
  v_publicada boolean;
  v_motivo text := nullif(trim(coalesce(p ->> 'motivo', '')), '');
begin
  if not private.is_supervisor() then raise exception 'ENQ_SIN_PERMISO'; end if;
  select * into v_u from public.regulatory_updates where id = p_update for update;
  if not found then raise exception 'ENQ_NO_ENCONTRADO'; end if;
  v_publicada := v_u.etapa in ('publicado', 'actualizado', 'rectificado');
  if v_etapa is not null and v_etapa not in ('detectado', 'en_investigacion', 'pendiente_contraste', 'verificado', 'revision_profesional', 'publicado', 'actualizado', 'rectificado', 'archivado') then
    raise exception 'ENQ_DATOS_INVALIDOS';
  end if;
  v_ficha := case when jsonb_typeof(p -> 'ficha') = 'object' then (
      select coalesce(jsonb_object_agg(k, left(v #>> '{}', 3000)), '{}'::jsonb) from jsonb_each(p -> 'ficha') e(k, v)
      where k in ('que_cambio', 'antes', 'ahora', 'afecta_a', 'desde', 'obligaciones', 'riesgos', 'acciones', 'tecnica', 'documentos')
        and jsonb_typeof(v) = 'string' and char_length(trim(v #>> '{}')) > 0)
    else v_u.ficha end;
  -- Corregir lo ya publicado exige motivo (queda en el historial); reenviar el mismo texto no es un cambio.
  if v_publicada and v_motivo is null and (
       coalesce(nullif(trim(p ->> 'titulo'), ''), v_u.title) <> v_u.title
    or coalesce(nullif(trim(p ->> 'resumen'), ''), v_u.summary) <> v_u.summary
    or v_ficha <> v_u.ficha
    or v_etapa in ('rectificado', 'actualizado')) then
    raise exception 'ENQ_FALTA_OBSERVACION';
  end if;

  perform set_config('enqora.motivo', coalesce(v_motivo, ''), true);
  update public.regulatory_updates set
    title = coalesce(nullif(trim(p ->> 'titulo'), ''), title),
    summary = coalesce(nullif(trim(p ->> 'resumen'), ''), summary),
    source_url = case when coalesce(p ->> 'url', '') ~ '^https://[^\s]+\.[^\s]+$' then p ->> 'url' else source_url end,
    institution = coalesce(left(nullif(trim(p ->> 'institucion'), ''), 120), institution),
    ficha = v_ficha,
    departamento = case when p ->> 'departamento' in ('tributario', 'contable', 'legal', 'laboral', 'empresas', 'marcas', 'financiero', 'municipal') then p ->> 'departamento' else departamento end,
    categorias = case when jsonb_typeof(p -> 'categorias') = 'array' then coalesce((select array_agg(x) from jsonb_array_elements_text(p -> 'categorias') x
       where x in ('contabilidad', 'constitucion', 'formalizacion', 'marcas', 'tributario', 'gestion', 'profesionales', 'crecimiento', 'enterprise', 'trabajador', 'empleador')), '{}') else categorias end,
    alerta = case when p ->> 'alerta' in ('informativa', 'preventiva', 'importante', 'urgente') then p ->> 'alerta' else alerta end,
    tipo_contenido = case when p ->> 'tipo_contenido' in ('obligacion', 'interpretacion', 'recomendacion', 'oportunidad') then p ->> 'tipo_contenido' else tipo_contenido end,
    confianza = case when p ->> 'confianza' in ('alta', 'media', 'baja') then p ->> 'confianza' else confianza end,
    vigente_desde = case when p ? 'vigente_desde' then nullif(p ->> 'vigente_desde', '')::date else vigente_desde end,
    vigente_hasta = case when p ? 'vigente_hasta' then nullif(p ->> 'vigente_hasta', '')::date else vigente_hasta end,
    published_on = case when p ? 'publicado' then nullif(p ->> 'publicado', '')::date else published_on end,
    fecha_consulta = case when p ? 'fecha_consulta' then nullif(p ->> 'fecha_consulta', '')::date else fecha_consulta end
  where id = p_update returning * into v_u;

  -- La regla de alto impacto se recalcula con la ficha nueva (nunca se puede bajar a mano).
  update public.regulatory_updates set requiere_revision = requiere_revision or private.info_alto_impacto(departamento, kind, alerta)
  where id = p_update returning * into v_u;

  if v_etapa is not null and v_etapa <> v_u.etapa then
    if v_etapa in ('publicado', 'actualizado', 'rectificado') then
      if v_u.fecha_consulta is null or v_u.source_url is null then raise exception 'ENQ_DATOS_INVALIDOS'; end if;
      if v_u.requiere_revision and v_u.revision_prof_at is null then raise exception 'ENQ_REVISION_PROFESIONAL'; end if;
      update public.regulatory_updates set etapa = v_etapa, status = case when status = 'aplicada' then 'aplicada' else 'verificada' end,
        client_visible = true, reviewed_by = coalesce(reviewed_by, v_uid), reviewed_at = coalesce(reviewed_at, now()),
        publicado_at = coalesce(publicado_at, now())
      where id = p_update;
    elsif v_etapa = 'archivado' then
      update public.regulatory_updates set etapa = 'archivado', client_visible = false,
        review_note = coalesce(left(v_motivo, 1000), review_note) where id = p_update;
    else
      update public.regulatory_updates set etapa = v_etapa,
        status = case when v_etapa in ('verificado', 'revision_profesional') and status = 'detectada' then 'verificada' else status end,
        client_visible = false,
        reviewed_by = case when v_etapa in ('verificado', 'revision_profesional') then coalesce(reviewed_by, v_uid) else reviewed_by end,
        reviewed_at = case when v_etapa in ('verificado', 'revision_profesional') then coalesce(reviewed_at, now()) else reviewed_at end
      where id = p_update;
    end if;
  end if;
  select etapa into v_etapa from public.regulatory_updates where id = p_update;
  return v_etapa;
end
$$;

-- Revisión profesional: un abogado o contador del equipo (o la administración) confirma el contenido.
create or replace function public.informa_revision_profesional(p_update uuid, p_nota text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_session();
begin
  if not private.is_staff(array['enqora_admin', 'lawyer_pro', 'accountant_pro']) then raise exception 'ENQ_SIN_PERMISO'; end if;
  if char_length(trim(coalesce(p_nota, ''))) < 10 then raise exception 'ENQ_FALTA_OBSERVACION'; end if;
  update public.regulatory_updates set revision_prof_por = v_uid, revision_prof_at = now(), revision_prof_nota = left(trim(p_nota), 1000),
    etapa = case when etapa = 'revision_profesional' then 'verificado' else etapa end
  where id = p_update and etapa not in ('archivado');
  if not found then raise exception 'ENQ_NO_ENCONTRADO'; end if;
end
$$;

-- Tablero del Centro de mando.
create or replace function public.informa_tablero() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_staff() then raise exception 'ENQ_SIN_PERMISO'; end if;
  return jsonb_build_object(
    'fuentes', (select count(*) from public.info_sources where activa),
    'fuentes_al_dia', (select count(*) from public.info_sources where activa and ultima_revision > now() - interval '35 days'),
    'misiones_activas', (select count(*) from public.info_missions where estado in ('planificada', 'en_curso')),
    'misiones_30d', (select count(*) from public.info_missions where created_at > now() - interval '30 days'),
    'fallidas_30d', (select count(*) from public.info_missions where estado = 'fallida' and created_at > now() - interval '30 days'),
    'hallazgos_30d', (select coalesce(sum(nuevas), 0) from public.info_missions where created_at > now() - interval '30 days'),
    'por_verificar', (select count(*) from public.regulatory_updates where etapa in ('detectado', 'en_investigacion', 'pendiente_contraste')),
    'revision_profesional', (select count(*) from public.regulatory_updates where etapa = 'revision_profesional'
       or (requiere_revision and revision_prof_at is null and etapa = 'verificado')),
    'por_publicar', (select count(*) from public.regulatory_updates where etapa = 'verificado' and (not requiere_revision or revision_prof_at is not null)),
    'publicadas', (select count(*) from public.regulatory_updates where etapa in ('publicado', 'actualizado', 'rectificado')),
    'alertas_criticas', (select count(*) from public.regulatory_updates where alerta in ('importante', 'urgente') and etapa not in ('archivado')
       and (vigente_hasta is null or vigente_hasta >= (now() at time zone 'America/Santiago')::date)));
end
$$;

-- ---------------------------------------------------------------------
-- 8. Lectura pública: solo lo publicado, vigente y con fuente
-- ---------------------------------------------------------------------
create or replace function public.informa_publicaciones(p_categoria text default null, p_q text default null, p_limit int default 60)
returns table (id uuid, titulo text, resumen text, institucion text, tipo text, fuente text, publicado date, consultado date,
  vigente_desde date, vigente_hasta date, etapa text, alerta text, tipo_contenido text, departamento text, categorias text[],
  revision_profesional boolean, verificado_at timestamptz, version int, ficha jsonb)
language sql stable security definer set search_path = '' as $$
  select u.id, u.title, u.summary, u.institution, u.kind, u.source_url, u.published_on, u.fecha_consulta,
    u.vigente_desde, u.vigente_hasta, u.etapa, u.alerta, u.tipo_contenido, u.departamento, u.categorias,
    u.revision_prof_at is not null, u.reviewed_at, u.version, u.ficha
  from public.regulatory_updates u
  where u.etapa in ('publicado', 'actualizado', 'rectificado') and u.client_visible and u.status in ('verificada', 'aplicada')
    and u.reviewed_at is not null and u.fecha_consulta is not null
    and (u.vigente_hasta is null or u.vigente_hasta >= (now() at time zone 'America/Santiago')::date)
    and (p_categoria is null or p_categoria = any (u.categorias))
    and (p_q is null or char_length(trim(p_q)) < 2 or u.title ilike '%' || trim(p_q) || '%' or u.summary ilike '%' || trim(p_q) || '%'
         or coalesce(u.institution, '') ilike '%' || trim(p_q) || '%')
  order by case u.alerta when 'urgente' then 0 when 'importante' then 1 else 2 end,
    coalesce(u.publicado_at, u.reviewed_at) desc nulls last
  limit least(greatest(coalesce(p_limit, 60), 1), 100)
$$;

create or replace function public.informa_publicacion(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', u.id, 'titulo', u.title, 'resumen', u.summary, 'institucion', u.institution, 'tipo', u.kind, 'fuente', u.source_url,
    'publicado', u.published_on, 'consultado', u.fecha_consulta, 'vigente_desde', u.vigente_desde, 'vigente_hasta', u.vigente_hasta,
    'etapa', u.etapa, 'alerta', u.alerta, 'tipo_contenido', u.tipo_contenido, 'departamento', u.departamento, 'categorias', u.categorias,
    'revision_profesional', u.revision_prof_at is not null, 'verificado_at', u.reviewed_at, 'version', u.version, 'ficha', u.ficha,
    'historial', coalesce((select jsonb_agg(jsonb_build_object('version', v.version, 'titulo', v.title, 'resumen', v.summary,
        'motivo', v.motivo, 'fecha', v.created_at) order by v.version desc) from public.info_versions v where v.update_id = u.id), '[]'::jsonb))
  from public.regulatory_updates u
  where u.id = p_id and u.etapa in ('publicado', 'actualizado', 'rectificado') and u.client_visible
    and u.status in ('verificada', 'aplicada') and u.reviewed_at is not null
$$;

-- Los caminos que ya existían (consulta por RUT y panel del cliente) también exigen que esté publicada:
-- lo de alto impacto no se filtra mientras espera la revisión profesional.
drop policy if exists novedades_clientes on public.regulatory_updates;
create policy novedades_clientes on public.regulatory_updates for select to authenticated
  using (status in ('verificada', 'aplicada') and client_visible and etapa in ('publicado', 'actualizado', 'rectificado'));

create or replace function public.public_regulatory_news(p_institutions text[] default null)
returns table (title text, summary text, institution text, source_url text, published_on date, reviewed_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select u.title, u.summary, u.institution, u.source_url, u.published_on, u.reviewed_at
  from public.regulatory_updates u
  where u.status in ('verificada', 'aplicada') and u.client_visible and u.etapa in ('publicado', 'actualizado', 'rectificado')
    and (u.vigente_hasta is null or u.vigente_hasta >= (now() at time zone 'America/Santiago')::date)
    and (p_institutions is null or exists (
      select 1 from unnest(p_institutions) i where coalesce(u.institution, '') ilike '%' || i || '%'))
  order by coalesce(u.published_on, u.reviewed_at::date) desc nulls last
  limit 5
$$;

revoke execute on function public.svc_informa_plan(text) from public;
revoke execute on function public.svc_informa_registrar(text, jsonb) from public;
revoke execute on function public.informa_pedir_mision(text, text) from public, anon;
revoke execute on function public.informa_editar(uuid, jsonb) from public, anon;
revoke execute on function public.informa_revision_profesional(uuid, text) from public, anon;
revoke execute on function public.informa_tablero() from public, anon;
revoke execute on function public.informa_publicaciones(text, text, int) from public;
revoke execute on function public.informa_publicacion(uuid) from public;
grant execute on function public.svc_informa_plan(text) to anon, authenticated;
grant execute on function public.svc_informa_registrar(text, jsonb) to anon, authenticated;
grant execute on function public.informa_pedir_mision(text, text) to authenticated;
grant execute on function public.informa_editar(uuid, jsonb) to authenticated;
grant execute on function public.informa_revision_profesional(uuid, text) to authenticated;
grant execute on function public.informa_tablero() to authenticated;
grant execute on function public.informa_publicaciones(text, text, int) to anon, authenticated;
grant execute on function public.informa_publicacion(uuid) to anon, authenticated;
