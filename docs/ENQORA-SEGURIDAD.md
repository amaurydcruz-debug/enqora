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
