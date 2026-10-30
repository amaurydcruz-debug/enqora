# ENQORA — Arquitectura de plataforma y hoja de ruta

Regla permanente del proyecto. Define el mapa completo; se construye por etapas sin rehacer lo anterior.

## Principio rector

ENQORA vela prioritariamente por los intereses legítimos del cliente, usando la normativa chilena para identificar las alternativas legales más favorables, prevenir incumplimientos y resolver problemas. Toda recomendación es fundamentada y verificable, y explica beneficios, obligaciones y riesgos. Los agentes investigadores sugieren soluciones y precios; las excepciones y actuaciones que requieren autorización las aprueba el responsable competente desde el Centro de Mando.

## Principios permanentes

- **Orquestación inteligente** (`ENQORA-ORQUESTACION.md`): el Centro de Mando coordina agentes, profesionales y procesos; los agentes, incluidos orquestador y supervisor, nunca aprueban acciones de alto impacto. "La inteligencia trabaja. El equipo supervisa. El cliente conserva el control de sus autorizaciones."
- **Interfaz limpia y revelación progresiva** (`ENQORA-EXPERIENCIA.md`): lo esencial a la vista, el detalle bajo demanda, advertencias siempre visibles y nada simulado.

## Visión

ENQORA no es solo un software contable. Acompaña a la empresa durante todo su ciclo de vida: idea → creación → formalización → operación → crecimiento → regularización, reorganización o cierre. El cliente no busca diez proveedores: ENQORA identifica lo que necesita, organiza los servicios y coordina agentes IA y profesionales.

ENQORA no reemplaza a los profesionales: automatiza el trabajo repetitivo y coordina especialistas. Lo que requiere criterio profesional, representación legal o aprobación humana conserva esa supervisión.

## Catálogo de módulos

| Módulo | Alcance |
| --- | --- |
| ENQORA IDEA | Diagnóstico de la idea, mercado, competencia, clientes, nombre, modelo de negocio, inversión, viabilidad, riesgos |
| ENQORA CREATE | Estructura jurídica (persona natural, EIRL, SpA, Ltda.), constitución en Registro de Empresas y Sociedades, estatutos, RUT, inicio de actividades, socios y beneficiarios |
| ENQORA BRAND | Nombres, logotipo, identidad y manual de marca, material comercial, dominio y correo, búsqueda preliminar y solicitud ante INAPI |
| ENQORA FORMALIZA | Patente municipal (según comuna, domicilio y actividad), permisos sanitarios y sectoriales, domicilio, expedientes, renovaciones |
| ENQORA CONTABILIDAD | Documentos tributarios, compras y ventas, conciliación, contabilidad mensual, IVA/F29, libros, renta, optimización legal, informes |
| ENQORA GESTIÓN | Clientes, proveedores, inventario, caja, cobros y pagos, contratos, RR. HH. y remuneraciones, proyectos, indicadores |
| ENQORA CRECE | Financiamiento, fondos y programas públicos, expansión, inversionistas, exportación |
| ENQORA LEGAL | Revisión documental, contratos, modificaciones societarias, regularización, deudas, mandatos y representación |

Futuros módulos (licitaciones, comercio exterior, inmobiliario…) se agregan sobre el mismo núcleo. La expansión del ecosistema (Conecta, Talento, Partners, Oportunidades, Academy, Enterprise) está en `ENQORA-ECOSISTEMA.md`.

## Núcleo común (todos los módulos lo usan)

1. Identidad y seguridad — **hecho** (Etapas 1 y 3)
2. Empresas, usuarios y roles de empresa — **hecho** (Etapa 2)
3. Auditoría — **hecho** (empresa y seguridad personal)
4. Expedientes y documentos — **hecho** (Etapa 4)
5. Casos, tareas y seguimiento — **hecho** (Etapa 4)
6. Equipo ENQORA: profesionales, gestores y agentes IA — **hecho** (Etapa 4; agentes IA conectados más adelante)
7. Autorizaciones del cliente — **hecho** (Etapa 5); mandatos, representación y trámites — **hecho** (Etapa 9)
8. Notificaciones (app, correo, WhatsApp) — **hecho** (Etapa 9)
9. Centro de Mando — **hecho** (Etapas 4 y 5): bandejas por perfil y mecanismo común de aprobaciones

