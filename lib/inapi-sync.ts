import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { conjuntoInapi, CONJUNTOS_MARCAS, descargarRecurso } from "@/lib/inapi-datos";
import { prepararFilasMarcas } from "@/lib/marcas";
import { leerXlsx } from "@/lib/xlsx-lector";

// Carga diaria de las marcas de INAPI (datos.gob.cl, CC0). Procesa un archivo por ejecución, por lotes, hasta el
// plazo; si no termina, la siguiente ejecución sigue desde el cursor (fila). Un archivo cambia de versión → se recarga.
export type InapiReport = { estado: "al_dia" | "continua" | "completada" | "error"; archivo?: string; filas?: number; detalle?: string };
type Carga = { recurso: string; conjunto: string; nombre: string | null; url: string; cursor_filas: number; estado: string };
const LOTE = 1000;

export async function runInapiSync(supabase: SupabaseClient, token: string, deadline: number): Promise<InapiReport> {
  for (const id of CONJUNTOS_MARCAS) {
    let c;
    try { c = await conjuntoInapi(id); } catch (e) { return { estado: "error", detalle: (e as Error).message }; }
    for (const r of c.recursos.filter((x) => x.formato === "XLSX" || /\.xlsx(\?|$)/i.test(x.url))) {
      const { error } = await supabase.rpc("svc_inapi_recurso", { p_token: token, p_recurso: r.id, p_conjunto: id, p_url: r.url, p_nombre: r.nombre, p_modificado: r.modificado });
      if (error) return { estado: "error", detalle: /ENQ_CLAVE_SERVICIO/.test(error.message) ? "ENQORA_SERVICE_TOKEN no coincide." : /svc_inapi_recurso|does not exist/i.test(error.message) ? "Falta pegar la migración 0077." : error.message };
    }
  }
  const { data } = await supabase.rpc("svc_inapi_estado", { p_token: token });
  // Primero los años más recientes (Applications-2026 antes que Registers-2009); los que fallaron, al final.
  const anio = (n: string | null) => Number(/(\d{4})/.exec(n ?? "")?.[1] ?? 0);
  const pendientes = ((data ?? []) as Carga[]).filter((c) => c.estado !== "completada")
    .sort((a, b) => (a.estado === "error" ? 1 : 0) - (b.estado === "error" ? 1 : 0) || anio(b.nombre) - anio(a.nombre));
  const c = pendientes[0];
  if (!c) return { estado: "al_dia", detalle: "Todos los archivos de marcas están cargados." };

  const guardar = async (filas: unknown[], cursor: number, estado: "en_curso" | "completada" | "error", detalle: string | null) => {
    const { data: n, error } = await supabase.rpc("svc_inapi_lote", { p_token: token, p_recurso: c.recurso, p_filas: filas, p_cursor: cursor, p_estado: estado, p_detalle: detalle });
    if (error) throw new Error(`No se pudo guardar el lote: ${error.message}`);
    return (n as number) ?? 0;
  };
  try {
    const hoja = leerXlsx(await descargarRecurso(c.url));
    const prep = prepararFilasMarcas(hoja.filas, new Date());
    if ("error" in prep) {
      await guardar([], 0, "error", prep.error);
      return { estado: "error", archivo: c.nombre ?? c.recurso, detalle: prep.error };
    }
    let i = Math.min(c.cursor_filas, prep.filas.length);
    let guardadas = 0;
    while (i < prep.filas.length) {
      if (Date.now() > deadline) {
        await guardar([], i, "en_curso", null);
        return { estado: "continua", archivo: c.nombre ?? c.recurso, filas: guardadas };
      }
      // Las no vigentes solo viajan con su clave (para sacarlas del índice si estaban).
      const lote = prep.filas.slice(i, i + LOTE).map((f) => (f.vigente ? f : { clave: f.clave, solicitud: f.solicitud, actualizado: f.actualizado, vigente: false }));
      i += lote.length;
      guardadas += await guardar(lote, i, i >= prep.filas.length ? "completada" : "en_curso", null);
    }
    if (prep.filas.length === 0) await guardar([], 0, "completada", "Archivo sin filas de marcas.");
    return { estado: "completada", archivo: c.nombre ?? c.recurso, filas: guardadas };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 500);
    await guardar([], c.cursor_filas, "error", msg).catch(() => undefined);
    return { estado: "error", archivo: c.nombre ?? c.recurso, detalle: msg };
  }
}
