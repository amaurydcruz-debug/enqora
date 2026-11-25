---
name: enqora-documentos-contables
description: Lectura y cuadratura de documentos contables y tributarios chilenos en el computador del agente - inventario de archivos del caso, XML de facturas y boletas electrónicas (DTE del SII), conciliación bancaria de cartolas contra registros, y cuadratura del IVA del Registro de Compras y Ventas contra el F29. Úsala cuando el caso trae archivos (PDF, Excel, CSV, XML) o pide revisar libros, IVA o movimientos bancarios.
---

# Documentos contables ENQORA

Programas listos (Python 3, sin internet). Ejecútalos con `python <ruta>/scripts/<programa>.py ...`.
Para encontrar la carpeta: `find /mnt/skills -name inventario.py`.

| Programa | Qué hace | Uso |
| --- | --- | --- |
| `inventario.py` | Lista los archivos del directorio: tipo, tamaño, hojas y filas de Excel/CSV, páginas de PDF, tipo de DTE de los XML | `python inventario.py .` |
| `leer_dte.py` | Lee uno o varios XML de DTE y verifica tipo, folio, fecha, RUT (dígito verificador), IVA 19% sobre el neto, total y timbre (TED). Entrega JSON | `python leer_dte.py factura1.xml factura2.xml` |
| `conciliacion.py` | Cruza una cartola bancaria con los registros contables por monto exacto y fecha cercana (± días). Entrega coincidencias y partidas sin cruzar en Excel | `python conciliacion.py cartola.xlsx registros.xlsx --dias 3 --salida conciliacion.xlsx` |
| `cuadratura_iva.py` | Suma el IVA del Registro de Compras y Ventas (CSV o Excel exportado del SII) y lo compara con los códigos del F29 que se indiquen | `python cuadratura_iva.py --ventas ventas.csv --compras compras.csv --f29-debito 538=1250000 --f29-credito 537=830000` |

## Criterios
- Columnas: los programas reconocen nombres habituales («Fecha», «Monto», «Monto IVA», «Monto Neto», «Cargo», «Abono», «Descripción»). Si no encuentran una columna, lo dicen: revisa el archivo y renombra en una copia; nunca modifiques el original.
- Montos chilenos: «1.250.000» y «1250000» se leen igual; las comas decimales se respetan.
- Un descuadre no es un error del cliente hasta explicarlo: puede haber notas de crédito, documentos de otro período o IVA no recuperable.
- Lo que no puedas leer (PDF escaneado sin texto), dilo y pide el archivo en Excel o el XML.
- Nunca verificas firma digital ni consultas al SII: eso lo confirma el Registro de Compras y Ventas oficial.
