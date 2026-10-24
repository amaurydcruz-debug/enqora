# ENQORA — Constitución del sistema visual y experiencia de usuario

Regla permanente del proyecto. Todo módulo nuevo la cumple antes de publicarse.

## Identidad visual (estable desde el inicio)

| Token | Color | Uso |
| --- | --- | --- |
| `--night` | `#101B2D` | Fondo principal, paneles |
| `--gold` | `#C6A66B` | Acciones principales y premium |
| `--silver` | `#D9E0EA` | Texto, bordes metálicos |
| `--ivory` | `#F4F0E8` | Títulos y texto destacado |
| `--verified` | `#39796B` | Operaciones verificadas |
| `--risk` | rojo | Solo riesgos reales y errores |

Debe transmitir prestigio, confianza, inteligencia, precisión y seguridad financiera.

## Sistema de diseño

- Tokens en `app/globals.css` (`:root`). Ningún color, sombra o radio fuera de los tokens.
- Componentes reutilizables en `components/`. No duplicar estilos por pantalla ni usar estilos en línea.
- Botones: principal (`btn-gold`), secundario (`btn-ghost`), peligro (`btn-danger`); tamaños normal y `btn-sm`.
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
- Pendiente Etapa 1: iconografía propia, navegación lateral, estados de carga, retirar estilos en línea restantes, regla global de movimiento reducido.
