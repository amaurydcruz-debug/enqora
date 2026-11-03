import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { abrirNavegador, memoriaMb, USER_AGENT } from "@/lib/cora/web/navegador";
import { INAPI, PROCEDIMIENTOS, type Procedimiento, type ResultadoPortal } from "@/lib/cora/web/portales";

// CORA Web Research Agent · ejecución de una investigación (o de la prueba de entorno).
// Por cada portal: abre una pestaña, ejecuta el procedimiento, guarda una captura en Storage privado y una
// fila de evidencia (portal, URL, fecha y hora, consulta, resultado, estado, versión del procedimiento).
// Así cada búsqueda queda demostrada: captura + fecha + fuente + resultado verificable.

const BUCKET = "cora-evidencias";
const LIMITE_PORTAL_MS = 75_000;

type Run = { id: string; rut: string; razon_social: string | null; modo: "investigacion" | "entorno" };

export async function ejecutarInvestigacion(supabase: SupabaseClient, run: Run) {
  const t0 = Date.now();
  let maxMem = memoriaMb();
  await supabase.from("research_runs").update({ status: "en_curso", started_at: new Date().toISOString() }).eq("id", run.id);
  let browser: Awaited<ReturnType<typeof abrirNavegador>>["browser"] | null = null;
  const metrics: Record<string, unknown> = { region: process.env.VERCEL_REGION ?? "local", node: process.version };
  try {
    const nav = await abrirNavegador();
    browser = nav.browser;
    Object.assign(metrics, { chromium: nav.version, lanzamiento_ms: nav.launchMs });
    maxMem = Math.max(maxMem, memoriaMb());
    const procedimientos: Procedimiento[] = run.modo === "entorno" ? [INAPI] : PROCEDIMIENTOS;
    let fallas = 0;
    for (const proc of procedimientos) {
      const ctx = await browser.newContext({ userAgent: USER_AGENT, viewport: { width: 1366, height: 900 }, locale: "es-CL" });
      const page = await ctx.newPage();
      const inicio = Date.now();
      let res: ResultadoPortal;
      try {
        if (run.modo === "entorno") {
          await page.goto(proc.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
          res = { status: "encontrado", query: { prueba: "abrir portal" }, url: page.url(), result: { titulo: await page.title() }, detail: "Prueba de entorno: el navegador abrió el portal." };
        } else {
          res = await Promise.race([
            proc.ejecutar(page, { rut: run.rut, razon: run.razon_social ?? "" }),
            new Promise<ResultadoPortal>((_, rej) => setTimeout(() => rej(new Error(`Tiempo máximo de ${LIMITE_PORTAL_MS / 1000} s excedido`)), LIMITE_PORTAL_MS)),
          ]);
        }
      } catch (e) {
        res = { status: "error", query: { rut: run.rut }, url: page.url() || proc.url, result: null, detail: (e instanceof Error ? e.message : "Error del navegador").slice(0, 900) };
      }
      const duracion = Date.now() - inicio;
      maxMem = Math.max(maxMem, memoriaMb());
      // Captura: la prueba de que el portal fue consultado (también cuando falla o hay barrera).
      let path: string | null = null;
      try {
        const png = await page.screenshot({ type: "png", fullPage: false, timeout: 15_000 });
        path = `${run.id}/${proc.id}-${Date.now()}.png`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, png, { contentType: "image/png", upsert: false });
        if (error) { res.detail = `${res.detail} · Captura no guardada: ${error.message}`.slice(0, 990); path = null; }
      } catch (e) {
        res.detail = `${res.detail} · Sin captura: ${e instanceof Error ? e.message : "error"}`.slice(0, 990);
      }
      await supabase.from("research_evidence").insert({
        run_id: run.id, portal: proc.id, procedure_version: run.modo === "entorno" ? "entorno-1" : proc.version,
        query: res.query, url: res.url.slice(0, 500), status: res.status, result: res.result, screenshot_path: path,
        duration_ms: duracion, detail: res.detail.slice(0, 1000),
      });
      if (res.status === "error" || res.status === "procedimiento_fallo") fallas++;
      await ctx.close().catch(() => undefined);
    }
    Object.assign(metrics, { total_ms: Date.now() - t0, memoria_max_mb: maxMem, portales: procedimientos.length, fallas });
    await supabase.from("research_runs").update({ status: "completada", finished_at: new Date().toISOString(), metrics }).eq("id", run.id);
  } catch (e) {
    Object.assign(metrics, { total_ms: Date.now() - t0, memoria_max_mb: maxMem });
    await supabase.from("research_runs").update({
      status: "fallida", finished_at: new Date().toISOString(), metrics,
      error: (e instanceof Error ? e.message : "Error inesperado").slice(0, 1000),
    }).eq("id", run.id);
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
