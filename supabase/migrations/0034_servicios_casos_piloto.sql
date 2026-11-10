-- =====================================================================
-- ENQORA · 0034 · Servicios para los casos piloto
-- Completa el catálogo con los servicios que CORA, las oportunidades legales y las rutas de trabajo ya
-- recomiendan pero que no existían. Quedan INACTIVOS y SIN PRECIO: el precio y la activación los decide
-- ENQORA desde Centro de Mando → Catálogo y precios. No modifica servicios existentes (on conflict do nothing).
-- Se puede ejecutar más de una vez.
-- =====================================================================

insert into public.services (code, module, name, summary, scope, exclusions, unit, requires_professional) values
  ('CON-06', 'contabilidad', 'Regularización de deudas fiscales con condonación (Ley 21.850)',
   'Pagar tus deudas con la Tesorería con condonación de intereses y multas, hasta el 15 de abril de 2027.',
   'Revisión del certificado de deuda fiscal que entrega la empresa; cálculo del pago al contado frente al convenio en cuotas, con el monto condonado en cada alternativa; recomendación según la caja de la empresa; acompañamiento paso a paso en la plataforma de la Tesorería; verificación del pago o convenio y registro del ahorro logrado.',
   'No incluye el pago de las deudas, deudas no fiscales (municipales o previsionales), rectificación de declaraciones ni representación judicial. ENQORA no pide claves: la empresa ingresa con las suyas.',
   'caso', true),
  ('CON-07', 'contabilidad', 'Evaluación y cambio de régimen tributario',
   'Comparamos tu régimen actual con las alternativas legales y te acompañamos a cambiarte si conviene.',
   'Revisión de los requisitos de cada régimen (Pro Pyme general, Pro Pyme transparente, general semi integrado) con los datos de la empresa y sus dueños; comparación del impuesto de la empresa y de los dueños con supuestos explícitos; recomendación fundada; preparación del aviso de cambio dentro del plazo legal (1 de enero al 30 de abril).',
   'No incluye la contabilidad de los períodos siguientes ni rectificaciones de años anteriores. La presentación ante el SII requiere la autorización de la empresa.',
   'caso', true),
  ('FOR-03', 'formaliza', 'Término de giro',
   'Cierre ordenado de la empresa ante el SII, sin dejar obligaciones pendientes.',
   'Revisión de declaraciones, documentos y deudas pendientes; preparación del balance de término y de los antecedentes del aviso de término de giro; acompañamiento hasta la resolución del SII.',
   'No incluye la disolución de la sociedad ante el Registro de Empresas o el notario, ni el pago de impuestos, multas o giros que determine el SII.',
   'caso', true),
  ('LEG-02', 'legal', 'Cumplimiento laboral y prevención (Ley Karin, reglamento interno, jornada y DS 44)',
   'Pon al día las obligaciones laborales y de seguridad que exige tu número de trabajadores.',
   'Diagnóstico de las obligaciones aplicables según la dotación; protocolo de prevención del acoso y la violencia (Ley 21.643); reglamento interno de orden, higiene y seguridad cuando corresponde; adecuación de contratos a la jornada de 42 horas; matriz de riesgos y programa preventivo del DS 44, coordinados con la mutualidad o el ISL.',
   'No incluye juicios laborales, fiscalizaciones en curso ni capacitaciones presenciales, que se cotizan aparte.',
   'caso', true),
  ('LEG-03', 'legal', 'Adecuación a la Ley 21.719 de datos personales',
   'Prepara tu empresa para la nueva ley de datos personales, vigente desde el 1 de diciembre de 2026.',
   'Inventario de los datos personales que trata la empresa y su base de licitud; política de privacidad y textos de información; procedimiento para atender derechos de acceso, rectificación, supresión, oposición y portabilidad; medidas de seguridad mínimas y registro de incidentes.',
   'No incluye la implementación técnica de sistemas, auditorías externas ni la representación ante la Agencia de Protección de Datos Personales.',
   'caso', true),
  ('CRC-01', 'crece', 'Postulación a beneficios y fondos (Sercotec, Corfo, SENCE)',
   'Identificamos los beneficios que calzan con tu empresa y preparamos la postulación.',
   'Revisión de las convocatorias vigentes y sus requisitos; verificación de elegibilidad con los datos de la empresa; preparación de la postulación y sus antecedentes; planificación de la franquicia SENCE con el tope y los copagos vigentes.',
   'La adjudicación depende de cada institución y no está garantizada. No incluye cofinanciamientos ni aportes propios.',
   'caso', true),
  ('CRC-02', 'crece', 'Inteligencia de compras públicas',
   'Te mostramos qué organismos compran lo que vendes y cómo competir en Mercado Público.',
   'Análisis de las compras públicas del rubro y de los organismos compradores; selección de licitaciones y Compra Ágil donde la empresa puede competir; revisión de bases y preparación de la oferta.',
   'La inscripción en Mercado Público es gratuita en ChileCompra y no se cobra. La acreditación en el Registro de Proveedores es un servicio pagado de ChileCompra. La adjudicación no está garantizada.',
   'caso', false)
on conflict (code) do nothing;
