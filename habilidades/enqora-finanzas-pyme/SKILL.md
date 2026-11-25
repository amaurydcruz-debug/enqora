---
name: enqora-finanzas-pyme
description: Proyecciones financieras para pymes chilenas en el computador del agente - flujo de caja mensual con escenarios (base, pesimista, optimista), evaluación de un crédito (cuota francesa, tabla de amortización, costo total y tasa anual equivalente con gastos) y punto de equilibrio. Úsala en casos de financiamiento, capital de trabajo, inversión o cuando el cliente pregunta si su flujo soporta una decisión.
---

# Finanzas pyme ENQORA

Programas en `scripts/` (búscalos con `find /mnt/skills -name flujo_caja.py`). Entregan JSON en pantalla y un Excel con el detalle.

## flujo_caja.py
Entrada: un JSON con los supuestos (todos en pesos chilenos, mensuales):
```json
{"meses": 12, "caja_inicial": 3000000, "ventas_mes": 18000000, "crecimiento_mensual_pct": 1,
 "margen_bruto_pct": 32, "gastos_fijos_mes": 4200000, "cuota_credito_mes": 0,
 "pago_iva_pct_de_ventas": 0, "estacionalidad": {"12": 1.4, "2": 0.8},
 "escenarios": {"pesimista": -15, "optimista": 10}}
```
Uso: `python flujo_caja.py supuestos.json --salida flujo_caja.xlsx`
Entrega por escenario: caja final, mes de menor caja, meses con caja negativa.

## credito.py
Uso: `python credito.py --monto 10000000 --tasa-mensual-pct 1.6 --meses 24 --gastos-iniciales 250000 --seguro-mensual 4500 --salida credito.xlsx`
Entrega: cuota, intereses totales, costo total, tasa anual equivalente considerando gastos y seguros (TIR mensual anualizada), y la tabla de amortización.
La tasa anual equivalente que calcula es una referencia para comparar ofertas; la **CAE oficial** la informa el banco según la normativa de la CMF: pídela y compárala.

## punto_equilibrio.py
Uso: `python punto_equilibrio.py --gastos-fijos 4200000 --margen-pct 32`

## Criterios
- Nunca inventes supuestos: usa los que entrega el caso y declara los que faltan como preguntas. Si propones un supuesto, márcalo como «supuesto por confirmar».
- Presenta siempre al menos dos escenarios y explica qué cambia entre ellos.
- Las proyecciones son escenarios, no recomendaciones de inversión ni promesas.
- Para programas públicos de financiamiento (Corfo, Sercotec, FOGAPE), verifica requisitos y vigencia en sus sitios oficiales antes de mencionarlos.
