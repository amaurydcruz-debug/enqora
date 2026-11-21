# API del punto de venta (ENQORA · 0068)

Para que un POS (Vania POS primero, o cualquier otro) envíe a ENQORA el **resumen de ventas de cada día**.
ENQORA lo cruza con las ventas del Registro de Compras y Ventas del SII antes de preparar el F29.

## Clave de conexión
- La crea el propietario o administrador en **Contabilidad → Punto de venta**. Formato `enq_pos_` + 48 caracteres hex.
- Se muestra una sola vez; ENQORA guarda solo su huella SHA-256. Se puede revocar en cualquier momento.
- Debe guardarse en el **servidor** del POS (variable de entorno o función del backend), nunca en el código del navegador.

## Envío
```
POST https://<dominio-enqora>/api/pos/ventas
Authorization: Bearer enq_pos_…
Content-Type: application/json

{ "dias": [
  { "fecha": "2026-11-20", "n_ventas": 42, "total": 385900,
    "efectivo": 120000, "debito": 200000, "credito": 65900, "transferencia": 0, "otros": 0,
    "neto": null, "iva": null, "exento": null } ] }
```
- `fecha` (AAAA-MM-DD, hora de Chile) y `total` (CLP, entero) son obligatorios; el resto es opcional.
- 1 a 62 días por envío; máximo 60 envíos por hora por conexión.
- Reenviar un día **lo reemplaza** (idempotente por fecha y sistema). Cada envío queda en la bitácora con sus totales.
- Un mes con F29 aprobado o presentado no admite cambios (409).

## Respuestas
| Código | Significado |
|---|---|
| 200 | `{ ok: true, dias, total, periodos }` |
| 400 | Formato o datos inválidos |
| 401 | Clave inválida o revocada |
| 409 | El mes ya fue declarado |
| 429 | Demasiados envíos en una hora |

## Vania POS (integralpos)
Recomendado: al cerrar la caja (o una vez al día), una función del servidor (por ejemplo, una Edge Function de
Supabase del POS) suma las `ventas` del día por `metodo_pago` y llama a esta API con la clave guardada como secreto.
Mapeo sugerido de `metodo_pago`: efectivo → `efectivo`; débito/Redcompra → `debito`; crédito → `credito`;
transferencia → `transferencia`; fiado y otros → `otros` (el fiado no es pago: se informa como venta del día).
