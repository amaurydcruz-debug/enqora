# ENQORA — Principio de Orquestación Inteligente

Regla permanente y transversal del proyecto. Rige para todos los módulos actuales y futuros (CONTABILIDAD, CREATE, FORMALIZA, BRAND, LEGAL, GESTIÓN, CRECE, IDEA y los que se agreguen).

> **La inteligencia trabaja. El equipo supervisa. El cliente conserva el control de sus autorizaciones.**

## 1. Qué coordina el Centro de Mando

El Centro de Mando es el único punto de coordinación operativa de ENQORA. Desde él se coordinan:

- **Agentes IA:** investigadores por área, verificador normativo, orquestador y supervisor.
- **Profesionales:** contador autorizado, abogado autorizado, director de operaciones y gestores.
- **Procesos:** casos, tareas, expedientes, aprobaciones internas y autorizaciones del cliente.

Ningún módulo crea su propio circuito paralelo de aprobación ni su propia bandeja. Todos usan el núcleo común: `cases`, `case_tasks`, `case_analysis_steps`, `approvals` y `client_authorizations` (ver `ENQORA-APROBACIONES.md`).

## 2. Lo que un agente puede y no puede hacer

| Puede | No puede |
| --- | --- |
| Investigar, ordenar documentos y cruzar información | Aprobar acciones de alto impacto |
| Proponer diagnósticos, alternativas, precios y excepciones | Aprobar precios, excepciones ni actuaciones legales |
| Registrar su trabajo real en el caso (`case_analysis_steps`) | Actuar ante una institución |
| Pedir una aprobación interna al responsable competente | Autorizar en nombre del cliente |

Esto incluye a los agentes **orquestador** y **supervisor**: coordinan y revisan, pero no aprueban. La aprobación de alto impacto siempre la da una persona con el perfil competente, desde el Centro de Mando, y queda en auditoría.

La base de datos lo garantiza, no solo la interfaz:

- `public.decide_approval` (vía `private.can_decide_approval`) rechaza decisiones de cuentas con rol `ai_agent`, y los agentes tampoco pueden solicitar autorizaciones al cliente.
- La regla de los cuatro ojos (`ENQ_CUATRO_OJOS`) impide que quien solicita decida su propia solicitud (solo un supervisor humano puede hacerlo).
- Las autorizaciones del cliente solo las decide un miembro de su empresa, con confirmación explícita.

## 3. Tres niveles de decisión (no mezclar)

1. **Trabajo de agentes:** sugiere y documenta.
2. **Aprobación interna de ENQORA:** el profesional competente aprueba, rechaza o devuelve con observaciones.
3. **Autorización del cliente:** consentimiento explícito, limitado al trámite, con vigencia y revocable.

La aprobación interna de ENQORA **no equivale** a un mandato legal. Cuando un trámite exige mandato o representación, se pide por separado (Etapa 9). ENQORA nunca solicita ni almacena la ClaveÚnica ni la clave del SII.

## 4. MIRROR muestra solo trabajo real

ENQORA MIRROR (`ENQORA-MIRROR.md`) es la ventana del cliente a la orquestación:

- Solo muestra pasos registrados en `case_analysis_steps`, documentos reales del expediente y autorizaciones existentes.
- No inventa porcentajes, tiempos estimados, avances ni resultados.
- Si no hay trabajo en curso, lo dice.
- Las conclusiones en revisión se marcan como **Sujeto a revisión profesional**. No se presentan como definitivas.

## 5. Control humano y auditoría

- Toda aprobación, rechazo, devolución, autorización y revocación queda registrada con autor, fecha y motivo (`case_events` y `audit_events`).
- Los registros de auditoría no se pueden modificar ni borrar desde la aplicación.
- Las observaciones son obligatorias al rechazar o devolver (`ENQ_FALTA_OBSERVACION`).

## 6. Contratos de agente escalables

Cada agente nuevo se integra con el mismo contrato, sin cambios en el núcleo:

| Campo | Contenido |
| --- | --- |
| Clave y nombre | Identificador estable (`tributario`, `contable`, `legal`…) y nombre visible |
| Alcance | Módulos y tipos de caso en los que puede trabajar |
| Entradas | Documentos y datos del caso a los que accede (siempre bajo RLS, solo con un caso asignado) |
| Salidas | Pasos en `case_analysis_steps` con estado `trabajando`, `completado` o `revision` |
| Fuentes | Fuentes oficiales con fecha de consulta y vigencia |
| Límites | Lo que siempre escala a un humano (precios, excepciones, actuaciones, conclusiones normativas) |
| Responsable | Perfil profesional que revisa su trabajo |

Agregar un agente es registrar su contrato y su identidad (`staff_members` con rol `ai_agent`). No se requiere una pantalla nueva: MIRROR y el Centro de Mando lo muestran automáticamente.

## 7. Cómo se aplica en cada módulo nuevo

Antes de publicar un módulo, verificar:

1. Usa casos, tareas y expediente del núcleo.
2. Sus agentes respetan el contrato y no aprueban.
3. Sus aprobaciones pasan por `approvals`.
4. Sus actuaciones ante instituciones exigen autorización del cliente.
5. MIRROR refleja solo su trabajo real.
6. Todo queda en auditoría.
