"""Punto de equilibrio mensual: ventas necesarias para cubrir los gastos fijos con el margen bruto dado."""
import argparse
import json

ap = argparse.ArgumentParser()
ap.add_argument("--gastos-fijos", type=float, required=True)
ap.add_argument("--margen-pct", type=float, required=True)
ap.add_argument("--ventas-actuales", type=float, default=0)
a = ap.parse_args()
if a.margen_pct <= 0:
    raise SystemExit("El margen debe ser mayor que 0.")
pe = a.gastos_fijos / (a.margen_pct / 100)
r = {"ventas_equilibrio_mes": round(pe)}
if a.ventas_actuales:
    r["margen_de_seguridad_pct"] = round((a.ventas_actuales - pe) / a.ventas_actuales * 100, 1)
print(json.dumps(r, ensure_ascii=False))
