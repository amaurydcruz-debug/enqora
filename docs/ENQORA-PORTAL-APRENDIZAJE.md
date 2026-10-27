# ENQORA · Portal por perfil, aprendizaje de casos y vigilancia normativa (M16)

Se agregó sobre lo ya construido; no reemplaza módulos existentes.

## 1. Portal en la página principal («02 · Tu camino»)

Cuatro entradas desplegables (`app/portal.tsx`):

| Entrada | Qué muestra | A dónde lleva |
|---|---|---|
| Tengo una idea | Etapas 01–05 del ciclo de vida y, por tipo de negocio, los trámites, instituciones, riesgos y fondos para emprender | `/comenzar` con la categoría del rubro |
| Tengo una pyme o mini empresa | Operación, crecimiento y regularización por tipo de negocio, beneficios tributarios y fondos | Igual |
| ENQORA Enterprise | Capacidades integrales | Nueva categoría `enterprise` (servicio general) |
| Tengo un problema | Seis puertas: tributario, legal, permisos, trabajadores, finanzas, «no sé qué necesito» | Categorías existentes |

Catálogos: `lib/rubros.ts` (ciclo de vida de 8 etapas, 8 tipos de negocio alineados con la pregunta «actividad»
del onboarding más turismo, requisitos por etapa e institución), `lib/institutions.ts` (instituciones con su dominio
oficial) y `lib/benefits.ts` (beneficios verificados el 27-10-2026: Capital Semilla, Crece, Semilla Inicia, Emprendamos,
franquicia SENCE, tasa Pro Pyme 12,5%, Registro de Proveedores del Estado). El diagnóstico confirma qué aplica a cada
caso; nada se presenta como garantizado.

## 2. Cada caso resuelto mejora al siguiente

- En el expediente de un caso en verificación o cerrado, el equipo registra el **aprendizaje**: problema, ruta seguida,
  resultado, qué funcionó, qué mejorar y beneficios aplicados. La base de datos rechaza el texto si incluye el nombre o
  el RUT de la empresa.
- La supervisión lo aprueba (otra persona distinta de quien lo escribió) en **Centro de Mando → Aprendizajes y rutas**,
  donde también se ven las métricas por servicio: casos abiertos, resueltos, días promedio y aprendizajes.
- Los agentes reciben en su contexto los 6 aprendizajes aprobados más recientes del mismo servicio (primero los del
  mismo rubro) y deben repetir lo que funcionó y evitar lo que falló.

## 3. Vigilancia normativa y beneficios

- Un agente revisa cada lunes (vercel.json → `/api/cron/vigilancia`) fuentes oficiales: tributario, laboral, beneficios
  y fondos, empresas/marcas/datos, permisos y municipal (dos grupos por semana, rotando). También se ejecuta a mano en
  **Centro de Mando → Vigilancia normativa**.
- Lo encontrado queda «por verificar». La supervisión revisa la fuente, define servicios y rubros, y decide si los
  clientes la ven. Al verificar una novedad visible con rubros, se avisa a las empresas de esos rubros.
- Las novedades verificadas llegan a los agentes en cada caso del servicio. Si una cambia la base normativa, se
  actualiza `lib/knowledge.ts` y se marca «aplicada».
- En el Centro de control el cliente ve «Novedades y beneficios para tu empresa» según su rubro.

## Puesta en marcha

1. Supabase: ejecutar `0017_aprendizaje_vigilancia.sql` y su prueba.
2. La vigilancia usa `ANTHROPIC_API_KEY`, `CRON_SECRET` y `ENQORA_SERVICE_TOKEN` (ya configuradas para M11/M13).
3. Corrección incluida: 0015 había quitado a la tarea diaria el permiso para ejecutarse sin sesión; 0017 lo restituye.
