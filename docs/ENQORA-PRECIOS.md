# ENQORA — Catálogo de servicios y motor de precios (M07 / Etapa 6)

Implementa las reglas de `ENQORA-COMERCIAL.md`. Migración: `supabase/migrations/0008_precios.sql`. Prueba: `supabase/tests/0008_precios.sql`.

## Qué se guarda

| Tabla | Contenido |
| --- | --- |
| `services` | Catálogo: código (CON-01…), módulo, nombre, alcance, exclusiones, unidad de cobro (caso, mes, trabajador, documento, hora), si exige criterio profesional y si está activo |
| `service_tariffs` | Tarifas **versionadas** por servicio: base, factores de complejidad (simple ×1, media, compleja, especializada), gestión presencial, recargo por urgencia, descuento máximo, precio mínimo y máximo por unidad, horas y especialidad. Estados: borrador → vigente → retirada. Solo una vigente por servicio |
| `market_references` | Referencias de mercado con proveedor, enlace https, fecha de consulta, alcance comparable y monto. Al cliente solo se le muestran las de los últimos 180 días |
| `quotes` | Cotizaciones del caso: copia del alcance y exclusiones, variables, desglose calculado, motivo del descuento, gastos externos aparte, condiciones de pago, validez, estado y evidencia de la aceptación |

## Cálculo (único, en la base de datos)

`private.quote_calc`:

1. Subtotal = redondeo(base × factor de complejidad) × cantidad.
2. Urgencia = subtotal × recargo %, solo si es urgente.
3. Precio estándar ENQORA = subtotal + urgencia + gestión presencial.
4. Descuento = estándar × descuento %. Siempre se calcula sobre la tarifa estándar vigente.
5. Precio final = estándar − descuento.
6. Los gastos externos se informan aparte.

El formulario del equipo muestra una vista previa con la misma fórmula (`lib/pricing.ts`), pero el precio oficial lo calcula la base de datos al guardar.

## Flujo de una cotización

- **Dentro de parámetros:** descuento ≤ máximo y precio entre el mínimo y el máximo × cantidad. Se envía sola al cliente.
- **Pasa por el Centro de Mando** (tabla `approvals`) en tres casos. El cliente no la ve mientras está en revisión.
  - **Fuera de rango:** tipo «excepción», la decide la supervisión.
  - **Servicio que exige criterio profesional:** tipo «precio», la decide el responsable.
  - **Propuesta de un agente IA:** siempre se revisa.
- **Al aprobarse,** se envía sola (disparador `approvals_quote_flow`). Si se rechaza o devuelve, queda «observada».
- **Aceptar o rechazar:** solo el Propietario o un Administrador de la empresa, con reautenticación reciente y la casilla de confirmación. Se guarda la evidencia (versión de tarifa, precio, alcance, condiciones, sesión). Una cotización vencida no se puede aceptar.
- **Anular:** el equipo puede anular una cotización no aceptada. También se anula su aprobación pendiente.

## Quién puede qué

| Acción | Quién |
| --- | --- |
| Editar el catálogo, crear y publicar o retirar tarifas | Administrador ENQORA (publicar y retirar exigen reautenticación) |
| Registrar referencias de mercado | Todo el equipo, incluidos los agentes de investigación |
| Cotizar | Equipo con acceso al caso (los agentes IA solo proponen) |
| Aprobar excepciones | Centro de Mando, con la regla de los cuatro ojos |
| Aceptar o rechazar | Propietario o Administrador de la empresa cliente |

## Catálogo inicial

Once servicios (CON-01 a CON-05, CRE-01, FOR-01, FOR-02, BRA-01, LEG-01 y GEN-01) **sin precios e inactivos**. ENQORA revisa su alcance, fija las tarifas tras medir el costo por caso y el margen, y los activa desde **Centro de Mando → Catálogo y precios** (`/mando/catalogo`).

## Pantallas

- `/mando/catalogo`: catálogo, versiones de tarifa, publicación y referencias de mercado.
- Página del caso, opción **Cotización**:
  - El equipo cotiza con vista previa en vivo.
  - El cliente ve el desglose honesto (precio estándar, descuento y motivo, precio final, gastos externos, qué incluye y qué no, condiciones, validez y referencias de mercado con su fuente) y decide.
- Centro de control: las cotizaciones que esperan decisión aparecen en «Requiere tu atención».

## Asesor de precios (M20 · 0024)

- **Investigar precios de mercado.** En **Centro de Mando → Catálogo y precios**, cada servicio tiene este botón.
  Además, todos los miércoles (`/api/cron/precios`) el asesor revisa el servicio con las referencias más antiguas.
  - El asesor busca en internet precios **publicados** en Chile por otros proveedores.
  - Cada precio queda registrado con su enlace, la fecha y el texto literal de la página.
  - No registra aranceles del Estado ni precios en UF.
- **Verificación humana.** Lo encontrado queda «por verificar». La supervisión revisa la fuente y lo marca como
  verificado o descartado.
- **Precio sugerido.** Se calcula como la mediana de las referencias verificadas de los últimos 180 días, en la misma
  unidad de cobro, menos el descuento de la política comercial (40% por defecto, editable). Hace falta un mínimo de
  referencias, que por defecto son 3.
- **El asesor nunca publica.** El Administrador crea el borrador con el precio sugerido y lo publica en «Tarifas»
  con su confirmación de identidad.
- **Lo que ve el cliente.** Cuando hay suficientes referencias verificadas y el precio ENQORA es menor, la portada
  y el informe inicial muestran «Mercado $X · ahorras Y%». Ese porcentaje se calcula con la tarifa vigente real,
  no con un número fijo. Al pasar el cursor se ve cuántas fuentes respaldan la mediana y hasta qué fecha se
  consultaron.
- **Cuidado legal.** La publicidad comparativa debe ser veraz y comprobable (Ley 19.496 de protección al
  consumidor). Por eso solo cuentan precios con fuente verificada y recientes. Se recomienda revisión legal antes
  de usar el comparativo en campañas.
