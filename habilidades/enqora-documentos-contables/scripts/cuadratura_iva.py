"""Cuadratura del IVA: Registro de Compras y Ventas (exportado del SII) contra los montos del F29."""
import argparse
import json

from comun import columna, leer_tabla, monto

ap = argparse.ArgumentParser()
ap.add_argument("--ventas", help="CSV o Excel del registro de ventas")
ap.add_argument("--compras", help="CSV o Excel del registro de compras")
ap.add_argument("--f29-debito", help="código=monto del débito fiscal declarado, p. ej. 538=1250000")
ap.add_argument("--f29-credito", help="código=monto del crédito fiscal declarado, p. ej. 537=830000")
a = ap.parse_args()


def iva_registro(ruta):
    df = leer_tabla(ruta)
    col_iva = columna(df, "monto iva", "iva recuperable", "monto iva recuperable", "iva")
    col_tipo = columna(df, "tipo doc", "tipo documento", "tipo dte", obligatoria=False)
    valores = df[col_iva].map(monto)
    if col_tipo:  # las notas de crédito (61) restan
        valores = [(-v if str(t).strip() in ("61", "112") else v) for v, t in zip(valores, df[col_tipo])]
    return round(sum(valores)), len(df)


def declarado(x):
    if not x:
        return None, None
    cod, _, val = x.partition("=")
    return cod.strip(), monto(val)


res = {}
for lado, ruta, f29 in (("debito", a.ventas, a.f29_debito), ("credito", a.compras, a.f29_credito)):
    if not ruta:
        continue
    total, n = iva_registro(ruta)
    cod, val = declarado(f29)
    res[lado] = {"documentos": n, "iva_registro": total, "codigo_f29": cod, "declarado_f29": val,
                 "diferencia": None if val is None else round(total - val)}
print(json.dumps(res, ensure_ascii=False, indent=1))
