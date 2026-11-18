-- =====================================================================
-- ENQORA · 0062 · Recepción final y patente municipal (servicio combinado)
-- La recepción final (recepción definitiva) es el antecedente de la patente: una obra solo puede habitarse o
-- destinarse a un uso con recepción definitiva (LGUC, art. 145), y las municipalidades piden el certificado
-- de la Dirección de Obras para otorgar la patente (DL 3.063, art. 26, y sus ordenanzas).
-- Ruta: 1) se confirma si el local tiene recepción final; 2a) si la tiene, se tramita la patente (FOR-02);
-- 2b) si no, se gestiona la recepción final o la regularización con un arquitecto aliado ante la DOM y,
-- según la comuna, la patente provisoria; 3) con la recepción, la patente.
-- La firma de la solicitud ante la DOM corresponde a un profesional competente (LGUC, art. 17), no a ENQORA.
-- El servicio queda INACTIVO y SIN PRECIO: ENQORA define el precio y lo activa en Catálogo y precios.
-- Se puede ejecutar más de una vez.
-- =====================================================================
insert into public.services (code, module, name, summary, scope, exclusions, unit, requires_professional, active) values
  ('FOR-04', 'formaliza', 'Recepción final y patente municipal',
   'Si tu local no tiene recepción final, la gestionamos primero y después tramitamos tu patente. Si ya la tiene, vamos directo a la patente.',
   'Diagnóstico del local: si cuenta con permiso de edificación y recepción final, y si el uso de suelo permite la actividad. Si falta la recepción final: coordinación con un arquitecto aliado para la recepción definitiva o la regularización ante la Dirección de Obras Municipales, preparación de antecedentes y seguimiento de observaciones. Revisión de la patente provisoria cuando la comuna la otorga. Con la recepción final: preparación del expediente de la patente municipal, presentación y seguimiento hasta su otorgamiento.',
   'Los derechos municipales, los honorarios del arquitecto, las obras o modificaciones que pida la Dirección de Obras y los permisos sectoriales (por ejemplo, resolución sanitaria) se informan aparte como gastos externos. La recepción final y la patente las otorga la municipalidad: no están garantizadas. Si el uso de suelo no permite la actividad, ninguna gestión puede obtener la patente en ese local.',
   'caso', true, false)
on conflict (code) do nothing;

insert into public.service_legal_profiles (service_code, institutions, represents, formalidad, base_legal, verificacion, nota)
select 'FOR-04', array['municipalidad'], true,
  'Poder escrito del propietario o arrendatario del local para gestionar ante la Dirección de Obras y Rentas Municipales. La solicitud de recepción definitiva o de regularización la firma el profesional competente (arquitecto) junto con el propietario.',
  'LGUC (DFL 458), arts. 17, 144 y 145; DL 3.063 de Rentas Municipales, art. 26; ordenanza de patentes de cada comuna', 'por_confirmar',
  'Confirmar con el estudio la formalidad del poder en cada comuna y si la ordenanza permite patente provisoria para el giro del cliente.'
where exists (select 1 from public.services where code = 'FOR-04')
on conflict (service_code) do nothing;
