// ENQORA MIRROR: catálogo de agentes y etapas, y cálculo del estado visible.
// Todo se deriva de datos reales (pasos registrados y estado del caso).

export const AGENTS = {
  tributario: { name: "Agente Tributario", short: "Tributario" },
  contable: { name: "Agente Contable", short: "Contable" },
  legal: { name: "Agente Legal", short: "Legal" },
  financiero: { name: "Agente Financiero", short: "Financiero" },
  investigador: { name: "Agente Investigador", short: "Investigador" },
  estrategico: { name: "Agente Estratégico", short: "Estratégico" },
} as const;
export type AgentKey = keyof typeof AGENTS;
export const AGENT_KEYS = Object.keys(AGENTS) as AgentKey[];

export const STAGES = [
  { key: "recibiendo", label: "Recibiendo antecedentes", message: "Estamos recibiendo los antecedentes de tu empresa." },
  { key: "organizando", label: "Organizando documentos", message: "Estamos ordenando y revisando los documentos de tu caso." },
  { key: "normativa", label: "Investigando normativa", message: "Estamos contrastando tu situación con la normativa aplicable." },
  { key: "cruce", label: "Cruzando información", message: "Estamos cruzando la información para identificar obligaciones pendientes." },
  { key: "alternativas", label: "Evaluando alternativas", message: "Estamos evaluando alternativas legales para proteger tus intereses." },
  { key: "escenarios", label: "Calculando escenarios", message: "Estamos estimando costos y efectos de cada alternativa." },
  { key: "diagnostico", label: "Preparando diagnóstico", message: "Estamos preparando un diagnóstico con los próximos pasos." },
  { key: "autorizacion", label: "Esperando autorización profesional", message: "Un profesional autorizado está revisando el resultado antes de entregártelo." },
  { key: "disponible", label: "Diagnóstico disponible", message: "Tu diagnóstico está listo." },
] as const;
export type StageKey = (typeof STAGES)[number]["key"];
export const stageIndex = (k: string) => STAGES.findIndex((s) => s.key === k);

export const STEP_STATUSES = { trabajando: "Trabajando", completado: "Completado", revision: "Requiere revisión humana" } as const;

export type MirrorStep = {
  id: string;
  agent: AgentKey;
  stage: StageKey;
  title: string;
  detail: string | null;
  status: keyof typeof STEP_STATUSES;
  progress: number | null;
  visibility: string;
  created_at: string;
  updated_at: string;
};

export type AgentState = "inactivo" | "trabajando" | "completado" | "revision";
export type Phase = "espera" | "trabajando" | "revision" | "listo" | "cerrado";

// Etapa mínima que se deduce del estado real del caso.
const STAGE_FROM_CASE: Record<string, StageKey> = {
  recibido: "recibiendo",
  esperando_cliente: "recibiendo",
  en_investigacion: "normativa",
  devuelto: "alternativas",
  diagnostico: "diagnostico",
  revision_profesional: "autorizacion",
  autorizacion_cliente: "disponible",
  en_ejecucion: "disponible",
  verificacion: "disponible",
  cerrado: "disponible",
};

export function mirrorState(steps: MirrorStep[], caseStatus: string) {
  const agents = Object.fromEntries(AGENT_KEYS.map((k) => [k, "inactivo" as AgentState])) as Record<AgentKey, AgentState>;
  const lastByAgent = new Map<AgentKey, MirrorStep>();
  for (const s of steps) lastByAgent.set(s.agent, s); // pasos vienen en orden cronológico
  for (const [k, s] of lastByAgent) agents[k] = s.status === "trabajando" ? "trabajando" : s.status;

  const fromSteps = steps.reduce((m, s) => Math.max(m, stageIndex(s.stage)), -1);
  const fromCase = stageIndex(STAGE_FROM_CASE[caseStatus] ?? "recibiendo");
  const current = Math.max(fromSteps, fromCase, 0);

  const anyWorking = Object.values(agents).includes("trabajando");
  const anyReview = Object.values(agents).includes("revision") || STAGES[current].key === "autorizacion";

  // Mientras algún agente trabaja, la fase es "Analizando"; la revisión humana se marca en su nodo.
  let phase: Phase;
  if (caseStatus === "cerrado" || caseStatus === "cancelado") phase = "cerrado";
  else if (STAGES[current].key === "disponible") phase = "listo";
  else if (anyWorking) phase = "trabajando";
  else if (anyReview) phase = "revision";
  else if (["en_investigacion", "diagnostico"].includes(caseStatus)) phase = "trabajando";
  else phase = "espera";

  const latest = steps.length ? steps[steps.length - 1] : null;
  const message =
    phase === "espera" && caseStatus === "recibido" && !steps.length
      ? "Recibimos tu solicitud. El análisis comienza cuando el equipo ENQORA asigna a su responsable."
      : phase === "espera" && caseStatus === "esperando_cliente"
        ? "Para continuar necesitamos antecedentes tuyos. Revisa las tareas del caso."
        : phase === "cerrado"
          ? "El caso está finalizado. Todo el trabajo realizado queda en el historial."
          : STAGES[current].message;

  return { agents, current, phase, latest, message };
}
