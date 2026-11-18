-- ENQORA · Revisión de migraciones 0036 a 0061 (solo lectura: no cambia nada)
-- Pégalo en Supabase → SQL Editor → Run. Cada fila dice si esa migración está aplicada.
with c(n, nombre, ok) as (values
  ('0036', 'Documentos legales',              to_regclass('public.legal_signatures') is not null),
  ('0037', 'Persona natural',                 exists (select 1 from pg_constraint where conname = 'companies_tax_regime_check' and pg_get_constraintdef(oid) like '%sin_inicio%')),
  ('0038', 'Precios de prueba',               exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'private' and p.proname = 'is_test_tariff')),
  ('0039', 'Prescripción de deudas',          exists (select 1 from public.services where code = 'LEG-04')),
  ('0040', 'Novedades públicas',              exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'public_regulatory_news')),
  ('0041', 'Robot en consulta',               exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'research_runs' and column_name = 'origen')),
  ('0042', 'Aviso de solicitudes',            exists (select 1 from pg_trigger where tgname = 'solicitudes_caso_aviso')),
  ('0043', 'Trazabilidad de solicitudes',     exists (select 1 from information_schema.columns where table_schema = 'private' and table_name = 'solicitudes_caso' and column_name = 'referencia')),
  ('0044', 'Consentimientos y derechos',      to_regclass('public.data_rights_requests') is not null),
  ('0045', 'Coherencia de casos',             exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'private' and p.proname = 'autorizacion_vigente')),
  ('0046', 'Plantilla de mandatos',           exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'mandates' and column_name = 'template_document_id')),
  ('0047', 'Cobros de prueba',                exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'quotes' and column_name = 'es_prueba')),
  ('0048', 'Robot: consultas vencidas',       exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'private' and p.proname = 'research_vencer')),
  ('0049', 'Uso de IA',                       to_regclass('private.ai_usage') is not null),
  ('0050', 'Vigilancia y aprendizajes',       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'regulatory_updates' and column_name = 'vigente_hasta')),
  ('0051', 'Entrega de notificaciones',       exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'claim_deliveries' and p.pronargs = 3)),
  ('0052', 'Equipo del Mando',                exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'private' and p.proname = 'staff_con_acceso')),
  ('0053', 'Despacho en terreno',             to_regclass('public.field_payouts') is not null),
  ('0054', 'App del gestor',                  to_regclass('public.field_task_downloads') is not null),
  ('0055', 'Mandato SII',                     to_regclass('public.sii_mandates') is not null),
  ('0056', 'Solicitud desde el navegador',    exists (select 1 from information_schema.columns where table_schema = 'private' and table_name = 'solicitudes_caso' and column_name = 'vinculada_via')),
  ('0057', 'Conflictos de interés laboral',   to_regclass('private.case_parties') is not null),
  ('0058', 'ENQORA Informa',                  to_regclass('public.info_versions') is not null),
  ('0058b','ENQORA Informa (versión con imagen)', exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'informa_editar' and pg_get_functiondef(p.oid) like '%imagen%')),
  ('0059', 'Bóveda de archivos',              to_regclass('public.vault_events') is not null),
  ('0060', 'ENQORA SIGN',                     to_regclass('public.sign_signers') is not null),
  ('0060b','ENQORA SIGN (versión actualizada)', exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'sign_documento' and pg_get_functiondef(p.oid) like '%v_s.metodo%')),
  ('0061', 'Firma con huella o Face ID',      to_regclass('public.signing_passkeys') is not null),
  ('0062', 'Recepción final y patente',       exists (select 1 from public.services where code = 'FOR-04'))
)
select n as migracion, nombre, case when ok then 'OK' else 'FALTA' end as estado
from c
order by (not ok) desc, n;
