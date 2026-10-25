import type { ModuleKey } from "@/lib/cases";

// Iconos de los módulos ENQORA, con el lenguaje de la iconografía de la plataforma.
const PATHS: Record<ModuleKey, React.ReactNode> = {
  contabilidad: (
    <>
      <path d="M5 4h14v16H5z" />
      <path d="M8 8h8M8 12h3M13 12h3M8 16h3M13 16h3" />
    </>
  ),
  create: (
    <>
      <path d="M4 20V9l8-5 8 5v11" />
      <path d="M12 11v6M9 14h6" />
    </>
  ),
  formaliza: (
    <>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v4h4" />
      <path d="m9.5 14 2 2 3.5-4" />
    </>
  ),
  brand: (
    <>
      <path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z" />
    </>
  ),
  legal: (
    <>
      <path d="M12 4v16M8 20h8M5 7h14" />
      <path d="M7 7l-3 6a3 3 0 0 0 6 0zM17 7l-3 6a3 3 0 0 0 6 0z" />
    </>
  ),
  gestion: (
    <>
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
      <path d="M3.5 9h17M9 9v11" />
    </>
  ),
  crece: (
    <>
      <path d="M4 19h16" />
      <path d="m5 15 4.5-4.5 3 3L19 7" />
      <path d="M15 7h4v4" />
    </>
  ),
  idea: (
    <>
      <path d="M9 17h6M10 20h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z" />
    </>
  ),
  general: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.4M12 16.8h.01" />
    </>
  ),
};

export function ModuleIcon({ module, size = 22 }: { module: ModuleKey; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[module]}
    </svg>
  );
}
