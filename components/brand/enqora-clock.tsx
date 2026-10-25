"use client";

import { useId } from "react";

// Símbolo ENQORA en vector: la Q plateada, el arco de luz dorada, la esfera azul noche,
// los doce índices de oro y las manecillas, con las proporciones del logotipo oficial
// (public/brand/enqora-icon-512.png, mismo sistema de coordenadas 512×512).
// Estático: muestra las 10:08 como el logotipo. Animado (prop `live`): las manecillas
// giran, un reflejo recorre el metal y el núcleo respira luz azul. Todo el movimiento
// se detiene con «reducir movimiento».

const C: [number, number] = [258, 277]; // eje de las manecillas
const FACE = { cx: 255, cy: 277, r: 163 };
const RING = { cx: 240, cy: 287, r: 198 };

// Arco SVG por ángulos en grados (0° = derecha, sentido horario).
function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  return `M${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(1)},${y1.toFixed(1)}`;
}

const circlePath = (cx: number, cy: number, r: number) =>
  `M${cx - r},${cy} a${r},${r} 0 1 0 ${r * 2},0 a${r},${r} 0 1 0 ${-r * 2},0 Z`;

export function EnqoraClock({ size = 96, live = false, className = "" }: { size?: number; live?: boolean; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const id = (k: string) => `${k}-${uid}`;
  const url = (k: string) => `url(#${id(k)})`;

  const ticks = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    const s = Math.sin(a);
    const c = -Math.cos(a);
    const r0 = i % 3 === 0 ? 112 : 117;
    return { x1: C[0] + s * r0, y1: C[1] + c * r0, x2: C[0] + s * 146, y2: C[1] + c * 146 };
  });

  return (
    <svg
      className={`enq-clock${live ? " is-live" : ""} ${className}`}
      viewBox="20 20 472 472"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={id("silver")} x1="0.05" y1="0.1" x2="0.95" y2="0.9">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.28" stopColor="#e3e9f3" />
          <stop offset="0.55" stopColor="#a7b4c9" />
          <stop offset="0.8" stopColor="#6d7d98" />
          <stop offset="1" stopColor="#b8c5da" />
        </linearGradient>
        <linearGradient id={id("tail")} x1="0" y1="0" x2="1" y2="0.6">
          <stop offset="0" stopColor="#5f6f8c" />
          <stop offset="0.35" stopColor="#dfe6f1" />
          <stop offset="0.7" stopColor="#9fadc4" />
          <stop offset="1" stopColor="#f4f7fb" />
        </linearGradient>
        <linearGradient id={id("gold")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1c7" />
          <stop offset="0.4" stopColor="#e5c783" />
          <stop offset="1" stopColor="#9c7c45" />
        </linearGradient>
        <linearGradient id={id("arc")} x1="0.2" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="rgba(229,199,131,0)" />
          <stop offset="0.25" stopColor="#f3dfa8" />
          <stop offset="0.7" stopColor="#c6a66b" />
          <stop offset="1" stopColor="rgba(198,166,107,0.1)" />
        </linearGradient>
        <radialGradient id={id("face")} cx="0.5" cy="0.45" r="0.6">
          <stop offset="0" stopColor="#13284a" />
          <stop offset="0.7" stopColor="#0b1830" />
          <stop offset="1" stopColor="#060d1c" />
        </radialGradient>
        <radialGradient id={id("core")} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="rgba(92,150,240,0.55)" />
          <stop offset="0.6" stopColor="rgba(60,118,210,0.16)" />
          <stop offset="1" stopColor="rgba(60,118,210,0)" />
        </radialGradient>
        <radialGradient id={id("pin")} cx="0.38" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#fff3cf" />
          <stop offset="0.5" stopColor="#d8b874" />
          <stop offset="1" stopColor="#7d6134" />
        </radialGradient>
        <linearGradient id={id("sheen")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="rgba(255,255,255,0)" />
          <stop offset="0.5" stopColor="rgba(255,250,235,0.85)" />
          <stop offset="1" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        <filter id={id("blur")} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
        <filter id={id("soft")} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
        <clipPath id={id("ringclip")}>
          <path d={`${circlePath(RING.cx, RING.cy, RING.r)} ${circlePath(FACE.cx, FACE.cy, FACE.r)}`} clipRule="evenodd" />
        </clipPath>
      </defs>

      {/* Luz ambiental: azul a la izquierda, dorada en el arco */}
      <ellipse cx={128} cy={290} rx={80} ry={165} fill="rgba(60,118,210,0.42)" filter={url("blur")} className="ec-ambient" />
      <path d={arc(262, 284, 206, -100, 66)} fill="none" stroke="rgba(229,199,131,0.6)" strokeWidth={40} filter={url("blur")} className="ec-flare" />
      <path d={arc(262, 284, 206, -96, 62)} fill="none" stroke={url("arc")} strokeWidth={14} strokeLinecap="round" />

      {/* Q plateada (anillo excéntrico) */}
      <path d={`${circlePath(RING.cx, RING.cy, RING.r)} ${circlePath(FACE.cx, FACE.cy, FACE.r)}`} fillRule="evenodd" fill={url("silver")} />
      <circle cx={FACE.cx} cy={FACE.cy} r={FACE.r + 1} fill="none" stroke="rgba(60,118,210,0.75)" strokeWidth={4} />
      <circle cx={RING.cx} cy={RING.cy} r={RING.r - 1.5} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={2} />

      {/* Reflejo que recorre el metal */}
      <g clipPath={url("ringclip")}>
        <g className="ec-sheen">
          <rect x={200} y={40} width={70} height={480} fill={url("sheen")} transform="rotate(24 255 277)" />
        </g>
      </g>

      {/* Esfera */}
      <circle cx={FACE.cx} cy={FACE.cy} r={FACE.r} fill={url("face")} />
      <circle cx={C[0]} cy={C[1]} r={150} fill="none" stroke="rgba(110,140,190,0.16)" strokeWidth={1.5} />
      <circle cx={C[0]} cy={C[1]} r={108} fill="rgba(5,11,24,0.45)" stroke="rgba(110,140,190,0.14)" strokeWidth={1.5} />
      <circle cx={C[0]} cy={C[1]} r={118} fill={url("core")} className="ec-core" />

      {ticks.map((t, i) => (
        <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={url("gold")} strokeWidth={i % 3 === 0 ? 7 : 5.5} strokeLinecap="round" />
      ))}

      {/* Manecillas (dibujadas a las 12 y giradas a las 10:08) */}
      <g className="ec-hand ec-hour">
        <path d={`M${C[0] - 7},${C[1] + 14} L${C[0] - 4.5},${C[1] - 70} L${C[0]},${C[1] - 76} L${C[0] + 4.5},${C[1] - 70} L${C[0] + 7},${C[1] + 14} Z`} fill={url("gold")} />
        <path d={`M${C[0]},${C[1] + 12} L${C[0]},${C[1] - 74}`} stroke="rgba(255,255,255,0.35)" strokeWidth={1.2} />
      </g>
      <g className="ec-hand ec-minute">
        <path d={`M${C[0] - 6},${C[1] + 22} L${C[0] - 3},${C[1] - 136} L${C[0]},${C[1] - 144} L${C[0] + 3},${C[1] - 136} L${C[0] + 6},${C[1] + 22} Z`} fill={url("gold")} />
        <path d={`M${C[0]},${C[1] + 20} L${C[0]},${C[1] - 140}`} stroke="rgba(255,255,255,0.35)" strokeWidth={1.2} />
      </g>
      <circle cx={C[0]} cy={C[1]} r={14} fill={url("pin")} />
      <circle cx={C[0]} cy={C[1]} r={5} fill="#3a2c14" />

      {/* Cola de la Q: cinta plateada que cruza la esfera hacia la derecha */}
      <path
        d="M150 366 C 205 357, 262 360, 300 381 C 340 403, 372 432, 422 461 C 380 466, 340 463, 318 452 C 296 440, 280 410, 248 396 C 214 382, 178 384, 150 366 Z"
        fill={url("tail")}
      />
      <path d="M150 366 C 205 357, 262 360, 300 381 C 340 403, 372 432, 422 461" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={2} />
      <path d="M300 381 C 340 403, 372 432, 422 461" fill="none" stroke="rgba(229,199,131,0.6)" strokeWidth={6} filter={url("soft")} className="ec-tail-light" />
    </svg>
  );
}
