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
