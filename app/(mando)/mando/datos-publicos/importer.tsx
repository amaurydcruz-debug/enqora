"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Importador de nóminas públicas del SII (personas jurídicas), sin terminal:
// el archivo se lee en el navegador (ZIP o TXT/CSV), se interpreta y se envía por lotes
// a la base de datos con la sesión del Administrador ENQORA (las funciones validan permisos y RUT).

type Dataset = "razon_social" | "actividades";
type Field = { key: string; label: string; required: boolean; hints: RegExp };

const FIELDS: Record<Dataset, Field[]> = {
  razon_social: [
    { key: "rut", label: "RUT", required: true, hints: /^rut|rut$|numero/i },
    { key: "dv", label: "Dígito verificador", required: false, hints: /^dv|digito|verif/i },
    { key: "legal_name", label: "Razón social", required: true, hints: /raz|nombre|social/i },
    { key: "activity_start", label: "Inicio de actividades", required: false, hints: /inicio|ini_act|f_ini/i },
    { key: "end_of_business", label: "Término de giro", required: false, hints: /t[eé]rmino|termino|fin|f_term/i },
  ],
  actividades: [
    { key: "rut", label: "RUT", required: true, hints: /^rut|rut$|numero/i },
    { key: "dv", label: "Dígito verificador", required: false, hints: /^dv|digito|verif/i },
    { key: "code", label: "Código de actividad", required: true, hints: /c[oó]d|actec|codigo/i },
    { key: "description", label: "Descripción", required: false, hints: /glosa|desc|actividad|nombre/i },
  ],
};

const SOURCES: Record<Dataset, { label: string; url: string }> = {
  razon_social: { label: "Nómina de Razón Social de contribuyentes PJ", url: "https://www.sii.cl/estadisticas/nominas/PUB_NOMBRES_PJ.zip" },
  actividades: { label: "Nómina de actividades económicas de contribuyentes PJ", url: "https://www.sii.cl/estadisticas/nominas/PUB_NOM_ACTECOS.zip" },
};

const BATCH = 1000;

// ---------- Lectura de archivos ----------
async function unzipFirstText(buf: ArrayBuffer): Promise<{ name: string; bytes: Uint8Array }> {
  const dv = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("El ZIP no es válido.");
  const entries = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let n = 0; n < entries; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!/\.(txt|csv)$/i.test(name)) continue;
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const data = new Uint8Array(buf, start, compSize);
    if (method === 0) return { name, bytes: data };
    if (method !== 8) throw new Error("El ZIP usa una compresión no soportada.");
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return { name, bytes: new Uint8Array(await new Response(stream).arrayBuffer()) };
  }
  throw new Error("El ZIP no contiene un archivo .txt o .csv.");
}

