# ENQORA · Agentes IA y rutas de módulo (M13)

## Qué hace

**Agentes IA reales.** Una persona del equipo asignada al caso (o la supervisión) elige un agente
—Tributario, Contable, Legal, Financiero, Investigador o Estratégico— y lo ejecuta desde
*Agentes y responsables* en la ficha del caso. El agente:

1. Recibe los antecedentes reales del caso: servicio, descripción, respuestas iniciales, datos de la empresa
   (razón social, RUT, giro, régimen), perfil del onboarding, **nombres** de los documentos (no su contenido),
   los últimos 20 mensajes, pasos registrados, diagnóstico entregado y estado de cotizaciones.
2. Consulta la API de Claude desde el servidor (la clave nunca llega al navegador). Si la búsqueda web está
   activa, solo puede buscar en sitios oficiales chilenos (sii.cl, bcn.cl, leychile.cl, tgr.cl, dt.gob.cl,
   inapi.cl, chileatiende.gob.cl, Diario Oficial, Registro de Empresas y Sociedades, CMF, CORFO, SERCOTEC, etc.).
3. Entrega **propuestas**: pasos para MIRROR, situaciones para el diagnóstico (con normativa, fuentes, nivel de
   riesgo, certeza y lo que falta), tareas y preguntas al cliente.

Mientras trabaja, el cliente ve en MIRROR un paso real «Analizando los antecedentes del caso». Al terminar, el paso
queda «Requiere revisión humana»; cuando el equipo revisa todas las propuestas, queda «Completado». Si la ejecución
falla, el paso se elimina (no se muestra trabajo que no ocurrió).

**Nada llega al cliente sin que una persona lo acepte.** Al aceptar:

| Propuesta | Qué ocurre |
|---|---|
| Paso | Se publica en MIRROR (o solo para el equipo). |
| Situación | Entra al **borrador** del diagnóstico; sigue requiriendo la revisión profesional de cuatro ojos para publicarse. |
| Tarea | Se crea (visible al cliente si es para él; interna si es para el equipo). |
| Pregunta | Se envía como mensaje al cliente en el caso. |

Los agentes **no** fijan precios, no aprueban nada, no ejecutan trámites ante instituciones y nunca piden
ClaveÚnica, clave del SII ni contraseñas. Una cuenta con rol *Agente IA* no puede ejecutar agentes ni aceptar
propuestas.

**Rutas de módulo.** Cada servicio (IDEA, CREATE, BRAND, FORMALIZA, CONTABILIDAD, GESTIÓN, CRECE, LEGAL y
Consulta general) tiene:

- Preguntas iniciales propias en *Nueva solicitud* (opcionales), guardadas en el caso y visibles en *Expediente*.
- Una ruta estándar de tareas: el equipo pulsa *Aplicar ruta del módulo* en *Tareas* y se crean las que falten.
- Una lista de documentos que normalmente se necesitan, en *Expediente* (guía general, no un requisito).

La configuración está en `lib/module-routes.ts`.

## Puesta en marcha

1. Supabase → SQL Editor: ejecutar `supabase/migrations/0014_agentes_modulos.sql` y luego la prueba
   `supabase/tests/0014_agentes_modulos.sql` (debe responder «TODAS LAS PRUEBAS OK»; deshace todo).
2. Crear una clave en console.anthropic.com (cuenta de la empresa, con límite de gasto mensual).
3. Vercel → Settings → Environment Variables (Production y Preview):
   - `ANTHROPIC_API_KEY` = la clave (obligatoria). **Nunca** en el repositorio ni compartida por chat.
   - `ANTHROPIC_MODEL` (opcional) = modelo; por defecto `claude-sonnet-5-5`.
   - `ANTHROPIC_WEB_SEARCH` (opcional) = `off` para desactivar la búsqueda web; por defecto
     `web_search_20250305`. La búsqueda web debe estar habilitada en la organización de la consola de Anthropic.
4. Redeploy. Sin la clave, la sección muestra un aviso y no se puede ejecutar.

## Límites y auditoría

- Máximo 20 ejecuciones por caso cada 24 horas; un mismo agente no corre dos veces en paralelo.
- Cada ejecución registra quién la pidió, modelo, tokens, búsquedas, resumen y error (tabla `agent_runs`).
- Tiempo máximo de 60 s por ejecución (Vercel). Ejecuciones colgadas se cierran como fallidas a los 3 minutos.
- El cliente no ve ejecuciones ni propuestas sin revisar (RLS: solo el equipo del caso).

## Protección de datos

Ejecutar un agente envía antecedentes del caso (incluidos RUT y razón social) a un proveedor externo de IA
(Anthropic). Antes de usarlo con clientes reales:

- Revisar con asesoría legal la Ley 19.628 y la **Ley 21.719** (vigente desde diciembre de 2026): base de
  licitud, información a los titulares, transferencia internacional y contrato de encargo de tratamiento.
- Incluirlo en la política de privacidad y en los términos del servicio.
- Revisar las condiciones de uso de datos de la API comercial de Anthropic (por defecto no se usan para entrenar).
