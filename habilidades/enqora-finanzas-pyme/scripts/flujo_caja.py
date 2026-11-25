"""Flujo de caja mensual con escenarios para una pyme."""
import argparse
import json

import pandas as pd

ap = argparse.ArgumentParser()
ap.add_argument("supuestos")
ap.add_argument("--salida", default="flujo_caja.xlsx")
a = ap.parse_args()
with open(a.supuestos, encoding="utf-8") as f:
    s = json.load(f)

meses = int(s.get("meses", 12))
estacional = {int(k): float(v) for k, v in (s.get("estacionalidad") or {}).items()}
mes_inicio = int(s.get("mes_inicio", 1))
escenarios = {"base": 0.0, **{k: float(v) for k, v in (s.get("escenarios") or {}).items()}}


def proyectar(ajuste_pct):
    caja = float(s.get("caja_inicial", 0))
    filas = []
    for i in range(meses):
        mes_cal = (mes_inicio - 1 + i) % 12 + 1
        ventas = float(s["ventas_mes"]) * (1 + float(s.get("crecimiento_mensual_pct", 0)) / 100) ** i
        ventas *= estacional.get(mes_cal, 1.0) * (1 + ajuste_pct / 100)
        margen = ventas * float(s["margen_bruto_pct"]) / 100
        iva = ventas * float(s.get("pago_iva_pct_de_ventas", 0)) / 100
        egresos = float(s.get("gastos_fijos_mes", 0)) + float(s.get("cuota_credito_mes", 0)) + iva
        neto = margen - egresos
        caja += neto
        filas.append({"mes": i + 1, "mes_calendario": mes_cal, "ventas": round(ventas), "margen_bruto": round(margen),
                      "egresos": round(egresos), "flujo_neto": round(neto), "caja_final": round(caja)})
    return pd.DataFrame(filas)


resumen = {}
with pd.ExcelWriter(a.salida) as w:
    for nombre, ajuste in escenarios.items():
        df = proyectar(ajuste)
        df.to_excel(w, sheet_name=nombre[:31], index=False)
        peor = df.loc[df["caja_final"].idxmin()]
        resumen[nombre] = {"ajuste_ventas_pct": ajuste, "caja_final": int(df["caja_final"].iloc[-1]),
                           "caja_minima": int(peor["caja_final"]), "mes_caja_minima": int(peor["mes"]),
                           "meses_caja_negativa": int((df["caja_final"] < 0).sum())}
    pd.DataFrame(resumen).T.to_excel(w, sheet_name="Resumen")
print(json.dumps({"archivo": a.salida, "escenarios": resumen}, ensure_ascii=False, indent=1))
