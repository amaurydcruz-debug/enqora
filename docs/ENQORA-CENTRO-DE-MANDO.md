# ENQORA · Centro de Mando con entrada independiente

El Centro de Mando ya no forma parte de la app de clientes.

| | App de clientes | Centro de Mando |
|---|---|---|
| Entrada | `/ingresar` | `/mando/acceso` |
| Estructura | `app/(app)/layout.tsx` | `app/(mando)/layout.tsx` (menú propio: Operación y Configuración) |
| Quién entra | Clientes | Solo el equipo ENQORA (las cuentas sin rol de equipo vuelven a la app de clientes) |

- El menú de clientes ya no muestra «Centro de Mando».
- Al abrir cualquier dirección `/mando/...` sin sesión, se pide ingresar en `/mando/acceso` y después se vuelve a esa página.
- La seguridad es la misma: contraseña + segundo factor obligatorio, y permisos verificados en la base de datos.
- Las direcciones internas no cambiaron (`/mando`, `/mando/cobros`, `/mando/datos-publicos`…), así que los enlaces existentes siguen funcionando.

## Primer Administrador

Se hace una sola vez, en Supabase → SQL Editor:

```sql
select private.bootstrap_enqora_admin('amaurydcruz@gmail.com');
```

## Acceso del equipo por enlace de jornada (0022)

- El equipo no se registra en la página pública. El Administrador entra a **Centro de Mando → Equipo ENQORA → Enlaces
  de jornada**, escribe el correo, el rol y el día, y pulsa **Generar enlace de jornada**. Luego lo envía por WhatsApp
  o por correo.
- El enlace es **personal**, de **un solo uso** y solo funciona dentro del horario de ese día, de **10:00 a 18:00**
  (hora de Chile). Ese horario se cambia en `private.shift_window`.
- Al usarlo, la persona tiene acceso hasta las 18:00 de ese día. Al día siguiente necesita un enlace nuevo.
- La primera vez, el mismo enlace le permite crear su cuenta (contraseña), confirmar su correo y activar el segundo
  factor; después vuelve al enlace y activa su acceso.
- El Administrador ve quién trabaja hoy, puede anular enlaces pendientes y **cortar el acceso** de inmediato.
- **Coadministradores:** el Administrador designa a otra cuenta con las mismas facultades. Los coadministradores no
  necesitan enlace de jornada.
- Las pruebas SQL anteriores a 0022 simulan un pase vigente para el equipo dentro de su transacción.
