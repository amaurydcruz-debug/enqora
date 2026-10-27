# ENQORA · Guía de publicación (M14)

Lista de verificación para abrir ENQORA a clientes reales. El **Estado del sistema**
(Centro de Mando → Estado del sistema, solo Administrador y Dirección de operaciones) revisa
automáticamente la mayoría de estos puntos. Muestra si cada clave existe, nunca su valor.

## 1. Base de datos (Supabase → SQL Editor)

1. Ejecutar las migraciones en orden: `0002` … `0016`. Cada una tiene su prueba en `supabase/tests/`
   (debe responder «TODAS LAS PRUEBAS OK» y deshace sus datos).
2. `0015_publicacion.sql` agrega índices, la limpieza diaria y el estado del sistema.
3. Plan de Supabase con **copias de seguridad diarias** (Pro o superior). Para datos tributarios se
   recomienda además *Point-in-Time Recovery*.
4. Database → Advisors (Security y Performance): revisar que no queden alertas nuevas.

## 2. Autenticación (Supabase → Authentication)

- **URL Configuration:** Site URL = dominio definitivo (mismo valor que `NEXT_PUBLIC_SITE_URL`);
  Redirect URLs: `https://<dominio>/**`.
- **Emails → SMTP Settings:** SMTP propio (Resend) con remitente del dominio de ENQORA. El SMTP por
  defecto de Supabase tiene un límite muy bajo y no sirve para producción.
- **Emails → Templates:** plantillas en español (ver `supabase/templates/`).
- **Providers → Email:** «Confirm email» activo.
- **Multi-Factor:** TOTP activo (ENQORA lo exige a todos).
- **Attack Protection:** protección de contraseñas filtradas y CAPTCHA si hay registros abusivos.
- **Rate Limits:** revisar los envíos de correo por hora según el SMTP contratado.

## 3. Vercel → Settings → Environment Variables (Production)

Ninguna clave va en el repositorio ni se comparte por chat. Las `NEXT_PUBLIC_*` se incorporan al
compilar: tras cambiarlas, **Redeploy**.

| Variable | Obligatoria | Para qué |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | Proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (o `..._ANON_KEY`) | Sí | Clave pública de Supabase (nunca `service_role`) |
| `NEXT_PUBLIC_SITE_URL` | Sí | Dominio definitivo; habilita la indexación en buscadores |
| `ENQORA_SERVICE_TOKEN` | Sí | Clave de servicio (generarla en Cobros y pagos) |
| `CRON_SECRET` | Sí | Protege la tarea diaria `/api/cron/facturacion` |
| `NEXT_PUBLIC_LEGAL_NAME`, `NEXT_PUBLIC_LEGAL_RUT` | Sí | Responsable en Términos y Privacidad |
| `NEXT_PUBLIC_LEGAL_ADDRESS` | Recomendada | Domicilio legal |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Sí | Canal para ejercer derechos sobre datos personales |
| `NEXT_PUBLIC_LEGAL_REVIEWED` | Al aprobar | `si` cuando un abogado apruebe los textos legales |
| `RESEND_API_KEY`, `ALERT_EMAIL_FROM` | Recomendadas | Avisos por correo |
| `FLOW_API_KEY`, `FLOW_SECRET_KEY`, `FLOW_API_URL` | Para pago en línea | Producción: `https://www.flow.cl/api` |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_TEMPLATE`, `WHATSAPP_OTP_TEMPLATE` | Opcional | Avisos por WhatsApp |
| `ANTHROPIC_API_KEY` (`ANTHROPIC_MODEL`, `ANTHROPIC_WEB_SEARCH`) | Opcional | Agentes IA |
| `OPENAI_API_KEY` (`OPENAI_MODEL`, `OPENAI_WEB_SEARCH`) | Si hay agentes | Auditoría independiente de las propuestas (M15) |

Otros ajustes en Vercel:
- **Domains:** dominio propio con HTTPS.
- **Deployment Protection:** proteger las vistas previas (Preview) para que no sean públicas.
- La tarea diaria corre a las 11:00 UTC (`vercel.json`): facturación, vencimiento de mandatos,
  avisos vencidos y limpieza de datos operativos.

## 4. Operación antes de abrir

- Al menos **dos** Administradores ENQORA activos (cuatro ojos y respaldo).
- Todo el equipo con segundo factor verificado.
- Tarifas publicadas para todos los servicios activos (Catálogo y precios) y precios de los planes
  que se activen. Nada se publica con precios inventados.
- Datos para transferencias completos (Cobros y pagos).
- Registro público de personas jurídicas del SII importado (Datos públicos) para la consulta por RUT.
- Prueba completa con una empresa de prueba: registro, segundo factor, solicitud, diagnóstico,
  cotización, pago por transferencia y en línea (Flow sandbox), mandato, F29.

## 5. Revisión legal (obligatoria antes de abrir)

Las páginas `/terminos` y `/privacidad` describen cómo funciona la plataforma, pero muestran
«Versión preliminar» hasta que un abogado las apruebe. Revisar especialmente:

- **Ley 19.628 y Ley 21.719** (vigente desde diciembre de 2026): bases de licitud, deber de
  información, derechos ARCO y portabilidad, transferencia internacional (Supabase, Vercel,
  Anthropic, Resend, Meta), contratos de encargo de tratamiento y registro de actividades.
- Uso de inteligencia artificial sobre datos de clientes.
- Mandatos y representación ante el SII y otras instituciones.
- Ley 19.496 (protección al consumidor) si se atiende a personas naturales.
- Emisión de documentos tributarios por los servicios de ENQORA.

## 6. Monitoreo

- `/api/salud` responde `200` si la aplicación está en línea y alcanza Supabase, `503` si no.
  Configurar un monitor externo (p. ej., UptimeRobot o Better Stack) cada 5 minutos.
- Vercel → Logs: errores de servidor (`[ENQORA …]`). Las pantallas de error muestran un código de
  referencia que coincide con el registro.
- Estado del sistema: avisos fallidos de los últimos 7 días y uso de agentes IA.

## 7. Optimización incluida en M14

- Índices en todas las claves foráneas hacia tablas de ENQORA (0015).
- Ficha del caso: de 13 a 5 consultas encadenadas; el diseño y las páginas comparten el usuario,
  el rol y las empresas en una sola consulta por solicitud.
- Robots y sitemap: solo se indexan las páginas públicas y solo en producción con dominio propio.
- Páginas de error y 404 propias; error global sin dependencias.
- Caché de una semana para las imágenes de marca; `upgrade-insecure-requests` en producción.
