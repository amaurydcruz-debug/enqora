import type { AgentKey } from "@/lib/mirror";

// Composición de la cámara MIRROR. Única fuente de verdad para el lienzo 3D (núcleo, filamentos)
// y para las etiquetas HTML de los agentes, de modo que ambos coincidan al píxel.

export const WIDE_MIN = 1020; // ancho mínimo del módulo para la composición amplia

// Disposición de los agentes alrededor del núcleo (izquierda / derecha, de arriba hacia abajo).
export const AGENT_SLOTS: { key: AgentKey; side: "left" | "right"; row: number }[] = [
  { key: "tributario", side: "left", row: 0.06 },
  { key: "investigador", side: "left", row: 0.42 },
  { key: "financiero", side: "left", row: 0.78 },
  { key: "contable", side: "right", row: 0.12 },
  { key: "legal", side: "right", row: 0.48 },
  { key: "estrategico", side: "right", row: 0.82 },
];

export const LABEL_W = 206;
export const ICON = 50;

export type AgentAnchor = { key: AgentKey; side: "left" | "right"; x: number; y: number; boxX: number; boxY: number };

export type MirrorLayout = {
  wide: boolean;
  cx: number;
  cy: number;
  r: number; // radio del núcleo en píxeles
  anchors: AgentAnchor[]; // vacío en la composición compacta
};

export function mirrorLayout(w: number, h: number, stage = false): MirrorLayout {
  // Escenario centrado (espacio de trabajo del caso): núcleo al centro, agentes en órbita.
  if (stage) {
    const r = Math.max(48, Math.min(w * 0.2, h * 0.27, 118));
    return { wide: false, cx: w / 2, cy: h * 0.4, r, anchors: [] };
  }
  const wide = w >= WIDE_MIN;
  if (!wide) {
    const r = Math.min(w * 0.23, 140);
    return { wide, cx: w / 2, cy: Math.min(h - r * 1.75, 104 + r * 1.45), r, anchors: [] };
  }
  const x0 = 300, x1 = w - 26;
  const y0 = 160, y1 = h - 262; // bajo la tarjeta del caso, sobre la banda de lectura
  const cx = (x0 + x1) / 2;
  const cy = y0 + (y1 - y0) * 0.44;
  const r = Math.min((x1 - x0 - 2 * LABEL_W) * 0.3, (y1 - y0) * 0.3, 175);
  const anchors = AGENT_SLOTS.map(({ key, side, row }) => {
    const y = y0 + (y1 - y0) * row;
    const boxX = side === "left" ? x0 + 8 : x1 - 8 - LABEL_W;
    const x = side === "left" ? boxX + LABEL_W - ICON / 2 : boxX + ICON / 2;
    return { key, side, x, y, boxX, boxY: y - ICON / 2 };
  });
  return { wide, cx, cy, r, anchors };
}
