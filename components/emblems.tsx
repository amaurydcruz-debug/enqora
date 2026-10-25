// Emblemas ENQORA: pequeñas piezas tridimensionales (metal, oro y luz azul) que dan
// identidad propia a cada módulo, servicio y sección. Sistema escalable: cada emblema
// es una composición de primitivas isométricas que comparten materiales globales
// (definidos una sola vez en <EmblemDefs />). Para un módulo nuevo basta con agregar
// su composición a GLYPHS; nunca se repite el mismo dibujo cambiando solo el color.

type Pt = [number, number];
type Glyph = () => React.ReactNode;

// ---------- Proyección isométrica ----------
const C30 = Math.cos(Math.PI / 6);
const S30 = 0.5;
const iso = (x: number, y: number, z: number, o: Pt = [24, 26], s = 1.55): Pt => [
  o[0] + (x - y) * C30 * s,
  o[1] + (x + y) * S30 * s - z * s,
];
const pts = (list: Pt[]) => list.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ");

// Caja isométrica: cara superior, cara izquierda (frente X) y cara derecha (frente Y).
function Box({ x, y, z = 0, w, d, h, top = "url(#eq-silver)", left = "url(#eq-face-l)", right = "url(#eq-face-r)", o, s }: {
  x: number; y: number; z?: number; w: number; d: number; h: number; top?: string; left?: string; right?: string; o?: Pt; s?: number;
}) {
  const P = (a: number, b: number, c: number) => iso(a, b, c, o, s);
  const t = [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)];
  const l = [P(x, y + d, z + h), P(x + w, y + d, z + h), P(x + w, y + d, z), P(x, y + d, z)];
  const r = [P(x + w, y, z + h), P(x + w, y + d, z + h), P(x + w, y + d, z), P(x + w, y, z)];
  return (
    <g strokeLinejoin="round">
      <polygon points={pts(l)} fill={left} />
      <polygon points={pts(r)} fill={right} />
      <polygon points={pts(t)} fill={top} />
      <polyline points={pts([t[3], t[0], t[1]])} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={0.5} />
    </g>
  );
}

// Disco (moneda / perilla): elipse superior y lateral.
function Disc({ cx, cy, rx, ry, h, top = "url(#eq-gold)", side = "url(#eq-gold-side)" }: {
  cx: number; cy: number; rx: number; ry: number; h: number; top?: string; side?: string;
}) {
  return (
    <g>
      <path d={`M${cx - rx},${cy} v${h} a${rx},${ry} 0 0 0 ${rx * 2},0 v${-h} Z`} fill={side} />
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={top} />
      <ellipse cx={cx} cy={cy} rx={rx - 0.6} ry={ry - 0.4} fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth={0.5} />
    </g>
  );
}

const Glow = ({ cx, cy, r }: { cx: number; cy: number; r: number }) => <circle cx={cx} cy={cy} r={r} fill="url(#eq-glow)" />;
const Core = ({ cx, cy, r }: { cx: number; cy: number; r: number }) => (
  <g>
    <circle cx={cx} cy={cy} r={r * 2.2} fill="url(#eq-glow)" />
    <circle cx={cx} cy={cy} r={r} fill="url(#eq-core)" />
    <circle cx={cx - r * 0.35} cy={cy - r * 0.4} r={r * 0.32} fill="rgba(255,255,255,0.75)" />
  </g>
);
const Spark = ({ x, y, r = 1.6 }: { x: number; y: number; r?: number }) => (
  <path d={`M${x},${y - r * 2} L${x + r * 0.5},${y - r * 0.5} L${x + r * 2},${y} L${x + r * 0.5},${y + r * 0.5} L${x},${y + r * 2} L${x - r * 0.5},${y + r * 0.5} L${x - r * 2},${y} L${x - r * 0.5},${y - r * 0.5} Z`} fill="url(#eq-gold)" />
);
const Sheet = ({ x, y, z, w = 14, d = 10, top = "url(#eq-paper)" }: { x: number; y: number; z: number; w?: number; d?: number; top?: string }) => (
  <Box x={x} y={y} z={z} w={w} d={d} h={0.8} top={top} />
);

