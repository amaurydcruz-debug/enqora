# ENQORA — Constitución del sistema visual y experiencia de usuario

Regla permanente del proyecto. Todo módulo nuevo la cumple antes de publicarse.

## Identidad visual (rediseño premium, oct 2026)

Azul casi negro con profundidad, iluminación azul sutil y oro como acento. Nada de grandes superficies de azul brillante ni de neón.

| Token | Color | Uso |
| --- | --- | --- |
| `--bg` | `#050914` | Fondo principal |
| `--bg-2` | `#080F1D` | Fondo secundario |
| `--surface` | `#0B1425` | Superficie elevada |
| `--surface-2` | `#101D34` | Superficie activa |
| `--blue-deep` | `#14284A` | Profundidad |
| `--blue` | `#3C76D2` | Solo reflejos, foco y elemento activo |
| `--gold` / `--gold-bright` | `#C6A66B` / `#E5C783` | Acento premium: acción principal, indicador activo, lo que espera al cliente |
| `--text` / `--text-2` / `--text-3` | `#F3F5FA` / `#C3CCDA` / `#9AA8BD` | Títulos / texto / texto secundario |
| `--ok` | `#64C7AE` | Éxito y verificado |
| `--danger` | `#E47C82` | Solo riesgos reales y errores |

Los nombres anteriores (`--night`, `--silver`, `--ivory`…) siguen funcionando y apuntan a la nueva paleta.

Debe transmitir inteligencia empresarial, seguridad financiera, tecnología avanzada, exclusividad, confianza y precisión.

### Composición

- **Superficies por capas:** franja de indicadores, paneles y fichas. Los bordes son finos y aparecen solo donde aportan estructura. No se encierra todo en tarjetas.
- **Navegación lateral propia:**
  - Contenido: logotipo, empresa activa, secciones según permisos y usuario.
  - Elemento activo: reflejo azul con indicador dorado.
  - **Teléfono:** barra superior y barra inferior compacta.
- **Estados:** punto de color y texto (`.status`). Se distinguen por su estado, no por decoración.
- **Pantallas principales:**
  - **Centro de control:** composición asimétrica. Lo principal es el estado de la empresa, los casos activos y las acciones pendientes; al costado, la protección de la cuenta, la actividad y los accesos.
  - **Casos:** filtros por estado y una línea por caso con folio, nombre, empresa, estado, próximo paso, responsable y fecha.
  - **Empresas:** ficha empresarial con monograma y datos en columnas. La ficha de una empresa es un panel de siete opciones en mosaico (M03); solo una se abre a la vez.
  - **Seguridad:** centro de seguridad con el estado de protección y secciones de dos columnas.

## Sistema de diseño

- Tokens en `app/globals.css` (`:root`). Ningún color, sombra o radio fuera de los tokens.
- Componentes reutilizables en `components/`. No duplicar estilos por pantalla ni usar estilos en línea.
- Botones:
  - **Principal (`btn-gold`):** azul profundo, borde metálico fino (oro a azul), texto dorado, profundidad interior. Al pasar el cursor sube 1 px, brilla y recorre un reflejo; al presionar se hunde levemente.
  - **Secundario (`btn-ghost`):** discreto, vidrio con desenfoque y borde fino.
  - **Riesgo (`btn-danger`):** nunca dorado. Las acciones riesgosas no usan el color de la acción principal.
  - Tamaños normal y `btn-sm`.
- Revelación progresiva: `Disclosure`, `Fold`, `FactTag`, `Callout`, `Evidence` y `NextAction` (ver `ENQORA-EXPERIENCIA.md`).
- Movimiento: entrada escalonada del contenido (`rise`), apertura de secciones (`unfold`), aparición de menús (`pop`) y profundidad sutil. Todo se desactiva con `prefers-reduced-motion`.
- Botones con siete estados: normal, hover, presionado, en ejecución (reloj ENQORA en miniatura mientras la acción real está pendiente), deshabilitado, completado y error (`SubmitButton` con `status`).
- Emblemas 3D (`components/emblems.tsx`):
  - Identidad propia para cada módulo, servicio y sección, con metal azul, oro, plata y luz.
  - Composiciones isométricas que comparten materiales globales (`<EmblemDefs />` en el layout raíz).
  - Un módulo nuevo agrega su composición; nunca se repite un dibujo cambiando solo el color.
