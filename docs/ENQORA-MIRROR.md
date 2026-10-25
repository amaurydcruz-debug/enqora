# ENQORA MIRROR — Una ventana hacia la inteligencia de tu empresa

Módulo visual transversal: se muestra en cada caso (contabilidad, patente, constitución, marca, legal…) y en pantalla completa en `/casos/<id>/mirror`.

## Regla de oro

MIRROR solo representa **trabajo real**. Todo lo que muestra sale de:

1. Los **pasos de análisis registrados** en el caso (`case_analysis_steps`), hoy por el equipo ENQORA desde la *Consola MIRROR* de la ficha, y mañana también por los agentes IA (cuenta del equipo con rol "Agente IA") usando la misma función `log_analysis_step`.
2. El **estado real del caso** (recibido, en investigación, en revisión profesional…).

No hay porcentajes inventados: la barra de avance aparece solo cuando el paso registra un avance medible. Si un caso está recién recibido y nadie lo trabaja, MIRROR lo dice.

## Dirección visual: Cámara de inteligencia privada

Una inteligencia detrás del espejo: el cliente observa cómo ENQORA analiza su caso. La referencia visual aprobada es la imagen conceptual de octubre 2026 (núcleo de cristal y oro sobre pedestal ENQORA, agentes alrededor y lectura del caso abajo).

### Núcleo 3D

El núcleo es **3D real**, hecho sin librerías:

- **Capa WebGL** (`mirror-gl.ts`):
  - El espacio: haz de luz superior, columnas de luz y piso con reflejo.
  - El cristal oscuro, formado por placas curvas. Cada placa refleja la cámara con su propia inclinación, y las juntas son filamentos de oro líquido por donde corre la luz cuando hay trabajo.
  - La luz dorada central.
  - El interior: retícula, circuitos que irradian desde el centro y partículas de datos.
- **Capa Canvas 2D** (`mirror-core.tsx`), encima de la anterior:
  - Cintas de oro y una cinta de datos azul que envuelven el núcleo.
  - El pedestal con el nombre ENQORA y sus anillos metálicos.
  - Los filamentos de los agentes, los pulsos y los paneles holográficos.

Si el dispositivo no tiene WebGL, todo se dibuja en Canvas 2D con la misma información.

### Agentes

Cada agente tiene un nodo propio: icono, nombre, último paso registrado y estado. Están ubicados alrededor del núcleo, con la misma composición en el lienzo y en el HTML (`layout.ts`).

| Estado | Nodo | Filamento al núcleo |
| --- | --- | --- |
| Trabajando | Anillo dorado que gira | Cinta trenzada (oro y datos), con pulsos hacia el núcleo y un panel holográfico |
| Completado | Se estabiliza en verde | Cinta fija, plata y verde |
| En espera | Tenue | Línea muy fina, sin flujo |
| Espera autorización | Anillo dorado que se expande suave (sin alarma) y píldora dorada | Cinta dorada discontinua |

### Información

- **Arriba a la izquierda:** marca ENQORA MIRROR.
- **Arriba a la derecha:** tarjeta del caso, siempre visible. Muestra el folio, el estado, una frase breve y un enlace a pantalla completa o a la ficha.
- **Izquierda:** etapa "04 / 09", nombre de la etapa y las 9 etapas reales con su marca (hecha, actual, pendiente).
- **Abajo, de izquierda a derecha:**
  - Actividad registrada: los últimos 4 pasos con su hora real. Al elegir un agente, aquí se ven sus pasos.
  - Mensaje humano de la etapa y aviso de autorización.
  - Documentos del caso: el total real y su distribución por formato (PDF, XML, planillas, otros).
- **Sin porcentajes inventados:** no se muestra "documentos analizados", porque ese dato no existe. La barra de avance aparece solo cuando un paso registra un avance medible.
- **Celular y módulo angosto (< 1020 px):**
  - El núcleo y el pedestal ocupan la parte principal, con los agentes en órbita.
  - Debajo van el estado del caso, la etapa, los agentes en dos columnas y la lectura del caso.

Los pasos marcados como **internos** no se muestran al cliente.

## Uso por el equipo

En la ficha del caso, sección **Consola MIRROR (equipo)**:
- Registrar paso: agente, etapa, qué se hace, fundamento o evidencia, estado y avance (opcional).
- Actualizar un paso abierto: estado (trabajando, completado, requiere revisión humana) y avance.

La ventana del cliente se actualiza sola cada 20 segundos mientras el caso está en curso.

## Accesibilidad y rendimiento

- WebGL + Canvas 2D, sin dependencias. Se pausa fuera de pantalla y con la pestaña oculta; menos partículas en teléfono; resolución limitada (1,5x en teléfono, 2x en escritorio). Si WebGL falla o se pierde el contexto, continúa en Canvas 2D.
- La composición depende del ancho del propio módulo (`@container`), no de la pantalla.
- Respeta "reducir movimiento": dibuja un cuadro fijo con la misma información.
- La información completa también está en texto (etapas, mensajes y actividad) para lectores de pantalla.
- Escritorio: cámara amplia con el núcleo al centro, agentes a los lados y lectura del caso abajo. Teléfono: el núcleo y el pedestal ocupan la pantalla principal; debajo, estado, etapa, agentes y lectura del caso.

## Instalación

1. Supabase → SQL Editor: ejecuta `supabase/migrations/0005_mirror.sql`.
2. Ejecuta `supabase/tests/0005_mirror_rls.sql` → **TODAS LAS PRUEBAS OK**.
3. Sube los archivos.

## Próximos pasos del módulo

- Conectar los agentes IA reales (Etapa de agentes) usando la misma tabla.
- Transición al diagnóstico estructurado (situación, riesgo fundamentado, obligaciones, alternativas, costos) cuando se construya el Diagnóstico gratuito (Etapa 7).
- Precios con excepción se mostrarán como "Propuesta pendiente de autorización" (Etapa 6).

## Reversión

```sql
drop function if exists public.log_analysis_step, public.update_analysis_step cascade;
drop table if exists public.case_analysis_steps cascade;
```


## Espacio de trabajo del caso (M04)

La ficha del caso es un único espacio de trabajo con tres áreas:

1. **Encabezado compacto:** ENQORA MIRROR, folio, título, estado, volver y pantalla completa.
2. **Escenario central** (`components/mirror/mirror-stage.tsx`):
   - El núcleo 3D, con los agentes en órbita, es el protagonista.
   - Debajo se muestran solo la etapa actual («04 / 09 — Cruzando información»), su estado y una frase breve.
   - El progreso por etapas es real. El avance medible aparece solo si el equipo lo registró.
   - Las nueve etapas se consultan con «Ver proceso completo». Sus estados reales son: pendiente, en curso, completado, requiere información, esperando autorización y revisión profesional.
3. **Panel de exploración:** el acordeón compacto de ENQORA, en mosaico, con una opción abierta a la vez.
   - Si una opción tiene mucha información, se desplaza dentro de sí misma.
   - Los enlaces antiguos (`#autorizaciones`, `#tareas`, `#equipo`, `#estado`, `#mirror`) abren la opción que corresponde.

**Agentes** (`components/mirror/agents-panel.tsx`):
- Primero se muestra un resumen; al elegir un agente se ve qué hace, qué información usa, su actividad, qué necesita, si requiere revisión y sus resultados.
- Un agente figura «Trabajando» solo si tiene un paso registrado en ese estado.

La pantalla completa (`/casos/[id]/mirror`) mantiene la cámara inmersiva.
