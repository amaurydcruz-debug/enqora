# ENQORA — Interfaz limpia y revelación progresiva

Regla permanente del proyecto. Complementa `ENQORA-DISENO.md` (sistema visual) y `ENQORA-ORQUESTACION.md` (quién decide qué).

## Principio

La pantalla muestra solo lo esencial. El detalle existe y es completo, pero se abre cuando el usuario lo pide. La complejidad es de ENQORA; la claridad, del cliente.

## Reglas

1. **Lo esencial primero.** Cada pantalla responde de inmediato tres preguntas: cómo está, qué requiere mi atención y cuál es el próximo paso.
2. **Detalle bajo demanda.** Antecedentes, historial, datos secundarios y explicaciones van dentro de secciones desplegables.
3. **Opciones relevantes.** Solo se muestran las acciones que corresponden al caso, a su estado y a los permisos del usuario.
4. **Distinguir la naturaleza de cada dato** con etiquetas (`FactTag`):

   | Etiqueta | Significado |
   | --- | --- |
   | Verificado | Dato comprobado con documento o fuente oficial |
   | Interpretación | Lectura profesional o de agente sobre la normativa o los hechos |
   | Estimación | Cálculo aproximado, aún no definitivo |
   | Alternativa | Opción posible entre otras |
   | Requiere tu autorización | ENQORA no actuará sin la decisión del cliente |
   | Sujeto a revisión profesional | Conclusión que todavía no aprueba un profesional |

5. **Nunca ocultar advertencias importantes.** Alertas de seguridad, riesgos, vencimientos y errores van siempre visibles (`Callout`), fuera de cualquier desplegable.
6. **Cliente simple, profesional profundo.** El cliente ve una interfaz simple. Los perfiles del equipo ENQORA ven abiertas por defecto las secciones de trabajo (historial, expediente, tareas, equipo), según sus permisos.
7. **Nada simulado.** Si no hay datos, se dice. No se muestran porcentajes, métricas ni avances inventados.
8. **Se mantienen datos, rutas y permisos.** La revelación progresiva cambia la presentación, nunca la seguridad (RLS y RPC siguen igual).

## Componentes reutilizables (`components/disclosure.tsx`)

| Componente | Uso |
| --- | --- |
| `Disclosure` | Fila con icono, título, resumen, estado y botón Explorar/Cerrar. Abre el detalle. Tonos `blue`, `gold`, `risk` |
| `Fold` | Sección plegable de una pantalla (expediente, tareas, historial, equipo) con su resumen a la derecha |
| `FactTag` | Etiqueta de naturaleza del dato (tabla anterior) |
| `Callout` | Aviso siempre visible: `info`, `warn`, `risk`, con acción opcional |
| `Evidence` | Lista de respaldos de una conclusión |
| `NextAction` | Bloque "Próximo paso" con una acción principal |

Otros componentes de la experiencia:

- `components/module-icons.tsx`: icono propio por módulo ENQORA.
- `components/user-menu.tsx`: menú de perfil (nombre, correo, rol, empresa, seguridad, cerrar sesión). Se cierra con Escape o al tocar fuera.
- `components/mirror/mirror-explore.tsx`: "Explora el análisis" de MIRROR.

Todos se construyen sobre `<details>/<summary>` nativos: accesibles con teclado y lector de pantalla, y funcionan sin JavaScript.

## Panel de opciones (`components/accordion.tsx`)

Componente oficial para mostrar información bajo demanda en toda ENQORA, salvo el Centro de control y Casos, que mantienen su organización.

- **Una sola opción abierta por grupo.** Abrir otra cierra la anterior; tocar la abierta la cierra.
- **Estado real de la interfaz**, reflejado en la URL (`#miembros`) para poder enlazar directo a una opción.
- **Variante `tiles`:** mosaico de opciones; el contenido se despliega a todo el ancho bajo la fila elegida. En teléfono pasa a lista vertical.
- **Variante `list`:** lista vertical.
- **Cada opción tiene:** emblema propio, título, descripción breve, estado opcional e indicador de apertura.
- **Contenido montado pero inerte** mientras está cerrado: los formularios no pierden lo escrito.
- **Accesible:** botones con `aria-expanded`, regiones con nombre y navegación con flechas.

## Aplicación por pantalla

| Pantalla | Visible siempre | Bajo demanda |
| --- | --- | --- |
| Barra superior | Logotipo (teléfono), estado de seguridad, notificaciones, perfil | Menú de perfil |
| Centro de control | Bienvenida personalizada, 3 indicadores, alertas, "Requiere tu atención", 3 casos, 4 servicios | Detalle de cada pendiente, todos los servicios, actividad reciente |
| Casos | Filtros y casos que necesitan acción | Grupos En curso y Finalizados |
| Empresas | Nombre, RUT, estado de verificación, acciones | Datos de la empresa |
| Ficha de empresa | Emblema, nombre comercial, razón social, RUT, estado, rol y resumen breve | Siete opciones en mosaico, una abierta a la vez: datos (lectura y luego «Editar datos»), miembros y permisos (acciones con «Administrar»), invitar, actividad (últimas 5 y «Explorar actividad»), seguridad y autorizaciones, documentos y configuración |
| Seguridad | Estado de protección y alertas | Cada sección (identidad, dos pasos, sesiones, dispositivos, actividad, contraseña) |
| Caso (MIRROR) | Encabezado compacto, núcleo MIRROR al centro, etapa actual con su frase y progreso real, avisos de autorizaciones o tareas | «Ver proceso completo» (nueve etapas con estado real) y el panel de exploración: qué investiga ENQORA, documentos, agentes y responsables, historial y mensajes, tareas, expediente, diagnóstico, próximas acciones (y gestión del caso para el equipo); una opción abierta a la vez |

## MIRROR: lo que el cliente puede explorar

Las preguntas aparecen solo si corresponden a su caso:

- ¿Qué está investigando ENQORA?: pasos en curso.
- ¿Qué documentos está revisando?: documentos reales del expediente.
- ¿Qué agentes están trabajando?: solo si hay agentes con trabajo registrado.
- ¿Qué conclusiones están pendientes?: pasos en revisión, marcados como sujetos a revisión profesional.
- ¿Qué autorizaciones se necesitan?: con enlace directo para decidir.

## Informes interactivos

Los informes de diagnóstico se presentarán como situaciones numeradas ("Situación 01", con la acción "Ver análisis"), usando `Disclosure`, `FactTag`, `Evidence` y `NextAction`. Se activan cuando exista el diagnóstico real (Etapa 7). Hasta entonces no se muestran situaciones de ejemplo.
