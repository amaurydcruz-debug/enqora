import type { AgentKey } from "@/lib/mirror";

// Habilidades del enjambre: cuáles carga cada agente en su computador (además de las de Anthropic para
// Excel, Word y PDF). Las propias se suben desde Mando → Enjambre (lib/habilidades/paquetes.ts).
export const HABILIDADES_POR_AGENTE: Record<AgentKey, string[]> = {
  tributario: ["enqora-metodo-caso", "enqora-casos-tributarios", "enqora-documentos-contables", "enqora-investigacion-normativa", "enqora-entregables"],
  contable: ["enqora-metodo-caso", "enqora-cierre-contable", "enqora-documentos-contables", "enqora-casos-tributarios", "enqora-entregables"],
  legal: ["enqora-metodo-caso", "enqora-laboral-metodo", "enqora-societario", "enqora-insolvencia", "enqora-investigacion-normativa", "enqora-entregables"],
  financiero: ["enqora-metodo-caso", "enqora-finanzas-pyme", "enqora-documentos-contables", "enqora-estrategia", "enqora-insolvencia", "enqora-entregables"],
  investigador: ["enqora-metodo-caso", "enqora-investigacion-normativa", "enqora-entregables"],
  estrategico: ["enqora-metodo-caso", "enqora-estrategia", "enqora-finanzas-pyme", "enqora-casos-tributarios", "enqora-societario", "enqora-insolvencia", "enqora-entregables"],
};

// Habilidades de Anthropic (prearmadas) para producir archivos.
export const HABILIDADES_ANTHROPIC = ["xlsx", "docx", "pdf"] as const;

export const DESCRIPCION_HABILIDAD: Record<string, string> = {
  "enqora-metodo-caso": "Método de caso: inventario, hipótesis, verificación oficial, cálculos, entregables y registro.",
  "enqora-documentos-contables": "Lectura de XML del SII, conciliación bancaria, cuadratura del IVA e inventario de archivos.",
  "enqora-finanzas-pyme": "Flujo de caja con escenarios, evaluación de créditos y punto de equilibrio.",
  "enqora-entregables": "Planillas e informes en borrador con el estilo y las reglas de ENQORA.",
  "enqora-laboral-metodo": "Término de contrato, carta, indemnizaciones, finiquito y obligaciones laborales.",
  "enqora-casos-tributarios": "F29 atrasado o con diferencias, régimen tributario, término de giro, honorarios y actuaciones del SII.",
  "enqora-cierre-contable": "Cierre mensual y anual: balance de comprobación desde el libro diario y lista de control.",
  "enqora-societario": "Constitución, modificación, poderes y disolución de sociedades.",
  "enqora-investigacion-normativa": "Verificación de normas en fuentes oficiales y fichas normativas citables.",
  "enqora-estrategia": "Matriz de decisión ponderada con sensibilidad y hoja de ruta por etapas.",
  "enqora-insolvencia": "Ley 20.720 y Ley 21.563: reorganización y liquidación simplificadas, renegociación de la persona deudora; propuesta para el abogado.",
};
