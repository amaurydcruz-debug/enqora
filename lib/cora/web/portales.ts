import type { Locator, Page, Response } from "playwright-core";

// CORA · Biblioteca de procedimientos por portal (memoria operativa).
// Cada procedimiento sabe: URL, campo que completa, botón que usa, cómo verifica que la búsqueda terminó
// y qué extrae. Si no puede verificar el término de la búsqueda, NO inventa: devuelve «procedimiento_fallo»
// con su captura, para que el equipo valide un procedimiento nuevo. Si aparece un CAPTCHA o un inicio de
// sesión, devuelve «bloqueado» y se detiene (nunca intenta superarlo).

export type EstadoBusqueda = "encontrado" | "sin_resultados" | "bloqueado" | "procedimiento_fallo" | "error";
export type Contexto = { rut: string; razon: string };
export type ResultadoPortal = {
  status: EstadoBusqueda;
  query: Record<string, string>;
  url: string;
  result: Record<string, unknown> | null;
  detail: string;
};
export type Procedimiento = {
  id: string;
  nombre: string;
  version: string;
  url: string;
  ejecutar: (page: Page, ctx: Contexto) => Promise<ResultadoPortal>;
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();

async function hayBarrera(page: Page): Promise<string | null> {
  const captcha = await page.locator('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="turnstile"], .g-recaptcha, .h-captcha, .cf-turnstile').count();
  if (captcha) return "El portal muestra un CAPTCHA: CORA no lo intenta resolver.";
  const login = await page.locator('input[type="password"]').count();
  if (login) return "El portal pide iniciar sesión: CORA no usa credenciales.";
  return null;
}

// Campo de texto asociado a una etiqueta visible (etiqueta <label>, o el primer input que sigue al texto).
async function campoPorEtiqueta(page: Page, etiqueta: RegExp, texto: string): Promise<Locator | null> {
  const byLabel = page.getByLabel(etiqueta).first();
  if (await byLabel.count().catch(() => 0)) return byLabel;
  const near = page.locator(`xpath=(//*[contains(normalize-space(text()), "${texto}")])[1]/following::input[(not(@type) or @type="text" or @type="search")][1]`).first();
  if (await near.count().catch(() => 0)) return near;
  return null;
}

async function botonBuscar(page: Page): Promise<Locator | null> {
  const cands = [
    page.getByRole("button", { name: /^\s*buscar/i }).first(),
    page.locator('input[type="submit"][value*="uscar" i], input[type="button"][value*="uscar" i]').first(),
    page.locator('a:has-text("Buscar"), button:has-text("Buscar")').first(),
  ];
  for (const c of cands) if (await c.count().catch(() => 0)) return c;
  return null;
}

// Tablas visibles con filas de datos: encabezados + filas (máximo 50).
async function leerTablas(page: Page) {
  return page.evaluate(() => {
    const out: { headers: string[]; rows: string[][] }[] = [];
    for (const t of Array.from(document.querySelectorAll("table"))) {
      const el = t as HTMLElement;
      if (!el.offsetParent) continue;
      const trs = Array.from(t.querySelectorAll("tr"));
      const headers = Array.from(t.querySelectorAll("th")).map((th) => (th.textContent ?? "").replace(/\s+/g, " ").trim());
      const rows = trs.map((tr) => Array.from(tr.querySelectorAll("td")).map((td) => (td.textContent ?? "").replace(/\s+/g, " ").trim()))
        .filter((r) => r.length >= 3 && r.some((c) => c.length > 0)).slice(0, 50);
      if (rows.length) out.push({ headers, rows });
    }
    return out;
  });
}

// Respuestas JSON del propio portal durante la búsqueda (evidencia estructurada adicional).
function capturarJson(page: Page, host: string) {
  const bodies: { url: string; body: string }[] = [];
  const onResp = async (r: Response) => {
    try {
      const u = r.url();
      if (!u.includes(host) || bodies.length >= 3) return;
      if (!(r.headers()["content-type"] ?? "").includes("json")) return;
      bodies.push({ url: u.slice(0, 300), body: (await r.text()).slice(0, 20_000) });
    } catch { /* respuesta no legible: se ignora */ }
  };
  page.on("response", onResp);
  return { bodies, stop: () => page.off("response", onResp) };
}

const SIN_RESULTADOS = /no se (encontraron|han encontrado|registran)|sin resultados|0 aciertos|no existen (registros|resultados)|no hay (registros|resultados)/i;

type Tabla = { headers: string[]; rows: string[][] };
const firma = (t: Tabla) => JSON.stringify(t);

// Espera a que la búsqueda termine: aparece un mensaje de «sin resultados» que antes no estaba, o una tabla
// distinta de las que ya existían antes de buscar (el formulario mismo puede ser una tabla).
async function esperarResultado(page: Page, ms: number, antes: { tablas: Tabla[]; sin: boolean }) {
  const previas = new Set(antes.tablas.map(firma));
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    const text = (await page.locator("body").innerText().catch(() => "")).slice(0, 200_000);
    if (!antes.sin && SIN_RESULTADOS.test(text)) return { fin: "sin" as const, nuevas: [] };
    const nuevas = (await leerTablas(page).catch(() => [] as Tabla[])).filter((t) => !previas.has(firma(t)));
    if (nuevas.length) return { fin: "tablas" as const, nuevas };
    await page.waitForTimeout(800);
  }
  return { fin: "timeout" as const, nuevas: [] as Tabla[] };
}

