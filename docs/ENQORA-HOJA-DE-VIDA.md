# ENQORA · Conector de fuentes oficiales y hoja de vida de la empresa (M18)

## Qué resuelve

Antes, la consulta por RUT de la portada respondía «La consulta pública se está preparando» porque alguien tenía
que descargar las nóminas del SII y subirlas a mano. Ahora:

1. **Conector automático con el SII.** Cada día (`vercel.json` → `/api/cron/nomina`, 09:00 UTC) el servidor revisa si
   el SII publicó una versión nueva de sus nóminas abiertas de personas jurídicas y la carga sola:
   - Nómina de razón social: `PUB_NOMBRES_PJ.zip`.
   - Actividades económicas: `PUB_NOM_ACTECOS.zip`.
   - Nómina de empresas 2020–2024 (tramo de ventas, trabajadores, rubro, región, tipo de contribuyente):
     `PUB_EMPRESAS_PJ_2020_A_2024.zip`.

   Los archivos se leen en streaming, sin guardarlos completos. La carga avanza por tramos: si no termina en una
   ejecución, guarda su cursor y el propio servidor encadena la siguiente. Las columnas se reconocen por el
   encabezado del archivo; si el SII cambia el formato, la carga se detiene con un mensaje en
   **Centro de Mando → Datos públicos**.
2. **Consulta por RUT con señales.** La portada muestra:
   - razón social, inicio de actividades, término de giro, actividades vigentes, tamaño por ventas, trabajadores y rubro;
   - las **señales** objetivas que constan en esas nóminas (término de giro, sin actividades vigentes, sin información
     de ventas, información desactualizada), cada una con «Quiero solucionarlo».
3. **Hoja de vida tributaria** (`/empresas/[id]/hoja-de-vida`). El historial de IVA (F29), de renta (F22) y las
   observaciones del SII no son públicos: solo la empresa puede obtenerlos. La vía oficial y gratuita es la
   **Carpeta Tributaria Electrónica**. La empresa la genera en sii.cl con su propia clave y sube el PDF.

   ENQORA nunca pide ni guarda la clave del SII ni la ClaveÚnica, y no consulta páginas protegidas con captcha.

   Una IA solo **transcribe** el documento. Las alertas las calculan reglas fijas sobre esa transcripción: períodos
   sin F29, F22 sin presentar u observada, observaciones del SII, sin movimiento, carpeta vencida y RUT distinto.
   Cada alerta propone el servicio ENQORA que la resuelve y abre la solicitud con el asunto ya escrito. El análisis
   se presenta como preliminar: lo confirma un profesional al abrir el caso, y el equipo puede marcarlo como revisado.

## Seguridad

- Las funciones `svc_*` exigen la clave de servicio, y el análisis solo lo guarda el servidor. Nadie puede escribir
  una hoja de vida a mano.
- Bucket privado `carpetas`, solo para PDF:
  - suben el propietario o el administrador de la empresa, o el equipo asignado;
  - leen solo quienes ven el cumplimiento de la empresa.
- Hay un máximo de 10 carpetas por empresa al día, porque cada análisis usa IA.
- Si hay alertas de prioridad alta, se avisa a la dirección de operaciones para ofrecer la solución.

## Puesta en marcha

1. Supabase:
   - Si aún no lo hiciste, ejecuta `0018_cumplimiento.sql` (PR de M17).
   - Ejecuta `0019_hoja_de_vida.sql` y luego su prueba `supabase/tests/0019_hoja_de_vida.sql`. Debe responder
     «TODAS LAS PRUEBAS OK».
2. En Vercel deben existir `CRON_SECRET`, `ENQORA_SERVICE_TOKEN` y `ANTHROPIC_API_KEY`.
3. Primera carga: en **Centro de Mando → Datos públicos**, pulsa **Sincronizar ahora** (o espera la tarea diaria).
   La primera carga completa puede tomar un rato, porque avanza por tramos. Mientras tanto, la portada muestra
   «Estamos sincronizando las fuentes oficiales».
4. La carga manual queda como respaldo, por si el SII bloqueara la descarga desde el servidor.

## Límites

- Las nóminas del SII son públicas y preliminares, y no incluyen personas naturales.
- La nómina de empresas cubre hasta el año comercial 2024. El SII la actualiza aproximadamente una vez al año.
