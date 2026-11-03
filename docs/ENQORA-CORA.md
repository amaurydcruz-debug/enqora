# CORA — Director de Inteligencia Empresarial de ENQORA

Etapa 1 aprobada el 02-11-2026. El alcance es Chile, con una arquitectura preparada para sumar otros países: cada
fuente lleva el campo `pais`.

## Qué hace

Al consultar el RUT de una empresa, CORA hace dos cosas:
1. Activa a sus agentes sobre las fuentes públicas ya conectadas y sobre la normativa verificada.
2. Construye un **expediente de 16 secciones**.

Solo pregunta al empresario lo que no se puede comprobar en fuentes legítimas: 11 preguntas.

Para cada sección, el expediente muestra:
- qué se investigó y en qué fuente, con su fecha;
- qué se encontró y qué falta;
- el estado y la próxima acción.

Los estados son: Confirmado, Parcial, No encontrado, Requiere autorización, Requiere documentación, Requiere evaluación
profesional, Fuente no disponible y Declarado por el empresario.

Además, el expediente incluye:
- **Completitud**: el porcentaje de secciones con información y cuántas están verificadas en fuentes oficiales. No es
  una nota de salud de la empresa.
- **Hallazgos.** Cada uno responde qué se encontró, por qué importa, qué consecuencias podría tener, qué hacer, qué
  pasaría si no se atiende y qué servicio de ENQORA ayuda. Las consecuencias solo aparecen cuando hay fundamento.
- **Tres prioridades**, cada una con un servicio real del catálogo. Si el servicio no está activo, aparece como
  «Próximamente · Solicitar contacto».

## Archivos

| Archivo | Rol |
| --- | --- |
| `lib/cora/secciones.ts` | Las 16 secciones y los estados |
| `lib/cora/fuentes.ts` | Catálogo Maestro de Fuentes: organismo, URL, nivel A–E, método, campos, restricciones, frecuencia, estado y verificación |
| `lib/cora/agentes.ts` | Director, 16 agentes especializados y 5 transversales, con su estado (activo, parcial o próxima etapa) |
| `lib/cora/normativa-laboral.ts` | Obligaciones laborales, previsionales y de seguridad, con su fundamento legal y fuente verificada |
| `lib/cora/director.ts` | Orquestación, consolidación, verificación, duplicados, contradicciones, niveles y prioridades |
| `app/expediente-cora.tsx` | Vista del expediente |
| `app/(mando)/mando/fuentes/page.tsx` | Centro de Mando: fuentes, agentes y normativa |

CORA reutiliza piezas que ya existían:
- el conector del SII (M18);
- el informe inicial;
- las preguntas y los beneficios del diagnóstico 360°;
- el catálogo M16;
- el catálogo de servicios con sus precios.

## Reglas

- El número de trabajadores informado al SII es un **indicador orientativo**. CORA informa obligaciones
  «potencialmente aplicables», cada una con su fundamento, los datos usados, lo que falta y el documento que acredita
  el cumplimiento. Nunca afirma un incumplimiento.
- «No encontrado» no significa incumplimiento.
- No se usan fuentes, APIs ni resultados inventados. Una fuente sin verificar queda «por investigar».
- No se hace scraping de páginas con verificación anti-robots ni se piden claves (SII, Previred, AFC o bancos).
- Las conclusiones de alto impacto se marcan como «requiere revisión profesional antes de actuar».
- Nada se guarda en la Etapa 1: el expediente se arma en el navegador con datos públicos y las respuestas del visitante.

## Próximas etapas (cada una requiere autorización)

| Etapa | Contenido |
| --- | --- |
| 2 | Conector del Registro de Empresas y Sociedades (datos abiertos) y API de Mercado Público (ticket `MERCADOPUBLICO_TICKET` en Vercel) |
| 3 | Memoria empresarial: historial y cambios del expediente en Supabase. Nivel C con documentos de Previred, F30 y mutualidad, más consentimiento. Revisión legal por la Ley 21.719 |
| 4 | Agente de reputación digital con búsqueda web y aprobación humana, INAPI asistido y fuentes sectoriales (SMA/SEA, Aduanas) |

## Etapa 1B (aprobada el 02-11-2026)

### Tres modalidades

| Modalidad | Quién la usa | Regla |
| --- | --- | --- |
| CORA Empresas | Cualquier visitante | Datos públicos de personas jurídicas (expediente de 16 secciones) |
| CORA Personas | Solo la propia persona | **Pública:** con un RUT de persona, CORA no consulta ninguna fuente sobre ella. 7 preguntas en el navegador, sin guardar nada (`lib/cora/personas.ts`). **Con cuenta** (etapa posterior): documentos y consentimiento |
| CORA Vinculación | Una empresa que verifica a un socio, representante o proveedor | Postergada hasta la revisión legal (Ley 21.719): requiere finalidad legítima, consentimiento de la persona verificada y registro de cada consulta |

### Motor de Necesidades (`lib/cora/necesidades.ts`)

Cada hallazgo con conocimiento verificado se convierte en una necesidad con estos elementos:
- evidencia, fuente y fecha, y certeza;
- la necesidad misma;
- la consecuencia, solo con fundamento;
- el beneficio de resolverla;
- la solución: un servicio de ENQORA y una ruta externa oficial;
- el próximo paso.

Las necesidades se priorizan por urgencia, impacto y evidencia. Un hallazgo sin conocimiento verificado no se
convierte en necesidad.

### Motor de Soluciones (`lib/cora/soluciones.ts`)

- Agrupa las necesidades en planes por etapas: regularización tributaria, cumplimiento laboral y preventivo,
  formalización y protección, orden y gestión, y oportunidades y crecimiento.
