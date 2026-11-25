---
name: enqora-insolvencia
description: Ruta de insolvencia para clientes de ENQORA que no pueden pagar sus deudas ni regularizarse - Ley 20.720 modificada por la Ley 21.563 (reorganización simplificada y liquidación voluntaria simplificada para micro y pequeñas empresas, renegociación gratuita de la persona deudora en la Superir). Úsala cuando el caso muestre deudas vencidas, embargos, cobranza judicial, falta de dinero para regularizar o intención de cerrar la empresa. Todo es propuesta para el abogado.
---

# Insolvencia ENQORA

**Regla de oro:** proponer un procedimiento concursal es una decisión legal seria (puede cerrar la empresa y vender sus bienes). Tú preparas el análisis; el abogado del equipo decide y aprueba qué se le dice al cliente. Nunca escribas al cliente que «debe declararse en quiebra».

## 1. Levantar la situación (preguntas si falta)
- Deudas: acreedor, monto (en UF a la fecha), fecha de vencimiento, garantías (prendas, hipotecas, avales de los socios), juicios o embargos.
- Deudor: empresa deudora (persona jurídica, persona natural de primera categoría o que emite boletas de honorarios) o persona deudora.
- Ingresos de los últimos 12 meses (en UF) y número de trabajadores.
- ¿El negocio puede seguir operando si reprograma sus deudas?
- Bienes de la empresa y de los socios comprometidos.

## 2. Alternativas no concursales primero
Convenios con Tesorería o el SII (y condonaciones vigentes: verificar en tgr.cl y sii.cl), repactación con bancos, venta de activos no esenciales. Si alcanzan, no hace falta un procedimiento concursal.

## 3. Rutas concursales (verificar siempre en bcn.cl y superir.gob.cl)
| Ruta | Para quién | Idea central |
| --- | --- | --- |
| Reorganización simplificada | Micro (≤ 2.400 UF de ingresos de 12 meses y 1 a 9 trabajadores) o pequeña empresa (> 2.400 y ≤ 25.000 UF, 10 a 49 trabajadores) | Acuerdo judicial con acreedores para seguir operando; abogado patrocinante y veedor; protección financiera de 40 días, prorrogable dos veces por 30 |
| Liquidación voluntaria simplificada | Micro y pequeñas empresas y personas (Ley 20.720 art. 273 y ss.) | Cierre ordenado entregando los bienes; más ágil que la ordinaria |
| Renegociación de la persona deudora | Personas (también quienes emiten boletas de honorarios) con dos o más obligaciones vencidas por más de 90 días, de obligaciones diversas, por más de 80 UF, sin demanda de liquidación o ejecutiva notificada | Administrativa y gratuita ante la Superir |
| Procedimientos ordinarios | Empresas que no son micro ni pequeñas | Reorganización o liquidación ordinaria |

Programa: `python "$(find /mnt/skills -name evaluar_rutas.py | head -1)" datos.json` entrega, por ruta, «probable», «por verificar» o «no aplica» con los motivos. Formato:
```json
{"tipo": "empresa", "ingresos_uf_12m": 1800, "trabajadores": 4, "sigue_operando": false,
 "deudas": [{"acreedor": "Banco A", "monto_uf": 320, "dias_vencida": 140}],
 "notificada_demanda": null}
```

## 4. Riesgos que siempre se informan al abogado
- Mala fe (ocultar bienes o dar antecedentes falsos) impide la extinción de las deudas.
- Avales y codeudores personales de los socios: el procedimiento de la empresa no los libera automáticamente; revisarlo.
- Trabajadores: remuneraciones, cotizaciones e indemnizaciones tienen preferencia; revisar el término de contratos.
- Deudas tributarias y previsionales: tratamiento especial; verificar.

## 5. Límites de ENQORA
- Lo que el Estado entrega gratis (renegociación de la Superir, nominación de veedor o liquidador) se informa como gratuito; ENQORA cobra solo el trabajo profesional real, con precio aprobado por una persona.
- La liquidación simplificada de una persona se tramita con su propia ClaveÚnica en la Superir: nunca la pidas ni la uses.
- No prometas resultados ni plazos de término.
