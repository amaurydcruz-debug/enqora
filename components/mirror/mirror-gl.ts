// ENQORA MIRROR · capa WebGL del núcleo (sin dependencias).
// Dibuja la cámara (luz volumétrica, columnas, piso), el cristal oscuro en placas con juntas de oro líquido,
// la luz dorada central y el interior (retícula, circuitos y flujos de datos) en 3D real.
// Si el dispositivo no soporta WebGL, mirror-core.tsx usa su versión en Canvas 2D.

export type GLBody = { pos: Float32Array; nor: Float32Array; idx: Uint16Array };

export type GLFrame = {
  w: number;
  h: number;
  dpr: number;
  cx: number;
  cy: number;
  scale: number;
  cam: number;
  k: number;
  rot: Float32Array; // mat3 en orden de columnas
  light: [number, number, number];
  time: number;
  energy: number;
  calm: number;
  rev: number;
  marks: Float32Array; // [x,y,z, r,g,b,a, size] por vértice
  lineVerts: number; // primeros N vértices: líneas
  pointVerts: number; // siguientes N vértices: puntos
  coreR: number;
  coreA: number;
  floorY: number;
};

// Misma precisión en vértice y fragmento (los uniformes compartidos deben coincidir).
const PREC = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

const QUAD_VS = `attribute vec2 aQ; void main(){ gl_Position = vec4(aQ, 0.0, 1.0); }`;

// Cámara privada: neblina azul noche, haz de luz superior, columnas de luz arquitectónicas,
// piso con reflejo dorado bajo el pedestal y viñeta. Sutil: el vacío también es lujo.
const BG_FS = `${PREC}
uniform vec2 uRes; uniform vec2 uC; uniform float uS; uniform float uT; uniform float uE; uniform float uCalm; uniform float uFloor;
void main(){
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 d = (p - uC) / uS;
  float r = length(d);
  vec3 space = vec3(0.020, 0.031, 0.055);
  vec3 night = vec3(0.063, 0.106, 0.176);
  vec3 gold = vec3(0.776, 0.651, 0.420);
  vec3 col = mix(space, night, exp(-r * 0.42) * 0.85);
  float life = (0.45 + 0.55 * uE) * (1.0 - uCalm * 0.3);
  // haz de luz que cae sobre el núcleo
  float bx = (p.x - uC.x) / (uS * 1.1);
  col += vec3(0.50, 0.64, 0.90) * exp(-bx * bx * 1.4) * smoothstep(uC.y, 0.0, p.y) * 0.09;
  // columnas de luz verticales (arquitectura de la cámara)
  float u = abs(p.x - uRes.x * 0.5) / uRes.x;
  float cols = 0.0;
  for (int i = 0; i < 4; i++) {
    float cxv = 0.20 + float(i) * 0.085;
    float wv = 0.0018 + 0.0012 * float(i);
    cols += exp(-pow((u - cxv) / wv, 2.0)) * (0.55 - 0.1 * float(i));
  }
  float vy = p.y / uRes.y;
  cols *= smoothstep(0.02, 0.3, vy) * (1.0 - smoothstep(0.55, 0.95, vy));
  col += mix(gold, vec3(0.7, 0.8, 1.0), 0.45) * cols * 0.07;
  // halo dorado contenido alrededor del núcleo
  col += gold * (exp(-r * r * 0.5) * 0.16 + exp(-r * 0.9) * 0.05) * life;
  // piso: reflejo del núcleo y del pedestal
  float fy = (p.y - uFloor) / uS;
  if (fy > 0.0) {
    col = mix(col, space, smoothstep(0.0, 2.0, fy) * 0.45);
    vec2 q = vec2(d.x * 0.32, fy * 1.6);
    col += gold * exp(-dot(q, q)) * 0.10 * (0.6 + 0.4 * uE);
    col += vec3(0.8, 0.85, 1.0) * exp(-fy * fy * 40.0) * exp(-d.x * d.x * 0.05) * 0.03;
  }
  vec2 uv = p / uRes - 0.5;
  col *= 1.0 - dot(uv, uv) * 0.9;
  gl_FragColor = vec4(col, 1.0);
}`;