- EnqoraClockLoader (`components/clock-loader.tsx`):
  - Es el indicador oficial de carga: el reloj del logotipo en vector (`components/brand/enqora-clock.tsx`), con manecillas en movimiento, reflejo en el metal, núcleo de luz azul e inclinación 3D sutil.
  - Modos `navegacion` (cada sección tiene su `loading.tsx` con una frase propia), `datos` (en línea, sin bloquear la pantalla) e `ia` (con la descripción real del trabajo).
  - Sin tiempos artificiales: desaparece en cuanto el contenido está listo. Queda quieto con «reducir movimiento».
  - No se usan círculos giratorios genéricos ni íconos de librerías.
- Barra superior: estado de seguridad, notificaciones con contador real y menú de perfil.
- Tarjetas, paneles, formularios, tablas y listas con un solo lenguaje visual.
- Estados obligatorios en cada pantalla: carga, éxito, error, advertencia y vacío.
- Navegación: barra superior + navegación lateral cuando haya más de 4 secciones. Volver, Continuar y Cancelar donde corresponda.
- Iconografía propia y coherente (trazo fino, terminaciones redondeadas, acento dorado). Nada de iconos genéricos mezclados.
- Adaptable a ordenador, tablet y teléfono (mínimo 360 px de ancho, sin desplazamiento horizontal).

## Capas separadas

1. Estructura funcional (páginas y rutas)
2. Componentes visuales
3. Animaciones y efectos (archivo/capa propia, activable por componente)
4. Datos y lógica contable

Agregar un efecto nunca obliga a reconstruir una pantalla.

## Plan de efectos

| Etapa | Contenido | Cuándo |
| --- | --- | --- |
| 1. Fundamentos | Colores, tipografía, botones, tarjetas, navegación, iconografía, responsive | Ahora |
| 2. Movimiento y profundidad | Transiciones suaves, círculos luminosos, reflejos, vidrio, cargas animadas, 3D moderado | Durante la construcción |
| 3. Experiencia avanzada | Gotas de agua, partículas, iluminación dinámica, reloj 3D interactivo en el Centro de Control | Con los módulos estables |
| 4. Optimización | Velocidad, accesibilidad, batería, compatibilidad móvil, pruebas de seguridad | Antes de publicar |

El reloj ENQORA es el emblema del Centro de Control, sin distraer de las funciones contables.

## Seguridad y accesibilidad (no negociable)

- Los efectos nunca ocultan información crítica, estados de seguridad, errores ni alertas tributarias.
- Respetar `prefers-reduced-motion`: sin animaciones si el dispositivo lo pide.
- Contraste mínimo WCAG AA. Todo funciona aunque las animaciones no se ejecuten.

## Antes de construir una pantalla

1. Revisar los componentes existentes.
2. Reutilizarlos.
3. Mantener la identidad visual.
4. Probar en ordenador y móvil.
5. Verificar que sea accesible y comprensible.

## Estado actual (oct 2026)

- Hecho: tokens de color, tipografía (Montserrat + Inter), botones, tarjetas, formularios, insignias, avisos, diseño adaptable.
- Hecho (Etapas 3 y 4): iconografía propia (`components/icons.tsx`), navegación lateral, estado de carga con el reloj ENQORA, movimiento reducido, foco visible.
- Hecho: ENQORA MIRROR, la Ventana de Inteligencia (`components/mirror/`): cámara de inteligencia privada con núcleo 3D real (WebGL: cristal en placas con juntas de oro líquido, luz dorada central, espacio volumétrico) sobre pedestal ENQORA, agentes con nodo propio y filamentos de energía, y lectura del caso con datos reales. Ver `ENQORA-MIRROR.md`.
- Hecho: rediseño premium del sistema (paleta azul casi negro y oro, navegación lateral con estado activo, barra inferior en teléfono) y de Centro de control, Casos, Empresas y Seguridad.
- Hecho: rediseño élite con revelación progresiva: barra superior limpia, bienvenida personalizada, solo indicadores importantes, mosaicos de servicios, "Explora el análisis" en MIRROR, botones premium y experiencia móvil nativa.
- Hecho (M02): estilos en línea retirados de las pantallas de acceso; los únicos que quedan son posiciones calculadas de MIRROR.