async function estadoInicial(page: Page) {
  const text = (await page.locator("body").innerText().catch(() => "")).slice(0, 200_000);
  return { tablas: await leerTablas(page).catch(() => [] as Tabla[]), sin: SIN_RESULTADOS.test(text) };
}

// ── INAPI · Buscador de marcas (por titular = razón social) ──
const INAPI_URL = "https://buscadormarcas.inapi.cl/Marca/BuscarMarca.aspx";
export const INAPI: Procedimiento = {
  id: "inapi", nombre: "INAPI · Buscador de marcas", version: "inapi-2026-11-03", url: INAPI_URL,
  async ejecutar(page, { razon }) {
    const query = { titular: razon };
    await page.goto(INAPI_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
    const barrera = await hayBarrera(page);
    if (barrera) return { status: "bloqueado", query, url: page.url(), result: null, detail: barrera };
    const campo = await campoPorEtiqueta(page, /titular/i, "Titular");
    if (!campo) return { status: "procedimiento_fallo", query, url: page.url(), result: null, detail: "No se encontró el campo «Titular»: el portal pudo cambiar." };
    await campo.fill(razon);
    const boton = await botonBuscar(page);
    const json = capturarJson(page, "inapi.cl");
    const antes = await estadoInicial(page);
    if (boton) await boton.click(); else await campo.press("Enter");
    const { fin, nuevas: tablas } = await esperarResultado(page, 30_000, antes);
    json.stop();
    if (await hayBarrera(page)) return { status: "bloqueado", query, url: page.url(), result: null, detail: "Apareció una verificación anti-robot al buscar." };
    if (fin === "timeout") return { status: "procedimiento_fallo", query, url: page.url(), result: { json: json.bodies }, detail: "No se pudo verificar que la búsqueda terminara (sin tabla ni mensaje de «sin resultados»)." };
    if (fin === "sin") return { status: "sin_resultados", query, url: page.url(), result: { json: json.bodies }, detail: "INAPI informa que no hay aciertos para este titular." };
    const objetivo = norm(razon);
    const filas = tablas.flatMap((t) => t.rows.map((r) => ({ headers: t.headers, celdas: r })));
    const exactas = filas.filter((f) => f.celdas.some((c) => norm(c) === objetivo));
    return {
      status: exactas.length ? "encontrado" : "sin_resultados",
      query, url: page.url(),
      result: { tablas: tablas.slice(0, 3), coincidencias_exactas: exactas.length, aciertos_totales: filas.length, json: json.bodies },
      detail: exactas.length
        ? `${exactas.length} registro(s) con titular «${razon}».`
        : `INAPI devolvió ${filas.length} acierto(s), ninguno con titular exactamente igual a la razón social: sin resultados localizados para este titular.`,
    };
  },
};

// ── Registro de Empresas y Sociedades · Búsqueda de actuaciones por RUT ──
const RES_URL = "https://www.registrodeempresasysociedades.cl/BuscarActuaciones2.aspx";
export const RES: Procedimiento = {
  id: "res", nombre: "Registro de Empresas y Sociedades", version: "res-2026-11-03", url: RES_URL,
  async ejecutar(page, { rut }) {
    const query = { rut };
    await page.goto(RES_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
    const barrera = await hayBarrera(page);
    if (barrera) return { status: "bloqueado", query, url: page.url(), result: null, detail: barrera };
    const campo = await campoPorEtiqueta(page, /rut/i, "RUT");
    if (!campo) return { status: "procedimiento_fallo", query, url: page.url(), result: null, detail: "No se encontró el campo «RUT»: el procedimiento debe validarse con el portal." };
    await campo.fill(rut);
    const boton = await botonBuscar(page);
    const json = capturarJson(page, "registrodeempresasysociedades.cl");
    const antes = await estadoInicial(page);
    if (boton) await boton.click(); else await campo.press("Enter");
    const { fin, nuevas: tablas } = await esperarResultado(page, 30_000, antes);
    json.stop();
    if (await hayBarrera(page)) return { status: "bloqueado", query, url: page.url(), result: null, detail: "Apareció una verificación anti-robot al buscar." };
    if (fin === "timeout") return { status: "procedimiento_fallo", query, url: page.url(), result: { json: json.bodies }, detail: "No se pudo verificar que la búsqueda terminara." };
    if (fin === "sin") return { status: "sin_resultados", query, url: page.url(), result: { json: json.bodies }, detail: "El Registro informa que no hay actuaciones para este RUT (puede haberse constituido fuera del Registro)." };
    const filas = tablas.reduce((n, t) => n + t.rows.length, 0);
    return { status: "encontrado", query, url: page.url(), result: { tablas: tablas.slice(0, 3), json: json.bodies }, detail: `${filas} actuación(es) o fila(s) de resultado.` };
  },
};

// Orden de ejecución del piloto (Mercado Público entra por API cuando exista el ticket).
export const PROCEDIMIENTOS: Procedimiento[] = [INAPI, RES];
