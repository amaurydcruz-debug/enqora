import { EmblemGlyph } from "@/components/emblems";

// Escena visual de cada categoría de la galería: el emblema ENQORA en grande, sobre un
// escenario propio (horizonte, órbitas y luz). Cada categoría tiene su composición:
// cambia la silueta, la disposición de las órbitas y el punto de luz, no solo el color.

const LAYOUTS = [
  { orbit: "M20 120 C 80 60, 240 60, 300 120", light: [250, 40], tilt: -8 },
  { orbit: "M10 100 C 120 150, 200 30, 310 90", light: [70, 36], tilt: 6 },
  { orbit: "M30 70 C 110 140, 210 140, 290 70", light: [160, 24], tilt: -4 },
  { orbit: "M0 130 C 100 40, 220 160, 320 60", light: [270, 120], tilt: 8 },
];

export function CategoryScene({ emblem, index }: { emblem: string; index: number }) {
  const L = LAYOUTS[index % LAYOUTS.length];
  const id = `cs-${emblem}-${index}`;
  return (
    <span className="cat-scene" aria-hidden="true">
      <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" className="cat-scene-bg">
        <defs>
          <radialGradient id={`${id}-light`} cx={L.light[0] / 320} cy={L.light[1] / 180} r="0.7">
            <stop offset="0" stopColor="rgba(229,199,131,0.32)" />
            <stop offset="0.35" stopColor="rgba(60,118,210,0.16)" />
            <stop offset="1" stopColor="rgba(5,9,20,0)" />
          </radialGradient>
          <linearGradient id={`${id}-floor`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgba(60,118,210,0)" />
            <stop offset="1" stopColor="rgba(60,118,210,0.22)" />
          </linearGradient>
        </defs>
        <rect width="320" height="180" fill={`url(#${id}-light)`} />
        <g transform={`rotate(${L.tilt} 160 120)`}>
          <rect x="-40" y="118" width="400" height="80" fill={`url(#${id}-floor)`} />
          {[0, 1, 2, 3, 4].map((i) => (
            <line key={`h${i}`} x1="-40" x2="360" y1={124 + i * i * 6} y2={124 + i * i * 6} stroke="rgba(156,195,255,0.12)" strokeWidth="0.6" />
          ))}
          {[-4, -3, -2, -1, 0, 1, 2, 3, 4].map((i) => (
            <line key={`v${i}`} x1={160 + i * 14} y1="120" x2={160 + i * 70} y2="200" stroke="rgba(156,195,255,0.08)" strokeWidth="0.6" />
          ))}
        </g>
        <path d={L.orbit} fill="none" stroke="rgba(229,199,131,0.35)" strokeWidth="0.8" strokeDasharray="2 4" />
        <circle cx={L.light[0]} cy={L.light[1]} r="2.2" fill="#f3dfa8" />
        <circle cx={L.light[0]} cy={L.light[1]} r="9" fill="none" stroke="rgba(243,223,168,0.35)" strokeWidth="0.6" />
      </svg>
      <span className="cat-scene-glyph">
        <EmblemGlyph name={emblem} />
      </span>
      <span className="cat-scene-floor" />
    </span>
  );
}
