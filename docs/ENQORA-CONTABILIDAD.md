# ENQORA CONTABILIDAD (M12 · Etapa 10)

Base de datos: `supabase/migrations/0013_contabilidad.sql`. Prueba: `supabase/tests/0013_contabilidad.sql`.

**Pantallas:**
- `/contabilidad`: últimos 12 meses.
- `/contabilidad/AAAA-MM`: el período.

El equipo ENQORA entra con `?empresa=<id>` y ve solo las empresas cuyos casos trabaja.

## Principios

- ENQORA **no se conecta al SII ni pide claves**: la empresa sube los archivos que descarga.
- El cálculo es **preliminar**:
  - se basa en los documentos cargados;
  - no reemplaza la propuesta del SII ni la revisión de un profesional;
  - lo que requiere criterio profesional se marca.
- ENQORA **no presenta declaraciones** sin un mandato vigente (ver M11). Registra el folio cuando la declaración se presenta.

## Quién puede hacer qué

| Acción | Quién |
|---|---|
| Ver la contabilidad | Todos los miembros de la empresa y el equipo asignado a sus casos |
| Cargar documentos y cartolas, y conciliar | Propietario, Administrador y Contador de la empresa, y el equipo asignado |
| Aprobar el F29 | Contador ENQORA o supervisión, con identidad confirmada y distinto de quien lo preparó |

## Documentos (Registro de Compras y Ventas)

- **Dónde se descargan:** sii.cl → Registro de Compras y Ventas → Compras o Ventas → «Descargar detalles» (CSV). Se sube tal cual.
- **Columnas:** el lector las reconoce por su nombre (tipo, folio, RUT, razón social, fecha, exento, neto, IVA, IVA no recuperable, IVA activo fijo, IVA uso común, otros impuestos y total). Muestra cómo interpretará la primera fila y permite corregir las columnas.
- **Validación:**
  - Se valida el RUT; los inválidos se descartan.
  - Las boletas pueden venir sin RUT del receptor.
  - Las notas de crédito (tipos 60, 61, 106 y 112) restan.
- **Sin duplicados:** volver a subir el archivo no duplica. Un documento se identifica por libro, tipo, RUT y folio.
- **Vaciar y volver a cargar:** se puede vaciar un libro del período; los documentos conciliados se conservan.

## Banco y conciliación

- **Cartolas:** archivo CSV o TXT del banco. El lector busca la fila de títulos y acepta una columna de monto con signo, o columnas separadas de cargos y abonos.
  - Solo se guardan los movimientos del período.
  - Una cartola repetida no duplica movimientos.
- **Sugerencias:** se cruzan los movimientos con documentos del mismo monto (cargo con compra, abono con venta) y de fecha cercana (hasta 60 días). Suma puntaje que el RUT aparezca en la glosa, que la fecha esté a 10 días o menos y que la glosa traiga el folio.
- **Confirmación:** **siempre la confirma una persona**.
- **Movimientos sin documento:** se clasifican (comisión bancaria, remuneraciones, impuestos, préstamo, traspaso, aporte o retiro, u otro).
- **Límite:** un movimiento se concilia con un solo documento. Los pagos parciales o agrupados se clasifican y se revisan con el contador.

## IVA y F29

### Códigos
Verificados con las instrucciones oficiales del SII ([instrucciones F29](https://www.sii.cl/servicios_online/instrucciones_f29_20241112.pdf)):

| Concepto | Código |
|---|---|
| Facturas emitidas del giro | 503 (cantidad) · 502 (débito) |
| Notas de crédito emitidas | 509 · 510 |
| Total débitos | 538 |
| Facturas recibidas del giro | 519 · 520 |
| Notas de crédito recibidas | 527 · 528 |
| Remanente del mes anterior | 504 |
| Total créditos | 537 |
| IVA determinado | 89 |
| Remanente para el período siguiente | 77 |
| PPM: base imponible, tasa y neto | 563 · 115 · 62 |
| Retención de honorarios | 151 |
| Total a pagar (referencial) | 91 |

### Datos que aporta la persona
- Remanente del mes anterior, ya reajustado según la variación de la UTM.
- Tasa de PPM.
- Retenciones de honorarios.

### Alertas de revisión profesional
- facturas de compra (46);
- IVA de activo fijo;
- IVA de uso común (proporcionalidad);
- otros impuestos;
- exportaciones;
- tipos de documento poco frecuentes;
- remanente con reajuste UTM;
- PPM sin tasa.

### Flujo
1. **Borrador:** se recalcula cuantas veces se quiera.
2. **Revisión profesional:** con cuatro ojos.
3. **Aprobado:** el período queda cerrado para cambios.
4. **Presentado:** con el folio del SII. Si se presenta sin revisión, queda marcado.

### Plazo
Día 12 del mes siguiente, o día 20 si se declara y paga por internet. Se recuerda confirmarlo en sii.cl.

## Límites del plan

- El período muestra cuántos documentos lleva frente al límite del plan vigente.
- Superarlo no bloquea: los documentos se procesan igual y se avisa que el plan podría ajustarse.

## Pendiente

- Lectura directa de XML de DTE.
- Libro diario y mayor, balance y renta anual.
- Remuneraciones.
- Proporcionalidad del IVA de uso común.
- Más formatos de cartola por banco.
