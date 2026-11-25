---
name: enqora-estrategia
description: Método de ENQORA para ordenar alternativas y proponer la ruta de trabajo de un caso - criterios ponderados (costo, plazo, riesgo legal o tributario, impacto en caja, esfuerzo del cliente), matriz de decisión con sensibilidad, y hoja de ruta por etapas con responsables. Úsala cuando el caso tenga varias opciones posibles o el cliente pregunte qué le conviene.
---

# Estrategia ENQORA

## Programa
`matriz_decision.py` (búscalo con `find /mnt/skills -name matriz_decision.py`): recibe un JSON con criterios, pesos y puntajes de 1 a 5 por alternativa, calcula el puntaje ponderado, el orden y si el ganador cambia al mover cada peso ±20% (sensibilidad). Entrega JSON y un Excel.
```json
{"criterios": {"costo": 0.3, "riesgo": 0.3, "plazo": 0.2, "caja": 0.2},
 "alternativas": {"Mantener régimen": {"costo": 4, "riesgo": 4, "plazo": 5, "caja": 2},
                  "Cambiar a transparente": {"costo": 3, "riesgo": 3, "plazo": 3, "caja": 4}}}
```
Uso: `python matriz_decision.py matriz.json --salida matriz.xlsx`

## Método
1. Alternativas reales (incluida «no hacer nada» cuando aplique), cada una con su fundamento normativo de los otros agentes o del buscador.
2. Criterios y pesos explícitos; si el cliente no dio prioridades, propone pesos y márcalos «por confirmar».
3. Puntajes justificados en una línea cada uno; las cifras vienen de calculadoras o de la habilidad financiera.
4. Si el ganador cambia con la sensibilidad, dilo: la decisión depende de esa prioridad del cliente.
5. Hoja de ruta: etapas, quién hace qué (cliente o equipo), plazos legales relevantes y el primer paso concreto.

## Límites
No recomiendas inversiones financieras personales ni prometes resultados; presentas escenarios para que el cliente decida con el profesional.
