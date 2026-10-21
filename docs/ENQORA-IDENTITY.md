# ENQORA Identity — Etapa 1

Autenticación y protección de cuentas. Sin tablas propias ni datos tributarios: todo vive en Supabase Auth.

## Qué incluye

| Función | Cómo se implementa |
| --- | --- |
| Registro con contraseña robusta | Mínimo 14 caracteres, máximo 72 (límite de bcrypt), sin contener el correo, comprobada contra filtraciones (Have I Been Pwned, k-anonimato) |
| Verificación de correo | Supabase "Confirm email" + enlace `token_hash` a `/auth/confirm` (funciona en otro dispositivo) |
| MFA obligatorio | TOTP con aplicación autenticadora. Sin segundo factor no se entra al área privada |
| Recuperación segura | Enlace de un solo uso + marca de recuperación de 15 min + código MFA si ya está activo. Cierra las demás sesiones |
| Reautenticación | Cambiar contraseña exige un código MFA nuevo en ese momento |
| Sesiones revocables | "Cerrar sesión en todos los dispositivos" (`signOut` global) |
| Doble barrera | Middleware exige `aal2` y el layout privado lo vuelve a comprobar en el servidor |
| Cabeceras de seguridad | HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors 'none'` |

## Configuración en Supabase (una vez)

**Proyecto**: crear uno nuevo llamado `enqora`, región São Paulo (`sa-east-1`), la más cercana a Chile.

**Authentication → Sign In / Providers → Email**
- Enable Email provider: activado
- Confirm email: **activado**
- Secure email change: activado
- Minimum password length: **14**
- Password requirements: sin requisitos de caracteres (la longitud y la comprobación de filtraciones protegen mejor)
- Leaked password protection: activar si el plan es Pro (refuerza la comprobación del servidor)
- Secure password change / Require current password: **desactivados** (la reautenticación la hace ENQORA con el código MFA)

**Authentication → Multi-Factor**
- TOTP (App Authenticator): **Enabled**

**Authentication → URL Configuration**
- Site URL: `https://<tu-dominio-vercel>` (el mismo valor que `NEXT_PUBLIC_SITE_URL`)
- Redirect URLs: `https://<tu-dominio-vercel>/**` y, si usas previews, `https://*-<tu-equipo>.vercel.app/**`

**Authentication → Emails → Templates**
- Confirm signup → pegar `supabase/templates/confirmar-registro.html`
- Reset password → pegar `supabase/templates/restablecer-clave.html`

**Authentication → Emails → Security notifications**: activar *Password changed*, *Email address changed*, *MFA method added* y *MFA method removed*.

**Authentication → Emails → SMTP**: el correo integrado de Supabase tiene un límite muy bajo de envíos por hora y es solo para pruebas. Antes de abrir a clientes, configurar un SMTP propio (Resend, Postmark, Amazon SES) con un remitente del dominio de ENQORA.

## Variables de entorno (Vercel → Settings → Environment Variables)

| Variable | Valor |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys → *publishable* (o la *anon* si tu proyecto aún usa claves antiguas) |
| `NEXT_PUBLIC_SITE_URL` | `https://<tu-dominio-vercel>` sin barra final |

No se usa ni debe agregarse la clave `service_role` / secreta. Tras cambiar variables, hacer **Redeploy**.

## Pruebas de aceptación

Hacerlas con correos de prueba, nunca con datos de clientes.

1. **Registro débil**: contraseña de 10 caracteres → rechazada. `Password1234567` → rechazada por filtrada.
2. **Registro válido**: llega el correo con diseño ENQORA; antes de confirmarlo, ingresar muestra "Debes confirmar tu correo".
3. **Confirmación**: abrir el enlace en otro dispositivo → entra y pide activar el segundo factor.
4. **Sin MFA no hay acceso**: escribir `/panel` en la barra → vuelve a `/mfa/configurar`.
5. **Activar MFA**: escanear QR, ingresar código → panel con aviso "Segundo factor activado".
6. **Ingreso con MFA**: cerrar sesión, ingresar con contraseña → pide código; código incorrecto → error; correcto → panel.
7. **Saltarse el código**: tras la contraseña, escribir `/seguridad` en la barra → vuelve a `/mfa/verificar`.
8. **Enlace usado o vencido**: abrir dos veces el mismo enlace de confirmación → "El enlace no es válido o ya expiró".
9. **Recuperación**: solicitar enlace → abrir → pide código MFA → nueva contraseña → panel. La sesión en otro navegador queda cerrada.
10. **Sin enlace no hay restablecimiento**: con sesión abierta, entrar directo a `/restablecer` → redirige (no permite cambiar la clave).
11. **Cambio de contraseña**: en Seguridad, sin código o con código incorrecto → rechazado; con código correcto → actualizada y llega el aviso por correo.
12. **Cerrar todo**: abrir sesión en dos navegadores, "Cerrar sesión en todos los dispositivos" en uno → el otro pierde acceso al recargar (puede tardar hasta que expire su token de acceso, 1 hora por defecto).
13. **Redirección abierta**: `/ingresar?next=//google.com` → tras ingresar, termina en `/panel`.
14. **Correo inexistente en recuperación**: muestra el mismo mensaje que uno existente.

## Reversión

Cada archivo es nuevo; no modifica nada previo. Para revertir: en Vercel → Deployments, promover el despliegue anterior (*Promote to Production*), o revertir el commit en GitHub. Las cuentas de prueba se eliminan en Supabase → Authentication → Users.

## Pendiente para próximas etapas

- Passkeys como segundo factor adicional.
- CAPTCHA (Cloudflare Turnstile) en registro e ingreso contra bots.
- Tiempo máximo de sesión e inactividad (Supabase → Auth → Sessions, plan Pro).
- Etapa 2: empresas, membresías, roles y RLS multiempresa.
- Etapa 3 (Shield/Sentinel): registro de auditoría propio, dispositivos y alertas.
