# ENQORA — Etapa 5 · Centro de Mando: aprobaciones y autorizaciones

## Qué incluye

1. **Bandejas por perfil en el Centro de Mando** (`/mando`):
   - Bandejas: Por aprobar, Mis casos, En revisión profesional, Esperando al cliente, Todos los activos, Sin responsable y Finalizados.
   - Cada perfil ve solo las suyas:
     - La supervisión ve todas.
     - Los profesionales ven todas salvo "Todos los activos" y "Sin responsable".
     - Los agentes IA no tienen "Por aprobar".
   - Al entrar se abre "Por aprobar" si hay algo pendiente.
2. **Mecanismo común de aprobaciones internas** (`approvals`):
   - Tipos: diagnóstico, cierre, precio, excepción, actuación u otro.
   - Decisiones posibles: aprobar, rechazar o devolver con observaciones.
   - La Etapa 6 (precios y excepciones) usa este mismo mecanismo.
3. **Autorizaciones del cliente dentro del caso** (`client_authorizations`): explícitas, limitadas a lo descrito, con plazo opcional, con evidencia y revocables.

## Aprobaciones internas

| Quién | Puede |
| --- | --- |
| Equipo con acceso al caso (incluidos agentes IA) | Solicitar una aprobación |
| Responsable del caso | Decidir las que van dirigidas al "Responsable del caso" |
| Contador / Abogado autorizado asignado al caso | Decidir las dirigidas a su rol |
| Supervisión (Administrador ENQORA, Director de operaciones) | Decidir cualquiera |
| Agente IA | **Nunca** decide |
| Cliente | No ve las aprobaciones internas |

Reglas:

- **Cuatro ojos:** quien solicita no decide. Solo la supervisión puede decidir su propia solicitud, y queda marcado en la ficha ("decidida por quien la solicitó").
- **Reautenticación:** decidir exige un código del segundo factor de menos de 15 minutos.
- **Observaciones:** rechazar o devolver exige explicar el motivo (mínimo 10 caracteres).
- **Efectos sobre el caso:**
  - Enviar un **diagnóstico** a aprobación deja el caso "En revisión profesional".
  - **Aprobar** aplica el estado elegido al solicitar, por ejemplo "Pedir autorización al cliente".
  - **Devolver** deja el caso "Devuelto con observaciones".
  - **Rechazar** no cambia el estado del caso.
- **Monto:** en solicitudes de precio se registra el monto propuesto en CLP. Un agente solo sugiere: el precio vale únicamente si se aprueba.

## Autorizaciones del cliente

- **Quién solicita:** el equipo con acceso al caso, salvo los agentes IA. Debe indicar:
  - qué se autoriza,
  - el alcance exacto,
  - la institución (opcional),
  - la vigencia (opcional; no puede nacer vencida).
- **Quién decide:** solo el **Propietario o un Administrador** de la empresa autoriza, rechaza o revoca. El equipo ENQORA nunca autoriza en nombre del cliente.
- **Cómo se autoriza:** marcando la casilla de confirmación expresa y con reautenticación reciente.
- **Evidencia guardada:** usuario, rol en la empresa, sesión, momento, alcance, institución y vigencia. La decisión queda además en la auditoría de la empresa.
- **Efectos sobre el caso:**
  - Al solicitar, el caso pasa a "Pendiente de tu autorización".
  - Cuando no quedan autorizaciones pendientes, pasa a "En ejecución".
  - Si el cliente rechaza, el caso queda "Devuelto con observaciones".
  - **Revocar** detiene la ejecución: el caso vuelve a "Devuelto con observaciones".
- **Vencimiento:** una autorización vencida se muestra como "Vencida" y no se puede usar.
- **Centro de control:** el cliente ve un aviso con sus autorizaciones pendientes.

**No es un mandato legal.** La autorización es el consentimiento del cliente dentro de ENQORA para la gestión descrita. Los mandatos y la representación ante instituciones llegan en la Etapa 9. ENQORA nunca solicita ni almacena ClaveÚnica ni clave del SII.

## Instalación

1. Supabase → SQL Editor: ejecuta `supabase/migrations/0006_aprobaciones.sql`.
2. Ejecuta `supabase/tests/0006_aprobaciones_rls.sql` → **TODAS LAS PRUEBAS OK**.
3. Sube los archivos de la aplicación.

## Reversión

```sql
drop function if exists public.request_approval, public.decide_approval, public.cancel_approval,
  public.approval_inbox, public.request_client_authorization, public.decide_client_authorization,
  public.revoke_client_authorization, public.cancel_client_authorization,
  private.can_decide_approval, private.can_request_authorization cascade;
drop table if exists public.approvals, public.client_authorizations cascade;
```
