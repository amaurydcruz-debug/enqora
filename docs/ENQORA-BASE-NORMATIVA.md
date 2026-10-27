# ENQORA · Base normativa de los agentes (M15)

Verificada el **27 de octubre de 2026** en fuentes oficiales. El contenido vive en `lib/knowledge.ts`
(reglas, casos de uso y capacidades por agente) y `lib/tax-calc.ts` (calculadoras).

## Reglas verificadas

| Tema | Regla clave | Fuente oficial |
|---|---|---|
| Multa por atraso | Art. 97 N°2 CT: 10% hasta 5 meses; +2% por mes o fracción desde el 6°; tope 30%. Sin impuesto: 1 UTM a 1 UTA | [SII · preguntas frecuentes](https://www.sii.cl/preguntas_frecuentes/renta/001_002_3095.htm) |
| Interés por mora | Desde 01-01-2025 (Ley 21.713): interés diario = (tasa corriente CMF + 3,5) / 360, fijado por el SII cada semestre. **Ya no es 1,5% mensual** | [SII · Circular 1/2025](https://www.sii.cl/normativa_legislacion/circulares/2025/circu1.pdf) |
| Ley de cumplimiento | Ley 21.713 (24-10-2024): reporte bancario de +50 abonos/mes, grupos empresariales, NGA, notificación por correo, IVA a toda importación desde 25-10-2025 | [BCN · Ley 21.713](https://www.bcn.cl/leychile/navegar?idNorma=1207746) |
| Inicio de actividades | Art. 68 CT: dentro de los dos meses siguientes al inicio | [Código Tributario](https://www.sii.cl/normativa_legislacion/codigo_tributario.pdf) |
| Término de giro | Art. 69 CT: dentro de dos meses; F2121; el SII resuelve en hasta 6 meses | [SII Educa](https://www.sii.cl/siieduca/aprende-con-nosotros/termino-de-giro-que-es.html) |
| Revisión del SII | Art. 200 CT: 3 años; 6 si no hubo declaración o fue maliciosamente falsa | Código Tributario |
| F29 | Día 12; hasta el 20 para facturadores electrónicos y emisores de BHE que declaran en internet | [SII](https://www.sii.cl/preguntas_frecuentes/impuestos_mensuales/001_130_4485.htm) |
| IVA | 19% (art. 14 DL 825); crédito de documentos atrasados dentro de 2 períodos (art. 24) | [SII · oficio art. 24](https://www.sii.cl/pagina/jurisprudencia/adminis/2005/ventas/ja913.htm) |
| IVA servicios | Desde 01-01-2023 (Ley 21.420); exención sociedades de profesionales con requisitos | [SII · Circular 50/2022](https://www.sii.cl/normativa_legislacion/circulares/2022/circu50.pdf) |
| Pro Pyme | Ingresos < 75.000 UF, capital < 85.000 UF; 14 D N°3: 12,5% en 2025-2027 y 15% en 2028 **si cumple la cotización de la Ley 21.735**; PPM a la mitad. N°8 exento de IDPC | [SII · Circular 53/2025](https://www.sii.cl/normativa_legislacion/circulares/2025/circu53.pdf) |
| Honorarios | Retención 14,5% (2025), 15,25% (2026), 16% (2027), 17% (2028) | [SII · noticia 26-12-2025](https://www.sii.cl/noticias/2025/261225noti01smn.htm) |
| Empresa en un día | Ley 20.659: constitución electrónica; cada socio firma con sus credenciales | [BCN Ley Fácil](https://www.bcn.cl/portal/leyfacil/recurso/procedimiento-simple-para-crear-empresas) |
| Marcas | Ley 19.039 (DFL 4/2022); 10 años renovables; ruta INAPI | [ChileAtiende](https://www.chileatiende.gob.cl/fichas/1633) · [BCN](https://www.bcn.cl/leychile/navegar?i=1179684) |
| Jornada | Ley 21.561: 44 h (2024), 42 h desde 26-04-2026, 40 h desde 26-04-2028 | Dirección del Trabajo |
| Ley Karin | Ley 21.643 desde 01-08-2024: protocolo, procedimiento y canales de denuncia | Dirección del Trabajo |
| Datos personales | Ley 21.719 vigente desde 01-12-2026 | [BCN · Ley 21.719](https://www.bcn.cl/leychile/navegar?idNorma=1209272) |

## Casos de uso que dominan los agentes

F29 atrasados · ventas sin inicio de actividades · elección de régimen · boletas de honorarios · IVA en servicios ·
término de giro · IVA que no cuadra con el RCV · abonos sin respaldo · constitución de SpA · registro de marca ·
jornada de 42 horas y Ley Karin · adecuación a la Ley 21.719.

| Agente | Domina |
|---|---|
| Tributario | IVA, F29, PPM, retenciones, regímenes, multas e intereses, inicio y término |
| Contable | RCV, cartola, cuadratura y conciliación, documentos atrasados |
| Legal | Sociedades, marcas, jornada, Ley Karin, datos personales |
| Financiero | Costo de regularizar y escenarios con supuestos explícitos |
| Investigador | Verificación de vigencia en fuentes oficiales y jerarquía normativa |
| Estratégico | Ruta por etapas e impacto |

## Bibliografía de referencia para el equipo profesional

Los agentes citan solo fuentes oficiales verificables. Estos libros orientan al equipo humano (verificar la edición vigente):

- Aste Mejías, Christian. *Curso sobre Derecho y Código Tributario*. Legal Publishing.
- Matus Fuentes, Marcelo. *Curso de Derecho Tributario chileno. Parte general y especial*. Thomson Reuters, 2021.
- Zavala Ortiz, José Luis. *Manual de Derecho Tributario*. Editorial Puntolex.
- Figueroa V., Patricio. *Manual de Derecho Tributario*. Editorial Jurídica de Chile, 2ª ed., 2017.
- Thayer Arteaga, William y Novoa Fuenzalida, Patricio. *Manual de Derecho del Trabajo*. Editorial Jurídica de Chile.
- IFRS Foundation. *NIIF para las PYMES*.

## Mantención

- Cada semestre (junio y diciembre): revisar la tasa diaria del art. 53 publicada por el SII (se entrega como dato).
- Cada enero: tasa de retención de honorarios del año y calendario tributario.
- Ante una ley nueva: actualizar `RULES`, `PLAYBOOKS`, `KNOWLEDGE_VERSION` y este documento; repetir los casos controlados.
- Nunca copiar textos de libros o artículos protegidos en la base: solo reglas resumidas con su fuente oficial.
