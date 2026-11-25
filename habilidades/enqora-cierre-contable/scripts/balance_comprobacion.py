"""Balance de comprobación desde un libro diario: cuadratura de asientos y saldos por cuenta."""
import argparse
import json
import os
import sys

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comun import columna, leer_tabla, monto  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("diario")
ap.add_argument("--salida", default="balance_comprobacion.xlsx")
a = ap.parse_args()

df = leer_tabla(a.diario)
c_cta = columna(df, "cuenta", "codigo cuenta", "cod cuenta")
c_nom = columna(df, "nombre cuenta", "glosa cuenta", "descripcion cuenta", obligatoria=False)
c_asi = columna(df, "asiento", "comprobante", "numero", "n°", obligatoria=False)
c_fec = columna(df, "fecha", obligatoria=False)
d = pd.DataFrame({
    "cuenta": df[c_cta].astype(str).str.strip(),
    "nombre": df[c_nom].fillna("") if c_nom else "",
    "asiento": df[c_asi].astype(str) if c_asi else "",
    "fecha": df[c_fec] if c_fec else "",
    "debe": df[columna(df, "debe", "cargo", "debito")].map(monto).round(0),
    "haber": df[columna(df, "haber", "abono", "credito")].map(monto).round(0),
})

descuadres = []
if c_asi:
    por = d.groupby("asiento")[["debe", "haber"]].sum()
    por = por[(por["debe"] - por["haber"]).abs() > 0.5]
    descuadres = [{"asiento": k, "debe": float(v.debe), "haber": float(v.haber), "diferencia": float(v.debe - v.haber)} for k, v in por.iterrows()]

NATURALEZA = {"1": "deudora", "2": "acreedora", "3": "acreedora", "4": "acreedora", "5": "deudora", "6": "deudora"}
bal = d.groupby("cuenta").agg(nombre=("nombre", "first"), debe=("debe", "sum"), haber=("haber", "sum")).reset_index()
bal["saldo_deudor"] = (bal["debe"] - bal["haber"]).clip(lower=0)
bal["saldo_acreedor"] = (bal["haber"] - bal["debe"]).clip(lower=0)
bal["naturaleza"] = bal["cuenta"].str[:1].map(NATURALEZA).fillna("sin inferir")
bal["saldo_contrario"] = ((bal["naturaleza"] == "deudora") & (bal["saldo_acreedor"] > 0)) | ((bal["naturaleza"] == "acreedora") & (bal["saldo_deudor"] > 0))

tot = {"debe": float(bal["debe"].sum()), "haber": float(bal["haber"].sum())}
res = {"cuadra": abs(tot["debe"] - tot["haber"]) < 0.5, **tot, "asientos_descuadrados": descuadres[:50],
       "cuentas_saldo_contrario": bal.loc[bal["saldo_contrario"], "cuenta"].tolist(), "archivo": a.salida}
with pd.ExcelWriter(a.salida) as w:
    bal.to_excel(w, sheet_name="Balance", index=False)
    pd.DataFrame(descuadres).to_excel(w, sheet_name="Asientos descuadrados", index=False)
print(json.dumps(res, ensure_ascii=False, indent=1))
