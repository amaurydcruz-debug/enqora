"use client";

import { useEffect, useRef } from "react";
import { AGENT_KEYS, type AgentKey, type AgentState, type Phase } from "@/lib/mirror";
import { ICON, mirrorLayout } from "./layout";
import { createMirrorGL, type GLBody } from "./mirror-gl";

// ENQORA MIRROR · Cámara de inteligencia privada
// Núcleo: cristal oscuro en placas curvas con juntas de oro líquido (WebGL), luz dorada central,
// retícula y circuitos interiores, cintas de oro y datos que lo envuelven, sobre un pedestal ENQORA.
// Agentes conectados por filamentos de energía y datos. Sin dependencias; respaldo en Canvas 2D.
// Todo movimiento responde a estados reales (fase del caso y estado/tarea registrada de cada agente).

type V3 = [number, number, number];
type Props = {
  agents: Record<AgentKey, AgentState>;
  tasks: Partial<Record<AgentKey, string>>;
  phase: Phase;
  selected: AgentKey | null;
  reduced: boolean;
};

// ---------- Utilidades 3D ----------
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const scl = (v: V3, k: number): V3 => [v[0] * k, v[1] * k, v[2] * k];

function rand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// Forma ENQORA: esfera con ondulación orgánica suave y fija.
const shape = (d: V3): V3 => {
  const r = 1 + 0.028 * Math.sin(3.1 * d[0] + 1.3) * Math.sin(2.7 * d[1] - 0.4) + 0.02 * Math.sin(4.3 * d[2] + 2.1 * d[0]);
  return [d[0] * r, d[1] * r * 1.06, d[2] * r];
};

