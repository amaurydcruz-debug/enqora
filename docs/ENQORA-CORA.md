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
