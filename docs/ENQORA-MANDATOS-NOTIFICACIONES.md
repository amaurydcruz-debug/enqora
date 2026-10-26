# ENQORA — Mandatos, trámites y notificaciones (M11 · Etapa 9)

Base de datos: `supabase/migrations/0012_mandatos_notificaciones.sql`. Prueba: `supabase/tests/0012_mandatos_notificaciones.sql`.

## Mandatos de representación

La aprobación interna de ENQORA y la autorización del cliente **no son un mandato legal**. El mandato es el documento firmado y verificado.

### Flujo

1. **Preparar** (Centro de Mando → Mandatos):
   - Se define la empresa, el tipo (simple o notarial), el mandatario, las instituciones, los trámites permitidos, el texto y la vigencia (máximo 3 años).
   - Queda como borrador interno.
2. **Enviar:** lo hace una persona del equipo; un agente IA puede preparar el mandato, pero no enviarlo.
3. **El cliente revisa** (Empresa → Mandatos y representación):
   - El Propietario o un Administrador lee el texto completo.
   - Declara quién firma (nombre, RUT válido y calidad) y lo confirma con su identidad. Queda evidencia de quién, cuándo, la sesión y una huella del texto.
4. **Firma y documento:**
   - El cliente imprime el texto desde «Ver texto completo».
   - Lo firma el representante legal (ante notario si es notarial) y sube el documento escaneado (PDF, JPG o PNG) al almacenamiento privado `mandatos`.
5. **Verificación legal** por un abogado o el Administrador ENQORA, que no puede ser quien lo preparó. La lista de chequeo es obligatoria:
   - identidad de quien firma;
   - representación legal;
   - el documento coincide con el texto preparado;
   - requisitos de cada institución.
6. **Resultado de la verificación:**
   - *Vigente*: el mandato habilita trámites.
   - *Observado*: vuelve al cliente con el motivo y puede subir un nuevo documento.
7. **Revocación:** el Propietario o un Administrador puede revocarlo cuando quiera, con identidad confirmada. Los trámites habilitados que dependían de él vuelven a «planificada».
8. **Vencimiento:** la tarea diaria lo marca como vencido al pasar su fecha.

## Trámites ante instituciones (caso → «Trámites ante instituciones»)

- **Planificar:** cualquier persona del equipo del caso puede planificar un trámite (institución y trámite), asociando un mandato y una autorización del cliente.
- **Habilitar:** lo hace el responsable del caso, la supervisión o un abogado. No puede hacerlo un agente IA ni quien lo planificó. La base de datos comprueba:
  - que hay un mandato **vigente** de la empresa, que cubre **esa institución** y está dentro de su vigencia;
  - que hay una autorización **autorizada** del cliente para **este caso**, no vencida.
- **Registrar el resultado:** folio, comprobante o motivo. Se vuelve a comprobar todo en ese momento. Un agente IA no registra resultados.
- **Visibilidad:** el cliente ve cada trámite con su respaldo y su resultado.

## Notificaciones

### En la aplicación
- La campana muestra los avisos sin leer.
- `/notificaciones` lista los avisos; al abrir uno se marca como leído.
- Nunca se notifica a quien realizó la acción.

### Qué se avisa y a quién

| Para | Avisos |
|---|---|
| **La empresa** | Mensajes y documentos del equipo; caso esperando respuesta o cerrado; cotización o propuesta de plan por revisar; diagnóstico listo; autorización pedida; trámite realizado o no completado; cobros nuevos o vencidos; pagos confirmados o rechazados; mandatos enviados, observados, vigentes, revocados o vencidos |
| **El equipo** | Solicitudes nuevas y diagnósticos gratuitos (supervisión); aprobaciones pendientes (según quién aprueba); respuestas del cliente; transferencias informadas (Administrador); mandatos por verificar (abogados y Administrador) |

### Preferencias
- Cada persona elige los canales (correo y WhatsApp) y qué categorías recibe fuera de la aplicación.
- En la aplicación siempre ve todo.

### Correo
- Se envía con Resend (`RESEND_API_KEY`, `ALERT_EMAIL_FROM`).
- El enlace usa `NEXT_PUBLIC_SITE_URL`.

### WhatsApp (API de WhatsApp Business de Meta)
- Requiere la aceptación expresa del cliente y su celular verificado con un código de 6 dígitos que se envía por WhatsApp. Se guarda solo el hash del código; vence en 10 minutos y admite 5 intentos.
- Variables en Vercel:
  - `WHATSAPP_TOKEN` y `WHATSAPP_PHONE_ID`;
  - `WHATSAPP_TEMPLATE`: plantilla de utilidad con 2 variables, por ejemplo «ENQORA: {{1}}. Revisa el detalle en {{2}}»;
  - `WHATSAPP_OTP_TEMPLATE`: plantilla de autenticación con el código;
  - opcional, `WHATSAPP_LANG` (por defecto `es`).
- Las plantillas deben estar aprobadas por Meta.

### Envío
- La aplicación envía los avisos pendientes justo después de cada página y en la tarea diaria, usando la clave de servicio `ENQORA_SERVICE_TOKEN`. Nunca usa `service_role`.
- Hace hasta 5 intentos por aviso; si no se envía en 3 días, se descarta.

### Contenido de los avisos
- Solo dicen qué ocurrió y llevan a ENQORA.
- Nunca incluyen documentos, datos tributarios ni claves.

## Tarea diaria

`/api/cron/facturacion` ejecuta `daily_run`:
- facturación (M10);
- vencimiento de mandatos;
- limpieza de envíos antiguos;
- y luego envía los avisos pendientes.
