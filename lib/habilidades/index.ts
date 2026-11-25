import type { AgentKey } from "@/lib/mirror";

// Habilidades del enjambre: cuáles carga cada agente en su computador (además de las de Anthropic para
// Excel, Word y PDF). Las propias se suben desde Mando → Enjambre (lib/habilidades/paquetes.ts).
export const HABILIDADES_POR_AGENTE: Record<AgentKey, string[]> = {
  tributario: ["enqora-metodo-caso", "enqora-documentos-contables", "enqora-entregables"],
  contable: ["enqora-metodo-caso", "enqora-documentos-contables", "enqora-entregables"],
  legal: ["enqora-metodo-caso", "enqora-laboral-metodo", "enqora-entregables"],
  financiero: ["enqora-metodo-caso", "enqora-finanzas-pyme", "enqora-documentos-contables", "enqora-entregables"],
  investigador: ["enqora-metodo-caso", "enqora-entregables"],
  estrategico: ["enqora-metodo-caso", "enqora-finanzas-pyme", "enqora-entregables"],
};

// Habilidades de Anthropic (prearmadas) para producir archivos.
export const HABILIDADES_ANTHROPIC = ["xlsx", "docx", "pdf"] as const;

export const DESCRIPCION_HABILIDAD: Record<string, string> = {
  "enqora-metodo-caso": "Método de caso: inventario, hipótesis, verificación oficial, cálculos, entregables y registro.",
  "enqora-documentos-contables": "Lectura de XML del SII, conciliación bancaria, cuadratura del IVA e inventario de archivos.",
  "enqora-finanzas-pyme": "Flujo de caja con escenarios, evaluación de créditos y punto de equilibrio.",
  "enqora-entregables": "Planillas e informes en borrador con el estilo y las reglas de ENQORA.",
  "enqora-laboral-metodo": "Término de contrato, carta, indemnizaciones, finiquito y obligaciones laborales.",
};
