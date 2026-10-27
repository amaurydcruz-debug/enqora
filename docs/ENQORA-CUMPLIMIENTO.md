# ENQORA · Expediente vivo de cumplimiento (M17)

Página **Empresa → Cumplimiento y vencimientos** (`/empresas/[id]/cumplimiento`), también enlazada desde el
expediente de cada caso y desde «Próximos vencimientos» en el Centro de control.

## Matriz de cumplimiento

Cada requisito registra institución, trámite, fundamento y fuente oficial, cuándo aplica, documentos, costo público
(separado de los honorarios de ENQORA), plazo legal o estimado, responsable (empresa, ENQORA, profesional o tercero),
estado, evidencia, observaciones, próxima revisión y fecha de renovación.

- El equipo la genera desde el mapa de requisitos del rubro (M16) y confirma cuáles aplican.
- **Nada queda «presentado» u «obtenido» sin un documento de evidencia** de un caso de la misma empresa.
- «No aplica» exige escribir el motivo.
- Los requisitos con plazo legal vencido pasan a «vencido»; 30 días antes de una renovación se avisa a la empresa.
- La editan la supervisión y el equipo asignado a casos de la empresa; la empresa la ve completa.

## Calendario de obligaciones

| Obligación | Fecha que genera | Fuente |
|---|---|---|
| F29 | Día 20 del mes siguiente (facturador electrónico que declara por internet) o día 12; fin de semana → lunes | SII |
| Cotizaciones | Día 13 si declara y paga electrónicamente (aunque sea inhábil); si no, día 10 hábil | Superintendencia de Pensiones |
| F22 | 30 de abril (verificar calendario de la Operación Renta) | SII |
| Patente, renovaciones y otras | Fecha que registra el equipo o la empresa | Municipalidad / institución |

- Estados: pendiente → preparada → presentada → pagada (o no aplica). **Presentada o pagada exigen folio, comprobante
  o documento.** Lo atrasado pasa a «vencida».
- Avisos automáticos 7 días y 1 día antes (dueños, administradores y contador de la empresa).
- Al registrar un F29 presentado en ENQORA CONTABILIDAD, la obligación del período queda presentada con su folio.
- Los feriados no se calculan automáticamente: si un vencimiento cae en feriado, ajústalo a mano.

## Puesta en marcha

Ejecutar `0018_cumplimiento.sql` y su prueba. Las alertas corren en la tarea diaria existente.