function decode(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

function detectDelimiter(line: string) {
  const cands = ["\t", ";", "|", ","];
  return cands.map((d) => [d, line.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
}

function parseDate(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

function parseRut(rutCell: string | undefined, dvCell: string | undefined): { rut: number; dv: string } | null {
  const r = (rutCell ?? "").replace(/[^0-9kK-]/g, "").toUpperCase();
  if (dvCell !== undefined) {
    const n = Number.parseInt(r.replace(/[^0-9]/g, ""), 10);
    const d = (dvCell ?? "").trim().toUpperCase();
    return Number.isFinite(n) && n > 0 && /^[0-9K]$/.test(d) ? { rut: n, dv: d } : null;
  }
  const clean = r.replace(/-/g, "");
  if (clean.length < 2) return null;
  const n = Number.parseInt(clean.slice(0, -1), 10);
  const d = clean.slice(-1);
  return Number.isFinite(n) && n > 0 && /^[0-9K]$/.test(d) ? { rut: n, dv: d } : null;
}

export function PublicDataImporter() {
  const [dataset, setDataset] = useState<Dataset>("razon_social");
  const [publishedOn, setPublishedOn] = useState("");
  const [fileName, setFileName] = useState("");
  const [lines, setLines] = useState<string[] | null>(null);
  const [delimiter, setDelimiter] = useState("\t");
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [clearFirst, setClearFirst] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ sent: 0, accepted: 0, total: 0 });
  const [message, setMessage] = useState<{ kind: "ok" | "error" | "info"; text: string } | null>(null);
  const [needReauth, setNeedReauth] = useState(false);
  const cancelRef = useRef(false);

  const fields = FIELDS[dataset];
  const header = lines ? lines[0].split(delimiter).map((h) => h.trim()) : [];
  const dataLines = lines ? (hasHeader ? lines.slice(1) : lines) : [];
  const preview = dataLines.slice(0, 5).map((l) => l.split(delimiter));
  const columns = header.length;

  const guess = (hdr: string[], ds: Dataset) => {
    const m: Record<string, number> = {};
    FIELDS[ds].forEach((f) => {
      const i = hdr.findIndex((h, idx) => f.hints.test(h) && !Object.values(m).includes(idx));
      if (i >= 0) m[f.key] = i;
    });
    return m;
  };

  const onFile = async (file: File | undefined) => {
    setMessage(null);
    setLines(null);
    if (!file) return;
    try {
      setBusy(true);
      setMessage({ kind: "info", text: "Leyendo el archivo…" });
      const buf = await file.arrayBuffer();
      const isZip = new DataView(buf).getUint32(0, true) === 0x04034b50;
      const { name, bytes } = isZip ? await unzipFirstText(buf) : { name: file.name, bytes: new Uint8Array(buf) };
      const text = decode(bytes);
      const all = text.split(/\r?\n/).filter((l) => l.trim().length);
      if (all.length < 2) throw new Error("El archivo no tiene filas.");
      const d = detectDelimiter(all[0]);
      const hdr = all[0].split(d).map((h) => h.trim());
      const headerLike = hdr.some((h) => /[a-záéíóú]{3,}/i.test(h)) && !/^\d+$/.test(hdr[0]);
      setFileName(name);
      setLines(all);
      setDelimiter(d);
      setHasHeader(headerLike);
      setMapping(headerLike ? guess(hdr, dataset) : {});
      setMessage({ kind: "info", text: `${(all.length - (headerLike ? 1 : 0)).toLocaleString("es-CL")} filas encontradas en ${name}. Revisa la vista previa y las columnas.` });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "No se pudo leer el archivo." });
    } finally {
      setBusy(false);
    }
  };

  const toRow = (cells: string[]) => {
    const get = (k: string) => (mapping[k] !== undefined ? cells[mapping[k]]?.trim() : undefined);
    const id = parseRut(get("rut"), mapping.dv !== undefined ? get("dv") ?? "" : undefined);
    if (!id) return null;
    if (dataset === "razon_social") {
      const name = get("legal_name");
      if (!name) return null;
      return { rut: id.rut, dv: id.dv, legal_name: name, activity_start: parseDate(get("activity_start")), end_of_business: parseDate(get("end_of_business")) };
    }
    const code = get("code");
    if (!code) return null;
    return { rut: id.rut, code, description: get("description") ?? null };
  };

  const missing = fields.filter((f) => f.required && mapping[f.key] === undefined);
  const canStart = !!lines && !busy && !missing.length && /^\d{4}-\d{2}-\d{2}$/.test(publishedOn);

  const start = async () => {
    if (!lines) return;
    cancelRef.current = false;
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const fail = (error: { message?: string } | null, fallback: string) => {
      const code = error?.message?.match(/ENQ_[A-Z_]+/)?.[0];
      setNeedReauth(code === "ENQ_REAUTH");
      setMessage({
        kind: "error",
        text: code === "ENQ_REAUTH"
          ? "Por seguridad, confirma tu identidad con un código nuevo y vuelve a iniciar la carga."
          : code === "ENQ_SIN_PERMISO" ? "Solo el Administrador ENQORA puede cargar datos públicos." : fallback,
      });
      setBusy(false);
    };
    try {
      if (clearFirst) {
        const { error } = await supabase.rpc("clear_public_dataset", { p_dataset: dataset });
        if (error) return fail(error, "No se pudo vaciar el conjunto anterior.");
      }
      const { data: imp, error } = await supabase.rpc("start_public_import", {
        p_dataset: dataset,
        p_source_url: SOURCES[dataset].url,
        p_published_on: publishedOn,
        p_file_name: fileName,
      });
      if (error || !imp) return fail(error, "No se pudo iniciar la carga.");

      const rows = dataLines;
      let accepted = 0;
      setProgress({ sent: 0, accepted: 0, total: rows.length });
      for (let i = 0; i < rows.length; i += BATCH) {
        if (cancelRef.current) {
          await supabase.rpc("finish_public_import", { p_import: imp, p_status: "cancelada" });
          setMessage({ kind: "info", text: `Carga detenida. Se guardaron ${accepted.toLocaleString("es-CL")} filas.` });
          setBusy(false);
          return;
        }
        const batch = rows.slice(i, i + BATCH).map((l) => toRow(l.split(delimiter))).filter(Boolean);
        let tries = 0;
        for (;;) {
          const { data: n, error: e } = await supabase.rpc("import_public_rows", { p_import: imp, p_rows: batch });
          if (!e) { accepted += Number(n ?? 0); break; }
          if (++tries >= 3) return fail(e, `La carga se detuvo en la fila ${i.toLocaleString("es-CL")}. Puedes reintentar.`);
          await new Promise((r) => setTimeout(r, 1500 * tries));
        }
        setProgress({ sent: Math.min(i + BATCH, rows.length), accepted, total: rows.length });
      }
      const { error: fe } = await supabase.rpc("finish_public_import", { p_import: imp, p_status: "completada" });
      if (fe) return fail(fe, "Los datos se cargaron, pero no se pudo cerrar la carga.");
      setMessage({
        kind: "ok",
        text: `Carga completada: ${accepted.toLocaleString("es-CL")} de ${rows.length.toLocaleString("es-CL")} filas aceptadas. Las filas con RUT o datos inválidos se descartaron.`,
      });
    } catch {
      setMessage({ kind: "error", text: "Se perdió la conexión durante la carga. Puedes reintentar." });
    } finally {
      setBusy(false);
    }
  };

  const pct = progress.total ? Math.round((progress.sent / progress.total) * 100) : 0;

  return (
    <div className="importer">
      <div className="form-grid">
        <div className="field">
          <label htmlFor="imp-dataset">Conjunto de datos</label>
          <select id="imp-dataset" className="input" value={dataset} disabled={busy}
            onChange={(e) => { const d = e.target.value as Dataset; setDataset(d); setMapping(lines ? guess(header, d) : {}); }}>
            <option value="razon_social">{SOURCES.razon_social.label}</option>
            <option value="actividades">{SOURCES.actividades.label}</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="imp-date">Fecha de publicación del SII</label>
          <input id="imp-date" type="date" className="input" value={publishedOn} disabled={busy} onChange={(e) => setPublishedOn(e.target.value)} />
        </div>
        <div className="field field-wide">
          <label htmlFor="imp-file">Archivo (.zip del SII, o .txt / .csv)</label>
          <input id="imp-file" type="file" accept=".zip,.txt,.csv" className="input" disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
      </div>
      <p className="hint">Fuente: <a href={SOURCES[dataset].url} target="_blank" rel="noopener noreferrer">{SOURCES[dataset].url}</a>. Descárgalo del SII y súbelo aquí tal cual.</p>

      {lines ? (
        <div className="importer-map">
          <div className="check-row">
            <label className="check-inline"><input type="checkbox" checked={hasHeader} disabled={busy} onChange={(e) => setHasHeader(e.target.checked)} /> La primera fila son títulos</label>
            <label className="check-inline">
              Separador
              <select className="input input-sm" value={delimiter} disabled={busy} onChange={(e) => setDelimiter(e.target.value)}>
                <option value={"\t"}>Tabulación</option>
                <option value=";">Punto y coma</option>
                <option value="|">Barra |</option>
                <option value=",">Coma</option>
              </select>
            </label>
          </div>
          <div className="map-grid">
            {fields.map((f) => (
              <div className="field" key={f.key}>
                <label htmlFor={`map-${f.key}`}>{f.label}{f.required ? "" : " (opcional)"}</label>
                <select id={`map-${f.key}`} className="input" disabled={busy} value={mapping[f.key] ?? ""}
                  onChange={(e) => setMapping((m) => { const n = { ...m }; if (e.target.value === "") delete n[f.key]; else n[f.key] = Number(e.target.value); return n; })}>
                  <option value="">— Sin columna —</option>
                  {Array.from({ length: columns }, (_, i) => (
                    <option key={i} value={i}>Columna {i + 1}{hasHeader && header[i] ? ` · ${header[i]}` : ""}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="preview-scroll">
            <div className={`preview-grid cols-${Math.min(columns, 15)}`}>
              {Array.from({ length: columns }, (_, i) => <span key={`h${i}`} className="pv-head">{hasHeader ? header[i] : `Columna ${i + 1}`}</span>)}
              {preview.flatMap((r, ri) => Array.from({ length: columns }, (_, ci) => <span key={`${ri}-${ci}`}>{r[ci]}</span>))}
            </div>
          </div>
          <div className="importer-check">
            <span className="eyebrow">Así se interpretará la primera fila</span>
            <code>{JSON.stringify(preview[0] ? toRow(preview[0]) : null)}</code>
          </div>
          <label className="check-inline"><input type="checkbox" checked={clearFirst} disabled={busy} onChange={(e) => setClearFirst(e.target.checked)} /> Reemplazar los datos anteriores de este conjunto (recomendado para una publicación nueva completa)</label>
        </div>
      ) : null}

      {message ? (
        <div className={`alert alert-${message.kind}`} role={message.kind === "error" ? "alert" : "status"}>
          {message.text}
          {needReauth ? <> <a href="/mfa/reautenticar?next=%2Fmando%2Fdatos-publicos">Confirmar mi identidad</a></> : null}
        </div>
      ) : null}

      {busy && progress.total ? (
        <div className="importer-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <span className="bar"><span className={`fill-p${Math.round(pct / 10)}`} /></span>
          <small>{progress.sent.toLocaleString("es-CL")} de {progress.total.toLocaleString("es-CL")} filas · {progress.accepted.toLocaleString("es-CL")} aceptadas · {pct}%</small>
        </div>
      ) : null}

      <div className="panel-actions">
        <button type="button" className="btn btn-gold btn-inline" disabled={!canStart} onClick={start}>
          {busy && progress.total ? "Cargando…" : "Iniciar carga"}
        </button>
        {busy && progress.total ? (
          <button type="button" className="btn btn-ghost btn-inline" onClick={() => { cancelRef.current = true; }}>Detener</button>
        ) : null}
        {missing.length && lines ? <span className="muted-line">Falta indicar: {missing.map((f) => f.label).join(", ")}.</span> : null}
        {!publishedOn && lines ? <span className="muted-line">Indica la fecha de publicación del SII.</span> : null}
      </div>
    </div>
  );
}
