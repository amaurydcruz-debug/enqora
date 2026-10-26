# ENQORA — Planes, suscripciones, cobros y pagos (M10 · Etapa 8)

Base de datos: `supabase/migrations/0011_planes_pagos.sql`. Prueba: `supabase/tests/0011_planes_pagos.sql`.

## Planes

- **Dos líneas:** ENQORA Plataforma y ENQORA Contabilidad Profesional. Una empresa tiene como máximo un plan por línea.
- **Cada plan define:**
  - qué incluye y qué no;
  - sus límites: documentos y operaciones al mes, y trabajadores;
  - los servicios del catálogo que incluye;
  - las condiciones de renovación y de cancelación.
- **Precio mensual versionado:** borrador → vigente → retirado.
  - Solo el Administrador ENQORA publica, con reautenticación.
  - Las suscripciones existentes conservan el precio con que se contrataron.
- **Planes iniciales:** cuatro planes, sin precio y desactivados. Un plan solo se activa con un precio vigente.
- **Dónde se ven:**
  - Cliente: `/planes`.
  - Equipo: Centro de Mando → Planes (`/mando/planes`).

## Contratación

1. **Cómo se contrata:**
   - Directo desde `/planes`, por el Propietario o un Administrador, con identidad confirmada.
   - O aceptando una **propuesta mensual** desde el caso.
2. Se crea la suscripción como *pendiente de pago* junto con el cobro del primer mes.
3. El plan se activa cuando se confirma el pago, y el período corre desde ese día.

**Renovación:** 5 días antes de terminar el período pagado se genera el cobro del siguiente. Si pasan 5 días desde el fin del período sin pago, la suscripción queda *vencida*.

**Cancelación:**
- Plan activo: deja de renovarse y sigue vigente hasta el último día pagado. No hay devoluciones proporcionales.
- Plan pendiente o vencido: se cancela de inmediato y se anulan sus cobros abiertos.

## Propuesta mensual al cerrar un caso

- El equipo del caso la prepara cuando el caso está en verificación o cerrado.
- Incluye:
  - qué se resolvió;
  - qué obligaciones continúan;
  - qué toca el próximo mes;
  - qué podría volver a fallar;
  - por qué conviene frente a contratar por separado.
- Usa el precio vigente del plan, sin descuentos.
- Si la redacta un agente IA, pasa por aprobación profesional antes de llegar al cliente.
- No presiona, no exagera riesgos y no garantiza ahorros tributarios.

## Cobros

- **Cotización aceptada:** genera su cobro automáticamente por el precio final, con vencimiento a 5 días. Los gastos externos se informan y pagan aparte.
- **Cada período de suscripción:** genera su propio cobro.
- **Folio:** `COB-AAAA-NNNNN`. Estados: por pagar → en revisión → pagado (o vencido o anulado).

## Pagos

- **Transferencia:**
  - El cliente la informa con el número de operación y la fecha.
  - El Administrador ENQORA la confirma o la rechaza con un motivo, en Centro de Mando → Cobros y pagos.
- **Pago en línea con Flow** (Webpay, tarjetas y otros medios):
  - El estado siempre se consulta a Flow; la notificación que llega no se toma como prueba de pago.
  - El monto y la moneda deben coincidir con el cobro.
  - Un segundo pago sobre un cobro ya pagado queda marcado para devolución.
- **Registro manual:** el Administrador puede registrar un pago recibido por otro medio.
- **Comprobante:** `/facturacion/comprobante/<id>` es un comprobante interno. **No reemplaza la boleta ni la factura electrónica**, que se emiten aparte.

## Configuración

Variables de entorno en Vercel (nunca en el repositorio):

| Variable | Para qué |
|---|---|
| `FLOW_API_KEY`, `FLOW_SECRET_KEY` | Credenciales del comercio en Flow |
| `FLOW_API_URL` | `https://sandbox.flow.cl/api` (pruebas) o `https://www.flow.cl/api` (producción) |
| `ENQORA_SERVICE_TOKEN` | Clave de servicio. Se genera en Centro de Mando → Cobros y pagos → Configuración y se muestra una sola vez; la base de datos guarda solo su hash |
| `CRON_SECRET` | Protege la tarea diaria `/api/cron/facturacion` (8:00, `vercel.json`) |

**Clave de servicio:** la pasarela y la tarea diaria llaman a la base sin sesión. Solo pasan con la clave de servicio; nunca se usa la clave `service_role`.

**Datos de transferencia:** se publican en la misma pantalla. Sin datos de transferencia ni Flow, el cliente ve sus cobros pero no puede pagarlos.

**Facturación diaria:** también se puede ejecutar a mano con «Ejecutar ahora».

## Pendiente

- Los documentos del período se comparan con el límite del plan en ENQORA CONTABILIDAD (aviso, sin bloqueo).
- Emitir la boleta o factura electrónica de cada pago, con un proveedor autorizado por el SII.
- Notificar por correo los cobros por pagar, vencidos y pagados (M11).
