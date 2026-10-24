// Iconografía ENQORA: trazo fino (1.6), terminaciones redondeadas, 24×24, color heredado.
// Un solo conjunto para toda la plataforma: no mezclar con iconos genéricos.

type IconProps = { size?: number; className?: string; title?: string };

function Svg({ size = 20, className = "", title, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}
      strokeLinecap="round" strokeLinejoin="round" className={`icon ${className}`}
      aria-hidden={title ? undefined : true} role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

// Reloj ENQORA (emblema): esfera con marcas y manecillas.
export const IconClock = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3.8v1.4M20.2 12h-1.4M12 20.2v-1.4M3.8 12h1.4" />
    <path d="M12 12 8.6 9.2M12 12l4.2-3.6" />
    <circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconControl = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 15a8 8 0 1 1 16 0" />
    <path d="M12 15l3.5-4" />
    <path d="M4 19h16" />
  </Svg>
);

export const IconBuilding = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20V6.5L12 3l8 3.5V20" />
    <path d="M3 20h18" />
    <path d="M9 9h.01M12 9h.01M15 9h.01M9 12.5h.01M12 12.5h.01M15 12.5h.01" />
    <path d="M10.5 20v-3.5h3V20" />
  </Svg>
);

export const IconShield = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3 5 6v5.5c0 4.3 2.9 7.7 7 9.5 4.1-1.8 7-5.2 7-9.5V6l-7-3Z" />
    <path d="m9.2 12 2 2 3.8-4" />
  </Svg>
);

export const IconDevice = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4.5" width="13" height="9.5" rx="1.5" />
    <path d="M6.5 17.5h6" />
    <rect x="17.5" y="8" width="4" height="10" rx="1" />
  </Svg>
);

export const IconKey = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="15" r="3.5" />
    <path d="m10.5 12.5 8-8M16 7l2.5 2.5M14 9l1.8 1.8" />
  </Svg>
);

export const IconUsers = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8.5" r="3" />
    <path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8" />
    <path d="M15.5 6a3 3 0 0 1 0 5.6M17.5 14.6c1.6.6 2.7 2.1 3 4.4" />
  </Svg>
);

export const IconAlert = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4 2.8 19.5h18.4L12 4Z" />
    <path d="M12 10v4.2M12 17h.01" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.3 12.2 2.5 2.5 4.9-5.2" />
  </Svg>
);

export const IconActivity = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 12h4l2.5-6 5 12 2.5-6h4" />
  </Svg>
);

export const IconLogout = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14" />
    <path d="M10 8l-4 4 4 4M6 12h9" />
  </Svg>
);

export const IconSpark = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M6.3 17.7l2.5-2.5M15.2 8.8l2.5-2.5" />
  </Svg>
);
