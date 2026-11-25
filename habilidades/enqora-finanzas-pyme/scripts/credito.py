"""Evaluación de un crédito en cuotas iguales (sistema francés)."""
import argparse
import json

import pandas as pd

ap = argparse.ArgumentParser()
ap.add_argument("--monto", type=float, required=True)
ap.add_argument("--tasa-mensual-pct", type=float, required=True)
ap.add_argument("--meses", type=int, required=True)
ap.add_argument("--gastos-iniciales", type=float, default=0, help="impuesto de timbres, notaría, comisiones")
ap.add_argument("--seguro-mensual", type=float, default=0)
ap.add_argument("--salida", default="credito.xlsx")
a = ap.parse_args()

i = a.tasa_mensual_pct / 100
cuota = a.monto / a.meses if i == 0 else a.monto * i / (1 - (1 + i) ** -a.meses)
saldo = a.monto
tabla = []
for k in range(1, a.meses + 1):
    interes = saldo * i
    amort = cuota - interes
    saldo -= amort
    tabla.append({"cuota": k, "pago": round(cuota), "interes": round(interes), "amortizacion": round(amort),
                  "seguro": round(a.seguro_mensual), "saldo": round(max(saldo, 0))})


def tir_mensual(recibido, pago, n):
    lo, hi = 0.0, 1.0
    for _ in range(200):
        mid = (lo + hi) / 2
        vp = sum(pago / (1 + mid) ** t for t in range(1, n + 1))
        lo, hi = (mid, hi) if vp > recibido else (lo, mid)
    return (lo + hi) / 2


recibido = a.monto - a.gastos_iniciales
t = tir_mensual(recibido, cuota + a.seguro_mensual, a.meses)
res = {
    "cuota_mensual": round(cuota), "pago_mensual_con_seguro": round(cuota + a.seguro_mensual),
    "intereses_totales": round(cuota * a.meses - a.monto), "costo_total_credito": round((cuota + a.seguro_mensual) * a.meses + a.gastos_iniciales - a.monto),
    "tasa_anual_equivalente_pct": round(((1 + t) ** 12 - 1) * 100, 2),
    "nota": "Referencia para comparar ofertas; la CAE oficial la informa el banco según la normativa de la CMF.",
}
with pd.ExcelWriter(a.salida) as w:
    pd.DataFrame([res]).T.rename(columns={0: "valor"}).to_excel(w, sheet_name="Resumen")
    pd.DataFrame(tabla).to_excel(w, sheet_name="Amortización", index=False)
print(json.dumps({"archivo": a.salida, **res}, ensure_ascii=False, indent=1))
