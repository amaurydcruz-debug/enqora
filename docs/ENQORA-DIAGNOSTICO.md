# ENQORA — Diagnóstico gratuito y onboarding (M09 · Etapa 7)

Base de datos: `supabase/migrations/0010_diagnostico.sql`. Prueba: `supabase/tests/0010_diagnostico.sql`.

## Recorrido del cliente

1. **Onboarding guiado** (`/diagnostico`).
   - Ocho preguntas por opciones, una a la vez: etapa de la empresa, actividad, trabajadores, ventas (rango, opcional), quién lleva la contabilidad, documentos que emite, preocupaciones (hasta 4) y urgencia.
   - Son obligatorias: etapa, contabilidad, preocupaciones y urgencia.
   - Desde la puerta de entrada, «Comenzar con…» lleva directo aquí con el servicio elegido.
2. **Tu ruta ENQORA.**
   - Hasta 4 rutas sugeridas. Salen de reglas explícitas (`lib/onboarding.ts`) y cada una dice por qué se sugiere, citando la respuesta.
   - Se rotulan como *Interpretación*: orientan, no diagnostican.
   - La ruta también aparece en el Centro de control (sección «Tu ruta ENQORA»).
3. **Diagnóstico gratuito.**
   - Una primera consulta por empresa. Crea un caso con origen `diagnostico_gratuito`.
   - Una solicitud cancelada sin informe entregado no cuenta.
   - Pueden pedirla el propietario, los administradores y el contador de la empresa.

## Informe por situaciones

El equipo ENQORA (o un agente IA con cuenta del equipo) lo redacta en la ficha del caso, opción «Diagnóstico y recomendaciones».

**Resumen general:** certeza general (alta, media o baja) y qué falta para confirmarlo.

**Situación 01, 02…** Cada una incluye:

| Campo | Contenido |
|---|---|
| Qué está ocurriendo | Rotulado como *Interpretación* |
| Qué establece la normativa | Con fuentes oficiales: título, artículo, vigencia y enlace https |
| Posibles causas | |
| Correcciones y alternativas por verificar | |
| Beneficios que podrían corresponder | |
| Riesgo de no actuar | Bajo, medio o alto, sin exagerar |
| Costo estimado | Rango en CLP, rotulado como *Estimación*, y el servicio del catálogo que ayudaría |
| Certeza | Y qué falta para confirmar la situación |

**Para el cliente:** cada situación se abre con «Ver análisis», una a la vez. Desde cada situación puede «Pedir cotización». Eso no lo compromete: crea una tarea interna para cotizar.

**Versión imprimible:** `/casos/<id>/diagnostico`, para guardarla en PDF o llevarla a un contador o abogado independiente.

**Rótulo permanente:** *diagnóstico preliminar*. No es una resolución oficial ni garantiza resultados que dependen de una institución.

## Revisión profesional (cuatro ojos)

- «Enviar a revisión profesional» crea una aprobación interna de tipo `diagnostico` y deja el caso «En revisión profesional».
- **Quien lo envía no puede aprobarlo.** Un agente IA nunca aprueba.
- **Aprobada:** el informe se publica para el cliente, reemplaza la versión anterior y el caso pasa a «Esperando tu respuesta».
- **Rechazada:** vuelve a borrador con la observación visible para el equipo.
- **Versiones:** una nueva versión parte de la entregada y la reemplaza al aprobarse. El historial queda completo.

## Centro de Mando

Bandeja «Diagnósticos gratuitos»: casos abiertos con origen diagnóstico gratuito.

El equipo ve en el caso el perfil del onboarding como contexto.
