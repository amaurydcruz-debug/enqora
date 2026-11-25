"""Inventario de los archivos del caso: tipo, tamaño y contenido básico."""
import json
import os
import re
import sys
import zipfile

ruta = sys.argv[1] if len(sys.argv) > 1 else "."
filas = []
for base, _, archivos in os.walk(ruta):
    if "/." in base or base.startswith("/mnt/skills"):
        continue
    for a in sorted(archivos):
        p = os.path.join(base, a)
        info = {"archivo": os.path.relpath(p, ruta), "kb": round(os.path.getsize(p) / 1024, 1)}
        ext = a.lower().rsplit(".", 1)[-1] if "." in a else ""
        try:
            if ext in ("xlsx", "xlsm", "xls"):
                import pandas as pd
                hojas = pd.read_excel(p, sheet_name=None)
                info["tipo"] = "excel"
                info["hojas"] = {k: int(v.dropna(how="all").shape[0]) for k, v in hojas.items()}
            elif ext in ("csv", "txt"):
                with open(p, "rb") as f:
                    info["tipo"] = ext
                    info["lineas"] = sum(1 for _ in f)
            elif ext == "pdf":
                from pypdf import PdfReader
                r = PdfReader(p)
                texto = (r.pages[0].extract_text() or "") if r.pages else ""
                info["tipo"] = "pdf"
                info["paginas"] = len(r.pages)
                info["con_texto"] = bool(texto.strip())
            elif ext == "xml":
                with open(p, "rb") as f:
                    x = f.read(200_000).decode("latin-1")
                t = re.search(r"<(?:\w+:)?TipoDTE>(\d+)<", x)
                info["tipo"] = "xml_dte" if t else "xml"
                if t:
                    info["tipo_dte"] = int(t.group(1))
                    info["documentos"] = len(re.findall(r"<(?:\w+:)?Documento[\s>]", x))
            elif ext == "docx":
                with zipfile.ZipFile(p) as z:
                    info["tipo"] = "word"
                    info["kb_texto"] = round(len(z.read("word/document.xml")) / 1024, 1)
            elif ext in ("jpg", "jpeg", "png", "webp"):
                info["tipo"] = "imagen"
            else:
                info["tipo"] = ext or "desconocido"
        except Exception as e:  # el inventario nunca se cae por un archivo
            info["error"] = f"no se pudo leer: {type(e).__name__}"
        filas.append(info)
print(json.dumps(filas, ensure_ascii=False, indent=1))
