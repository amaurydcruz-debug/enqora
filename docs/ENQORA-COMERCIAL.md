# ENQORA — Modelo comercial, motor de precios y diagnóstico gratuito

Regla permanente del proyecto. Se construye en las Etapas 6, 7 y 8 (ver `ENQORA-ARQUITECTURA.md`). El motor de precios (Etapa 6) está implementado: ver `ENQORA-PRECIOS.md`. Planes, propuesta mensual y pagos (Etapa 8): ver `ENQORA-PLANES-PAGOS.md`.

## Tres productos distintos

| Línea | Qué es | Cómo se cobra |
| --- | --- | --- |
| ENQORA Plataforma | Acceso a la app, herramientas y contabilidad básica automatizada según el plan | Suscripción |
| ENQORA Servicios | Casos puntuales: constitución, marca, patente, regularización, investigación, gestión presencial | Cotización por caso |
| ENQORA Contabilidad Profesional | Profesionales que revisan, preparan o presentan obligaciones; remuneraciones; cumplimiento continuo | Mensualidad adicional según alcance |

Tener la aplicación no significa que toda gestión profesional esté incluida. Cada cotización dice qué incluye y qué no.

## Principio rector

ENQORA vela prioritariamente por los intereses legítimos del cliente con la normativa chilena: busca las alternativas legales más favorables, previene incumplimientos y resuelve problemas. Toda recomendación es fundamentada, verificable y explica beneficios, obligaciones y riesgos. Los agentes sugieren soluciones y precios; las excepciones y actuaciones que requieren autorización las aprueba el responsable competente en el Centro de Mando.

## Primera consulta gratuita: diagnóstico completo

Objetivo: que el cliente entienda su situación antes de contratar, y que pueda llevar el diagnóstico a un contador o abogado independiente para verificarlo.

El diagnóstico muestra:
1. Qué está ocurriendo, según los antecedentes entregados.
2. Qué obligaciones establece la normativa (con fuente y vigencia).
3. Posibles causas: errores, omisiones o retrasos.
4. Correcciones necesarias y alternativas de regularización por verificar.
5. Beneficios legales o estatales que podrían corresponder (con requisitos).
6. Riesgos de no actuar, sin exagerar.
7. Costo estimado de resolverlo y qué servicio de ENQORA ayudaría.
8. Nivel de certeza y qué falta para confirmarlo.

Siempre rotulado como **diagnóstico preliminar**: no es una resolución oficial ni garantiza resultados que dependen del SII, una municipalidad, un tribunal u otra institución. Las materias sensibles pasan por revisión profesional antes de entregarse.

## Agente de normativa y beneficios

Investiga normativa tributaria, contable, comercial, laboral y beneficios públicos. Cada conclusión trae: fuente oficial, artículo o disposición, vigencia, requisitos, condiciones y excepciones, cálculo estimado, documentos faltantes, riesgos de no actuar y nivel de certeza. Busca alternativas legales favorables; nunca oculta obligaciones ni sugiere evasión.

Recomendar y preparar no es representar: actuar ante una institución o tribunal exige mandato y facultades verificadas (ver Arquitectura).

## Motor de precios

Independiente de los módulos: CREATE, BRAND, FORMALIZA, CONTABILIDAD, LEGAL y los futuros usan el mismo motor.

### Ficha de servicio (catálogo)

Código · descripción y alcance · exclusiones · tarifa base · unidad de cobro (caso, período, trabajador, documento, hora) · variables de complejidad (simple, media, compleja, especializada) · volumen · horas profesionales estimadas y especialidad · costos externos (aranceles, notaría, derechos) · gestión presencial · recargo por urgencia · descuentos y condiciones · precio mínimo y máximo permitidos · vigencia · referencias de mercado · aprobación y versión.

### Cálculo

Precio final = tarifa base + ajuste por complejidad y volumen + gestión presencial + urgencia − descuento aplicable, más costos externos informados por separado.

### Referencias de mercado

Catálogo con proveedor o fuente, URL, fecha de consulta, alcance comparable y monto. Se presentan como **referencia**, nunca como "precio oficial del mercado". Si caducan (por ejemplo, más de 6 meses), se ocultan hasta revisarse.

### Descuentos honestos

- El descuento se calcula sobre la **tarifa estándar ENQORA vigente y documentada**, no sobre un precio de referencia inflado.
- La comparación con el mercado se muestra aparte y con su fuente.
- Prohibido usar precios ficticios para aparentar ahorro (también lo exige la normativa chilena de protección al consumidor sobre publicidad engañosa).

### Autorización

- Dentro de los parámetros aprobados (mínimo, máximo, descuentos permitidos): la cotización se presenta automáticamente.
- Fuera de rango, incoherente o con excepción: va al Centro de Mando para aprobación.
- Los agentes IA pueden proponer, nunca cambiar tarifas aprobadas ni autorizar excepciones.

### Cotización

Precio de referencia (con fuente) · precio estándar ENQORA · descuento y su motivo · precio final · alcance incluido · exclusiones · gastos externos estimados · condiciones de pago · validez. Los casos que requieren criterio profesional o representación se revisan antes de confirmar el precio final.

### Trazabilidad

Quién creó la cotización, con qué datos, qué tarifa y versión aplicó, qué descuento se autorizó y quién lo aprobó, qué versión aceptó el cliente y cuándo. Tarifas con control de versiones, vigencia y auditoría, editables desde el panel administrativo sin tocar código.

## Planes recurrentes

Cada plan define: alcance, límites de documentos y operaciones, trabajadores, servicios incluidos, adicionales, precio mensual, renovación y cancelación.

## Conversión a cliente mensual

Al cerrar un caso, ENQORA puede proponer un plan basado en el expediente real:
- Qué se resolvió y qué quedó al día.
- Qué obligaciones continúan y qué toca el próximo mes.
- Qué podría volver a fallar sin cumplimiento continuo.
- Qué plan conviene, qué incluye, cuánto cuesta y qué beneficio tiene frente a contratar por separado.

Sin presión, sin exagerar riesgos y sin garantizar ahorros tributarios.

## Referencias iniciales encontradas (por validar)

Precios publicados por proveedores chilenos, no tarifas oficiales ni promedios estadísticos. Deben registrarse con su URL y fecha antes de usarse en el simulador:

| Servicio | Referencia publicada |
| --- | --- |
| Contabilidad mensual pyme pequeña | desde $30.000–$60.000 al mes en algunas ofertas |
| Constitución de empresa con asesoría | aprox. $80.000–$200.000 |
| Regularización de contabilidad atrasada | desde $60.000 por mes pendiente |
| Remuneraciones | aprox. $8.000–$15.000 por trabajador al mes |

Las tarifas estándar de ENQORA aún no están definidas: se fijan tras medir costo por caso y margen.