// ---------- Composiciones ----------
const GLYPHS = {
  // Módulos y áreas
  empresas: () => (
    <>
      <g transform="translate(4.3 9) scale(0.82)">
      <Glow cx={24} cy={30} r={16} />
      <Box x={-9} y={-9} w={18} d={18} h={1} top="url(#eq-plate)" />
      <Box x={-6} y={-6} w={7} d={7} h={17} />
      <Box x={2} y={-2} w={5} d={6} h={10} top="url(#eq-gold)" />
      <Box x={-6} y={2} w={5} d={4} h={6} />
      {[4, 8, 12].map((z) => (
        <polyline key={z} points={pts([iso(-5, 1, z), iso(0, 1, z)])} stroke="rgba(229,199,131,0.9)" strokeWidth={0.7} fill="none" />
      ))}
      </g>
    </>
  ),
  create: () => (
    <>
      <g transform="translate(4.3 9) scale(0.82)">
      <Glow cx={24} cy={30} r={15} />
      <Box x={-7} y={-1} w={7} d={7} h={7} />
      <Box x={1} y={-1} w={7} d={7} h={7} />
      <Box x={-3} y={-5} z={11} w={7} d={7} h={7} top="url(#eq-gold)" left="url(#eq-gold-side)" right="url(#eq-gold-deep)" />
      <path d="M24 11.5 v4" stroke="rgba(156,195,255,0.8)" strokeWidth={0.7} strokeDasharray="1 1.2" />
      </g>
    </>
  ),
  contabilidad: () => (
    <>
      <Glow cx={24} cy={28} r={15} />
      <ellipse cx={24} cy={30} rx={15} ry={6.5} fill="none" stroke="rgba(156,195,255,0.55)" strokeWidth={0.7} />
      <Disc cx={24} cy={33} rx={9} ry={3.6} h={3} top="url(#eq-silver)" side="url(#eq-face-r)" />
      <Disc cx={24} cy={28} rx={9} ry={3.6} h={3} />
      <Disc cx={24} cy={23} rx={9} ry={3.6} h={3} />
      <Disc cx={24} cy={18} rx={9} ry={3.6} h={3} />
      <path d="M21.5 18 h5 M24 16.4 v3.2" stroke="rgba(110,85,48,0.9)" strokeWidth={0.9} strokeLinecap="round" />
      <ellipse cx={24} cy={30} rx={15} ry={6.5} fill="none" stroke="url(#eq-gold)" strokeWidth={0.8} strokeDasharray="22 80" strokeDashoffset={-4} />
    </>
  ),
  casos: () => (
    <>
      <Core cx={24} cy={24} r={7.5} />
      <ellipse cx={24} cy={24} rx={16} ry={6} fill="none" stroke="url(#eq-silver)" strokeWidth={1.2} transform="rotate(-24 24 24)" />
      <ellipse cx={24} cy={24} rx={16} ry={6} fill="none" stroke="rgba(156,195,255,0.6)" strokeWidth={0.6} transform="rotate(34 24 24)" />
      <circle cx={38.2} cy={17.4} r={1.9} fill="url(#eq-silver)" />
      <circle cx={11.5} cy={31.5} r={1.4} fill="#9cc3ff" />
    </>
  ),
  seguridad: () => (
    <>
      <Glow cx={24} cy={24} r={16} />
      <path d="M24 6 L37 11 V22 C37 31 31 37.5 24 41 C17 37.5 11 31 11 22 V11 Z" fill="url(#eq-gold)" />
      <path d="M24 8.6 L34.6 12.7 V22 C34.6 29.8 29.6 35.3 24 38.2 Z" fill="url(#eq-face-r)" />
      <path d="M24 8.6 L13.4 12.7 V22 C13.4 29.8 18.4 35.3 24 38.2 Z" fill="url(#eq-face-l)" />
      <circle cx={24} cy={22} r={7} fill="url(#eq-glow)" />
      <path d="M24 16.5 l1.4 4.1 h4.2 l-3.4 2.5 1.3 4.1 -3.5 -2.5 -3.5 2.5 1.3 -4.1 -3.4 -2.5 h4.2 Z" fill="url(#eq-core)" />
      <path d="M24 8.6 V38.2" stroke="rgba(255,255,255,0.35)" strokeWidth={0.5} />
    </>
  ),
  crece: () => (
    <>
      <Glow cx={26} cy={28} r={15} />
      <Box x={-9} y={-2} w={5} d={5} h={5} />
      <Box x={-3} y={-2} w={5} d={5} h={10} />
      <Box x={3} y={-2} w={5} d={5} h={16} top="url(#eq-gold)" left="url(#eq-gold-side)" right="url(#eq-gold-deep)" />
      <path d="M9 21 C 16 19, 24 13, 33 6" fill="none" stroke="url(#eq-gold)" strokeWidth={1.3} strokeLinecap="round" />
      <path d="M29.5 5.5 L34 5.2 L33.2 9.6" fill="none" stroke="url(#eq-gold)" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  legal: () => (
    <>
      <Glow cx={24} cy={24} r={16} />
      <Disc cx={24} cy={37} rx={7} ry={2.4} h={2} top="url(#eq-silver)" side="url(#eq-face-r)" />
      <rect x={23} y={11} width={2} height={26} fill="url(#eq-silver)" />
      <path d="M9 14 L39 12" stroke="url(#eq-gold)" strokeWidth={1.6} strokeLinecap="round" />
      <path d="M11 14 L7 24 M11 14 L15 24 M37 12.2 L33 22 M37 12.2 L41 22" stroke="rgba(195,204,218,0.7)" strokeWidth={0.5} />
      <path d="M6 24 a5 2.4 0 0 0 10 0 Z" fill="url(#eq-gold)" />
      <path d="M32 22 a5 2.4 0 0 0 10 0 Z" fill="url(#eq-gold)" />
      <circle cx={24} cy={13} r={2.2} fill="url(#eq-core)" />
    </>
  ),
  investigacion: () => {
    const nodes: Pt[] = [[10, 14], [38, 12], [41, 30], [24, 40], [8, 32]];
    return (
      <>
        {nodes.map(([x, y], i) => (
          <line key={`l${i}`} x1={24} y1={24} x2={x} y2={y} stroke="url(#eq-line)" strokeWidth={0.9} />
        ))}
        <polyline points={pts([...nodes, nodes[0]])} fill="none" stroke="rgba(156,195,255,0.25)" strokeWidth={0.5} />
        <Core cx={24} cy={24} r={6} />
        {nodes.map(([x, y], i) => (
          <circle key={`n${i}`} cx={x} cy={y} r={i % 2 ? 2.2 : 1.7} fill={i % 2 ? "url(#eq-silver)" : "#9cc3ff"} />
        ))}
      </>
    );
  },
  control: () => (
    <>
      <Glow cx={24} cy={26} r={16} />
      <ellipse cx={24} cy={27} rx={17} ry={8} fill="none" stroke="url(#eq-silver)" strokeWidth={1.1} />
      <ellipse cx={24} cy={27} rx={11.5} ry={5.4} fill="rgba(20,40,74,0.6)" stroke="rgba(156,195,255,0.6)" strokeWidth={0.6} />
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return <line key={i} x1={24 + Math.cos(a) * 14.5} y1={27 + Math.sin(a) * 6.8} x2={24 + Math.cos(a) * 16.2} y2={27 + Math.sin(a) * 7.6} stroke="rgba(229,199,131,0.8)" strokeWidth={0.6} />;
      })}
      <path d="M24 27 L36 13 L26.5 28.6 Z" fill="url(#eq-gold)" />
      <path d="M24 27 L36 13 L23 25.6 Z" fill="url(#eq-gold-deep)" />
      <circle cx={24} cy={27} r={2} fill="url(#eq-core)" />
    </>
  ),
  formaliza: () => (
    <>
      <Glow cx={24} cy={28} r={15} />
      <Sheet x={-8} y={-6} z={0} w={15} d={12} top="url(#eq-face-r)" />
      <Sheet x={-7} y={-6} z={2.5} w={15} d={12} top="url(#eq-face-l)" />
      <Sheet x={-6} y={-6} z={5} w={15} d={12} />
      {[0, 3, 6].map((k) => (
        <polyline key={k} points={pts([iso(-4, -4 + k, 6), iso(4, -4 + k, 6)])} stroke="rgba(74,86,108,0.8)" strokeWidth={0.6} fill="none" />
      ))}
      <Disc cx={30} cy={25} rx={5.2} ry={2.6} h={1.6} />
      <path d="M27.6 26.6 l-1.5 6 2.2 -1.2 1.2 2 1 -5.6 M32.4 26.6 l1.5 6 -2.2 -1.2 -1.2 2 -1 -5.6" fill="url(#eq-gold-deep)" />
    </>
  ),
  brand: () => (
    <>
      <Glow cx={24} cy={24} r={16} />
      <path d="M12 17 L18 9 H30 L36 17 L24 39 Z" fill="url(#eq-gold-deep)" />
      <path d="M12 17 H36 L24 39 Z" fill="url(#eq-gold-side)" />
      <path d="M18 17 H30 L24 39 Z" fill="url(#eq-gold)" />
      <path d="M18 9 L22 17 H12 Z" fill="url(#eq-silver)" />
      <path d="M30 9 L26 17 H36 Z" fill="url(#eq-face-r)" />
      <path d="M18 9 H30 L26 17 H22 Z" fill="url(#eq-gold)" />
      <path d="M12 17 H36" stroke="rgba(255,255,255,0.55)" strokeWidth={0.5} />
      <Spark x={36} y={9} r={1.4} />
    </>
  ),
  gestion: () => (
    <>
      <Glow cx={24} cy={28} r={15} />
      <Box x={-8} y={-8} w={7} d={7} h={2} />
      <Box x={0} y={-8} w={7} d={7} h={2} />
      <Box x={-8} y={0} w={7} d={7} h={2} />
      <Box x={0} y={0} z={3} w={7} d={7} h={3} top="url(#eq-gold)" left="url(#eq-gold-side)" right="url(#eq-gold-deep)" />
      <path d="M24 26.5 V14" stroke="rgba(156,195,255,0.6)" strokeWidth={0.6} strokeDasharray="1 1.4" />
      <circle cx={24} cy={12.5} r={1.6} fill="#9cc3ff" />
    </>
  ),
  idea: () => (
    <>
      <Glow cx={24} cy={20} r={16} />
      <path d="M24 6 L34 20 L24 34 L14 20 Z" fill="url(#eq-glass)" stroke="url(#eq-silver)" strokeWidth={0.8} />
      <path d="M24 6 L34 20 L24 22 Z" fill="rgba(255,255,255,0.18)" />
      <path d="M14 20 L24 22 L24 34 Z" fill="rgba(20,40,74,0.55)" />
      <Core cx={24} cy={20} r={3.2} />
      <path d="M18 38 h12 M20 41.5 h8" stroke="url(#eq-gold)" strokeWidth={1.4} strokeLinecap="round" />
      <path d="M37 9 l2.5 -2 M40 18 h3 M8 18 h-3 M11 9 l-2.5 -2" stroke="rgba(229,199,131,0.8)" strokeWidth={0.8} strokeLinecap="round" />
    </>
  ),
  general: () => (
    <>
      <Glow cx={24} cy={24} r={16} />
      <path d="M10 12 Q10 8 14 8 H34 Q38 8 38 12 V27 Q38 31 34 31 H22 L15 37 V31 H14 Q10 31 10 27 Z" fill="url(#eq-glass)" stroke="url(#eq-silver)" strokeWidth={0.9} />
      <path d="M12 10.5 H36" stroke="rgba(255,255,255,0.35)" strokeWidth={0.5} />
      {[17, 24, 31].map((x, i) => <circle key={x} cx={x} cy={19.5} r={2.1} fill={i === 1 ? "url(#eq-core)" : "url(#eq-gold)"} />)}
    </>
  ),

  // Secciones de la ficha de empresa y de la cuenta
  datos: () => (
    <>
      <Glow cx={24} cy={28} r={15} />
      <Box x={-9} y={-6} w={18} d={12} h={1.6} top="url(#eq-panel)" />
      <polygon points={pts([iso(-7, -4, 1.6), iso(-2, -4, 1.6), iso(-2, 0, 1.6), iso(-7, 0, 1.6)])} fill="url(#eq-gold)" />
      {[-3, 0, 3].map((k) => (
        <polyline key={k} points={pts([iso(1, k, 1.6), iso(7, k, 1.6)])} stroke="rgba(195,204,218,0.8)" strokeWidth={0.7} fill="none" />
      ))}
      <Spark x={36} y={12} r={1.3} />
    </>
  ),
  miembros: () => (
    <>
      <Glow cx={24} cy={28} r={16} />
      <ellipse cx={24} cy={36} rx={17} ry={4.5} fill="none" stroke="rgba(156,195,255,0.4)" strokeWidth={0.6} />
      {[[13, 0], [35, 0]].map(([x]) => (
        <g key={x}>
          <circle cx={x} cy={19} r={3.6} fill="url(#eq-silver)" />
          <path d={`M${x - 6} 34 Q${x - 6} 25 ${x} 25 Q${x + 6} 25 ${x + 6} 34 Z`} fill="url(#eq-face-r)" stroke="rgba(195,204,218,0.4)" strokeWidth={0.5} />
        </g>
      ))}
      <circle cx={24} cy={16} r={4.4} fill="url(#eq-gold)" />
      <path d="M16.5 36 Q16.5 23.5 24 23.5 Q31.5 23.5 31.5 36 Z" fill="url(#eq-gold-side)" />
      <path d="M18 34 Q18 25 24 25" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={0.6} />
    </>
  ),
  invitar: () => (
    <>
      <Glow cx={22} cy={28} r={15} />
      <path d="M6 17 L22 9 L38 17 V34 H6 Z" fill="url(#eq-face-r)" />
      <path d="M6 17 L22 27 L38 17 V34 H6 Z" fill="url(#eq-face-l)" stroke="rgba(195,204,218,0.4)" strokeWidth={0.5} />
      <path d="M6 34 L18 24.5 M38 34 L26 24.5" stroke="rgba(5,9,20,0.6)" strokeWidth={0.8} />
      <path d="M6 17 L22 27 L38 17" fill="none" stroke="url(#eq-gold)" strokeWidth={1.3} strokeLinejoin="round" />
      <circle cx={38} cy={11} r={5.4} fill="url(#eq-core)" />
      <path d="M38 8.3 v5.4 M35.3 11 h5.4" stroke="#3a2c14" strokeWidth={1.2} strokeLinecap="round" />
    </>
  ),
  actividad: () => (
    <>
      <Glow cx={24} cy={28} r={15} />
      <Box x={-10} y={-7} w={20} d={14} h={1} top="url(#eq-plate)" />
      <path d="M7 27 L15 27 L18 19 L22 33 L26 13 L30 27 L41 27" fill="none" stroke="url(#eq-gold)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={26} cy={13} r={2} fill="url(#eq-core)" />
    </>
  ),
  documentos: () => (
    <>
      <Glow cx={24} cy={26} r={15} />
      <g transform="rotate(-10 24 24)"><rect x={11} y={10} width={20} height={26} rx={2} fill="url(#eq-face-r)" /></g>
      <g transform="rotate(4 24 24)"><rect x={14} y={9} width={20} height={26} rx={2} fill="url(#eq-face-l)" stroke="rgba(195,204,218,0.4)" strokeWidth={0.5} /></g>
      <path d="M17 8 H32 L37 13 V35 Q37 37 35 37 H19 Q17 37 17 35 Z" fill="url(#eq-paper)" />
      <path d="M32 8 V13 H37" fill="url(#eq-silver)" />
      <path d="M21 18 H32 M21 22.5 H32 M21 27 H28" stroke="rgba(74,86,108,0.85)" strokeWidth={0.9} strokeLinecap="round" />
      <path d="M17 33 H37" stroke="url(#eq-gold)" strokeWidth={1.4} />
    </>
  ),
  configuracion: () => (
    <>
      <Glow cx={24} cy={26} r={15} />
      <Disc cx={24} cy={27} rx={14} ry={6.2} h={4} top="url(#eq-silver)" side="url(#eq-face-r)" />
      <Disc cx={24} cy={23} rx={8} ry={3.6} h={4} top="url(#eq-face-l)" side="url(#eq-face-r)" />
      {Array.from({ length: 16 }).map((_, i) => {
        const a = (i / 16) * Math.PI * 2;
        return <line key={i} x1={24 + Math.cos(a) * 10.5} y1={27 + Math.sin(a) * 4.6} x2={24 + Math.cos(a) * 12.6} y2={27 + Math.sin(a) * 5.5} stroke="rgba(74,86,108,0.9)" strokeWidth={0.6} />;
      })}
      <path d="M24 23 L30.5 21" stroke="url(#eq-gold)" strokeWidth={1.6} strokeLinecap="round" />
      <circle cx={31.5} cy={20.7} r={1.4} fill="url(#eq-core)" />
    </>
  ),
  autorizaciones: () => (
    <>
      <Glow cx={24} cy={24} r={16} />
      <circle cx={17} cy={19} r={8} fill="url(#eq-gold)" />
      <circle cx={17} cy={19} r={3.2} fill="#0b1425" />
      <path d="M23 24 L37 36 M30.5 30.3 l-3 3.4 M34 33.4 l-2.6 3" stroke="url(#eq-gold)" strokeWidth={3} strokeLinecap="round" />
      <circle cx={36} cy={13} r={6} fill="rgba(100,199,174,0.18)" stroke="#64c7ae" strokeWidth={0.9} />
      <path d="M33.3 13 l2 2 3.6 -4" fill="none" stroke="#9ee6d1" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  identidad: () => (
    <>
      <Glow cx={24} cy={24} r={16} />
      <circle cx={24} cy={24} r={15} fill="url(#eq-face-r)" stroke="url(#eq-gold)" strokeWidth={1.4} />
      <circle cx={24} cy={24} r={12.6} fill="none" stroke="rgba(156,195,255,0.35)" strokeWidth={0.6} strokeDasharray="2 2" />
      <circle cx={24} cy={20} r={4.6} fill="url(#eq-silver)" />
      <path d="M15.5 33 Q15.5 26 24 26 Q32.5 26 32.5 33" fill="url(#eq-silver)" />
    </>
  ),
  "dos-pasos": () => (
    <>
      <Glow cx={24} cy={24} r={16} />
      <rect x={14} y={6} width={20} height={36} rx={4} fill="url(#eq-face-r)" stroke="url(#eq-silver)" strokeWidth={1} />
      <rect x={16.5} y={10} width={15} height={26} rx={1.6} fill="rgba(20,40,74,0.85)" />
      {[0, 1, 2].map((i) => <circle key={i} cx={19.5 + i * 4.5} cy={20} r={1.5} fill="url(#eq-gold)" />)}
      {[0, 1, 2].map((i) => <circle key={`b${i}`} cx={19.5 + i * 4.5} cy={25.5} r={1.5} fill="#9cc3ff" />)}
      <circle cx={24} cy={39} r={1.2} fill="url(#eq-silver)" />
      <circle cx={37} cy={12} r={4.6} fill="url(#eq-core)" />
      <text x={37} y={14.3} textAnchor="middle" fontSize={6.2} fontWeight={700} fill="#3a2c14" fontFamily="system-ui">2</text>
    </>
  ),
  sesiones: () => (
    <>
      <Glow cx={24} cy={24} r={16} />
      <rect x={6} y={10} width={22} height={15} rx={1.8} fill="url(#eq-face-r)" stroke="url(#eq-silver)" strokeWidth={0.9} />
      <rect x={20} y={18} width={22} height={15} rx={1.8} fill="url(#eq-face-l)" stroke="url(#eq-gold)" strokeWidth={0.9} />
      <path d="M23 22 h9 M23 25.5 h14 M23 29 h6" stroke="rgba(195,204,218,0.7)" strokeWidth={0.8} strokeLinecap="round" />
      <path d="M27 37 h8 M31 33 v4" stroke="url(#eq-silver)" strokeWidth={1.2} strokeLinecap="round" />
      <circle cx={10} cy={13.5} r={1.2} fill="#64c7ae" />
    </>
  ),
  dispositivos: () => (
    <>
      <g transform="translate(4.3 9) scale(0.82)">
      <Glow cx={24} cy={28} r={15} />
      <Box x={-10} y={-6} w={16} d={12} h={1} top="url(#eq-silver)" />
      <polygon points={pts([iso(-10, -6, 1), iso(6, -6, 1), iso(6, -6, 11), iso(-10, -6, 11)])} fill="url(#eq-face-l)" stroke="url(#eq-silver)" strokeWidth={0.7} />
      <polygon points={pts([iso(-8.5, -6, 2.5), iso(4.5, -6, 2.5), iso(4.5, -6, 9.5), iso(-8.5, -6, 9.5)])} fill="rgba(60,118,210,0.35)" />
      <Box x={8} y={-1} w={3} d={6} h={9} top="url(#eq-gold)" left="url(#eq-gold-side)" right="url(#eq-gold-deep)" />
      </g>
    </>
  ),
  clave: () => (
    <>
      <Glow cx={24} cy={26} r={15} />
      <path d="M16 20 V15 A8 8 0 0 1 32 15 V20" fill="none" stroke="url(#eq-silver)" strokeWidth={3} />
      <rect x={11} y={19} width={26} height={21} rx={3.5} fill="url(#eq-gold)" />
      <rect x={11} y={19} width={13} height={21} rx={3.5} fill="rgba(255,255,255,0.12)" />
      <circle cx={24} cy={27.5} r={2.8} fill="#2a1f0c" />
      <path d="M24 29 v5" stroke="#2a1f0c" strokeWidth={2} strokeLinecap="round" />
    </>
  ),

  // Opciones de ENQORA MIRROR
  agentes: () => (
    <>
      <ellipse cx={24} cy={24} rx={17} ry={7} fill="none" stroke="rgba(156,195,255,0.45)" strokeWidth={0.7} />
      <Core cx={24} cy={24} r={6.5} />
      <circle cx={8} cy={22} r={2.6} fill="url(#eq-silver)" />
      <circle cx={38} cy={29} r={2.6} fill="url(#eq-gold)" />
      <circle cx={31} cy={17.6} r={2} fill="#9cc3ff" />
      <circle cx={15} cy={30.5} r={1.8} fill="url(#eq-silver)" />
    </>
  ),
  mensajes: () => (
    <>
      <Glow cx={24} cy={24} r={15} />
      <path d="M6 10 Q6 7 9 7 H27 Q30 7 30 10 V20 Q30 23 27 23 H14 L9 27.5 V23 Q6 23 6 20 Z" fill="url(#eq-face-r)" stroke="url(#eq-silver)" strokeWidth={0.8} />
      <path d="M18 21 Q18 18 21 18 H39 Q42 18 42 21 V31 Q42 34 39 34 H38 V39 L33 34 H21 Q18 34 18 31 Z" fill="url(#eq-glass)" stroke="url(#eq-gold)" strokeWidth={0.9} />
      <path d="M23 24 H37 M23 28 H32" stroke="rgba(243,245,250,0.75)" strokeWidth={0.9} strokeLinecap="round" />
    </>
  ),
  tareas: () => (
    <>
      <Glow cx={24} cy={26} r={15} />
      <rect x={11} y={7} width={26} height={33} rx={3} fill="url(#eq-face-r)" stroke="url(#eq-silver)" strokeWidth={0.9} />
      <rect x={18} y={5} width={12} height={5} rx={1.5} fill="url(#eq-gold)" />
      {[16, 23.5, 31].map((y, i) => (
        <g key={y}>
          <rect x={15} y={y - 2.2} width={4.4} height={4.4} rx={1} fill={i < 2 ? "url(#eq-gold)" : "none"} stroke="url(#eq-gold)" strokeWidth={0.8} />
          {i < 2 ? <path d={`M15.9 ${y} l1.3 1.3 2.3 -2.6`} fill="none" stroke="#3a2c14" strokeWidth={0.9} strokeLinecap="round" /> : null}
          <path d={`M22 ${y} H33`} stroke="rgba(195,204,218,0.75)" strokeWidth={0.9} strokeLinecap="round" />
        </g>
      ))}
    </>
  ),
  expediente: () => (
    <>
      <Glow cx={24} cy={28} r={15} />
      <Box x={-8} y={-6} w={16} d={12} h={9} top="url(#eq-face-l)" />
      <Sheet x={-6} y={-5} z={9} w={12} d={2} top="url(#eq-paper)" />
      <Sheet x={-6} y={-1.5} z={9} w={12} d={2} top="url(#eq-gold)" />
      <Sheet x={-6} y={2} z={9} w={12} d={2} top="url(#eq-silver)" />
      <polyline points={pts([iso(-3, 6, 3.5), iso(3, 6, 3.5)])} stroke="url(#eq-gold)" strokeWidth={1.4} fill="none" strokeLinecap="round" />
    </>
  ),
  diagnostico: () => (
    <>
      <Glow cx={20} cy={20} r={15} />
      <circle cx={20} cy={20} r={11} fill="url(#eq-glass)" stroke="url(#eq-gold)" strokeWidth={2.4} />
      <path d="M13 17 Q15 12 20 11.5" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth={1} strokeLinecap="round" />
      <path d="M14.5 23 L18 19.5 L21 22 L26 16" fill="none" stroke="#9cc3ff" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M28.5 28.5 L39 39" stroke="url(#eq-silver)" strokeWidth={4.2} strokeLinecap="round" />
      <path d="M28.5 28.5 L31 31" stroke="url(#eq-gold)" strokeWidth={4.2} strokeLinecap="round" />
    </>
  ),
  proximas: () => (
    <>
      <Glow cx={24} cy={28} r={15} />
      <Box x={-11} y={-4} w={22} d={8} h={1} top="url(#eq-plate)" />
      {[-7, -1, 5].map((x, i) => (
        <polyline key={x} points={pts([iso(x, -3, 1.4), iso(x + 3.5, 0, 1.4), iso(x, 3, 1.4)])} fill="none" stroke={i === 2 ? "url(#eq-gold)" : "rgba(156,195,255,0.7)"} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      <Spark x={38} y={13} r={1.5} />
    </>
  ),
  proceso: () => (
    <>
      <Glow cx={24} cy={24} r={15} />
      <path d="M8 34 C 14 34, 14 24, 20 24 S 28 14, 34 14 L40 14" fill="none" stroke="rgba(156,195,255,0.5)" strokeWidth={1} strokeDasharray="1.5 1.5" />
      <circle cx={8} cy={34} r={3} fill="url(#eq-silver)" />
      <circle cx={20} cy={24} r={3.4} fill="url(#eq-silver)" />
      <circle cx={34} cy={14} r={4.4} fill="url(#eq-core)" />
      <circle cx={34} cy={14} r={8} fill="none" stroke="rgba(229,199,131,0.4)" strokeWidth={0.6} />
    </>
  ),
} satisfies Record<string, Glyph>;

export type EmblemKey = keyof typeof GLYPHS;
export const EMBLEM_KEYS = Object.keys(GLYPHS) as EmblemKey[];

// Aliases: nombres de módulos y secciones que comparten un emblema conceptual.
const ALIAS: Record<string, EmblemKey> = {
  finanzas: "crece",
  marca: "brand",
  historial: "mensajes",
  "seguridad-empresa": "seguridad",
  actividad_reciente: "actividad",
};
export const isEmblem = (v: string): v is EmblemKey => v in GLYPHS || v in ALIAS;

// Pieza visible: marco metálico (CSS .emblem) con la composición en su interior.
export function Emblem({
  name,
  size = "md",
  label,
  className = "",
}: {
  name: EmblemKey | string;
  size?: "sm" | "md" | "lg" | "xl";
  label?: string;
  className?: string;
}) {
  const key = (name in GLYPHS ? name : ALIAS[name] ?? "general") as EmblemKey;
  const G = GLYPHS[key];
  return (
    <span className={`emblem emblem-${size} ${className}`} data-emblem={key} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <svg viewBox="0 0 48 48" focusable="false">{G()}</svg>
    </span>
  );
}

// Composición sin marco, para escenas grandes (galería de la puerta de entrada).
export function EmblemGlyph({ name, className = "" }: { name: string; className?: string }) {
  const key = (name in GLYPHS ? name : ALIAS[name] ?? "general") as EmblemKey;
  const G = GLYPHS[key];
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" focusable="false">{G()}</svg>
  );
}

// Materiales compartidos. Se renderiza una sola vez en el layout raíz.
// No usa display:none (los navegadores dejan de resolver los gradientes); queda fuera de vista.
export function EmblemDefs() {
  return (
    <svg className="emblem-defs" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="eq-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1c7" />
          <stop offset="0.35" stopColor="#e5c783" />
          <stop offset="0.72" stopColor="#a8854b" />
          <stop offset="1" stopColor="#6e5530" />
        </linearGradient>
        <linearGradient id="eq-gold-side" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c6a66b" />
          <stop offset="1" stopColor="#7a5f35" />
        </linearGradient>
        <linearGradient id="eq-gold-deep" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9c7c45" />
          <stop offset="1" stopColor="#4d3b1f" />
        </linearGradient>
        <linearGradient id="eq-silver" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.4" stopColor="#c9d3e3" />
          <stop offset="0.78" stopColor="#7d8aa1" />
          <stop offset="1" stopColor="#4a566c" />
        </linearGradient>
        <linearGradient id="eq-face-l" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a5683" />
          <stop offset="1" stopColor="#16264a" />
        </linearGradient>
        <linearGradient id="eq-face-r" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#24395e" />
          <stop offset="1" stopColor="#0c162b" />
        </linearGradient>
        <linearGradient id="eq-plate" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2d4670" />
          <stop offset="1" stopColor="#101d34" />
        </linearGradient>
        <linearGradient id="eq-panel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#dfe6f1" />
          <stop offset="1" stopColor="#8c99b0" />
        </linearGradient>
        <linearGradient id="eq-paper" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3f5fa" />
          <stop offset="1" stopColor="#a9b5c9" />
        </linearGradient>
        <linearGradient id="eq-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="rgba(156,195,255,0.5)" />
          <stop offset="1" stopColor="rgba(20,40,74,0.35)" />
        </linearGradient>
        <linearGradient id="eq-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="rgba(156,195,255,0.85)" />
          <stop offset="1" stopColor="rgba(229,199,131,0.75)" />
        </linearGradient>
        <radialGradient id="eq-core" cx="0.4" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#fff6dc" />
          <stop offset="0.45" stopColor="#e5c783" />
          <stop offset="1" stopColor="#8a6a36" />
        </radialGradient>
        <radialGradient id="eq-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="rgba(60,118,210,0.42)" />
          <stop offset="0.55" stopColor="rgba(60,118,210,0.12)" />
          <stop offset="1" stopColor="rgba(60,118,210,0)" />
        </radialGradient>
      </defs>
    </svg>
  );
}
