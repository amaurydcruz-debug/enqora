# ENQORA — Etapa 2: Empresas, miembros y aislamiento de datos

## Qué incluye

| Función | Cómo se implementa |
| --- | --- |
| Registrar empresas | RUT validado (módulo 11) en el navegador y en la base de datos. Quien registra queda como propietario |
| Varias empresas por usuario | Selector de empresa activa (cookie segura, validada contra la membresía en cada uso) |
| Roles | Propietario, Administrador, Contador y Solo lectura |
| Invitaciones | Enlace personal de un solo uso, ligado al correo invitado, vence en 7 días. Se guarda solo su huella (SHA-256), nunca el enlace |
| Aislamiento (RLS) | Cada consulta solo devuelve filas de empresas donde el usuario es miembro. Probado con usuarios ficticios |
| Segundo factor en la base de datos | Política restrictiva: sin sesión `aal2` la base no entrega ninguna fila, aunque falle el código de la app |
| Sin escrituras directas | Las tablas son de solo lectura para la API; todo cambio pasa por funciones que validan permisos |
| Reautenticación | Invitar, cambiar roles o quitar miembros exige haber validado el segundo factor hace menos de 15 minutos |
| Auditoría | Cada operación queda registrada (quién, qué, cuándo). Propietarios y administradores la ven; nadie puede editarla |
| Último propietario | La base impide dejar una empresa sin propietario |

## Permisos por rol

| Acción | Propietario | Administrador | Contador | Solo lectura |
| --- | :-: | :-: | :-: | :-: |
| Ver la empresa y sus miembros | ✓ | ✓ | ✓ | ✓ |
| Editar datos de la empresa | ✓ | ✓ | — | — |
| Invitar contadores y lectores | ✓ | ✓ | — | — |
| Invitar administradores | ✓ | — | — | — |
| Cambiar roles / quitar contadores y lectores | ✓ | ✓ | — | — |
| Cambiar roles / quitar administradores y propietarios | ✓ | — | — | — |
| Ver auditoría e invitaciones | ✓ | ✓ | — | — |
| Salir de la empresa | ✓ (si hay otro propietario) | ✓ | ✓ | ✓ |

## Instalación (una vez)

1. **Supabase → SQL Editor → New query**: pega el contenido completo de `supabase/migrations/0002_empresas.sql` y pulsa **Run**. Debe terminar con *Success. No rows returned*.
2. **Prueba de aislamiento**: en otra *New query*, pega `supabase/tests/0002_empresas_rls.sql` y pulsa **Run**. El resultado debe ser una fila: **TODAS LAS PRUEBAS OK**. La prueba crea datos ficticios y los deshace al final: no deja nada en la base.
3. Sube los archivos de la app a GitHub. Vercel desplegará solo.

Si el paso 1 falla a mitad, copia el mensaje de error completo antes de reintentar.

## Pruebas manuales en la app

1. **Registrar empresa** con un RUT inválido (ej. `76.086.428-0`) → error. Con uno válido → quedas como Propietario y la empresa queda activa.
2. **Duplicado**: registrar otra vez el mismo RUT → "Ya tienes registrada una empresa con ese RUT".
3. **Editar** razón social y régimen → aparece en "Actividad reciente".
4. **Invitar** a un correo (rol Contador) → se muestra el enlace. Si iniciaste sesión hace más de 15 minutos, primero te pide un código nuevo.
5. **Invitación con otra cuenta**: abre el enlace con una cuenta de otro correo → "Esta invitación es para otra cuenta".
6. **Aceptar** con la cuenta correcta → entra a la empresa como Contador; no ve "Actividad reciente" ni invitaciones, ni puede editar.
7. **Enlace reutilizado** → "La invitación ya fue usada".
8. **Último propietario**: intenta "Salir" siendo el único propietario → bloqueado.
9. **URL ajena**: con la cuenta del contador, abre `/empresas/<id de otra empresa>` → página no encontrada.
10. **Cambiar rol / quitar** miembro → pide confirmación y queda en auditoría.

Mientras el correo de pruebas de Resend solo entregue a tu propia dirección, las invitaciones se comparten copiando el enlace (no se envían por correo). Para probar con una segunda persona, esa persona debe poder crear su cuenta: requiere dominio verificado en Resend.

## Reversión

En Supabase → SQL Editor (borra todos los datos de empresas):

```sql
drop function if exists public.create_company, public.update_company, public.create_invitation,
  public.revoke_invitation, public.invitation_preview, public.accept_invitation,
  public.change_member_role, public.remove_member, public.update_my_profile cascade;
drop trigger if exists enqora_on_auth_user_created on auth.users;
drop trigger if exists enqora_on_auth_user_email_changed on auth.users;
drop table if exists public.audit_events, public.company_invitations, public.company_members,
  public.companies, public.profiles cascade;
drop schema if exists private cascade;
```

Y en Vercel → Deployments, promover el despliegue anterior.

## Siguiente etapa

Etapa 3 (Shield / Sentinel): sesiones y dispositivos visibles, alertas de seguridad, auditoría de ingresos y exportaciones.
