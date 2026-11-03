-- =====================================================================
-- ENQORA · CORA Web Research Agent (piloto)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0025_bienvenida.sql.
--
-- Dos tablas nuevas y un bucket privado. No modifica estructuras existentes.
-- • research_runs: cada investigación (o prueba de entorno) que lanza el equipo ENQORA.
-- • research_evidence: una fila por búsqueda en un portal, con su prueba: portal, URL, fecha y hora,
--   consulta, resultado, estado y la ruta de la captura en Storage privado.
-- • Bucket «cora-evidencias» (privado): solo capturas PNG; solo el equipo ENQORA puede subir y ver.
-- Piloto: solo el equipo ENQORA (con segundo factor) usa estas tablas.
-- =====================================================================

create table if not exists public.research_runs (
  id uuid primary key default gen_random_uuid(),
  rut text not null check (rut ~ '^[1-9][0-9]{6,7}-[0-9K]$'),
  razon_social text check (char_length(razon_social) <= 200),
  modo text not null default 'investigacion' check (modo in ('investigacion', 'entorno')),
  status text not null default 'en_cola' check (status in ('en_cola', 'en_curso', 'completada', 'fallida')),
  requested_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  metrics jsonb,
  error text check (char_length(error) <= 1000)
);
create index if not exists research_runs_created_idx on public.research_runs (created_at desc);
create index if not exists research_runs_requested_idx on public.research_runs (requested_by);

create table if not exists public.research_evidence (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.research_runs (id) on delete cascade,
  portal text not null check (char_length(portal) <= 60),
  procedure_version text not null check (char_length(procedure_version) <= 40),
  query jsonb not null,
  url text not null check (char_length(url) <= 500),
  consulted_at timestamptz not null default now(),
  status text not null check (status in ('encontrado', 'sin_resultados', 'bloqueado', 'procedimiento_fallo', 'error')),
  result jsonb,
  screenshot_path text check (char_length(screenshot_path) <= 300),
  duration_ms integer check (duration_ms >= 0),
  detail text check (char_length(detail) <= 1000)
);
create index if not exists research_evidence_run_idx on public.research_evidence (run_id, consulted_at);

alter table public.research_runs enable row level security;
alter table public.research_evidence enable row level security;

drop policy if exists mfa_requerido on public.research_runs;
create policy mfa_requerido on public.research_runs as restrictive for all to authenticated
  using (private.is_mfa()) with check (private.is_mfa());
drop policy if exists mfa_requerido on public.research_evidence;
create policy mfa_requerido on public.research_evidence as restrictive for all to authenticated
  using (private.is_mfa()) with check (private.is_mfa());

drop policy if exists investigaciones_equipo on public.research_runs;
create policy investigaciones_equipo on public.research_runs for all to authenticated
  using (private.is_staff()) with check (private.is_staff());
drop policy if exists evidencias_equipo on public.research_evidence;
create policy evidencias_equipo on public.research_evidence for all to authenticated
  using (private.is_staff()) with check (private.is_staff());

-- Capturas: Storage privado (nunca públicas, nunca dentro de las tablas)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cora-evidencias', 'cora-evidencias', false, 5242880, array['image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists cora_evidencias_subir on storage.objects;
create policy cora_evidencias_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'cora-evidencias' and private.is_mfa() and private.is_staff());
drop policy if exists cora_evidencias_leer on storage.objects;
create policy cora_evidencias_leer on storage.objects for select to authenticated
  using (bucket_id = 'cora-evidencias' and private.is_mfa() and private.is_staff());

grant select, insert, update on public.research_runs, public.research_evidence to authenticated;
revoke all on public.research_runs, public.research_evidence from anon;
