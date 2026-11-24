# ENQORA — Etapa 3: Shield y Sentinel

## Qué incluye

| Función | Cómo se implementa |
| --- | --- |
| Sesiones abiertas | Lista de los dispositivos con sesión activa (navegador, IP, última actividad), leída de Supabase Auth solo para el propio usuario |
| Cerrar una sesión | Elimina esa sesión en Supabase: el dispositivo pierde el acceso en su siguiente acción. Exige reautenticación reciente |
| Cerrar las demás | Cierra todo menos la sesión actual. Exige reautenticación reciente |
| Dispositivos conocidos | Cada navegador recibe un código aleatorio en una cookie protegida; la base solo guarda su huella |
| Alerta de dispositivo nuevo | Aviso en el Centro de control, punto en el menú Seguridad y correo (si `RESEND_API_KEY` está configurada). El primer dispositivo no genera alerta |
| Registro de seguridad | Ingresos, segundo factor activado, cambios de contraseña, sesiones cerradas y dispositivos olvidados. Solo el usuario lo ve; nadie puede editarlo |
| Iconografía ENQORA | Conjunto propio de iconos (`components/icons.tsx`) |
| Estado de carga | Reloj ENQORA animado mientras carga el área privada |
| Accesibilidad | Respeta "movimiento reducido" del dispositivo; foco visible con teclado |

## Instalación

1. **Supabase → SQL Editor → New query**: pega `supabase/migrations/0003_seguridad.sql` → **Run**.
2. **New query**: pega `supabase/tests/0003_seguridad_rls.sql` → **Run**. Debe responder **TODAS LAS PRUEBAS OK** (no deja datos).
3. Sube los archivos a GitHub.
4. Opcional, alertas por correo: en **Vercel → Settings → Environment Variables** agrega
   - `RESEND_API_KEY`: tu API Key de Resend (sin `NEXT_PUBLIC_`).
   - `ALERT_EMAIL_FROM`: `ENQORA <onboarding@resend.dev>` mientras no verifiques un dominio.
   Luego **Redeploy**.

Si el paso 2 falla en "my_sessions" o "revoke_session" con *permission denied for table sessions*, avísame: significa que tu proyecto restringe el acceso al esquema `auth` y hay que usar otra vía.

## Pruebas manuales

1. Cierra sesión e ingresa de nuevo → en **Seguridad → Actividad** aparece "Ingreso".
2. Ingresa desde otro navegador o el teléfono → aviso "dispositivo nuevo" en el Centro de control, punto en el menú y correo (si configuraste Resend).
3. Pulsa **Fui yo** → el aviso desaparece.
4. En **Sesiones abiertas** cierra la del otro dispositivo → ese dispositivo vuelve a la pantalla de ingreso al recargar.
5. Si ingresaste hace más de 15 minutos, cerrar una sesión pide primero un código nuevo.
6. **Olvidar** un dispositivo y volver a ingresar desde él → nueva alerta.
7. Cambiar la contraseña → "Contraseña cambiada" en la actividad.
8. Activa "reducir movimiento" en el sistema operativo → el reloj de carga queda quieto.

## Reversión

```sql
drop function if exists public.register_login, public.log_security_event, public.acknowledge_security_alerts,
  public.forget_device, public.my_sessions, public.revoke_session, public.revoke_other_sessions cascade;
drop function if exists private.current_session_id();
drop table if exists public.security_events, public.known_devices cascade;
```

## Auditoría de seguridad (2026-11-24)

Revisión con evidencia sobre las 92 migraciones aplicadas en una base de prueba y sobre el código de la aplicación.

**Base de datos — en orden:** todas las tablas de `public` tienen seguridad por fila; `anon` no tiene permisos
directos sobre ninguna tabla; todas las funciones `security definer` fijan `search_path`; las 43 funciones de servicio
que `anon` puede llamar verifican el token al inicio (`daily_run` lo hace a través de `billing_run`); las búsquedas
públicas por RUT rechazan personas naturales; las funciones de administración usan `require_admin`. Las tablas con
seguridad por fila y sin políticas (`inapi_marcas`, `public_companies`, `public_company_*`, `public_lookups`,
`notification_deliveries`) son intencionales: solo se leen por funciones con permisos verificados.

**Corregido:**
- 0092: 35 funciones de `private` ejecutables por `PUBLIC`/`anon` (no invocables desde la API porque `anon` no usa ese
  esquema) quedan solo para `authenticated` y `service_role`.
- 0093: `case_ratings` y `case_savings` (0033) conservaban los permisos por defecto de Supabase para `anon` y
  `authenticated` (la seguridad por fila ya los bloqueaba). Quedan solo con lectura para `authenticated`. Lo detectó la
  auditoría de solo lectura en producción; las bases de prueba sin los permisos por defecto de Supabase no lo muestran.
- `Permissions-Policy` bloqueaba el micrófono incluso para ENQORA (`microphone=()`): el dictado de gastos y la voz de
  CORA no podían escuchar. Ahora `microphone=(self)`.
- `form-action` admite Flow (redirección al pago después de enviar el formulario).
- Rutas cron: `CRON_SECRET` se compara en tiempo constante (`lib/interno.ts`).
- Llamadas internas con `CRON_SECRET`: en producción van a la dirección fija del proyecto (`VERCEL_PROJECT_PRODUCTION_URL`),
  no a la cabecera `Host` de la petición.
- `/api/hoja-de-vida/analizar` verifica el origen, como las rutas de agentes.
- Buscador legal: la pregunta se anonimiza y solo se envía a Hugging Face si está autorizado (PR #177).

**Sin hallazgos:** secretos en el repositorio (solo `.env.example`), HTML inyectado (solo `markdownSeguro`),
confirmación de pagos (se consulta el estado a Flow servidor a servidor).

**Repetir en producción:** `pegar_en_supabase_auditoria_seguridad.sql` (solo lectura) devuelve OK o REVISAR por cada punto.