Cada módulo es configuración y contenido sobre este núcleo, no una aplicación aparte: catálogo de servicios → diagnóstico → ruta de trabajo → expediente → agentes IA → profesional responsable → gestor → seguimiento → autorización del cliente → auditoría.

## Dos tipos de roles (no mezclar)

| Dimensión | Roles | Dónde vive |
| --- | --- | --- |
| Roles en la empresa del cliente | Propietario, Administrador, Contador, Solo lectura | `company_members` (Etapa 2) |
| Roles del equipo ENQORA | Administrador ENQORA, Director de operaciones, Contador autorizado, Abogado autorizado, Gestor presencial/junior, Agente IA | `staff_members` (Etapa 4) |

Un miembro del equipo ENQORA solo accede a una empresa cuando un caso se lo asigna, por el tiempo del caso, y queda en auditoría. Permisos en base de datos y backend, nunca solo en la interfaz.

## Nombres de las vistas

- **Centro de control**: vista del cliente (su empresa, pendientes, alertas, avances).
- **Centro de Mando**: vista operativa del equipo ENQORA (casos, bandejas, asignaciones, aprobaciones).

## Ficha de caso

Identificador (ENQ-AAAA-NNNNN), cliente y empresa, módulo de origen, solicitud, diagnóstico, ruta de solución, agentes participantes, profesional responsable, gestor asignado, documentos y evidencias, autorizaciones, estado, prioridad, fecha límite, historial, resultado, verificación y cierre.

## Flujo de un caso

Solicitud del cliente → investigación IA → diagnóstico → revisión profesional (aprobar / rechazar / devolver con observaciones) → autorización del cliente si corresponde → ejecución (gestor presencial solo con asignación y autorización) → verificación → cierre validado por el profesional → resultado al cliente.

Un caso no se cierra porque alguien respondió: se cierra con solución ejecutada y verificada, o queda pendiente con su motivo documentado.

## Representación y actuaciones (no negociable)

- La aprobación interna de ENQORA no equivale a un mandato legal.
- Antes de actuar ante una institución se verifica: identidad del cliente y del representante, alcance y vigencia del mandato, institución y trámite permitidos, evidencia de la autorización y requisitos de la institución.
- La autorización del cliente es explícita, verificable, limitada al trámite y revocable.
- Nunca solicitar ni almacenar ClaveÚnica ni clave del SII.
- No ejecutar trámites reales ni integraciones institucionales sin verificar sus requisitos técnicos, legales y de autorización.

## Onboarding inteligente

Primeras preguntas: ¿tienes una idea?, ¿quieres crear una empresa?, ¿ya está constituida?, ¿iniciaste actividades?, ¿está funcionando?, ¿necesitas regularizar?, ¿quieres crecer? Según las respuestas se activan solo los módulos pertinentes, se crea la ruta personalizada con tareas, documentos faltantes, explicación de cada paso y próximos pasos.

## Investigación continua

Agentes por área (empresas, tributario, marcas, municipal, sectorial, oportunidades), con Verificador normativo, Orquestador y Gerente IA. Fuentes oficiales: SII, TGR, INAPI, Registro de Empresas y Sociedades, Diario Oficial, BCN, ChileAtiende, municipalidades y organismos sectoriales.

Toda información normativa registra: fuente oficial, fecha de consulta, publicación, vigencia, alcance y excepciones, nivel de confianza y revisión profesional cuando corresponda. Nunca presentar una interpretación de IA como resolución oficial ni garantizar el resultado de un trámite (por ejemplo, la concesión de una marca). Costos solo con fuente verificable.

