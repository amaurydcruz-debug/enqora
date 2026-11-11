-- =====================================================================
-- ENQORA · 0039 · Revisión de prescripción de deudas fiscales
-- Antes de pagar o firmar un convenio con la Tesorería se revisa, deuda por deuda, si la acción de cobro
-- prescribió (Código Tributario, arts. 200 y 201: 3 años desde que debió pagarse, o 6 si no se declaró
-- o la declaración fue maliciosamente falsa). Pagar o firmar un convenio reconoce la deuda por escrito y
-- puede interrumpir la prescripción. La prescripción no opera sola: la declara la Tesorería o un tribunal.
-- El servicio queda INACTIVO y SIN PRECIO: ENQORA define el precio y lo activa en Catálogo y precios.
-- Se puede ejecutar más de una vez.
-- =====================================================================
insert into public.services (code, module, name, summary, scope, exclusions, unit, requires_professional, active) values
  ('LEG-04', 'legal', 'Revisión y solicitud de prescripción de deudas fiscales',
   'Revisamos si tus deudas antiguas con la Tesorería están prescritas antes de pagar nada, y pedimos que se declaren.',
   'Revisión, deuda por deuda, del certificado de deuda fiscal y de los movimientos de la cuenta: fecha en que debió pagarse cada impuesto, si se presentó la declaración, notificaciones de giros, convenios, pagos o demandas que hayan interrumpido el plazo; informe con las deudas que podrían estar prescritas y las que no; preparación de la solicitud de prescripción ante la Tesorería y seguimiento.',
   'La prescripción la declara la Tesorería o un tribunal: no está garantizada. No incluye la defensa en juicios de cobro, que se cotiza aparte. ENQORA no pide claves: la persona obtiene sus certificados con las suyas.',
   'caso', true, false)
on conflict (code) do nothing;

insert into public.service_legal_profiles (service_code, institutions, represents, formalidad, base_legal, verificacion, nota)
select 'LEG-04', array['tgr'], true,
  'Poder escrito del cliente para presentar la solicitud de prescripción ante la Tesorería y hacer su seguimiento. Sin facultad para pagar, firmar convenios ni reconocer deudas.',
  'Código Tributario, arts. 200 y 201', 'por_confirmar',
  'Confirmar con el estudio la formalidad del poder ante la Tesorería y la vía (administrativa o judicial) para cada caso.'
where exists (select 1 from public.services where code = 'LEG-04')
on conflict (service_code) do nothing;
