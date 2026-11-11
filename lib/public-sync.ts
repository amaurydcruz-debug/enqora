import type { SupabaseClient } from "@supabase/supabase-js";
import { mapHeader, SOURCES, SYNC_ORDER, toRow, type Dataset } from "@/lib/public-data";
import { entryLines, firstLine, openZip } from "@/lib/zip-lines";

// Conector automático con las nóminas públicas del SII. Cada ejecución:
//  1) si hay una carga en curso, la continúa desde su cursor (línea);
//  2) si no, revisa en orden razón social → actividades → empresas si el SII publicó una versión
//     nueva (cabecera Last-Modified) y, si es así, la empieza.
// Procesa hasta agotar su tiempo y deja el cursor guardado: la siguiente ejecución sigue donde quedó.

type Active = { id: string; modo: string; cursor: number; fuente: string; modificado: string | null; latido: string | null };
type Last = { id: string; modificado: string | null; publicada: string; termino: string | null; filas: number; archivo?: string | null };
type State = Record<Dataset, { activa: Active | null; ultima: Last | null }>;

export type SyncReport = {
  estado: "al_dia" | "continua" | "completada" | "ocupado" | "error";
  conjunto?: Dataset;
  filas?: number;
  cursor?: number;
  detalle?: string;
};

const BATCH = 2000;
// Un ZIP puede traer varios archivos con la misma nómina (p. ej., un archivo por año comercial 2020 a 2024).
// Se cargan todos, del año más reciente al más antiguo, y el cursor codifica archivo y línea:
// cursor = índice del archivo × ARCHIVO + línea dentro del archivo. La base conserva el año más reciente de cada RUT.
export const ARCHIVO = 100_000_000;
// Marca guardada en el nombre del archivo de la carga: si la última carga completada no la tiene, se hizo con un
// solo archivo del ZIP (versión anterior del conector) y se vuelve a cargar completa.
const MARCA_TODOS = " · todos los archivos";
// Conjuntos cuyo ZIP trae varios archivos de la misma nómina (los demás traen uno solo y no se recargan).
const VARIOS_ARCHIVOS: Dataset[] = ["empresas"];
// Mayor que la duración máxima de un tramo (300 s): mientras uno trabaja, otro no lo interrumpe.
const STALE_MS = 330 * 1000;
const REFRESH_WITHOUT_DATE_DAYS = 30;

const errText = (e: unknown) => {
  if (!(e instanceof Error)) return "Error";
  if (e.name === "TimeoutError" || e.name === "AbortError") return "Tiempo de espera agotado al descargar del SII";
  // fetch() resume los fallos de red como «fetch failed»: se agrega la causa real (DNS, conexión rechazada, TLS…).
  const cause = (e as { cause?: { code?: string; message?: string } }).cause;
  const extra = cause ? ` (${[cause.code, cause.message].filter(Boolean).join(": ")})` : "";
  return `${e.message === "fetch failed" ? "No se pudo conectar con el SII" : e.message}${extra}`.slice(0, 480);
};

