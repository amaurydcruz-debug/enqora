"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { detectDelimiter, parseAmount, parseDate, readTextFile, splitLine } from "@/lib/csv";
import { createClient } from "@/lib/supabase/client";

// Carga del detalle del Registro de Compras y Ventas (descargado del SII) o de una cartola bancaria.
// El archivo se lee en el navegador; se proponen las columnas, se muestra cómo se interpretará y
// se envía por lotes. La base de datos valida RUT, montos y período, y no duplica.

type Kind = "compras" | "ventas" | "banco";
type Field = { key: string; label: string; required?: boolean; hints: RegExp[] };

const DOC_FIELDS = (book: "compras" | "ventas"): Field[] => [
  { key: "doc_type", label: "Tipo de documento", required: true, hints: [/^tipo ?doc/i, /tipo/i] },
  { key: "folio", label: "Folio", required: true, hints: [/^folio$/i, /folio/i] },
  { key: "rut", label: book === "compras" ? "RUT proveedor" : "RUT cliente", required: true, hints: [/^rut (proveedor|cliente)/i, /^rut/i] },
  { key: "name", label: "Razón social", hints: [/raz[oó]n social/i, /nombre/i] },
  { key: "date", label: "Fecha del documento", required: true, hints: [/^fecha docto/i, /fecha doc/i, /^fecha$/i] },
  { key: "exempt", label: "Monto exento", hints: [/^monto exento/i, /exento/i] },
  { key: "net", label: "Monto neto", hints: [/^monto neto$/i, /^neto$/i] },
  book === "compras"
    ? { key: "vat", label: "IVA recuperable", hints: [/iva recuperable/i] }
    : { key: "vat", label: "Monto IVA", hints: [/^monto iva$/i, /^iva$/i] },
  ...(book === "compras"
    ? [
        { key: "vat_nr", label: "IVA no recuperable", hints: [/iva no recuperable/i] },
        { key: "fixed_vat", label: "IVA activo fijo", hints: [/iva activo fijo/i] },
        { key: "common_vat", label: "IVA uso común", hints: [/uso com[uú]n/i] },
      ]
    : []),
  { key: "other", label: "Otros impuestos", hints: [/valor otro imp/i] },
  { key: "total", label: "Monto total", required: true, hints: [/^monto total$/i, /total/i] },
];

const BANK_FIELDS: Field[] = [
  { key: "date", label: "Fecha", required: true, hints: [/^fecha/i] },
  { key: "description", label: "Descripción", required: true, hints: [/descrip|glosa|detalle|concepto/i] },
  { key: "amount", label: "Monto (con signo)", hints: [/^monto$/i, /importe/i] },
  { key: "cargo", label: "Cargos", hints: [/cargo|d[eé]bito|giro/i] },
  { key: "abono", label: "Abonos", hints: [/abono|cr[eé]dito|dep[oó]sito/i] },
  { key: "balance", label: "Saldo", hints: [/saldo/i] },
  { key: "reference", label: "N° de documento", hints: [/n[°º]? ?doc|documento|referencia|operaci/i] },
];

const BATCH = 1000;

