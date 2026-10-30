import type { SupabaseClient } from "@supabase/supabase-js";
import { mapHeader, SOURCES, SYNC_ORDER, toRow, type Dataset } from "@/lib/public-data";
import { entryLines, firstLine, openZip } from "@/lib/zip-lines";

// Conector automático con las nóminas públicas del SII. Cada ejecución:
//  1) si hay una carga en curso, la continúa desde su cursor (línea);
//  2) si no, revisa en orden razón social → actividades → empresas si el SII publicó una versión
//     nueva (cabecera Last-Modified) y, si es así, la empieza.
// Procesa hasta agotar su tiempo y deja el cursor guardado: la siguiente ejecución sigue donde quedó.

type Active = { id: string; modo: string; cursor: number; fuente: string; modificado: string | null; latido: string | null };
type Last = { id: string; modificado: string | null; publicada: string; termino: string | null; filas: number };
type State = Record<Dataset, { activa: Active | null; ultima: Last | null }>;

export type SyncReport = {
  estado: "al_dia" | "continua" | "completada" | "ocupado" | "error";
  conjunto?: Dataset;
  filas?: number;
  cursor?: number;
  detalle?: string;
};

const BATCH = 1000;
const STALE_MS = 3 * 60 * 1000; // una ejecución sin latido hace 3 minutos se considera detenida
const REFRESH_WITHOUT_DATE_DAYS = 30;

const errText = (e: unknown) => {
  if (!(e instanceof Error)) return "Error";
  if (e.name === "TimeoutError" || e.name === "AbortError") return "Tiempo de espera agotado al descargar del SII";
  // fetch() resume los fallos de red como «fetch failed»: se agrega la causa real (DNS, conexión rechazada, TLS…).
  const cause = (e as { cause?: { code?: string; message?: string } }).cause;
  const extra = cause ? ` (${[cause.code, cause.message].filter(Boolean).join(": ")})` : "";
  return `${e.message === "fetch failed" ? "No se pudo conectar con el SII" : e.message}${extra}`.slice(0, 480);
};

export async function runPublicSync(supabase: SupabaseClient, token: string, deadline: number): Promise<SyncReport> {
  const { data, error } = await supabase.rpc("svc_public_sync_state", { p_token: token });
  if (error || !data) {
    const m = error?.message ?? "";
    return {
      estado: "error",
      detalle: /ENQ_CLAVE_SERVICIO/.test(m)
        ? "ENQORA_SERVICE_TOKEN en Vercel no coincide con la clave de servicio registrada en Centro de Mando."
        : /svc_public_sync_state|does not exist|schema cache/i.test(m)
          ? "Falta ejecutar la migración 0019_hoja_de_vida.sql en Supabase."
          : m || "Sin respuesta de la base de datos",
    };
  }
  const state = data as State;

  // 1) Carga en curso
  for (const ds of SYNC_ORDER) {
    const a = state[ds]?.activa;
    if (!a || a.modo !== "automatica") continue;
    if (a.latido && Date.now() - new Date(a.latido).getTime() < STALE_MS) return { estado: "ocupado", conjunto: ds };
    return processImport(supabase, token, ds, a.id, a.cursor, deadline);
  }

  // 2) ¿Hay versión nueva publicada? (si una fuente falla, se revisan las demás)
  let failure: SyncReport | null = null;
  for (const ds of SYNC_ORDER) {
    const last = state[ds]?.ultima;
    // Consulta liviana: solo se piden las cabeceras (fecha de publicación del archivo).
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    let res: Response;
    try {
      res = await fetch(SOURCES[ds].url, {
        signal: controller.signal, cache: "no-store", headers: { "user-agent": "ENQORA/1.0 (+datos abiertos SII)", range: "bytes=0-0" },
      });
    } catch (e) {
      clearTimeout(timer);
      failure ??= { estado: "error", conjunto: ds, detalle: errText(e) };
      continue;
    } finally {
      clearTimeout(timer);
    }
    controller.abort();
    if (!res.ok) {
      failure ??= { estado: "error", conjunto: ds, detalle: `El SII respondió ${res.status} al descargar la nómina` };
      continue;
    }
    const lm = res.headers.get("last-modified");
    const modified = lm && !Number.isNaN(Date.parse(lm)) ? new Date(lm) : null;
    const isNew = !last
      || (modified && (!last.modificado || modified.getTime() > new Date(last.modificado).getTime() + 1000))
      || (!modified && last.termino && Date.now() - new Date(last.termino).getTime() > REFRESH_WITHOUT_DATE_DAYS * 86400000);
    if (!isNew) continue;
    const { data: id, error: startErr } = await supabase.rpc("svc_start_public_import", {
      p_token: token, p_dataset: ds, p_source_url: SOURCES[ds].url, p_modified: modified?.toISOString() ?? null,
      p_file_name: SOURCES[ds].url.split("/").pop() ?? null,
    });
    if (startErr || !id) return { estado: "error", conjunto: ds, detalle: startErr?.message ?? "No se pudo iniciar la carga" };
    return processImport(supabase, token, ds, id as string, 0, deadline);
  }
  return failure ?? { estado: "al_dia" };
}

