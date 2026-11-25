"""Utilidades comunes: lectura de tablas y montos chilenos."""
import re
import sys
import unicodedata

import pandas as pd


def sin_tildes(s):
    return "".join(c for c in unicodedata.normalize("NFD", str(s)) if unicodedata.category(c) != "Mn").lower().strip()


def monto(v):
    """'1.250.000' -> 1250000 ; '1.250,5' -> 1250.5 ; '-3.000' -> -3000 ; vacío -> 0."""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace("$", "").replace(" ", "")
    if not s:
        return 0.0
    neg = s.startswith("-") or (s.startswith("(") and s.endswith(")"))
    s = s.strip("-()")
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    elif re.fullmatch(r"\d{1,3}(\.\d{3})+", s):
        s = s.replace(".", "")
    try:
        n = float(s)
    except ValueError:
        return 0.0
    return -n if neg else n


def leer_tabla(ruta):
    """Lee CSV (coma o punto y coma) o Excel (primera hoja con datos)."""
    r = str(ruta).lower()
    if r.endswith((".xlsx", ".xlsm", ".xls")):
        hojas = pd.read_excel(ruta, sheet_name=None, dtype=str)
        for df in hojas.values():
            if not df.dropna(how="all").empty:
                return df.dropna(how="all")
        return pd.DataFrame()
    for sep in (";", ",", "\t", "|"):
        for enc in ("utf-8-sig", "latin-1"):
            try:
                df = pd.read_csv(ruta, sep=sep, dtype=str, encoding=enc)
            except Exception:
                continue
            if df.shape[1] > 1:
                return df.dropna(how="all")
    sys.exit(f"No pude leer {ruta} como tabla (CSV o Excel).")


def columna(df, *candidatos, obligatoria=True):
    """Busca una columna por nombres habituales (sin tildes ni mayúsculas)."""
    mapa = {sin_tildes(c): c for c in df.columns}
    for cand in candidatos:
        k = sin_tildes(cand)
        if k in mapa:
            return mapa[k]
    for cand in candidatos:
        k = sin_tildes(cand)
        for nombre, original in mapa.items():
            if k in nombre:
                return original
    if obligatoria:
        sys.exit(f"No encontré la columna {candidatos[0]!r}. Columnas disponibles: {list(df.columns)}")
    return None
