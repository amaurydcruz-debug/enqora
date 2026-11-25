---
name: enqora-cierre-contable
description: Cierre contable mensual y anual de pymes chilenas en ENQORA - revisión del libro diario (cuadra debe y haber), balance de comprobación por cuenta, cuentas con saldo contrario a su naturaleza, gastos sin respaldo, y lista de control del cierre. Úsala cuando el caso trate de contabilidad, libros, balances o cierre de mes o año.
---

# Cierre contable ENQORA

## Programas (`scripts/`, búscalos con `find /mnt/skills -name balance_comprobacion.py`)
| Programa | Qué hace | Uso |
| --- | --- | --- |
| `balance_comprobacion.py` | Desde un libro diario (CSV o Excel con fecha, cuenta, debe, haber) verifica que cada asiento y el total cuadren y arma el balance de comprobación por cuenta, marcando saldos contrarios a la naturaleza de la cuenta | `python balance_comprobacion.py diario.xlsx --salida balance.xlsx` |

La naturaleza de la cuenta se infiere del código del plan de cuentas cuando empieza con 1 (activo), 2 (pasivo), 3 (patrimonio), 4 (ingresos) o 5-6 (gastos y costos). Si el plan usa otra numeración, dilo y no concluyas sobre saldos contrarios.

## Lista de control del cierre mensual
1. Ventas y compras del mes registradas y cuadradas con el Registro de Compras y Ventas.
2. Conciliación bancaria (habilidad «enqora-documentos-contables»).
3. Remuneraciones y leyes sociales del mes contabilizadas.
4. Provisiones (vacaciones, honorarios por pagar) y depreciación cuando corresponda.
5. Gastos sin respaldo o sin uso comercial identificados (pueden no ser aceptados tributariamente: art. 31 LIR).
6. F29 del mes coherente con la contabilidad.

## Criterios
- Un descuadre se informa con el asiento exacto (fecha y número) y su diferencia.
- No corrijas la contabilidad: propone los asientos de ajuste para que el contador los revise.