// Luz dorada cálida en el centro: núcleo brillante y destello fino, controlado (no explosión).
const GLOW_FS = `${PREC}
uniform vec2 uRes; uniform vec2 uC; uniform float uR; uniform float uA; uniform float uT;
void main(){
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 dv = (p - uC) / uR;
  float d = length(dv);
  float ang = atan(dv.y, dv.x);
  float a = exp(-d * d * 2.0) * 0.6 + exp(-d * 4.0) * 0.5 + exp(-d * 14.0) * 0.8;
  float star = pow(abs(cos(ang * 3.0 + uT * 0.05)), 70.0) + 0.6 * pow(abs(cos(ang * 5.0 - uT * 0.035 + 0.4)), 90.0);
  a += star * exp(-d * 2.4) * 0.45;
  a *= uA;
  vec3 col = mix(vec3(0.91, 0.74, 0.45), vec3(1.0, 0.95, 0.85), exp(-d * 5.0));
  gl_FragColor = vec4(col * a, a);
}`;

const BODY_VS = `${PREC}attribute vec3 aPos; attribute vec3 aNor;
uniform mat3 uRot; uniform vec2 uC; uniform vec2 uRes; uniform float uS; uniform float uCam; uniform float uK;
varying vec3 vN; varying vec3 vP; varying vec3 vO;
void main(){
  vec3 r = uRot * (aPos * uK);
  float f = uCam / (uCam + r.z);
  vec2 px = uC + r.xy * f * uS;
  gl_Position = vec4(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0, 0.0, 1.0);
  vN = aNor; vP = r; vO = aPos;
}`;

// Cristal oscuro en placas curvas (celdas): cada placa refleja la cámara con su propia inclinación,
// las juntas son filamentos de oro líquido por donde corre la luz cuando hay trabajo real.
const BODY_FS = `${PREC}
varying vec3 vN; varying vec3 vP; varying vec3 vO;
uniform mat3 uRot; uniform float uCam; uniform float uPass; uniform float uE; uniform float uCalm; uniform float uRev; uniform float uT; uniform vec3 uL;
vec3 hash3(vec3 q){
  q = vec3(dot(q, vec3(127.1, 311.7, 74.7)), dot(q, vec3(269.5, 183.3, 246.1)), dot(q, vec3(113.5, 271.9, 124.6)));
  return fract(sin(q) * 43758.5453);
}
vec3 envf(vec3 R){
  float up = -R.y;
  vec3 c = mix(vec3(0.015, 0.025, 0.05), vec3(0.08, 0.13, 0.24), smoothstep(-0.3, 0.8, up));
  c += vec3(0.95, 0.78, 0.52) * pow(max(0.0, 1.0 - abs(up + 0.12) * 5.0), 3.0) * 0.55;
  c += vec3(0.85, 0.9, 1.0) * pow(max(dot(R, normalize(vec3(-0.4, -0.8, -0.4))), 0.0), 24.0) * 1.1;
  c += vec3(0.3, 0.5, 1.0) * pow(max(dot(R, normalize(vec3(0.8, -0.1, -0.5))), 0.0), 10.0) * 0.5;
  c += vec3(0.9, 0.75, 0.5) * pow(max(dot(R, normalize(vec3(-0.85, 0.1, -0.4))), 0.0), 10.0) * 0.35;
  return c;
}
void main(){
  vec3 x = vO * 3.1;
  vec3 ip = floor(x), fp = fract(x);
  float d1 = 8.0, d2 = 8.0; vec3 cell = vec3(0.0);
  for (int a = -1; a <= 1; a++) for (int b = -1; b <= 1; b++) for (int c = -1; c <= 1; c++) {
    vec3 g = vec3(float(a), float(b), float(c));
    vec3 rr = g + hash3(ip + g) - fp;
    float dd = dot(rr, rr);
    if (dd < d1) { d2 = d1; d1 = dd; cell = ip + g; } else if (dd < d2) { d2 = dd; }
  }
  float gap = sqrt(d2) - sqrt(d1);
  float edge = 1.0 - smoothstep(0.008, 0.04, gap);
  vec3 h = hash3(cell * 1.7 + 3.1);
  edge *= 0.45 + 0.55 * h.z;
  vec3 n = normalize(uRot * normalize(normalize(vN) + (h - 0.5) * 0.75));
  vec3 V = normalize(vec3(0.0, 0.0, -uCam) - vP);
  float nv = dot(normalize(uRot * vN), V);
  if (uPass > 0.5) { if (nv < 0.0) discard; } else { if (nv >= 0.0) discard; }
  float fr = pow(1.0 - abs(nv), 2.0);
  vec3 L = -uL;
  vec3 R = reflect(-V, n);
  vec3 env = envf(R);
  float sp = pow(max(dot(n, normalize(L + V)), 0.0), 90.0);
  vec3 night = vec3(0.035, 0.060, 0.105);
  vec3 gold = mix(vec3(0.85, 0.70, 0.44), vec3(0.95, 0.80, 0.52), uRev * 0.4);
  vec3 silver = vec3(0.85, 0.88, 0.92);
  float core = (0.22 + 0.30 * uE) * (1.0 - uCalm * 0.3);
  float flow = 0.5 + 0.5 * sin(dot(vO, vec3(5.0, 3.0, 4.0)) * 2.0 - uT * (0.4 + 1.8 * uE));
  vec3 liquid = mix(gold * 0.85, vec3(1.0, 0.9, 0.66), flow * uE * (1.0 - uCalm * 0.6));
  if (uPass < 0.5) {
    vec3 c = night * 1.1 + gold * core * 0.45 * (1.0 - fr) + env * 0.12 + liquid * edge * 0.35;
    gl_FragColor = vec4(c, 0.6);
  } else {
    vec3 c = env * (0.35 + 0.65 * fr) * (0.75 + 0.5 * h.y) + gold * core * 0.16 * pow(1.0 - fr, 2.0) + silver * sp * 1.1
           + liquid * edge * (0.8 + 0.6 * flow * uE);
    float a = 0.2 + 0.42 * fr + h.x * 0.1 + edge * 0.75 + sp * 0.5;
    gl_FragColor = vec4(c, clamp(a, 0.0, 0.97));
  }
}`;

