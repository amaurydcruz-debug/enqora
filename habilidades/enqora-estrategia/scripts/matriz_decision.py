"""Matriz de decisión ponderada con análisis de sensibilidad de pesos."""
import argparse
import json

import pandas as pd

ap = argparse.ArgumentParser()
ap.add_argument("matriz")
ap.add_argument("--salida", default="matriz_decision.xlsx")
a = ap.parse_args()
with open(a.matriz, encoding="utf-8") as f:
    m = json.load(f)

pesos = {k: float(v) for k, v in m["criterios"].items()}
total = sum(pesos.values())
if total <= 0:
    raise SystemExit("Los pesos deben sumar más que 0.")
pesos = {k: v / total for k, v in pesos.items()}
alts = m["alternativas"]
for nombre, p in alts.items():
    for c in pesos:
        v = float(p.get(c, 0))
        if not 1 <= v <= 5:
            raise SystemExit(f"Puntaje fuera de rango (1 a 5) en {nombre}/{c}: {v}")


def puntajes(w):
    return {n: round(sum(w[c] * float(p[c]) for c in w), 3) for n, p in alts.items()}


base = puntajes(pesos)
orden = sorted(base, key=base.get, reverse=True)
ganador = orden[0]
sensibilidad = []
for c in pesos:
    for f in (0.8, 1.2):
        w = dict(pesos)
        w[c] *= f
        s = sum(w.values())
        w = {k: v / s for k, v in w.items()}
        p = puntajes(w)
        g = max(p, key=p.get)
        sensibilidad.append({"criterio": c, "cambio_peso": f"{'+' if f > 1 else '-'}20%", "ganador": g, "cambia": g != ganador})
res = {"pesos_normalizados": {k: round(v, 3) for k, v in pesos.items()}, "puntajes": base, "orden": orden, "ganador": ganador,
       "ganador_estable": not any(x["cambia"] for x in sensibilidad),
       "cambia_si": [f"{x['criterio']} {x['cambio_peso']}" for x in sensibilidad if x["cambia"]], "archivo": a.salida}
with pd.ExcelWriter(a.salida) as w:
    pd.DataFrame(alts).T.assign(puntaje=pd.Series(base)).sort_values("puntaje", ascending=False).to_excel(w, sheet_name="Matriz")
    pd.DataFrame([{"criterio": k, "peso": v} for k, v in res["pesos_normalizados"].items()]).to_excel(w, sheet_name="Pesos", index=False)
    pd.DataFrame(sensibilidad).to_excel(w, sheet_name="Sensibilidad", index=False)
print(json.dumps(res, ensure_ascii=False, indent=1))