// continuation: la ejecución viene encadenada desde la anterior (que ya terminó su tramo), así que
// no se espera a que «enfríe» su latido. Si dos ejecuciones coincidieran, la base de datos deja
// avanzar solo a una (el lote debe empezar exactamente en el cursor guardado).
export async function runPublicSync(supabase: SupabaseClient, token: string, deadline: number, continuation = false): Promise<SyncReport> {
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
    if (!continuation && a.latido && Date.now() - new Date(a.latido).getTime() < STALE_MS) return { estado: "ocupado", conjunto: ds };
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
    // Carga anterior hecha con un solo archivo del ZIP (requiere la migración 0032, que informa el archivo).
    const incompleta = VARIOS_ARCHIVOS.includes(ds) && !!last && "archivo" in last && !(last.archivo ?? "").endsWith(MARCA_TODOS);
    if (!isNew && !incompleta) continue;
    const { data: id, error: startErr } = await supabase.rpc("svc_start_public_import", {
      p_token: token, p_dataset: ds, p_source_url: SOURCES[ds].url, p_modified: modified?.toISOString() ?? null,
      p_file_name: `${SOURCES[ds].url.split("/").pop() ?? "nomina.zip"}${MARCA_TODOS}`,
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
  const t0 = Date.now();
  let llegada = 0; // segundos que tomó llegar al cursor (diagnóstico)
  const detalle = () => `${llegada ? `${llegada} s para llegar al avance guardado · ` : ""}${Math.round((Date.now() - t0) / 1000)} s de tramo`;
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
    // El ZIP puede traer varios archivos: una tabla de códigos y una o más nóminas (p. ej., una por año).
    // Se cargan todos los que tengan las columnas de esta nómina, del año más reciente al más antiguo.
    const { source, entries } = await openZip(SOURCES[ds].url, controller.signal);
    const candidates = entries.filter((e) => /\.(txt|csv)$/i.test(e.name) && e.size > 0).sort((a, b) => b.size - a.size);
    const anio = (n: string) => Number(n.match(/(19|20)\d{2}(?!.*(19|20)\d{2})/)?.[0] ?? 0);
    const archivos: { e: (typeof entries)[number]; map: ReturnType<typeof mapHeader> }[] = [];
    const seen: string[] = [];
    for (const e of candidates.slice(0, 12)) {
      const header = await firstLine(source, e, controller.signal);
      const m = mapHeader(ds, header);
      if (!m.missing.length) archivos.push({ e, map: m });
      else seen.push(`${e.name}: ${m.header.slice(0, 8).join(" | ")}`);
    }
    archivos.sort((a, b) => anio(b.e.name) - anio(a.e.name) || b.e.size - a.e.size);
    if (!archivos.length) {
      await supabase.rpc("svc_finish_public_import", {
        p_token: token, p_import: importId, p_status: "cancelada",
        p_error: `Formato no reconocido. Archivos del ZIP: ${seen.join(" ;; ").slice(0, 440) || "ninguno de texto"}`,
      });
      return { estado: "error", conjunto: ds, detalle: "Formato no reconocido: ningún archivo del ZIP tiene las columnas esperadas" };
    }

    for (let idx = Math.floor(cursor / ARCHIVO); idx < archivos.length; idx++) {
      const { e: chosen, map } = archivos[idx];
      const base = idx * ARCHIVO;
      const desde = Math.max(0, cursor - base); // líneas ya cargadas de este archivo
      let header = false;
      line = base;
      for await (const raw of entryLines(source, chosen, controller.signal)) {
        if (!header) {
          if (raw.trim()) header = true;
          continue;
        }
        if (!raw.trim()) continue;
        line++;
        if (line - base <= desde) {
          // Avance rápido hasta el cursor; si el tiempo se agota antes, la próxima ejecución sigue igual.
          if (line % 50_000 === 0 && Date.now() > deadline) return { estado: "continua", conjunto: ds, filas: 0, cursor, detalle: `No alcanzó a llegar al avance guardado (${detalle()})` };
          continue;
        }
        if (desde && !llegada) llegada = Math.max(1, Math.round((Date.now() - t0) / 1000));
        const row = toRow(ds, map, raw);
        if (row) rows.push(row);
        if (line - sent >= BATCH) {
          await flush();
          if (Date.now() > deadline) return { estado: "continua", conjunto: ds, filas: total, cursor: sent, detalle: detalle() };
        }
      }
      if (!header) throw new Error(`El archivo «${chosen.name}» de la nómina venía vacío.`);
      if (line - base < desde) throw new Error("El archivo publicado es más corto que el avance guardado: se reiniciará la carga.");
      await flush();
      if (idx + 1 < archivos.length) {
        // Salta al inicio del siguiente archivo (sin filas) y guarda el cursor.
        line = (idx + 1) * ARCHIVO;
        await flush();
        if (Date.now() > deadline) return { estado: "continua", conjunto: ds, filas: total, cursor: sent };
      }
    }
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