async function processImport(
  supabase: SupabaseClient, token: string, ds: Dataset, importId: string, cursor: number, deadline: number,
): Promise<SyncReport> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(5_000, deadline - Date.now() + 5_000));
  let line = 0; // líneas de datos leídas (sin contar el encabezado)
  let sent = cursor;
  let rows: Record<string, unknown>[] = [];
  let total = 0;
  const flush = async () => {
    if (line === sent) return;
    const { data, error } = await supabase.rpc("svc_import_public_rows", {
      p_token: token, p_import: importId, p_rows: rows, p_from: sent, p_to: line,
    });
    if (error) throw Object.assign(new Error(error.message), { db: true });
    total += Number(data ?? 0);
    sent = line;
    rows = [];
  };

  try {
    // El ZIP puede traer varios archivos (p. ej. una tabla de códigos y la nómina): se elige el que
    // tenga las columnas de esta nómina, empezando por el más grande.
    const { source, entries } = await openZip(SOURCES[ds].url, controller.signal);
    const candidates = entries.filter((e) => /\.(txt|csv)$/i.test(e.name) && e.size > 0).sort((a, b) => b.size - a.size);
    let chosen: (typeof entries)[number] | null = null;
    let map: ReturnType<typeof mapHeader> | null = null;
    const seen: string[] = [];
    for (const e of candidates.slice(0, 8)) {
      const header = await firstLine(source, e, controller.signal);
      const m = mapHeader(ds, header);
      if (!m.missing.length) { chosen = e; map = m; break; }
      seen.push(`${e.name}: ${m.header.slice(0, 8).join(" | ")}`);
    }
    if (!chosen || !map) {
      await supabase.rpc("svc_finish_public_import", {
        p_token: token, p_import: importId, p_status: "cancelada",
        p_error: `Formato no reconocido. Archivos del ZIP: ${seen.join(" ;; ").slice(0, 440) || "ninguno de texto"}`,
      });
      return { estado: "error", conjunto: ds, detalle: "Formato no reconocido: ningún archivo del ZIP tiene las columnas esperadas" };
    }
    let header = false;
    for await (const raw of entryLines(source, chosen, controller.signal)) {
      if (!header) {
        if (raw.trim()) header = true;
        continue;
      }
      if (!raw.trim()) continue;
      line++;
      if (line <= cursor) {
        // Avance rápido hasta el cursor; si el tiempo se agota antes, la próxima ejecución sigue igual.
        if (line % 50_000 === 0 && Date.now() > deadline) return { estado: "continua", conjunto: ds, filas: 0, cursor };
        continue;
      }
      const row = toRow(ds, map, raw);
      if (row) rows.push(row);
      if (line - sent >= BATCH) {
        await flush();
        if (Date.now() > deadline) {
          return { estado: "continua", conjunto: ds, filas: total, cursor: sent };
        }
      }
    }
    if (!header) throw new Error("El archivo de la nómina venía vacío.");
    if (line < cursor) throw new Error("El archivo publicado es más corto que el avance guardado: se reiniciará la carga.");
    await flush();
    await supabase.rpc("svc_finish_public_import", { p_token: token, p_import: importId, p_status: "completada", p_error: null });
    return { estado: "completada", conjunto: ds, filas: total, cursor: sent };
  } catch (e) {
    const msg = errText(e);
    if (/ENQ_CARGA_EN_CURSO/.test(msg)) return { estado: "ocupado", conjunto: ds };
    if (/más corto/.test(msg)) {
      await supabase.rpc("svc_finish_public_import", { p_token: token, p_import: importId, p_status: "cancelada", p_error: msg });
    } else {
      await supabase.rpc("svc_public_import_error", { p_token: token, p_import: importId, p_error: msg.slice(0, 500) });
    }
    return { estado: "error", conjunto: ds, filas: total, cursor: sent, detalle: msg };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
