# ENQORA — Hoja de ruta maestra del ecosistema

Visión oficial: **ENQORA, el ecosistema inteligente que ayuda a crear, formalizar, administrar, conectar y hacer
crecer empresas.**

Este documento registra la expansión acordada el 30-10-2026, para implementarla en el futuro. Complementa
`ENQORA-ARQUITECTURA.md`, que sigue siendo la regla del núcleo. Nada de esto se construye como una aplicación
separada: todos los módulos consumen el mismo núcleo.

## 1. Mapa del ecosistema

| Pilar | Qué es | Se apoya en lo ya construido |
| --- | --- | --- |
| **ENQORA Business** | Contabilidad, impuestos, gestión y administración | CONTABILIDAD (M10), cumplimiento (M17), hoja de vida (M18), planes (M8) |
| **ENQORA Conecta** | Red comercial: perfiles, catálogo, cotizaciones, marketplace | Empresas (M2), planes y suscripciones (M8), precios y cotizaciones (M6), pagos Flow (M8) |
| **ENQORA Talento** | Profesionales independientes, vacantes, servicios por proyecto | Identidad y roles (M1-M2), equipo ENQORA (pases de jornada, 0022) |
| **ENQORA Partners** | Red privada de especialistas que atienden los casos que ENQORA detecta | Casos y asignaciones (M4), agentes y rutas (M13), mandatos (M9) |
| **ENQORA Oportunidades** | Radar de fondos, programas y licitaciones según el perfil de cada empresa | Vigilancia normativa y beneficios (M16), catálogo de rubros (M16), datos públicos SII (M18) |
| **ENQORA Academy** | Formación empresarial (cursos y talleres, con credenciales validadas) | Base normativa (M15), aprendizajes de casos (M16) |
| **ENQORA Enterprise** | Nivel superior de capacidades: varias empresas, equipos, expedientes complejos, orquestación de agentes | Categoría «enterprise» del portal (M16), Centro de Mando, auditoría IA (M15) |

Entradas para el cliente, que se mantienen: **Soy emprendedor** (crear mi empresa) · **Tengo una pyme** (administrar
y crecer) · **Tengo un problema** (solución especializada).

## 2. Capacidades transversales nuevas

| Capacidad | Qué resuelve | Punto de partida actual |
| --- | --- | --- |
| ENQORA Trust | Identidad empresarial, verificación documental, reputación y prevención de fraude | RUT validado, hoja de vida (CTE), mandatos verificados |
| ENQORA CRM | Clientes, contactos, oportunidades, presupuestos y seguimiento | Módulo GESTIÓN (pendiente) |
| ENQORA Payments | Pedidos, cobros, conciliación y registro de transacciones | Cobros y Flow (M8), conciliación (M10) |
| ENQORA Intelligence | Indicadores, tendencias, alertas y oportunidades personalizadas | Centro de control, cumplimiento y señales del SII |
| ENQORA Support | Atención, reclamos, incidencias y compromisos | Casos, notificaciones (M9) |
| ENQORA Mi Negocio | Una pantalla con clientes, ingresos, obligaciones, oportunidades y tareas | Centro de control del cliente (`/panel`) |

## 3. Fases

| Fase | Contenido | Criterio de avance |
| --- | --- | --- |
| **0 · Estabilización** (en curso) | Consulta por RUT con datos verificables, conector SII, diagnóstico inicial, clave de servicio, acceso del equipo | Consulta funcional, datos verificables y errores controlados |
| **1 · Conecta MVP** | Perfil comercial público **voluntario**; publicación básica incluida para suscriptores de contabilidad; categorías y buscador; contacto por WhatsApp; solicitudes de cotización; panel de publicaciones; moderación | Empresas publicadas, búsquedas útiles y contactos funcionando |
| **2 · Comercio inteligente** | Catálogos, marketplace, profesionales y proveedores, opiniones de experiencias verificables, destacados identificados como publicidad, Agente Comercial IA, estadísticas | Operaciones comerciales medibles |
| **3 · Inteligencia y crecimiento** | Radar de fondos y subsidios (Sercotec, Corfo, SENCE, Chile Emprende); **Proveedores del Estado** (Mercado Público: licitaciones, Compra Ágil, alertas y requisitos); red de proveedores; compras conjuntas; Academy; Talento; preparación financiera; alianzas B2B | Oportunidades relevantes y seguimiento de resultados |
| **4 · Enterprise** | Varias empresas, equipos y departamentos, red de profesionales coordinada, expedientes complejos, orquestación de agentes, integraciones | Operaciones complejas auditables con aprobación humana |

