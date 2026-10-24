import type { AgentKey } from "@/lib/mirror";

// Iconos de los agentes MIRROR con el lenguaje de la iconografía ENQORA (trazo fino, terminaciones redondeadas).
const PATHS: Record<AgentKey, React.ReactNode> = {
  tributario: (
    <>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v4h4" />
      <path d="M10 11h5M10 14h5M10 17h3" />
    </>
  ),
  contable: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8 7h8" />
      <path d="M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01M8.5 18h.01M12 18h.01M15.5 18h.01" />
    </>
  ),
  legal: (
    <>
      <path d="M12 4v16M8 20h8M5 7h14" />
      <path d="M7 7l-3 6a3 3 0 0 0 6 0zM17 7l-3 6a3 3 0 0 0 6 0z" />
    </>
  ),
  financiero: (
    <>
      <path d="M4 20h16" />
      <path d="M7 16v-4M12 16V8M17 16V5" />
    </>
  ),
  investigador: (
    <>
      <circle cx="10.5" cy="10.5" r="5.5" />
      <path d="M15 15l5 5" />
    </>
  ),
  estrategico: (
    <>
      <path d="M9 17h6M10 20h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z" />
    </>
  ),
};

export function AgentIcon({ agent, size = 22 }: { agent: AgentKey; size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      {PATHS[agent]}
    </svg>
  );
}