## Hoja de ruta de construcción

| Etapa | Contenido | Estado |
| --- | --- | --- |
| 1 | Identity: registro, correo verificado, MFA, recuperación | Hecho |
| 2 | Empresas, roles, invitaciones, RLS, auditoría | Hecho |
| 3 | Shield / Sentinel: sesiones, dispositivos, alertas, registro de seguridad | Hecho |
| 4 | Núcleo operativo: equipo ENQORA, casos, tareas, expedientes y documentos (almacenamiento privado por empresa) | Hecho |
| 5 | Centro de Mando: bandejas por perfil, aprobar / rechazar / devolver, mecanismo común de aprobaciones (casos, precios, excepciones), autorizaciones del cliente dentro del caso | Entregado (ver `ENQORA-APROBACIONES.md`) |
| 6 | Catálogo de servicios y motor de precios: tarifas versionadas, referencias de mercado con fuente, cotizaciones, excepciones aprobadas en el Centro de Mando, aceptación del cliente | Entregado (ver `ENQORA-PRECIOS.md`) |
| 7a | Puerta de entrada: bienvenida, consulta pública por RUT (empresas), galería de servicios y registro con el servicio elegido | Entregado (ver `ENQORA-ENTRADA.md`) |
| 7 | Diagnóstico gratuito + onboarding inteligente + Centro de control del cliente con su ruta | Entregado (ver `ENQORA-DIAGNOSTICO.md`) |
| 8 | Planes y suscripciones (Plataforma y Contabilidad Profesional), propuesta mensual al cerrar un caso, pagos | Entregado (ver `ENQORA-PLANES-PAGOS.md`) |
| 9 | Mandatos y representación; notificaciones (correo, WhatsApp) | Entregado (ver `ENQORA-MANDATOS-NOTIFICACIONES.md`) |
| 10 | Primer servicio completo: ENQORA CONTABILIDAD (documentos, conciliación, IVA/F29) | Entregado (ver `ENQORA-CONTABILIDAD.md`) |
| 11–13 | Agentes de investigación por módulo, rutas y propuestas con aprobación humana | Entregado (ver `ENQORA-AGENTES.md`) |
| 14 | Publicación: SEO, legales, salud y estado del sistema | Entregado (ver `ENQORA-PUBLICACION.md`) |
| 15 | Auditoría IA independiente y base normativa | Entregado (ver `ENQORA-BASE-NORMATIVA.md`) |
| 16 | Portal por perfil y rubro, aprendizaje de casos, vigilancia normativa | Entregado (ver `ENQORA-PORTAL-APRENDIZAJE.md`) |
| 17 | Cumplimiento y calendario de obligaciones | Entregado (ver `ENQORA-CUMPLIMIENTO.md`) |
| 18 | Conector SII y hoja de vida de la empresa | Entregado (ver `ENQORA-HOJA-DE-VIDA.md`) |
| 19 | Centro de Mando independiente y acceso del equipo por enlace de jornada | Entregado (ver `ENQORA-CENTRO-DE-MANDO.md`) |
| Próximo | Fase 0 del ecosistema: estabilización (consulta por RUT con datos reales, clave de servicio, diagnóstico) | En curso |
| Futuro | Ecosistema: Conecta, Talento, Partners, Oportunidades, Academy y Enterprise; Trust, CRM, Payments, Intelligence, Support y Mi Negocio | Planificado (ver `ENQORA-ECOSISTEMA.md`) |
| Pendientes de módulo | CREATE, FORMALIZA, BRAND, IDEA, GESTIÓN, CRECE, LEGAL (servicio completo) | |

Ver también `docs/ENQORA-COMERCIAL.md` (precios, diagnóstico gratuito y conversión), `docs/ENQORA-DISENO.md` (sistema visual), `docs/ENQORA-ORQUESTACION.md` (orquestación) y `docs/ENQORA-EXPERIENCIA.md` (revelación progresiva).
