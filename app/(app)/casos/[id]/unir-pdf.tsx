"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { unirEnPdfAction } from "@/app/actions/pdf-expediente";
import { Notice } from "@/components/auth-card";

export type DocUnible = { id: string; file_name: string; mime_type: string | null; created_at: string };

const UNIBLE = ["application/pdf", "image/jpeg", "image/png"];

// Equipo ENQORA: elige los documentos y los une en un PDF numerado que entra al expediente y a la Bóveda.
export function UnirPdf({ caseId, docs }: { caseId: string; docs: DocUnible[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<string[]>(() => docs.filter((d) => UNIBLE.includes(d.mime_type ?? "")).map((d) => d.id));
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (!docs.length) return null;

  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const elegidos = docs.filter((d) => sel.includes(d.id)).map((d) => d.id);

  return (
    <details className="pdf-unir">
      <summary className="btn btn-ghost btn-inline btn-sm">Unir en PDF numerado</summary>
      {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}
      <p className="muted-line">
        Portada con índice, huella SHA-256 de cada original y pie «folio · documento · página». El PDF queda como documento interno;
        los originales no se modifican. Word, Excel y XML se listan en el índice y quedan como originales.
      </p>
      <ul>
        {docs.map((d) => (
          <li key={d.id}>
            <label>
              <input type="checkbox" checked={sel.includes(d.id)} onChange={() => toggle(d.id)} disabled={pending} />
              <span>{d.file_name}</span>
              {!UNIBLE.includes(d.mime_type ?? "") ? <small>(solo en el índice)</small> : null}
            </label>
          </li>
        ))}
      </ul>
      <div className="upload-row">
        <button type="button" className={`btn btn-gold btn-inline btn-sm${pending ? " is-busy" : ""}`} disabled={pending || !elegidos.length}
          onClick={() =>
            start(async () => {
              setMsg(null);
              const r = await unirEnPdfAction(caseId, elegidos).catch(() => ({ error: "No se pudo unir. Intenta nuevamente.", ok: undefined }));
              setMsg(r.error ? { kind: "error", text: r.error } : { kind: "ok", text: r.ok ?? "Listo." });
              if (!r.error) router.refresh();
            })
          }>
          {pending ? "Uniendo…" : `Unir ${elegidos.length} en PDF`}
        </button>
      </div>
    </details>
  );
}