- Suma el costo solo con tarifas publicadas.
- Siempre ofrece la alternativa oficial («O por tu cuenta»).
- Si no hay nada urgente lo dice, y si no detecta necesidades dice «hoy no necesitas contratar nada».

### Investigación en vivo (`app/cora-solucion.tsx`)

Muestra, uno a uno, los pasos que CORA realmente ejecutó: es su bitácora real, no pasos simulados.

## Consulta Estratégica 360° · Etapa E1 (autorizada el 03-11-2026)

La consulta de una empresa es ahora **una sola experiencia** (`app/consulta-estrategica.tsx`). Antes había tres capas
que se repetían: el informe inicial, el expediente y la propuesta.

La consulta sigue este orden:
1. **Investigación en vivo**: la bitácora real de los agentes.
2. **Apertura estratégica**: lo más relevante que encontró CORA, con su evidencia.
3. **Conversación**: una pregunta a la vez, como máximo 5, y solo sobre lo que no aparece en fuentes públicas.
4. **Informe ejecutivo**:
   - resumen y situación;
   - plan de acción priorizado, con beneficio, documentos, servicio y ruta oficial;
   - hallazgos verificados, fortalezas, oportunidades (confirmadas o por confirmar) y necesidades confirmadas;
   - riesgos, fundamento normativo y pendientes;
   - todas las soluciones, por plan.
5. **Expediente completo** de 16 secciones, plegado.

### Estratega (`lib/cora/estratega.ts` y `app/actions/cora.ts`)

- **Evidencias**: el servidor vuelve a consultar el RUT y arma el expediente. Nunca usa hechos enviados por el navegador.
  Cada hecho lleva un identificador (E-…), su fuente y su fecha.
- **Manual**: Jobs to Be Done, Customer Discovery (The Mom Test), SPIN, Value Proposition Design, reconocimiento de
  oportunidades y decisiones basadas en evidencia, traducidos a procedimientos con redacción propia.
- **Salida estructurada** (Claude, herramienta forzada) y **validador**. El validador descarta:
  - afirmaciones sin evidencia válida;
  - montos;
  - «no tiene» o «no posee»;
  - garantías;
  - preguntas fuera del banco;
  - prioridades fuera del listado de necesidades, que ya trae servicios reales.
- **Respaldo**: si la IA no responde o no pasa el validador, se usa el motor de reglas, y la pantalla lo indica.
- Cada llamada cuenta en el límite de consultas por visitante (30 por hora). Nada se guarda.

### Personas

La conversación muestra una pregunta a la vez, se adapta y permite cambiar cada respuesta. Con el RUT de una persona
no se consulta ninguna fuente (ver la Etapa 1B).

### Pruebas (`scripts/cora-escenarios.ts`)

Se ejecutan con `npx tsx scripts/cora-escenarios.ts`. Cubren 7 escenarios: persona sin inicio, profesional
independiente, emprendedor establecido, empresa con trabajadores, empresa sin hallazgos, empresa con señal de ventas y
empresa con término de giro. Comprueban que:
- las prioridades difieren entre escenarios;
- toda afirmación tiene evidencia válida;
- no hay lenguaje prohibido;
- ningún servicio inactivo se muestra como disponible;
- el validador rechaza salidas de IA sin evidencia o con montos.

Dos escenarios **no se pueden demostrar en E1**:
- empresa con marca registrada: INAPI no tiene API;
- proveedor del Estado: Mercado Público llega en E2.

## CORA Web Research Agent · piloto (aprobado el 03-11-2026)

Es un bot con un navegador en la nube (Vercel, Playwright y `@sparticuz/chromium`). Consulta los portales oficiales y
deja la prueba de cada búsqueda: captura en Storage privado, fecha y hora, fuente, consulta, resultado y estado.

| Pieza | Archivo |
| --- | --- |
| Tablas y bucket privado | `supabase/migrations/0026_investigador_web.sql` (prueba en `supabase/tests/0026_…`) |
| Navegador | `lib/cora/web/navegador.ts` |
| Procedimientos por portal (memoria operativa) | `lib/cora/web/portales.ts`: INAPI (por titular = razón social) y Registro de Empresas y Sociedades (por RUT) |
| Ejecución y evidencias | `lib/cora/web/investigador.ts` |
| Ejecución en la nube (202 + after, hasta 300 s) | `app/api/cora/investigador/route.ts` |
| Centro de Mando | `/mando/investigador`: prueba de entorno, investigación y evidencias con captura |

### Reglas

- **CAPTCHA o inicio de sesión:** el bot no los intenta superar; marca «Bloqueado» y se detiene.
- **Búsqueda sin término verificable:** marca «Procedimiento por validar» y guarda la captura. Un humano valida el
  procedimiento nuevo antes de que se use; el bot no lo cambia solo.
- **Cada búsqueda** genera una fila de evidencia con su captura, también cuando falla.
- **Coincidencias en INAPI:** cuentan solo las que tienen el titular exacto. Lo demás es «sin resultados localizados».
- **Uso en el piloto:** solo el equipo ENQORA lo usa, con su sesión. No se conecta a la consulta pública hasta superar
  el piloto con 3 portales.

### Prueba del piloto

1. En el Centro de Mando, abre **«1 · Probar el navegador en Vercel»**. Mide el lanzamiento, el tiempo, la memoria y
   la versión de Chromium. Si falla de forma estable, se evalúa Browserbase.
2. Usa **«2 · Investigar»** con el RUT de prueba autorizado. Debe dejar una evidencia con captura por cada portal.
