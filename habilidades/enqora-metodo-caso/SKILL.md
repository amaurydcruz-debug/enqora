---
name: enqora-metodo-caso
description: Método de trabajo de los agentes de ENQORA para resolver un caso de una empresa chilena (tributario, contable, legal, laboral, financiero). Úsala siempre al empezar un caso: inventario de antecedentes y archivos, hipótesis, verificación en fuentes oficiales, cálculos con las calculadoras de ENQORA, entregables y registro del resultado para revisión humana.
---

# Método de caso ENQORA

Trabajas como lo haría un profesional senior de ENQORA con un computador propio (Linux, Python, sin internet).
Todo lo que produces es una **propuesta**: una persona del equipo la revisa antes de que llegue al cliente.

## 1. Inventario (siempre primero)
1. Lee los antecedentes del caso (JSON del mensaje): empresa, relato, servicio, documentos, aprendizajes y novedades verificadas.
2. Revisa los archivos del caso en tu directorio de trabajo. Ejecuta:
   `python "$(find /mnt/skills -name inventario.py | head -1)" .` si tienes la habilidad de documentos contables; si no, `ls -la` y abre cada archivo.
3. Anota qué datos tienes y cuáles faltan. Lo que falte se pide al cliente con preguntas concretas, sin tecnicismos.

## 2. Hipótesis y ruta
- Escribe 1 a 3 hipótesis de qué está pasando y qué se debe hacer.
- Para cada una, define qué norma la respalda y qué dato la confirmaría.

## 3. Verificación (sin inventar)
- Normas: usa primero el bloque «BUSCADOR LEGAL» del mensaje (conocimiento verificado de ENQORA). Si necesitas más, usa la búsqueda o la lectura web, solo en sitios oficiales (bcn.cl, sii.cl, dt.gob.cl, previred.com, spensiones.cl, suseso.cl, inapi.cl, chileatiende.gob.cl, diariooficial.interior.gob.cl).
- Cita cuerpo legal, artículo y fecha o vigencia. Si no lo verificaste, certeza «baja».
- Nunca entres ni sugieras entrar a portales con claves (SII, Previred, bancos). ENQORA actúa solo con mandato.

## 4. Cálculos
- Toda cifra legal (IVA, retenciones, multas, intereses, finiquito, impuesto único) sale de las herramientas `calcular_*`. Decláralas en «calculos».
- Para análisis de datos (cuadraturas, conciliaciones, proyecciones) usa Python en tu computador y guarda el script y el resultado.
- Si falta un valor oficial (UF, UTM, tasa diaria del SII), no lo supongas: pídelo o verifícalo en la fuente oficial.

## 5. Entregables
- Si un archivo ayuda al equipo (planilla de cuadratura, flujo de caja, borrador de informe), créalo con la habilidad «enqora-entregables».
- Los archivos que crees quedan en el expediente del caso como **borradores internos**; el equipo decide qué se envía.

## 6. Registro
- Llama una vez a `registrar_resultado` con pasos, hallazgos (con fuentes y cálculos), tareas y preguntas.
- En «resumen» menciona los archivos que generaste y qué contiene cada uno.

## Lista de control antes de registrar
- [ ] Cada hallazgo tiene situación, norma con artículo, certeza y qué falta.
- [ ] Cada cifra tiene su cálculo declarado o su script.
- [ ] No hay precios ni honorarios, ni promesas de resultado.
- [ ] No pides claves ni contraseñas.
- [ ] Distingues lo verificado de lo que es hipótesis.
