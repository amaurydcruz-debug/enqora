"""Orientación de rutas de insolvencia (Ley 20.720 / Ley 21.563) para el abogado. No es una decisión."""
import json
import sys

if len(sys.argv) < 2:
    sys.exit("Uso: python evaluar_rutas.py datos.json")
with open(sys.argv[1], encoding="utf-8") as f:
    e = json.load(f)


def tamano(ingresos, trabajadores):
    if ingresos is None:
        return "por_verificar"
    por_ing = "micro" if ingresos <= 2400 else "pequena" if ingresos <= 25000 else "mayor"
    if trabajadores is None:
        return "mayor" if por_ing == "mayor" else "por_verificar"
    por_trab = "micro" if trabajadores <= 9 else "pequena" if trabajadores <= 49 else "mayor"
    return por_ing if por_ing == por_trab else "por_verificar"


rutas = []
deudas = e.get("deudas") or []
if e.get("tipo") == "empresa":
    t = tamano(e.get("ingresos_uf_12m"), e.get("trabajadores"))
    mipe = t in ("micro", "pequena")
    opera = e.get("sigue_operando")
    rutas.append({"ruta": "Reorganización simplificada",
                  "estado": ("no_aplica" if t == "mayor" else "por_verificar") if not mipe else ("no_aplica" if opera is False else "probable" if opera else "por_verificar"),
                  "tamano": t})
    rutas.append({"ruta": "Liquidación voluntaria simplificada",
                  "estado": ("no_aplica" if t == "mayor" else "por_verificar") if not mipe else ("probable" if opera is False else "por_verificar"),
                  "tamano": t})
    if t == "mayor":
        rutas.append({"ruta": "Reorganización o liquidación ordinaria", "estado": "por_verificar", "tamano": t})
else:
    venc = [d for d in deudas if d.get("dias_vencida", 0) > 90]
    acre = {str(d.get("acreedor", "")).strip().lower() for d in venc}
    total = sum(float(d.get("monto_uf", 0)) for d in venc)
    cumple = len(venc) >= 2 and len(acre) >= 2 and total > 80
    dem = e.get("notificada_demanda")
    rutas.append({"ruta": "Renegociación de la persona deudora (Superir, gratuita)",
                  "estado": ("no_aplica" if deudas else "por_verificar") if not cumple else ("no_aplica" if dem else "probable" if dem is False else "por_verificar"),
                  "obligaciones_vencidas_90d": len(venc), "acreedores_distintos": len(acre), "total_uf": round(total, 1)})
    rutas.append({"ruta": "Liquidación voluntaria simplificada (persona)", "estado": "por_verificar"})
print(json.dumps({"rutas": rutas, "nota": "Orientación para el abogado de ENQORA; verificar requisitos vigentes en bcn.cl y superir.gob.cl."}, ensure_ascii=False, indent=1))