const MARK_VS = `${PREC}attribute vec3 aPos; attribute vec4 aCol; attribute float aSize;
uniform mat3 uRot; uniform vec2 uC; uniform vec2 uRes; uniform float uS; uniform float uCam; uniform float uK; uniform float uDpr;
varying vec4 vCol;
void main(){
  vec3 r = uRot * (aPos * uK);
  float f = uCam / (uCam + r.z);
  vec2 px = uC + r.xy * f * uS;
  gl_Position = vec4(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0, 0.0, 1.0);
  gl_PointSize = aSize * uDpr * f;
  vCol = aCol;
}`;

const MARK_FS = `${PREC}
varying vec4 vCol; uniform float uPt;
void main(){
  float a = vCol.a;
  if (uPt > 0.5) { float d = length(gl_PointCoord - 0.5) * 2.0; a *= exp(-d * d * 3.5) * (1.0 - smoothstep(0.85, 1.0, d)); }
  gl_FragColor = vec4(vCol.rgb * a, a);
}`;

export function createMirrorGL(canvas: HTMLCanvasElement, body: GLBody) {
  const gl = canvas.getContext("webgl", { alpha: false, antialias: true, premultipliedAlpha: false, powerPreference: "low-power" });
  if (!gl) return null;

  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
    return s;
  };
  const program = (vs: string, fs: string) => {
    const p = gl.createProgram()!;
    gl.attachShader(p, shader(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "program");
    const u = (name: string) => gl.getUniformLocation(p, name);
    return { p, u, a: (name: string) => gl.getAttribLocation(p, name) };
  };

  type Prog = ReturnType<typeof program>;
  let progs: { bg: Prog; glow: Prog; bodyP: Prog; mark: Prog };
  try {
    progs = {
      bg: program(QUAD_VS, BG_FS),
      glow: program(QUAD_VS, GLOW_FS),
      bodyP: program(BODY_VS, BODY_FS),
      mark: program(MARK_VS, MARK_FS),
    };
  } catch {
    return null;
  }
  const { bg, glow, bodyP, mark } = progs;

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const posBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, body.pos, gl.STATIC_DRAW);
  const norBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, norBuf);
  gl.bufferData(gl.ARRAY_BUFFER, body.nor, gl.STATIC_DRAW);
  const idxBuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, body.idx, gl.STATIC_DRAW);
  const markBuf = gl.createBuffer();

  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);

  const drawQuad = (prog: Prog) => {
    const loc = prog.a("aQ");
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(loc);
  };

  const shared = (prog: Prog, f: GLFrame) => {
    gl.uniformMatrix3fv(prog.u("uRot"), false, f.rot);
    gl.uniform2f(prog.u("uC"), f.cx * f.dpr, f.cy * f.dpr);
    gl.uniform2f(prog.u("uRes"), f.w * f.dpr, f.h * f.dpr);
    gl.uniform1f(prog.u("uS"), f.scale * f.dpr);
    gl.uniform1f(prog.u("uCam"), f.cam);
    gl.uniform1f(prog.u("uK"), f.k);
  };

  return {
    resize(w: number, h: number, dpr: number) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    },
    render(f: GLFrame) {
      const W = f.w * f.dpr, H = f.h * f.dpr;
      // 1 · Fondo volumétrico (opaco)
      gl.disable(gl.BLEND);
      gl.useProgram(bg.p);
      gl.uniform2f(bg.u("uRes"), W, H);
      gl.uniform2f(bg.u("uC"), f.cx * f.dpr, f.cy * f.dpr);
      gl.uniform1f(bg.u("uS"), f.scale * f.dpr);
      gl.uniform1f(bg.u("uT"), f.time);
      gl.uniform1f(bg.u("uE"), f.energy);
      gl.uniform1f(bg.u("uCalm"), f.calm);
      gl.uniform1f(bg.u("uFloor"), f.floorY * f.dpr);
      drawQuad(bg);

      gl.enable(gl.BLEND);
      // 2 · Pared posterior del cristal
      const drawBody = (pass: number) => {
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(bodyP.p);
        shared(bodyP, f);
        gl.uniform1f(bodyP.u("uPass"), pass);
        gl.uniform1f(bodyP.u("uE"), f.energy);
        gl.uniform1f(bodyP.u("uCalm"), f.calm);
        gl.uniform1f(bodyP.u("uRev"), f.rev);
        gl.uniform1f(bodyP.u("uT"), f.time);
        gl.uniform3f(bodyP.u("uL"), f.light[0], f.light[1], f.light[2]);
        const ap = bodyP.a("aPos"), an = bodyP.a("aNor");
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
        gl.enableVertexAttribArray(ap);
        gl.vertexAttribPointer(ap, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, norBuf);
        gl.enableVertexAttribArray(an);
        gl.vertexAttribPointer(an, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
        gl.drawElements(gl.TRIANGLES, body.idx.length, gl.UNSIGNED_SHORT, 0);
        gl.disableVertexAttribArray(ap);
        gl.disableVertexAttribArray(an);
      };
      drawBody(0);

      // 3 · Luz dorada contenida
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(glow.p);
      gl.uniform2f(glow.u("uRes"), W, H);
      gl.uniform2f(glow.u("uC"), f.cx * f.dpr, f.cy * f.dpr);
      gl.uniform1f(glow.u("uR"), f.coreR * f.dpr);
      gl.uniform1f(glow.u("uA"), f.coreA);
      gl.uniform1f(glow.u("uT"), f.time);
      drawQuad(glow);

      // 4 · Interior: retícula, circuitos y flujos de datos
      if (f.lineVerts + f.pointVerts > 0) {
        gl.useProgram(mark.p);
        shared(mark, f);
        gl.uniform1f(mark.u("uDpr"), f.dpr);
        gl.bindBuffer(gl.ARRAY_BUFFER, markBuf);
        gl.bufferData(gl.ARRAY_BUFFER, f.marks, gl.DYNAMIC_DRAW);
        const ap = mark.a("aPos"), ac = mark.a("aCol"), as = mark.a("aSize");
        gl.enableVertexAttribArray(ap);
        gl.enableVertexAttribArray(ac);
        gl.enableVertexAttribArray(as);
        gl.vertexAttribPointer(ap, 3, gl.FLOAT, false, 32, 0);
        gl.vertexAttribPointer(ac, 4, gl.FLOAT, false, 32, 12);
        gl.vertexAttribPointer(as, 1, gl.FLOAT, false, 32, 28);
        gl.uniform1f(mark.u("uPt"), 0);
        if (f.lineVerts) gl.drawArrays(gl.LINES, 0, f.lineVerts);
        gl.uniform1f(mark.u("uPt"), 1);
        if (f.pointVerts) gl.drawArrays(gl.POINTS, f.lineVerts, f.pointVerts);
        gl.disableVertexAttribArray(ap);
        gl.disableVertexAttribArray(ac);
        gl.disableVertexAttribArray(as);
      }

      // 5 · Cara frontal del cristal (velo translúcido sobre el interior)
      drawBody(1);
    },
    // Libera recursos sin perder el contexto (el mismo lienzo puede reutilizarse al cambiar de modo).
    dispose() {
      for (const b of [quad, posBuf, norBuf, idxBuf, markBuf]) gl.deleteBuffer(b);
      for (const pr of [bg, glow, bodyP, mark]) gl.deleteProgram(pr.p);
    },
  };
}