export function BookImporter({ kind, companyId, period }: { kind: Kind; companyId: string; period: string }) {
  const router = useRouter();
  const fields = kind === "banco" ? BANK_FIELDS : DOC_FIELDS(kind);
  const [lines, setLines] = useState<string[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [delimiter, setDelimiter] = useState(";");
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [account, setAccount] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error" | "info"; text: string } | null>(null);

  const header = lines ? splitLine(lines[headerRow] ?? "", delimiter).map((h) => h.trim()) : [];
  const rows = lines ? lines.slice(headerRow + 1) : [];
  const preview = rows.slice(0, 4).map((l) => splitLine(l, delimiter));
  const columns = header.length;

  const guess = (hdr: string[]) => {
    const m: Record<string, number> = {};
    for (const f of fields) {
      for (const re of f.hints) {
        const i = hdr.findIndex((h, idx) => re.test(h) && !Object.values(m).includes(idx));
        if (i >= 0) { m[f.key] = i; break; }
      }
    }
    return m;
  };

  const onFile = async (file: File | undefined) => {
    setMsg(null);
    setLines(null);
    if (!file) return;
    try {
      const all = await readTextFile(file);
      if (all.length < 2) throw new Error("El archivo no tiene filas.");
      // Las cartolas suelen traer líneas de encabezado del banco: se busca la fila de títulos.
      const h = Math.max(0, all.slice(0, 20).findIndex((l) => /fecha/i.test(l) && /(monto|total|cargo|abono|folio)/i.test(l)));
      const d = detectDelimiter(all[h]);
      const hdr = splitLine(all[h], d).map((x) => x.trim());
      setFileName(file.name);
      setLines(all);
      setDelimiter(d);
      setHeaderRow(h);
      setMapping(guess(hdr));
      setMsg({ kind: "info", text: `${(all.length - h - 1).toLocaleString("es-CL")} filas en ${file.name}. Revisa las columnas y la vista previa.` });
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "No se pudo leer el archivo." });
    }
  };

  const toRow = (cells: string[]) => {
    const get = (k: string) => (mapping[k] !== undefined ? cells[mapping[k]]?.trim() : undefined);
    if (kind === "banco") {
      const date = parseDate(get("date"));
      const amount = mapping.amount !== undefined ? parseAmount(get("amount")) : (parseAmount(get("abono")) ?? 0) - Math.abs(parseAmount(get("cargo")) ?? 0);
      if (!date || !amount) return null;
      return { date, description: get("description") ?? "", amount, balance: parseAmount(get("balance")), reference: get("reference") ?? null };
    }
    const type = Number.parseInt(get("doc_type") ?? "", 10);
    const folio = parseAmount(get("folio"));
    const total = parseAmount(get("total"));
    if (!Number.isFinite(type) || folio == null || total == null) return null;
    const n = (k: string) => Math.abs(parseAmount(get(k)) ?? 0);
    return {
      doc_type: type, folio: Math.abs(folio), rut: get("rut") ?? "", name: get("name") ?? null, date: parseDate(get("date")),
      exempt: n("exempt"), net: n("net"), vat: n("vat"), vat_nr: n("vat_nr"), fixed_vat: n("fixed_vat"), common_vat: n("common_vat"),
      other: n("other"), total: Math.abs(total),
    };
  };

  const missing = fields.filter((f) => f.required && mapping[f.key] === undefined);
  const bankAmountMissing = kind === "banco" && mapping.amount === undefined && mapping.cargo === undefined && mapping.abono === undefined;
  const canStart = !!lines && !busy && !missing.length && !bankAmountMissing && (kind !== "banco" || account.trim().length >= 2);

  const start = async () => {
    if (!lines) return;
    setBusy(true);
    setMsg({ kind: "info", text: "Cargando…" });
    const supabase = createClient();
    let ok = 0;
    let other = 0;
    try {
      const parsed = rows.map((l) => toRow(splitLine(l, delimiter))).filter(Boolean);
      for (let i = 0; i < parsed.length; i += BATCH) {
        const batch = parsed.slice(i, i + BATCH);
        const { data, error } = kind === "banco"
          ? await supabase.rpc("import_bank", { p_company: companyId, p_period: period, p_account: account.trim(), p_rows: batch, p_file_name: fileName })
          : await supabase.rpc("import_documents", { p_company: companyId, p_period: period, p_book: kind === "compras" ? "compra" : "venta", p_rows: batch, p_file_name: fileName });
        if (error) {
          const code = error.message?.match(/ENQ_[A-Z_]+/)?.[0];
          throw new Error(code === "ENQ_PERIODO_DECLARADO"
            ? "Este período ya tiene su F29 aprobado o presentado: no admite cambios."
            : code === "ENQ_SIN_PERMISO" ? "Tu rol no permite cargar documentos." : "La carga se detuvo. Intenta nuevamente.");
        }
        const r = data as { aceptadas: number; descartadas: number; repetidas?: number };
        ok += r.aceptadas;
        other += r.descartadas + (r.repetidas ?? 0);
      }
      setMsg({ kind: "ok", text: `Carga lista: ${ok.toLocaleString("es-CL")} filas guardadas${other ? ` · ${other.toLocaleString("es-CL")} descartadas o repetidas (RUT inválido, fuera del período o ya cargadas)` : ""}.` });
      setLines(null);
      router.refresh();
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "No se pudo cargar." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="importer">
      <div className="form-grid">
        {kind === "banco" ? (
          <div className="field">
            <label htmlFor={`acc-${kind}`}>Cuenta</label>
            <input id={`acc-${kind}`} className="input" value={account} maxLength={80} onChange={(e) => setAccount(e.target.value)} placeholder="Banco y n° de cuenta" />
          </div>
        ) : null}
        <div className="field field-wide">
          <label htmlFor={`file-${kind}`}>{kind === "banco" ? "Cartola (.csv o .txt)" : `Detalle de ${kind} del RCV (.csv)`}</label>
          <input id={`file-${kind}`} type="file" accept=".csv,.txt" className="input" disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
      </div>
      <p className="hint">
        {kind === "banco"
          ? "Descarga la cartola desde tu banco en formato CSV. Se guardan solo los movimientos del período."
          : `En sii.cl → Registro de Compras y Ventas → ${kind === "compras" ? "Compras" : "Ventas"} → «Descargar detalles». Súbelo tal cual.`}
      </p>

      {lines ? (
        <div className="importer-map">
          <div className="map-grid">
            {fields.map((f) => (
              <div className="field" key={f.key}>
                <label htmlFor={`m-${kind}-${f.key}`}>{f.label}{f.required ? "" : " (opcional)"}</label>
                <select id={`m-${kind}-${f.key}`} className="input" disabled={busy} value={mapping[f.key] ?? ""}
                  onChange={(e) => setMapping((m) => { const n = { ...m }; if (e.target.value === "") delete n[f.key]; else n[f.key] = Number(e.target.value); return n; })}>
                  <option value="">— Sin columna —</option>
                  {Array.from({ length: columns }, (_, i) => <option key={i} value={i}>{header[i] || `Columna ${i + 1}`}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="preview-scroll">
            <div className={`preview-grid cols-${Math.min(columns, 15)}`}>
              {Array.from({ length: Math.min(columns, 15) }, (_, i) => <span key={`h${i}`} className="pv-head">{header[i]}</span>)}
              {preview.flatMap((r, ri) => Array.from({ length: Math.min(columns, 15) }, (_, ci) => <span key={`${ri}-${ci}`}>{r[ci]}</span>))}
            </div>
          </div>
          <div className="importer-check">
            <span className="eyebrow">Así se interpretará la primera fila</span>
            <code>{JSON.stringify(preview[0] ? toRow(preview[0]) : null)}</code>
          </div>
        </div>
      ) : null}

      {msg ? <div className={`alert alert-${msg.kind}`} role={msg.kind === "error" ? "alert" : "status"}>{msg.text}</div> : null}

      {lines ? (
        <div className="panel-actions">
          <button type="button" className="btn btn-gold btn-inline" disabled={!canStart} onClick={start}>{busy ? "Cargando…" : "Cargar al período"}</button>
          {missing.length ? <span className="muted-line">Falta indicar: {missing.map((f) => f.label).join(", ")}.</span> : null}
          {bankAmountMissing ? <span className="muted-line">Indica la columna de monto, o las de cargos y abonos.</span> : null}
          {kind === "banco" && account.trim().length < 2 ? <span className="muted-line">Indica la cuenta.</span> : null}
        </div>
      ) : null}
    </div>
  );
}
