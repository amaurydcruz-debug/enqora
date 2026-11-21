# Plan aprobado (por construir): Contabilidad mensual e Informe de ingreso

Estado: **autorizado por Amaury, sin construir todavía** (20-11-2026). Se construye cuando él lo indique.

## 1. Contabilidad mensual (el objetivo: que el cliente pague una mensualidad y sienta que se le resuelve)

Principio: el cliente no registra casi nada. La mayoría de los datos ya existen en forma electrónica.

| Dato | Dónde existe | Quién lo trae |
|---|---|---|
| Ventas (facturas, boletas, pagos con tarjeta) | SII · Registro de Compras y Ventas y resumen de boletas | ENQORA con Mandato Digital (nunca claves ni robots) |
| Compras (facturas de proveedores) | SII · Registro de Compras y Ventas | ENQORA con Mandato Digital |
| Movimientos del banco | Cartola | El cliente sube 1 archivo al mes; a futuro, finanzas abiertas (Ley Fintec, confirmar fechas) |
| Detalle de ventas diarias | Punto de venta | Exportación o integración (Vania POS primero) |
| Sueldos | Previred / libro de remuneraciones | ENQORA, si hay trabajadores |
| Gastos sin factura | En ningún lado | El cliente: «Registrar gasto» por foto, voz o texto |

Experiencia del cliente:
- Día a día (opcional): «Registrar gasto» con foto de la boleta (lectura automática), voz o texto. CORA avisa que un gasto sin documento no rebaja impuestos.
- Una vez al mes: subir la cartola (si no hay conexión) y «Aprueba tu mes» (ventas, compras, IVA a pagar, vencimiento). ENQORA presenta el F29 con el mandato; el cliente paga.
- Preguntas puntuales de CORA con un toque (¿gasto del negocio o personal?).
- Tarjeta «Tu mes» en el panel: datos recibidos → en revisión → listo para aprobar → presentado.

Ciclo interno: días 1–5 reunir datos y avisar faltantes · 6–12 conciliación por agentes + revisión del contador · 13–17 aprobación del cliente · hasta el 20 presentación del F29 (comprobante a la Bóveda) · abril F22 con los 12 meses ordenados. Agentes preparan, el contador revisa, el cliente aprueba.

Etapas:
1. **Construida (21-11-2026, migración 0066):** tarjeta «Tu mes» en el inicio, aprobación del cliente con constancia del monto, «Tengo una observación», el equipo solo presenta lo aprobado por el cliente, recordatorios días 1–5 y 13–17. Base: plan mensual, Mandato Digital, importador RCV/cartola (ya existe), cierre mensual con aprobación y tarjeta «Tu mes».
2. **Construida (21-11-2026, migración 0067):** «Registrar gasto» con foto (la IA lee la boleta), voz o texto; el cliente confirma antes de guardar, clasifica negocio/personal con un toque y el contador revisa en la contabilidad del mes. Nada se borra: se descarta con motivo.
3. Integraciones: Vania POS, archivos de otros POS, bancos.
4. Automatización: conciliación y preguntas automáticas por agentes.

Decisiones pendientes de Amaury: segmento inicial (sugerido: pyme Pro Pyme con boletas/facturas electrónicas y pocos o ningún trabajador), planes por tamaño y precios, momento de Vania POS, quién paga el IVA (sugerido: el cliente).

Modelo de cobro (en discusión): nunca se bloquea el acceso a la cuenta ni a los documentos del cliente; lo que se cobra es ejecutar el trabajo. Gratis: orientación de CORA, un diagnóstico profesional por área y la cotización. El caso no pasa a «En ejecución» sin cobro pagado y confirmado (falta construir ese bloqueo). Límite de consultas gratis y precio de la consulta adicional: por definir.

## 2. Informe de ingreso («el análisis antes del médico»)

**Construido (21-11-2026, migración 0065):** informe automático al llegar cada solicitud (y cron diario de respaldo), fuentes citadas por id (F1…), plazos con texto fijo, precio solo del catálogo vigente, conflicto calculado por la base, versiones inmutables, corrección que enseña a la línea, crear caso con un clic (supervisión) y borrador al cliente que envía una persona.

Cada solicitud llega al Centro de Mando con un informe del enjambre experto en ese tema; la persona solo lee, corrige y decide.

Hoy existe: análisis breve de CORA en la solicitud (resumen, área, documentos, urgencia laboral con texto fijo verificado) y seis agentes por caso (tributario, contable, legal, financiero, investigador, estratégico) que el equipo ejecuta a mano. Falta: ejecución automática al llegar, un informe único y consolidado, un agente laboral, y acciones de un clic.

Informe de ingreso (una pantalla): qué pide el cliente · hechos clave extraídos · área y especialista sugerido · urgencia y plazos (texto verificado) · datos y documentos faltantes · conflicto de interés · ruta de solución sugerida · servicio del catálogo y precio vigente · riesgos · borrador del mensaje al cliente. Cada dato con su fuente y nivel de certeza.

Acciones de un clic (nada sale al cliente sin aprobación humana): crear caso con la ruta · enviar cotización sugerida · pedir documentos (mensaje ya redactado) · asignar profesional · corregir el informe (la corrección alimenta el aprendizaje).
