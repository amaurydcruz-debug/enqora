---
name: enqora-casos-tributarios
description: Rutas de trabajo para los casos tributarios más frecuentes de pymes chilenas en ENQORA - F29 atrasado o con diferencias, rectificatorias, PPM, elección o cambio de régimen (Pro Pyme general, Pro Pyme transparente, semi integrado), inicio y término de giro, boletas de honorarios y retenciones, y notificaciones o citaciones del SII. Úsala cuando el caso trate de impuestos, declaraciones o el SII.
---

# Casos tributarios ENQORA

Regla común: cada afirmación normativa con cuerpo legal y artículo verificado (bloque «BUSCADOR LEGAL», sii.cl o bcn.cl); cada cifra con `calcular_*`. Los valores que cambian (UTM, UF, tasa diaria del art. 53, IPC) no se suponen: se piden o se verifican en la fuente oficial con su fecha.

## F29 atrasado o impago
1. Datos: período, fecha de vencimiento, fecha de presentación o fecha de hoy, impuesto determinado, si se pagó, y si hubo notificación del SII.
2. Multa: `calcular_multa_atraso` (art. 97 N°2 CT) con los meses o fracción de atraso.
3. Reajuste e intereses: art. 53 CT; desde 2025 el interés es diario y variable: usa `calcular_interes_mora` solo con la tasa diaria oficial del período, verificada en sii.cl.
4. Condonación: la política de condonación del SII y sus requisitos cambian; verifica la vigente en sii.cl antes de mencionarla y nunca prometas un porcentaje.
5. Si además falta declarar (no solo pagar), distingue art. 97 N°2 (con impuesto) de art. 97 N°1 (sin impuesto) y explica la diferencia.
6. Tareas: preparar declaración y pago, revisar si hay otros períodos en la misma situación, y calendario para evitar repetición.

## F29 con diferencias (débito o crédito)
1. Pide el Registro de Compras y Ventas del período (exportación del SII) y el F29 presentado.
2. Usa `cuadratura_iva.py` de «enqora-documentos-contables» para cuadrar el IVA del registro con los códigos del F29.
3. Explica cada diferencia: documentos de otro período, notas de crédito, facturas reclamadas, IVA no recuperable o uso común.
4. Si corresponde rectificar, indica qué códigos cambian y el efecto en impuesto, multa e intereses.

## Régimen tributario (elección o cambio)
1. Datos: tipo de sociedad y socios, ingresos de los últimos años, si los socios retiran las utilidades, inversiones previstas y otras rentas de los socios.
2. Compara Pro Pyme general (art. 14 letra D N°3 LIR), Pro Pyme transparente (art. 14 letra D N°8) y semi integrado (art. 14 letra A): requisitos de ingreso, tributación de la empresa y de los socios, y obligaciones contables.
3. Plazos y forma de opción: verifícalos en sii.cl (cambian por año comercial) y dilos con su fuente.
4. Presenta un cuadro comparativo con supuestos explícitos; si faltan datos de los socios, la certeza es «baja».

## Término de giro
Requisitos, plazo del aviso (art. 69 CT), revisión de deudas y documentos pendientes y efectos para los socios. Verifica el trámite vigente en sii.cl.

## Boletas de honorarios
Retención según el año con `calcular_retencion_honorarios`; quién retiene (empresa receptora o el propio emisor) y efecto en la operación renta.

## Notificaciones, citaciones y liquidaciones del SII
Identifica el tipo de actuación y su plazo de respuesta en la propia notificación; no propongas respuesta de fondo sin el documento completo; deriva a abogado si hay reclamación o plazo judicial.