## 4. Modelo comercial (precios por definir, nunca inventados)

| Producto | Contenido |
| --- | --- |
| Conecta Básico | Publicación incluida en la suscripción de contabilidad, mientras esté activa |
| Conecta Pro | Catálogo ampliado, más imágenes, estadísticas, herramientas comerciales |
| Conecta Marketplace | Venta de productos y gestión de pedidos; disponible también sin contabilidad |
| Conecta Partners | Acceso a oportunidades y a la red profesional |
| Agente Comercial IA | Automatización comercial con límites por plan |
| Campañas destacadas | Publicidad **siempre identificada como tal** |

Los precios se publican con el motor de precios (M6) y se aprueban en el Centro de Mando, como hasta ahora.

## 5. Reglas permanentes del ecosistema

1. Un RUT empresarial es una sola identidad, que puede tener varios usuarios, roles y perfiles.
2. **Los datos tributarios y contables nunca se publican ni se usan para captar clientes sin autorización
   expresa.** El perfil comercial es voluntario y el propietario decide qué aparece.
3. Pagar no compra reputación, certificación ni mejor calificación; solo herramientas o publicidad identificada.
   «Verificado» dice exactamente qué se comprobó.
4. Las opiniones distinguen experiencias verificadas de no verificadas.
5. Cada proveedor responde por sus ofertas, servicios, entregas y contratos. ENQORA facilita el contacto: no es
   vendedor ni garante, y sus términos lo dirán.
6. Los agentes IA no comprometen precios, contratos ni decisiones sin la autorización correspondiente (igual que M13).
7. Las fuentes oficiales registran la fecha de consulta y la vigencia. Las convocatorias se verifican antes de
   mostrarse.
8. Ley 21.719 (datos personales): vigencia prevista desde el 01-12-2026, con una propuesta de postergación en
   trámite. Antes de activar Conecta hay que confirmar su estado y tener consentimientos y finalidades listos
   (revisión legal).

## 6. Cómo se irá integrando sin rehacer nada

Mientras se construyen las fases anteriores, cada entrega deja preparada la siguiente:

- **Suscripciones con beneficios.** Los planes (M8) podrán declarar beneficios incluidos, como
  «publicación Conecta». Un plan activo habilita el beneficio y uno vencido lo pausa.
- **Perfil comercial separado del perfil tributario.** Habrá una tabla propia, `business_profiles`, enlazada a la
  empresa. Nunca se leerá automáticamente desde la contabilidad ni desde la hoja de vida.
- **Oportunidades.** La vigilancia normativa (M16) ya detecta beneficios. El radar sumará Mercado Público y
  relacionará cada oportunidad con el rubro, la actividad y el tamaño, usando los datos públicos del SII (M18).
- **Cotizaciones entre empresas.** Reutilizarán el modelo de cotizaciones (M6) y los pagos (M8).
- **Agente Comercial IA.** Usará el mismo marco de agentes, auditoría y aprobación humana (M13 y M15).
- **Partners y Talento.** Reutilizarán identidad, roles y el acceso controlado del equipo (0022).

Antes de la Fase 1: estudio competitivo de directorios, marketplaces y redes B2B en Chile, para definir la
diferenciación.
