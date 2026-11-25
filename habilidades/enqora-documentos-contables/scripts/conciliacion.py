"""Conciliación bancaria: cruza la cartola con los registros por monto exacto y fecha cercana."""
import argparse

import pandas as pd

from comun import columna, leer_tabla, monto

ap = argparse.ArgumentParser()
ap.add_argument("cartola")
ap.add_argument("registros")
ap.add_argument("--dias", type=int, default=3, help="tolerancia de días entre fechas")
ap.add_argument("--salida", default="conciliacion.xlsx")
a = ap.parse_args()


def preparar(df, nombre):
    f = columna(df, "fecha", "fecha movimiento", "fecha contable")
    d = columna(df, "descripcion", "glosa", "detalle", "concepto", obligatoria=False)
    m = columna(df, "monto", "importe", obligatoria=False)
    if m:
        montos = df[m].map(monto)
    else:
        cargo = columna(df, "cargo", "cargos", "debe", "egreso")
        abono = columna(df, "abono", "abonos", "haber", "ingreso")
        montos = df[abono].map(monto) - df[cargo].map(monto)
    out = pd.DataFrame({
        "fecha": pd.to_datetime(df[f], dayfirst=True, errors="coerce"),
        "descripcion": df[d].fillna("") if d else "",
        "monto": montos.round(0),
    })
    out = out[out["monto"] != 0].reset_index(drop=True)
    out["origen"] = nombre
    return out


c = preparar(leer_tabla(a.cartola), "cartola")
r = preparar(leer_tabla(a.registros), "registros")
usados = set()
usados_c = set()
pares = []
for i, mov in c.iterrows():
    candidatos = r[(r["monto"] == mov["monto"]) & (~r.index.isin(usados))]
    if pd.notna(mov["fecha"]):
        candidatos = candidatos[(candidatos["fecha"] - mov["fecha"]).abs().dt.days <= a.dias]
    if len(candidatos):
        j = (candidatos["fecha"] - mov["fecha"]).abs().idxmin() if pd.notna(mov["fecha"]) else candidatos.index[0]
        usados.add(j)
        usados_c.add(i)
        pares.append({"fecha_cartola": mov["fecha"], "fecha_registro": r.at[j, "fecha"], "monto": mov["monto"],
                      "descripcion_cartola": mov["descripcion"], "descripcion_registro": r.at[j, "descripcion"]})
sin_c = c[~c.index.isin(usados_c)]
sin_r = r[~r.index.isin(usados)]
with pd.ExcelWriter(a.salida) as w:
    pd.DataFrame(pares).to_excel(w, sheet_name="Conciliados", index=False)
    sin_c.to_excel(w, sheet_name="Solo en cartola", index=False)
    sin_r.to_excel(w, sheet_name="Solo en registros", index=False)
    pd.DataFrame([
        {"concepto": "Movimientos cartola", "cantidad": len(c), "monto": c["monto"].sum()},
        {"concepto": "Registros contables", "cantidad": len(r), "monto": r["monto"].sum()},
        {"concepto": "Conciliados", "cantidad": len(pares), "monto": sum(p["monto"] for p in pares)},
        {"concepto": "Solo en cartola", "cantidad": len(sin_c), "monto": sin_c["monto"].sum()},
        {"concepto": "Solo en registros", "cantidad": len(sin_r), "monto": sin_r["monto"].sum()},
    ]).to_excel(w, sheet_name="Resumen", index=False)
print(f"Conciliados: {len(pares)} · solo en cartola: {len(sin_c)} · solo en registros: {len(sin_r)} · archivo: {a.salida}")
