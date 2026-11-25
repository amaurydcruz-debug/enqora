"""Lee XML de DTE del SII (factura, boleta, notas) y verifica lo que se puede con el propio documento.
Mismo criterio que el lector de ENQORA (lib/dte.ts). No verifica firma ni consulta al SII."""
import json
import re
import sys

TIPOS = {33: "Factura electrónica", 34: "Factura no afecta o exenta electrónica", 39: "Boleta electrónica",
         41: "Boleta exenta electrónica", 43: "Liquidación factura electrónica", 46: "Factura de compra electrónica",
         52: "Guía de despacho electrónica", 56: "Nota de débito electrónica", 61: "Nota de crédito electrónica",
         110: "Factura de exportación electrónica", 111: "Nota de débito de exportación electrónica",
         112: "Nota de crédito de exportación electrónica"}


def rut_valido(rut):
    r = re.sub(r"[^0-9kK]", "", rut or "").upper()
    if len(r) < 2 or not r[:-1].isdigit():
        return False
    cuerpo, dv = r[:-1], r[-1]
    s, m = 0, 2
    for c in reversed(cuerpo):
        s += int(c) * m
        m = 2 if m == 7 else m + 1
    res = 11 - s % 11
    esperado = "0" if res == 11 else "K" if res == 10 else str(res)
    return dv == esperado


def leer(texto):
    if re.search(r"<!DOCTYPE|<!ENTITY", texto, re.I):
        return {"error": "El XML trae declaraciones no permitidas."}
    x = re.sub(r"<(/?)[A-Za-z_][\w.-]*:", r"<\1", texto)
    docs = re.findall(r"<Documento(?:\s[^>]*)?>([\s\S]*?)</Documento>", x)
    if not docs:
        return {"error": "No hay un DTE en el archivo."}
    d = docs[0]

    def t(tag, src=d):
        m = re.search(rf"<{tag}(?:\s[^>]*)?>([\s\S]*?)</{tag}>", src)
        return m.group(1).strip().replace("&amp;", "&") if m else None

    def n(tag, src=d):
        v = t(tag, src)
        try:
            return float(v) if v not in (None, "") else None
        except ValueError:
            return None

    tot = t("Totales") or ""
    r = {
        "tipo": int(n("TipoDTE") or 0), "folio": int(n("Folio") or 0), "fecha": t("FchEmis"),
        "rut_emisor": t("RUTEmisor"), "emisor": t("RznSoc") or t("RznSocEmisor"),
        "rut_receptor": t("RUTRecep"), "receptor": t("RznSocRecep"),
        "neto": n("MntNeto", tot), "exento": n("MntExe", tot), "tasa_iva": n("TasaIVA", tot), "iva": n("IVA", tot),
        "total": n("MntTotal", tot), "documentos_en_archivo": len(docs), "timbre": bool(re.search(r"<TED[\s>]", x)),
    }
    r["tipo_nombre"] = TIPOS.get(r["tipo"], f"Tipo {r['tipo']}")
    adicionales = sum(float(m) for m in re.findall(r"<ImptoReten>[\s\S]*?<MontoImp>([\d.]+)</MontoImp>", tot))
    rev = []
    rev.append(("tipo", r["tipo"] in TIPOS))
    rev.append(("folio", r["folio"] > 0))
    rev.append(("fecha", bool(r["fecha"] and re.fullmatch(r"\d{4}-\d{2}-\d{2}", r["fecha"]))))
    rev.append(("rut_emisor", rut_valido(r["rut_emisor"])))
    if r["rut_receptor"]:
        rev.append(("rut_receptor", rut_valido(r["rut_receptor"])))
    if r["neto"] is not None and r["iva"] is not None and r["tasa_iva"]:
        rev.append(("iva_cuadra", abs(round(r["neto"] * r["tasa_iva"] / 100) - r["iva"]) <= 1))
    if r["total"] is not None and (r["neto"] is not None or r["exento"] is not None):
        suma = (r["neto"] or 0) + (r["exento"] or 0) + (r["iva"] or 0) + adicionales
        rev.append(("total_cuadra", abs(suma - r["total"]) <= 1))
    rev.append(("timbre", r["timbre"]))
    r["verificaciones"] = {k: v for k, v in rev}
    r["observaciones"] = [k for k, v in rev if not v]
    return r


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("Uso: python leer_dte.py archivo.xml [otro.xml ...]")
    salida = []
    for ruta in sys.argv[1:]:
        with open(ruta, "rb") as f:
            crudo = f.read()
        cab = crudo[:200].decode("latin-1")
        enc = "latin-1" if re.search(r"encoding=[\"'](iso-8859-1|latin1|windows-1252)", cab, re.I) else "utf-8"
        salida.append({"archivo": ruta, **leer(crudo.decode(enc, errors="replace"))})
    print(json.dumps(salida, ensure_ascii=False, indent=1))
