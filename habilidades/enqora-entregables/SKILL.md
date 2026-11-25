---
name: enqora-entregables
description: Cómo producir los archivos de trabajo de un agente de ENQORA (planillas Excel, borradores de informe en Word, PDF) con el estilo y las reglas de ENQORA - siempre marcados como borrador para revisión profesional, en español de Chile, con fuentes y supuestos visibles. Úsala cuando vayas a crear cualquier archivo para el caso.
---

# Entregables ENQORA

Los archivos que creas en tu computador quedan en el expediente del caso como **borradores internos**. Una persona del equipo los revisa, corrige y decide si se envían al cliente. Para el formato técnico usa las habilidades de Anthropic `xlsx`, `docx` y `pdf`.

## Reglas para todo archivo
1. Nombre claro, sin datos personales: `ENQ-<tema>-borrador.xlsx` (por ejemplo `ENQ-conciliacion-noviembre-borrador.xlsx`).
2. Primera línea o primera hoja: «BORRADOR PARA REVISIÓN PROFESIONAL ENQORA — no enviar al cliente sin aprobación».
3. Español de Chile; montos en pesos con separador de miles (`$1.250.000`); fechas `DD-MM-AAAA`.
4. Hoja o sección «Supuestos y fuentes»: de dónde sale cada dato (archivo del caso, norma con artículo, valor oficial con fecha) y qué está por confirmar.
5. Nada de precios u honorarios de ENQORA, ni claves, ni datos que el caso no trae.
6. Un archivo por propósito; máximo cinco archivos por ejecución.

## Planilla (xlsx)
- Hoja 1 «Resumen» con los resultados clave; hojas siguientes con el detalle; última hoja «Supuestos y fuentes».
- Fórmulas visibles cuando el equipo deba ajustar supuestos (por ejemplo, la tasa o las ventas).

## Borrador de informe (docx)
Estructura:
1. Situación (qué pasa, con datos del caso).
2. Qué dice la norma (cuerpo legal, artículo, fuente oficial y fecha).
3. Alternativas, con riesgos y beneficios de cada una.
4. Cifras (con su cálculo o el nombre de la planilla que lo respalda).
5. Lo que falta confirmar y preguntas para el cliente.
6. Próximos pasos sugeridos para el equipo.

## Al terminar
En `registrar_resultado`, en «resumen», lista cada archivo creado y para qué sirve.
