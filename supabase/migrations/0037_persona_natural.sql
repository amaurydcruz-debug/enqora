-- =====================================================================
-- ENQORA · 0037 · Clientes persona natural
-- Una persona natural se registra con su propio RUT. Se agregan dos situaciones que no son regímenes
-- de empresa: boletas de honorarios (segunda categoría) y sin inicio de actividades.
-- Las personas naturales con giro siguen usando Pro Pyme, régimen general o renta presunta.
-- Se puede ejecutar más de una vez.
-- =====================================================================
alter table public.companies drop constraint if exists companies_tax_regime_check;
alter table public.companies add constraint companies_tax_regime_check check (
  tax_regime in ('pro_pyme_general', 'pro_pyme_transparente', 'general_semi_integrado',
                 'renta_presunta', 'honorarios', 'sin_inicio', 'otro', 'por_definir')
);
