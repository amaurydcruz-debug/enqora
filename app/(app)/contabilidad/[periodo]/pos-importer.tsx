"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cargarPosAction } from "@/app/actions/pos";
import { Notice } from "@/components/auth-card";
import { detectDelimiter, parseAmount, parseDate, readTextFile, splitLine } from "@/lib/csv";
import { CAMPOS_POS, resumirPorDia, type DiaPOS } from "@/lib/pos";

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;

// Exportación de cualquier punto de venta (CSV): se lee en el navegador, se agrupa por día y medio de pago,
// se muestra el resumen y solo entonces se carga. Lo que no se pudo leer se informa (no se pierde en silencio).
export function PosImporter({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [lines, setLines] = useState<string[] | null>(null);
  const [archivo, setArchivo] = useState("");
  const [sistema, setSistema] = useState("");
  const [delim, setDelim] = useState(";");
  const [fila, setFila] = useState(0);
  const [map, setMap] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState<{ kind: "ok" | "error" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const header = lines ? splitLine(lines[fila] ?? "", delim).map((h) => h.trim()) : [];
  const resumen: { dias: DiaPOS[]; descartadas: number } | null = lines && map.fecha !== undefined && map.total !== undefined
    ? resumirPorDia(lines.slice(fila + 1).filter((l) => l.trim()).map((l) => {
        const c = splitLine(l, delim);
        const get = (k: string) => (map[k] !== undefined ? c[map[k]]?.trim() : undefined);
        const num = (k: string) => (map[k] !== undefined ? parseAmount(get(k)) : null);
        return { fecha: parseDate(get("fecha")), total: num("total"), medio: get("medio"), neto: num("neto"), iva: num("iva"), exento: num("exento"), cantidad: num("cantidad") };
      }))
    : null;

  async function onFile(file: File | undefined) {
    setMsg(null); setLines(null);
    if (!file) return;
    try {
      const all = await readTextFile(file);
      if (all.length < 2) throw new Error("El archivo no tiene filas.");
      const h = Math.max(0, all.slice(0, 20).findIndex((l) => /fecha/i.test(l) && /(total|monto)/i.test(l)));
      const d = detectDelimiter(all[h]);
      const hdr = splitLine(all[h], d).map((x) => x.trim());
      const m: Record<string, number> = {};
      for (const f of CAMPOS_POS) for (const re of f.hints) {
        const i = hdr.findIndex((x, idx) => re.test(x) && !Object.values(m).includes(idx));
        if (i >= 0) { m[f.key] = i; break; }
      }
      setArchivo(file.name); setLines(all); setDelim(d); setFila(h); setMap(m);
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "No se pudo leer el archivo." });
    }
  }

  async function cargar() {
    if (!resumen?.dias.length) return;
    setBusy(true);
    const r = await cargarPosAction(companyId, resumen.dias, sistema.trim() || "POS", archivo).catch(() => ({ error: "No se pudo cargar.", ok: undefined }));
    setBusy(false);
    if (r.error) return setMsg({ kind: "error", text: r.error });
    setMsg({ kind: "ok", text: r.ok ?? "Listo." });
    setLines(null);
    router.refresh();
  }

  return (
    <div className="pos-imp">
      {msg ? <Notice kind={msg.kind === "info" ? "ok" : msg.kind}>{msg.text}</Notice> : null}
      <div className="upload-row">
        <label className="btn btn-ghost btn-inline btn-sm">
          Subir exportación del POS (CSV)
          <input type="file" accept=".csv,.txt" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
        <input className="input input-sm" placeholder="Nombre del sistema (ej.: Vania POS, Bsale)" maxLength={40} value={sistema} onChange={(e) => setSistema(e.target.value)} aria-label="Sistema" />
      </div>
      {lines ? (
        <>
          <div className="form-grid">
            {CAMPOS_POS.map((f) => (
              <label key={f.key} className="field"><span>{f.label}{f.required ? " *" : ""}</span>
                <select className="input input-sm" value={map[f.key] ?? ""} onChange={(e) => setMap((m) => { const n = { ...m }; if (e.target.value === "") delete n[f.key]; else n[f.key] = Number(e.target.value); return n; })}>
                  <option value="">— No viene —</option>
                  {header.map((h, i) => <option key={i} value={i}>{h || `Columna ${i + 1}`}</option>)}
                </select>
              </label>
            ))}
          </div>
          {resumen ? (
            <>
              <p className="muted-line">
                {resumen.dias.length} día(s) · {resumen.dias.reduce((s, d) => s + d.n_ventas, 0)} ventas · total {clp(resumen.dias.reduce((s, d) => s + d.total, 0))}
                {resumen.descartadas ? ` · ${resumen.descartadas} fila(s) sin fecha o monto válido no se cargarán` : ""}
              </p>
              <div className="table-scroll">
                <table className="ledger-table">
                  <thead><tr><th>Fecha</th><th className="num">Ventas</th><th className="num">Efectivo</th><th className="num">Débito</th><th className="num">Crédito</th><th className="num">Transf.</th><th className="num">Otros</th><th className="num">Total</th></tr></thead>
                  <tbody>{resumen.dias.slice(0, 31).map((d) => (
                    <tr key={d.fecha}><td>{d.fecha}</td><td className="num">{d.n_ventas}</td><td className="num">{clp(d.efectivo)}</td><td className="num">{clp(d.debito)}</td><td className="num">{clp(d.credito)}</td><td className="num">{clp(d.transferencia)}</td><td className="num">{clp(d.otros)}</td><td className="num">{clp(d.total)}</td></tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="upload-row">
                <button type="button" className={`btn btn-gold btn-inline btn-sm${busy ? " is-busy" : ""}`} disabled={busy || !resumen.dias.length} onClick={() => void cargar()}>
                  {busy ? "Cargando…" : `Cargar ${resumen.dias.length} día(s)`}
                </button>
                <span className="hint">Si un día ya estaba cargado desde este mismo sistema, se reemplaza.</span>
              </div>
            </>
          ) : <p className="muted-line">Elige al menos la columna de fecha y la de total.</p>}
        </>
      ) : null}
    </div>
  );
}
