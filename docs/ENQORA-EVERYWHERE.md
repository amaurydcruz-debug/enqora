# ENQORA Everywhere: ENQORA instalable

La misma ENQORA, con su diseño, sus módulos y su seguridad, instalable en teléfonos, tablets y computadores como una
aplicación web progresiva (PWA). No es otra aplicación: es el mismo sitio, con un ícono propio y una ventana sin la barra
del navegador.

## 1. Diagnóstico inicial (01-11-2026)

| Tema | Estado previo | Decisión |
| --- | --- | --- |
| Next.js | 15.5, App Router, React 19, 4 dependencias | Sin dependencias nuevas |
| Manifest | `app/manifest.ts` con un solo ícono de 512 px | Se completa: 192, 512, maskable, atajos, `id` y `scope` |
| Logotipo | Ícono Q-reloj oficial (`public/brand/enqora-icon-512.png`), ícono de Apple 180 px y logo horizontal | Se reutiliza; solo se generan el tamaño 192 y la versión maskable |
| Service worker | No existía | Nuevo, servido por `app/sw.js/route.ts` |
| iOS | Sin metadatos de pantalla completa | `appleWebApp` y `viewport-fit=cover` |
| Responsive | Barra inferior móvil con áreas seguras y menú lateral en escritorio | Se conserva; se agrega el margen lateral de las áreas seguras para teléfonos con muesca en horizontal |
| Sesión | Supabase Auth con cookies seguras; middleware protege las rutas | Sin cambios; solo se excluye `/sw.js` y se publica `/sin-conexion` |

## 2. Qué se implementó

- **Manifest** (`app/manifest.ts`): nombre y nombre corto «ENQORA», pantalla independiente (standalone), inicio en `/panel`, colores azul noche (`#050914` de fondo y `#101B2D` de tema), íconos 192/512/maskable y atajos a «Centro de control» y «Consultar un RUT».
- **Íconos** (`public/brand/`): `enqora-icon-192.png` (el ícono oficial reducido) y `enqora-maskable-512.png` (el ícono oficial al 80% sobre `#101B2D`, para que Android no recorte la Q).
- **iPhone y iPad**: metadatos `appleWebApp` (título ENQORA, barra de estado oscura) e ícono de Apple oficial.
- **Service worker** (`/sw.js`):
  - Guarda solo archivos estáticos públicos: código y estilos con nombre versionado (`/_next/static`), imágenes de marca y la página «Sin conexión».
  - **Nunca guarda** páginas, datos, formularios, respuestas de Supabase, del SII, pagos ni documentos. Las páginas siempre vienen de la red con la sesión vigente, así que no se muestra información desactualizada como si fuera actual.
  - Las peticiones a otros dominios (Supabase, SII, Flow) no pasan por él.
  - Su versión es la del despliegue de Vercel: cada despliegue lo cambia, y al activarse la versión nueva se borran las cachés anteriores.
- **Actualizaciones**: cuando hay una versión nueva aparece el aviso «Nueva versión de ENQORA disponible · Actualizar / Más tarde». La versión antigua nunca bloquea: al volver a abrir la app se revisa de nuevo.
- **Sin conexión** (`/sin-conexion`): página con la identidad ENQORA, sin datos, con el botón «Reintentar». No se guardan ni se envían operaciones sin conexión.
- **Sugerencia de instalación** (`components/pwa.tsx`):
  - Aparece 15 segundos después de entrar, solo si el navegador permite instalar (Chrome, Edge, Android) o en Safari de iPhone/iPad (con instrucciones).
  - No aparece si ENQORA ya está instalada. Si se descarta, no vuelve durante 30 días.
  - Lo único que se guarda en el navegador es la fecha del descarte.

## 3. Instalar ENQORA

**Android (Chrome)**: abre ENQORA → toca «Instalar» en el aviso de ENQORA, o menú ⋮ → «Instalar aplicación» / «Agregar a pantalla principal».

**iPhone / iPad (Safari)**: abre ENQORA en Safari → botón Compartir (cuadrado con flecha) → «Agregar a pantalla de inicio» → «Agregar».
La aplicación instalada no comparte la sesión con Safari (lo decide Apple): inicia sesión una vez dentro de la app.

**Windows / macOS (Chrome o Edge)**: ícono de instalar en la barra de direcciones, o menú → «Instalar ENQORA».
En Safari de macOS (versión 17 o superior): Archivo → «Agregar al Dock». Firefox de escritorio no permite instalar aplicaciones web.

## 4. Pruebas

| Prueba | Cómo |
| --- | --- |
| Build de producción | Vercel (despliegue del PR) |
| Manifest e instalabilidad | Chrome → DevTools → Application → Manifest (sin errores; íconos visibles) |
| Service worker | DevTools → Application → Service workers: «activated»; Cache storage `enqora-static-*` solo con `/_next/static`, `/brand` y `/sin-conexion` |
| Sin conexión | DevTools → Network → Offline → recargar: aparece «Sin conexión» |
| Actualización | Desplegar un cambio → volver a la app: aviso «Nueva versión» → Actualizar |
| Sesión | Iniciar y cerrar sesión dentro de la app instalada; rutas protegidas redirigen a ingresar |
| Dispositivos físicos | Android, iPhone, iPad, Windows y macOS: deben probarse en equipos reales (lista de arriba) |

## 5. Notificaciones (preparadas, no activadas)

No se envía ninguna notificación todavía. Para activarlas se necesita:

1. **Claves VAPID**: la pública como `NEXT_PUBLIC_VAPID_PUBLIC_KEY` y la privada como `VAPID_PRIVATE_KEY`, solo en Vercel.
2. **Tabla `push_subscriptions`** (migración nueva, con RLS):
   - qué guarda: usuario, endpoint, claves, dispositivo y fecha;
   - los temas que la persona aceptó;
   - el consentimiento con su fecha.
3. **Consentimiento explícito por tema**, que se pide desde Seguridad o Notificaciones y nunca al entrar. Temas previstos:
   - vencimientos tributarios (F29, F22, declaraciones juradas);
   - obligaciones laborales (cotizaciones);
   - avances de expedientes;
   - documentos pendientes;
   - oportunidades de ENQORA Conecta: comercial, requiere su propio consentimiento y está apagado por defecto.
4. **Envío desde el servidor**:
   - con las tareas programadas que ya existen (cumplimiento y notificaciones M9);
   - solo con hechos reales de la cuenta, nunca avisos ficticios.
5. **Ley 21.719**: revisión legal de las finalidades antes de activar.
6. **iPhone**: las notificaciones solo funcionan con ENQORA instalada en la pantalla de inicio (iOS 16.4 o superior).

En el service worker se agregará el manejo de `push` y `notificationclick` cuando exista esta infraestructura.

## 6. Limitaciones

- Sin conexión, ENQORA no muestra datos ni permite operar, a propósito.
- En iPhone la sesión de la app instalada es independiente de la de Safari.
- Firefox de escritorio no instala aplicaciones web.
- La instalación en dispositivos físicos no fue probada por Claude: debe verificarse con la lista de la sección 4.