function icosphere(level: number) {
  const t = (1 + Math.sqrt(5)) / 2;
  const verts: V3[] = (
    [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t],
      [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
    ] as V3[]
  ).map(norm);
  let faces: [number, number, number][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  for (let l = 0; l < level; l++) {
    const cache = new Map<string, number>();
    const mid = (a: number, b: number) => {
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const va = verts[a], vb = verts[b];
      verts.push(norm([(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2]));
      cache.set(key, verts.length - 1);
      return verts.length - 1;
    };
    const next: [number, number, number][] = [];
    for (const [a, b, c] of faces) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  const edgeSet = new Set<string>();
  const edges: [number, number][] = [];
  for (const [a, b, c] of faces) {
    for (const [x, y] of [[a, b], [b, c], [c, a]] as [number, number][]) {
      const key = x < y ? `${x}-${y}` : `${y}-${x}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push([x, y]);
      }
    }
  }
  return { verts, faces, edges };
}

// Cuerpo de cristal para WebGL: normales suaves sobre la forma orgánica.
function crystalBody(): GLBody {
  const g = icosphere(3);
  const pos = g.verts.map(shape);
  const nor: V3[] = pos.map(() => [0, 0, 0]);
  const idx: number[] = [];
  for (const [a, b, c] of g.faces) {
    let n = cross(sub(pos[b], pos[a]), sub(pos[c], pos[a]));
    let i1 = b, i2 = c;
    if (dot(n, pos[a]) < 0) {
      n = scl(n, -1);
      i1 = c;
      i2 = b;
    }
    for (const i of [a, b, c]) nor[i] = [nor[i][0] + n[0], nor[i][1] + n[1], nor[i][2] + n[2]];
    idx.push(a, i1, i2);
  }
  return { pos: new Float32Array(pos.flat()), nor: new Float32Array(nor.map(norm).flat()), idx: new Uint16Array(idx) };
}

// Respaldo 2D: caras y aristas del cristal (icosaedro subdividido una vez).
function fallbackCrystal() {
  const g = icosphere(1);
  return {
    faces: g.faces.map(([a, b, c]) => [shape(g.verts[a]), shape(g.verts[b]), shape(g.verts[c])] as [V3, V3, V3]),
    edges: g.edges.map(([a, b]) => [shape(g.verts[a]), shape(g.verts[b])] as [V3, V3]),
  };
}

// Circuitos internos: trazos segmentados sobre una esfera interior.
function circuits(count: number) {
  const r = rand(23);
  return Array.from({ length: count }, () => {
    let p = norm([r() - 0.5, r() - 0.5, r() - 0.5]);
    const path: V3[] = [scl(p, 0.62)];
    for (let i = 0; i < 7; i++) {
      const axis = norm([r() - 0.5, r() - 0.5, r() - 0.5]);
      const ang = 0.18 + r() * 0.28;
      const c = Math.cos(ang), s = Math.sin(ang);
      const k = cross(axis, p);
      const d = dot(axis, p);
      p = norm([
        p[0] * c + k[0] * s + axis[0] * d * (1 - c),
        p[1] * c + k[1] * s + axis[1] * d * (1 - c),
        p[2] * c + k[2] * s + axis[2] * d * (1 - c),
      ]);
      path.push(scl(p, 0.62));
    }
    return { path, phase: r() * 10, speed: 0.25 + r() * 0.35 };
  });
}

function glowSprite(rgb: string, size = 64, core = 0.25) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, `rgba(${rgb},1)`);
  grd.addColorStop(core, `rgba(${rgb},0.45)`);
  grd.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return c;
}

const GOLD = "232,203,146";
const GOLD_DEEP = "198,166,107";
const BLUE = "110,165,255";
const SILVER = "217,224,234";
const GREEN = "143,209,191";
const C_GOLD = [0.91, 0.8, 0.57];
const C_GOLD_DEEP = [0.78, 0.65, 0.42];
const C_BLUE = [0.43, 0.65, 1];

const LEVEL: Record<AgentState, number> = { inactivo: 0, trabajando: 1, revision: 0.85, completado: 0.6 };

// Cintas que envuelven el núcleo: oro líquido y una de datos en azul eléctrico.
const RIBBONS = [
  { R: 1.24, tx: 0.42, tz: 0.55, k: 3, amp: 0.07, speed: 0.09, color: GOLD, data: false },
  { R: 1.34, tx: -0.62, tz: -0.3, k: 2, amp: 0.1, speed: -0.07, color: GOLD_DEEP, data: false },
  { R: 1.17, tx: 1.15, tz: 0.18, k: 4, amp: 0.05, speed: 0.12, color: BLUE, data: true },
];

export function MirrorCore({ agents, tasks, phase, selected, reduced }: Props) {
  const glRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ agents, tasks, phase, selected });
  stateRef.current = { agents, tasks, phase, selected };

  useEffect(() => {
    const canvas = canvasRef.current;
    const glCanvas = glRef.current;
    if (!canvas || !glCanvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const narrow = canvas.getBoundingClientRect().width < 640;
    glCanvas.style.display = "";
    let glr: ReturnType<typeof createMirrorGL> = null;
    try {
      glr = createMirrorGL(glCanvas, crystalBody());
    } catch {
      glr = null;
    }
    const onLost = (e: Event) => {
      e.preventDefault();
      glr = null;
      glCanvas.style.display = "none";
    };
    glCanvas.addEventListener("webglcontextlost", onLost);
    if (!glr) glCanvas.style.display = "none";
    const fb = glr ? null : fallbackCrystal();

    const cs = getComputedStyle(canvas);
    const fontBrand = cs.getPropertyValue("--font-brand").trim() || "Montserrat, system-ui, sans-serif";
    const circ = circuits(narrow ? 6 : 10);
    const lattice = icosphere(0);
    const rnd = rand(7);
    const sp = {
      gold: glowSprite(GOLD),
      goldSoft: glowSprite(GOLD_DEEP, 128, 0.12),
      blue: glowSprite(BLUE),
      silver: glowSprite(SILVER),
      green: glowSprite(GREEN),
    };

    // Fondo: estrellas tenues y luces lejanas desenfocadas (fuera del núcleo).
    const stars = Array.from({ length: narrow ? 50 : 90 }, () => ({
      x: rnd() * 2 - 1, y: rnd() * 2 - 1, d: [0.25, 0.55, 1][Math.floor(rnd() * 3)], tw: rnd() * 6.28,
    }));
    const lights = Array.from({ length: narrow ? 6 : 12 }, () => ({
      x: rnd(), y: rnd() < 0.5 ? rnd() * 0.25 : 0.72 + rnd() * 0.25, r: 10 + rnd() * 26, a: 0.04 + rnd() * 0.06, tw: rnd() * 6.28,
    }));
    const bokeh = Array.from({ length: narrow ? 3 : 6 }, () => ({
      x: rnd(), y: rnd(), r: 18 + rnd() * 34, s: 0.004 + rnd() * 0.006, a: 0.02 + rnd() * 0.03, blue: rnd() > 0.6,
    }));
    const chords = Array.from({ length: narrow ? 14 : 26 }, () => {
      const a = norm([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]);
      const b = norm([-a[0] + (rnd() - 0.5) * 0.9, -a[1] + (rnd() - 0.5) * 0.9, -a[2] + (rnd() - 0.5) * 0.9]);
      return { a: scl(a, 0.92), b: scl(b, 0.92), t: rnd(), speed: 0.12 + rnd() * 0.2 };
    });
    const rays = Array.from({ length: narrow ? 10 : 16 }, () => scl(norm([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]), 0.5 + rnd() * 0.3));
    const sparks = RIBBONS.map(() => Array.from({ length: narrow ? 3 : 5 }, () => ({ t: rnd() * Math.PI * 2, s: 0.5 + rnd() * 0.6 })));
    const panelSeed = AGENT_KEYS.map(() => Array.from({ length: 4 }, () => 0.35 + rnd() * 0.6));
    const pulses: { agent: number; t: number; speed: number }[] = [];
    const lvl = AGENT_KEYS.map(() => 0);
    const reveal = AGENT_KEYS.map(() => 0);
    const ribbonPhase = RIBBONS.map(() => 0);

    let w = 0, h = 0, dpr = 1, raf = 0, running = true, visible = true;
    const start = performance.now();
    let last = start;
    let calm = 0, energySm = 0.4, revSm = 0, first = true;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      glr?.resize(w, h, Math.min(dpr, w < 640 ? 1.5 : 2));
    };

    const frame = (now: number, still = false) => {
      const { agents: ag, phase: ph } = stateRef.current;
      const dt = still ? 1 : Math.min((now - last) / 1000, 0.05);
      last = now;
      const time = (now - start) / 1000;
      const settle = (cur: number, target: number, rate: number) => (still || first ? target : cur + (target - cur) * Math.min(1, dt * rate));

      const anyWorking = AGENT_KEYS.some((k) => ag[k] === "trabajando");
      calm = settle(calm, ph === "listo" || ph === "cerrado" ? 1 : 0, 0.7);
      energySm = settle(energySm, ph === "espera" ? 0.25 : anyWorking ? 1 : ph === "revision" ? 0.55 : 0.35, 1.2);
      revSm = settle(revSm, AGENT_KEYS.some((k) => ag[k] === "revision") ? 1 : 0, 1);
      AGENT_KEYS.forEach((k, i) => {
        lvl[i] = settle(lvl[i], LEVEL[ag[k]], 1.4);
        reveal[i] = settle(reveal[i], ag[k] === "inactivo" ? 0.0 : 1, 0.75);
      });
      first = false;
      const energy = energySm;

      const L = mirrorLayout(w, h);
      const intro = reduced ? 1 : 1 - Math.pow(1 - Math.min(1, time / 2.4), 3);
      const cx = L.cx, cy = L.cy;
      const scale = L.r * (0.92 + 0.08 * intro);
      const yaw = time * (0.05 + 0.07 * energy) * (1 - calm * 0.6) + 0.4;
      const pitch = -0.28 + Math.sin(time * 0.12) * 0.04;
      const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), spn = Math.sin(pitch);
      const cam = 5.5;
      const kShape = 1 - calm * 0.05;
      const la = time * 0.06;
      const light = norm([-0.55 * Math.cos(la) - 0.45 * Math.sin(la), -0.75, 0.55 * Math.sin(la) - 0.45 * Math.cos(la)]);

      // Pedestal ENQORA
      const pTop = cy + scale * 1.0;
      const pH = scale * 0.34;
      const pRx = scale * 0.92;
      const stepH = scale * 0.07;
      const floorY = pTop + pH + stepH;

      const rot = (v: V3): V3 => {
        const x1 = v[0] * cyw + v[2] * syw;
        const z1 = -v[0] * syw + v[2] * cyw;
        return [x1, v[1] * cp - z1 * spn, v[1] * spn + z1 * cp];
      };
      const proj = (r: V3) => {
        const f = cam / (cam + r[2]);
        return { x: cx + r[0] * f * scale, y: cy + r[1] * f * scale, z: r[2], f };
      };
      const project = (v: V3) => proj(rot(scl(v, kShape)));

      // ---- Interior (espacio del objeto)
      type Mark = { a: V3; b?: V3; c: number[]; al: number; al2?: number; s: number };
      const lines: Mark[] = [];
      const points: Mark[] = [];
      const ly = -time * 0.11 * (1 - calm * 0.7), lc = Math.cos(ly), ls = Math.sin(ly);
      const latticePt = (v: V3): V3 => {
        const x = v[0] * 0.34, y = v[1] * 0.34, z = v[2] * 0.34;
        const x1 = x * lc + z * ls, z1 = -x * ls + z * lc;
        return [x1, y * 0.94 - z1 * 0.34, y * 0.34 + z1 * 0.94];
      };
      const lp = lattice.verts.map(latticePt);
      for (const [a, b] of lattice.edges) lines.push({ a: lp[a], b: lp[b], c: C_GOLD, al: 0.3 + 0.3 * energy, s: 1 });
      for (const v of lp) points.push({ a: v, c: C_GOLD, al: 0.55 + 0.3 * energy, s: 5 });
      // filamentos de luz que irradian desde el centro (circuitos que atraviesan el interior)
      for (const v of rays) lines.push({ a: [0, 0, 0], b: v, c: C_GOLD, al: 0.5 * (0.4 + 0.6 * energy), al2: 0, s: 1 });
      for (const c of circ) {
        for (let i = 0; i < c.path.length - 1; i++) lines.push({ a: c.path[i], b: c.path[i + 1], c: C_GOLD_DEEP, al: 0.16 + 0.24 * energy, s: 1 });
        for (const p of c.path) points.push({ a: p, c: C_GOLD, al: 0.25 + 0.3 * energy, s: 3 });
        if (energy > 0.3) {
          const seg = ((time * c.speed * (0.4 + energy) + c.phase) % 1) * (c.path.length - 1);
          const i0 = Math.floor(seg), tt = seg - i0;
          const a = c.path[i0], b = c.path[Math.min(i0 + 1, c.path.length - 1)];
          points.push({ a: [a[0] + (b[0] - a[0]) * tt, a[1] + (b[1] - a[1]) * tt, a[2] + (b[2] - a[2]) * tt], c: C_GOLD, al: 0.9 * energy, s: 12 });
        }
      }
      const flowSpeed = (0.15 + energy * 0.85) * (1 - calm * 0.85);
      for (const ch of chords) {
        if (!still) ch.t = (ch.t + ch.speed * flowSpeed * dt) % 1;
        const v: V3 = [ch.a[0] + (ch.b[0] - ch.a[0]) * ch.t, ch.a[1] + (ch.b[1] - ch.a[1]) * ch.t, ch.a[2] + (ch.b[2] - ch.a[2]) * ch.t];
        points.push({ a: v, c: C_BLUE, al: (0.3 + 0.6 * energy) * Math.sin(Math.PI * ch.t) * (1 - calm * 0.6), s: 7 });
      }
      const coreR = scale * (0.5 + 0.03 * Math.sin(time * (0.8 + energy))) * (1 + calm * 0.12);
      const coreA = (0.5 + 0.35 * energy + 0.1 * calm) * intro;

      // ---- Capa WebGL
      if (glr) {
        const marks = new Float32Array((lines.length * 2 + points.length) * 8);
        let o = 0;
        const put = (p: V3, m: Mark, al: number) => {
          marks.set([p[0], p[1], p[2], m.c[0], m.c[1], m.c[2], Math.max(0, Math.min(1, al)), m.s], o);
          o += 8;
        };
        for (const m of lines) {
          put(m.a, m, m.al);
          put(m.b!, m, m.al2 ?? m.al);
        }
        for (const m of points) put(m.a, m, m.al);
        glr.render({
          w, h, dpr: Math.min(dpr, w < 640 ? 1.5 : 2), cx, cy, scale, cam, k: kShape,
          rot: new Float32Array([cyw, syw * spn, -syw * cp, 0, cp, spn, syw, -cyw * spn, cyw * cp]),
          light, time, energy, calm, rev: revSm, marks, lineVerts: lines.length * 2, pointVerts: points.length, coreR, coreA, floorY,
        });
      }

      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      // ---- Fondo: luces lejanas y estrellas fuera del núcleo
      for (const l of lights) {
        const x = l.x * w, y = l.y * h;
        ctx.globalAlpha = l.a * (0.8 + 0.2 * Math.sin(time * 0.4 + l.tw)) * intro;
        ctx.drawImage(sp.goldSoft, x - l.r, y - l.r, l.r * 2, l.r * 2);
      }
      ctx.globalAlpha = 1;
      for (const s of stars) {
        const px = cx + s.x * w * 0.62 - Math.sin(yaw) * 14 * s.d;
        const py = cy + s.y * h * 0.62;
        if (Math.hypot(px - cx, py - cy) < scale * 1.5 || py > floorY) continue;
        const a = (0.05 + 0.14 * s.d) * (0.7 + 0.3 * Math.sin(time * 0.6 + s.tw)) * intro;
        ctx.fillStyle = `rgba(${SILVER},${a.toFixed(3)})`;
        const sz = 0.6 + s.d * 0.8;
        ctx.fillRect(px, py, sz, sz);
      }

      // ---- Sin WebGL: cámara y cristal en Canvas 2D
      if (fb) {
        ctx.globalAlpha = 0.14 + 0.08 * energy;
        const atm = scale * 3;
        ctx.drawImage(sp.goldSoft, cx - atm, cy - atm, atm * 2, atm * 2);
        ctx.globalAlpha = 1;
        const faces = fb.faces
          .map((f) => {
            const r = f.map((v) => rot(scl(v, kShape))) as [V3, V3, V3];
            const n = norm(cross(sub(r[1], r[0]), sub(r[2], r[0])));
            const out = dot(n, r[0]) < 0 ? scl(n, -1) : n;
            return { p: r.map(proj), n: out, z: (r[0][2] + r[1][2] + r[2][2]) / 3, facing: out[2] < 0 };
          })
          .sort((m, n) => n.z - m.z);
        const drawFace = (fd: (typeof faces)[number]) => {
          const diff = Math.max(0, -dot(fd.n, light));
          const spec = Math.pow(diff, 14);
          ctx.globalCompositeOperation = "source-over";
          const r = Math.round(10 + 34 * diff + 110 * spec), g = Math.round(18 + 40 * diff + 95 * spec), b = Math.round(34 + 64 * diff + 70 * spec);
          ctx.fillStyle = `rgba(${r},${g},${b},${fd.facing ? 0.36 : 0.62})`;
          ctx.beginPath();
          ctx.moveTo(fd.p[0].x, fd.p[0].y);
          ctx.lineTo(fd.p[1].x, fd.p[1].y);
          ctx.lineTo(fd.p[2].x, fd.p[2].y);
          ctx.closePath();
          ctx.fill();
        };
        for (const fd of faces) if (!fd.facing) drawFace(fd);
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = Math.min(1, coreA * 1.4);
        ctx.drawImage(sp.goldSoft, cx - coreR * 2, cy - coreR * 2, coreR * 4, coreR * 4);
        ctx.drawImage(sp.gold, cx - coreR * 0.5, cy - coreR * 0.5, coreR, coreR);
        ctx.globalAlpha = 1;
        const rgb = (c: number[]) => c.map((x) => Math.round(x * 255)).join(",");
        ctx.lineWidth = 0.9;
        for (const m of lines) {
          const a = project(m.a), b = project(m.b!);
          ctx.strokeStyle = `rgba(${rgb(m.c)},${m.al.toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        for (const m of points) {
          const p = project(m.a);
          const s = m.s * 0.5 * p.f;
          ctx.globalAlpha = Math.max(0, Math.min(1, m.al));
          ctx.drawImage(m.c === C_BLUE ? sp.blue : sp.gold, p.x - s, p.y - s, s * 2, s * 2);
        }
        ctx.globalAlpha = 1;
        for (const fd of faces) if (fd.facing) drawFace(fd);
        ctx.globalCompositeOperation = "source-over";
        for (const [a, b] of fb.edges) {
          const pa = project(a), pb = project(b);
          const front = Math.min(1, Math.max(0, 0.5 - (pa.z + pb.z) / 2));
          ctx.strokeStyle = `rgba(214,182,120,${(0.15 + 0.55 * front).toFixed(3)})`;
          ctx.lineWidth = 0.5 + front;
          ctx.beginPath();
          ctx.moveTo(pa.x, pa.y);
          ctx.lineTo(pb.x, pb.y);
          ctx.stroke();
        }
        ctx.globalCompositeOperation = "lighter";
      }

      // ---- Cintas que envuelven el núcleo (oro líquido y datos)
      const ribbonPoint = (ri: number, th: number, strand: number): V3 => {
        const rb = RIBBONS[ri];
        const R = (rb.R + strand * 0.016) * (1 - calm * 0.06);
        const y0 = Math.sin(rb.k * th + strand * 0.35 + ribbonPhase[ri] * 0.5) * rb.amp;
        let v: V3 = [Math.cos(th) * R, y0, Math.sin(th) * R];
        const cx1 = Math.cos(rb.tx), sx1 = Math.sin(rb.tx);
        v = [v[0], v[1] * cx1 - v[2] * sx1, v[1] * sx1 + v[2] * cx1];
        const cz = Math.cos(rb.tz), sz = Math.sin(rb.tz);
        return [v[0] * cz - v[1] * sz, v[0] * sz + v[1] * cz, v[2]];
      };
      const strands = narrow ? 3 : 4;
      const drawRibbons = (front: boolean) => {
        const life = (0.25 + 0.55 * energy) * (1 - calm * 0.45) * intro;
        RIBBONS.forEach((rb, ri) => {
          if (!still && !front) ribbonPhase[ri] += rb.speed * dt * (0.3 + energy);
          const head = ribbonPhase[ri] * 4;
          for (let s = 0; s < strands; s++) {
            const N = narrow ? 64 : 96;
            const pts = Array.from({ length: N + 1 }, (_, i) => {
              const th = (i / N) * Math.PI * 2 + ribbonPhase[ri];
              const r = rot(ribbonPoint(ri, th, s - (strands - 1) / 2));
              return { ...proj(r), th };
            });
            for (let i = 0; i < N; i += 4) {
              const a = pts[i], b = pts[Math.min(i + 4, N)];
              const isFront = (a.z + b.z) / 2 < 0;
              if (isFront !== front) continue;
              const dh = Math.abs(((a.th - ribbonPhase[ri] - head) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
              const hl = Math.exp(-dh * dh * 1.6) * energy;
              const al = life * (front ? 0.5 : 0.14) * (1 - Math.abs(s - (strands - 1) / 2) * 0.22) * (1 + hl * 1.6);
              ctx.strokeStyle = `rgba(${rb.color},${Math.min(1, al).toFixed(3)})`;
              ctx.lineWidth = front ? 0.9 + hl * 0.8 : 0.6;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              for (let j = i + 1; j <= Math.min(i + 4, N); j++) ctx.lineTo(pts[j].x, pts[j].y);
              ctx.stroke();
            }
          }
          // partículas de datos que viajan por las cintas
          if (energy > 0.3) {
            for (const sk of sparks[ri]) {
              if (!still && !front) sk.t += sk.s * dt * (0.4 + energy) * Math.sign(rb.speed);
              const r = rot(ribbonPoint(ri, sk.t, 0));
              if ((r[2] < 0) !== front) continue;
              const p = proj(r);
              const sz = (rb.data ? 5 : 4) * p.f;
              ctx.globalAlpha = (front ? 0.9 : 0.3) * energy * intro;
              ctx.drawImage(rb.data ? sp.blue : sp.gold, p.x - sz, p.y - sz, sz * 2, sz * 2);
              ctx.globalAlpha = 1;
            }
          }
        });
      };
      drawRibbons(false);

      // ---- Pedestal ENQORA: anillos metálicos, base y nombre
      ctx.globalCompositeOperation = "source-over";
      const ringMax = L.wide ? 3.3 : Math.min(3.3, (w * 0.48) / scale);
      [1.45, 1.95, 2.6, 3.3].forEach((k, i) => {
        if (k > ringMax) return;
        const rx = scale * k, ry = rx * 0.13;
        ctx.strokeStyle = `rgba(198,166,107,${((0.32 - i * 0.06) * intro).toFixed(3)})`;
        ctx.lineWidth = i === 0 ? 1.2 : 0.8;
        ctx.beginPath();
        ctx.ellipse(cx, floorY, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        if (energy > 0.3) {
          const a0 = time * 0.25 * (i % 2 ? -1 : 1) + i;
          ctx.strokeStyle = `rgba(${GOLD},${(0.55 * energy * intro).toFixed(3)})`;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.ellipse(cx, floorY, rx, ry, 0, a0, a0 + 0.5);
          ctx.stroke();
        }
      });
      // reflejo cálido en el piso
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = (0.22 + 0.12 * energy) * intro;
      ctx.drawImage(sp.goldSoft, cx - scale * 1.8, floorY - scale * 0.32, scale * 3.6, scale * 0.64);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      // escalón base
      const ry = (rx: number) => rx * 0.17;
      const stepRx = pRx * 1.22;
      ctx.fillStyle = "rgba(10,15,24,0.96)";
      ctx.beginPath();
      ctx.ellipse(cx, floorY, stepRx, ry(stepRx), 0, 0, Math.PI);
      ctx.lineTo(cx - stepRx, floorY - stepH);
      ctx.ellipse(cx, floorY - stepH, stepRx, ry(stepRx), 0, Math.PI, 0, true);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(198,166,107,0.55)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx, floorY - stepH, stepRx, ry(stepRx), 0, 0, Math.PI * 2);
      ctx.stroke();
      // cuerpo del pedestal: metal oscuro con brillo lateral
      const body = ctx.createLinearGradient(cx - pRx, 0, cx + pRx, 0);
      body.addColorStop(0, "#05080e");
      body.addColorStop(0.28, "#111a2a");
      body.addColorStop(0.5, "#1a2538");
      body.addColorStop(0.72, "#0f1726");
      body.addColorStop(1, "#05080e");
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(cx, pTop + pH, pRx, ry(pRx), 0, 0, Math.PI);
      ctx.lineTo(cx - pRx, pTop);
      ctx.ellipse(cx, pTop, pRx, ry(pRx), 0, Math.PI, 0, true);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(232,203,146,0.55)";
      ctx.beginPath();
      ctx.ellipse(cx, pTop + pH, pRx, ry(pRx), 0, 0, Math.PI);
      ctx.stroke();
      // cara superior: cuna donde se apoya el núcleo
      const top = ctx.createRadialGradient(cx, pTop, 0, cx, pTop, pRx);
      top.addColorStop(0, `rgba(232,203,146,${(0.35 * intro).toFixed(3)})`);
      top.addColorStop(0.55, "rgba(30,38,54,0.92)");
      top.addColorStop(1, "rgba(14,20,32,0.95)");
      ctx.fillStyle = top;
      ctx.beginPath();
      ctx.ellipse(cx, pTop, pRx, ry(pRx), 0, 0, Math.PI * 2);
      ctx.fill();
      const rim = ctx.createLinearGradient(cx - pRx, 0, cx + pRx, 0);
      rim.addColorStop(0, "rgba(140,107,53,0.6)");
      rim.addColorStop(0.5, "rgba(243,223,168,0.95)");
      rim.addColorStop(1, "rgba(140,107,53,0.6)");
      ctx.strokeStyle = rim;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(cx, pTop, pRx, ry(pRx), 0, 0, Math.PI * 2);
      ctx.stroke();
      // nombre ENQORA en oro metálico
      const fs = Math.max(13, scale * 0.19);
      ctx.font = `600 ${fs.toFixed(1)}px ${fontBrand}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const ctxLS = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
      if ("letterSpacing" in ctxLS) ctxLS.letterSpacing = `${(fs * 0.22).toFixed(1)}px`;
      const tg = ctx.createLinearGradient(0, pTop + pH * 0.3, 0, pTop + pH * 0.9);
      tg.addColorStop(0, "#f3dfa8");
      tg.addColorStop(0.55, "#c6a66b");
      tg.addColorStop(1, "#8c6b35");
      ctx.fillStyle = tg;
      ctx.shadowColor = `rgba(232,203,146,${(0.45 * intro).toFixed(3)})`;
      ctx.shadowBlur = 12;
      ctx.fillText("ENQORA", cx + fs * 0.11, pTop + pH * 0.62);
      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";
      if ("letterSpacing" in ctxLS) ctxLS.letterSpacing = "0px";

      ctx.globalCompositeOperation = "lighter";
      drawRibbons(true);

      // ---- Agentes: posiciones (composición amplia: junto a su etiqueta; compacta: en órbita)
      type AP = { key: AgentKey; i: number; x: number; y: number; sx: number; sy: number; ex: number; ey: number; side: number };
      const agentPos: AP[] = AGENT_KEYS.map((k, i) => {
        const an = L.anchors.find((a) => a.key === k);
        let x: number, y: number, side: number;
        if (an) {
          x = an.x;
          y = an.y;
          side = an.side === "left" ? 1 : -1;
        } else {
          const ang = (i / AGENT_KEYS.length) * Math.PI * 2 + time * 0.03 * (1 - calm * 0.8) + 0.3;
          const p = proj(rot([Math.cos(ang) * 1.75, Math.sin(ang * 2 + i * 1.3) * 0.22 - 0.1, Math.sin(ang) * 0.9]));
          x = p.x;
          y = p.y;
          side = x < cx ? 1 : -1;
        }
        const sx = an ? x + side * (ICON / 2 + 4) : x;
        const dir = norm([sx - cx, y - cy, 0]);
        const ex = cx + dir[0] * scale * 0.9, ey = cy + dir[1] * scale * 0.9;
        return { key: k, i, x, y, sx, sy: y, ex, ey, side };
      });

      // Filamento de energía y datos: curva agente → núcleo
      const fil = (a: AP, t: number, off: number) => {
        const dx = a.ex - a.sx;
        const c1x = a.sx + dx * 0.45, c1y = a.sy;
        const c2x = a.ex - (a.ex - cx) * 0.55, c2y = a.ey - (a.ey - cy) * 0.55 + (a.sy - a.ey) * 0.1;
        const u = 1 - t;
        const x = u * u * u * a.sx + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * a.ex;
        const y = u * u * u * a.sy + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * a.ey;
        // desplazamiento perpendicular (cinta trenzada, unida en los extremos)
        const tx = 3 * u * u * (c1x - a.sx) + 6 * u * t * (c2x - c1x) + 3 * t * t * (a.ex - c2x);
        const ty = 3 * u * u * (c1y - a.sy) + 6 * u * t * (c2y - c1y) + 3 * t * t * (a.ey - c2y);
        const l = Math.hypot(tx, ty) || 1;
        return { x: x + (-ty / l) * off, y: y + (tx / l) * off };
      };

      if (!still) {
        for (const a of agentPos) {
          if (ag[a.key] === "trabajando" && reveal[a.i] > 0.95 && Math.random() < dt * 4) pulses.push({ agent: a.i, t: 0, speed: 0.35 + Math.random() * 0.2 });
        }
      }

      for (const a of agentPos) {
        const st = ag[a.key];
        const rv = st === "inactivo" ? 1 : reveal[a.i];
        const n = st === "trabajando" ? 5 : st === "inactivo" ? 1 : 3;
        const strong = st === "inactivo" ? 0.12 : (st === "trabajando" ? 1 : st === "revision" ? 0.85 : 0.55) * (0.3 + 0.7 * lvl[a.i]);
        const wave = still ? 0 : time * (st === "trabajando" ? 1.6 : 0.4);
        ctx.setLineDash(st === "revision" ? [3, 5] : []);
        for (let s = 0; s < n; s++) {
          const color = st === "completado" ? (s === 1 ? GREEN : SILVER) : st === "inactivo" ? SILVER : st === "trabajando" && s === n - 1 ? BLUE : GOLD;
          ctx.strokeStyle = `rgba(${color},${((s === Math.floor(n / 2) ? 0.6 : 0.3) * strong * intro).toFixed(3)})`;
          ctx.lineWidth = s === Math.floor(n / 2) ? 1.2 : 0.8;
          ctx.beginPath();
          const M = 40;
          for (let j = 0; j <= M; j++) {
            const t = (j / M) * rv;
            const off = (s - (n - 1) / 2) * 2.6 * Math.sin(Math.PI * t) * (1 + 0.5 * Math.sin(t * 9 + wave + s));
            const p = fil(a, t, off);
            if (j) ctx.lineTo(p.x, p.y);
            else ctx.moveTo(p.x, p.y);
          }
          ctx.stroke();
        }
        ctx.setLineDash([]);
        // haz ancho y tenue: volumen del filamento
        if (st !== "inactivo") {
          ctx.strokeStyle = `rgba(${st === "completado" ? SILVER : GOLD},${(0.05 * strong * intro).toFixed(3)})`;
          ctx.lineWidth = 9;
          ctx.beginPath();
          for (let j = 0; j <= 30; j++) {
            const p = fil(a, (j / 30) * rv, 0);
            if (j) ctx.lineTo(p.x, p.y);
            else ctx.moveTo(p.x, p.y);
          }
          ctx.stroke();
        }
      }

      // Paneles holográficos: solo junto a agentes con una tarea registrada en curso
      if (L.wide) {
        for (const a of agentPos) {
          if (ag[a.key] !== "trabajando" || reveal[a.i] < 0.9) continue;
          const p = fil(a, 0.42, 0);
          const fy = still ? 0 : Math.sin(time * 0.8 + a.i) * 3;
          const pw = 46, ph2 = 34;
          ctx.save();
          ctx.globalCompositeOperation = "source-over";
          ctx.transform(1, a.side * -0.12, 0, 1, p.x - pw / 2, p.y - 46 + fy);
          ctx.fillStyle = "rgba(24,48,92,0.28)";
          ctx.fillRect(0, 0, pw, ph2);
          ctx.strokeStyle = `rgba(150,190,255,${(0.5 * intro).toFixed(3)})`;
          ctx.lineWidth = 0.8;
          ctx.strokeRect(0, 0, pw, ph2);
          ctx.fillStyle = "rgba(232,203,146,0.75)";
          ctx.fillRect(5, 5, 18, 2);
          ctx.fillStyle = "rgba(217,224,234,0.45)";
          panelSeed[a.i].forEach((lw, j) => ctx.fillRect(5, 11 + j * 5, (pw - 10) * lw, 1.5));
          ctx.restore();
          ctx.globalCompositeOperation = "lighter";
        }
      }

      // Pulsos de datos hacia el núcleo
      for (let i = pulses.length - 1; i >= 0; i--) {
        const pl = pulses[i];
        pl.t += pl.speed * dt;
        const a = agentPos[pl.agent];
        if (pl.t >= 1 || ag[a.key] !== "trabajando") {
          pulses.splice(i, 1);
          continue;
        }
        const p = fil(a, pl.t, 0);
        const s = 7;
        ctx.globalAlpha = 0.95 * Math.sin(Math.PI * pl.t);
        ctx.drawImage(pl.t < 0.55 ? sp.gold : sp.blue, p.x - s, p.y - s, s * 2, s * 2);
      }
      ctx.globalAlpha = 1;

      // Nodos de agentes
      for (const a of agentPos) {
        const st = ag[a.key];
        const Lv = lvl[a.i];
        const isSel = stateRef.current.selected === a.key;
        const halo = st === "completado" ? sp.green : st === "inactivo" ? sp.silver : sp.gold;
        if (L.wide) {
          // halo y anillo alrededor del icono HTML
          const R = ICON / 2 + 6;
          ctx.globalAlpha = (0.12 + 0.4 * Lv) * (st === "trabajando" ? 0.85 + 0.15 * Math.sin(time * 2.4 + a.i) : 1) * intro;
          ctx.drawImage(halo, a.x - R * 1.6, a.y - R * 1.6, R * 3.2, R * 3.2);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = "source-over";
          ctx.strokeStyle = `rgba(${st === "completado" ? GREEN : st === "inactivo" ? SILVER : GOLD},${((0.15 + 0.5 * Lv) * intro).toFixed(3)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(a.x, a.y, R, 0, Math.PI * 2);
          ctx.stroke();
          if (st === "trabajando") {
            const a0 = still ? 0.6 : time * 1.2 + a.i;
            ctx.strokeStyle = `rgba(${GOLD},0.9)`;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(a.x, a.y, R, a0, a0 + 1.1);
            ctx.stroke();
          }
          if (st === "revision") {
            const k = still ? 0.4 : (time * 0.6 + a.i * 0.3) % 1;
            ctx.strokeStyle = `rgba(${GOLD},${(0.7 * (1 - k)).toFixed(3)})`;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(a.x, a.y, R + 12 * k, 0, Math.PI * 2);
            ctx.stroke();
          }
          if (isSel) {
            ctx.strokeStyle = `rgba(${SILVER},0.7)`;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.arc(a.x, a.y, R + 6, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.globalCompositeOperation = "lighter";
        } else {
          // composición compacta: nodo luminoso en órbita
          const R = 7 + 5 * Lv;
          ctx.globalAlpha = (0.25 + 0.6 * Lv) * intro;
          ctx.drawImage(halo, a.x - R * 2, a.y - R * 2, R * 4, R * 4);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = "source-over";
          ctx.fillStyle = st === "inactivo" ? "rgba(60,74,98,0.9)" : st === "completado" ? "rgba(200,230,222,0.95)" : "rgba(243,223,168,0.95)";
          ctx.beginPath();
          ctx.moveTo(a.x, a.y - 5);
          ctx.lineTo(a.x + 3.5, a.y);
          ctx.lineTo(a.x, a.y + 5);
          ctx.lineTo(a.x - 3.5, a.y);
          ctx.closePath();
          ctx.fill();
          if (st === "revision" || isSel) {
            ctx.strokeStyle = `rgba(${isSel ? SILVER : GOLD},0.8)`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(a.x, a.y, 10, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.globalCompositeOperation = "lighter";
        }
      }

      // ---- Primer plano: partículas desenfocadas
      for (const b of bokeh) {
        if (!still) b.y = (b.y - b.s * dt + 1) % 1;
        const x = b.x * w - Math.sin(yaw) * 30, y = b.y * h;
        if (Math.hypot(x - cx, y - cy) < scale * 1.4) continue;
        ctx.globalAlpha = b.a * intro;
        ctx.drawImage(b.blue ? sp.blue : sp.goldSoft, x - b.r, y - b.r, b.r * 2, b.r * 2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };

    resize();
    const redraw = () => frame(start + 6000, true);
    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) redraw();
    });
    ro.observe(canvas);
    canvas.addEventListener("enq-redraw", redraw);

    const loop = (now: number) => {
      if (running && visible) frame(now);
      raf = requestAnimationFrame(loop);
    };
    if (reduced) redraw();
    else raf = requestAnimationFrame(loop);

    const io = new IntersectionObserver(([entry]) => {
      running = entry.isIntersecting;
    });
    io.observe(canvas);
    const onVis = () => {
      visible = document.visibilityState === "visible";
      last = performance.now();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("enq-redraw", redraw);
      glCanvas.removeEventListener("webglcontextlost", onLost);
      glr?.dispose();
    };
  }, [reduced]);

  // Movimiento reducido: redibujar un cuadro fijo cuando cambia el estado real.
  useEffect(() => {
    if (reduced) canvasRef.current?.dispatchEvent(new Event("enq-redraw"));
  }, [reduced, agents, tasks, phase, selected]);

  return (
    <>
      <canvas ref={glRef} className="mirror-canvas mirror-gl" aria-hidden="true" />
      <canvas ref={canvasRef} className="mirror-canvas" aria-hidden="true" />
    </>
  );
}
