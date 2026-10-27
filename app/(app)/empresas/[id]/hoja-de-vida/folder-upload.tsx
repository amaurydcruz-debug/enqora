"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { prepareTaxUploadAction, registerTaxRecordAction } from "@/app/actions/tax-records";
import { Notice } from "@/components/auth-card";
import { EnqoraClockLoader } from "@/components/clock-loader";
import { createClient } from "@/lib/supabase/client";

type Step = "idle" | "subiendo" | "analizando";

async function analyze(record: string): Promise<string | null> {
  const res = await fetch("/api/hoja-de-vida/analizar", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ record }),
  });
  if (res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error ?? "No pudimos analizar la carpeta. Intenta nuevamente.";
}

// Sube la Carpeta Tributaria Electrónica (PDF) al almacenamiento privado «carpetas»
// y pide su análisis. La clave del SII nunca pasa por ENQORA: la carpeta la genera la empresa.
export function FolderUpload({ companyId }: { companyId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("idle");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function onFile(file: File) {
    setMsg(null);
    setStep("subiendo");
    try {
      const prep = await prepareTaxUploadAction(companyId, file.name, file.size, file.type || "application/pdf");
      if (prep.error || !prep.path || !prep.token) throw new Error(prep.error ?? "No se pudo preparar la subida.");
      const supabase = createClient();
      const { error } = await supabase.storage.from("carpetas").uploadToSignedUrl(prep.path, prep.token, file, { contentType: "application/pdf" });
      if (error) throw new Error("La subida falló. Revisa tu conexión e intenta nuevamente.");
      const reg = await registerTaxRecordAction(companyId, prep.path, file.name);
      if (reg.error || !reg.id) throw new Error(reg.error ?? "No se pudo registrar la carpeta.");
      setStep("analizando");
      const err = await analyze(reg.id);
      if (err) throw new Error(err);
      setMsg({ kind: "ok", text: "Listo: tu hoja de vida tributaria está actualizada." });
      router.refresh();
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "No se pudo subir el archivo." });
      router.refresh();
    } finally {
      setStep("idle");
      if (input.current) input.current.value = "";
    }
  }

  const busy = step !== "idle";
  return (
    <div className="upload">
      {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}
      {step === "analizando" ? (
        <EnqoraClockLoader mode="ia" label="Leyendo tu carpeta tributaria" detail="Transcribimos declaraciones y observaciones; puede tardar hasta un minuto." />
      ) : null}
      <input ref={input} type="file" accept="application/pdf" className="sr-only" id={`cte-${companyId}`} disabled={busy}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
      <label htmlFor={`cte-${companyId}`} className={`btn btn-gold btn-inline${busy ? " is-busy" : ""}`} aria-disabled={busy}>
        {step === "subiendo" ? "Subiendo…" : step === "analizando" ? "Analizando…" : "Subir carpeta tributaria (PDF)"}
      </label>
      <span className="hint">PDF del SII · máximo 20 MB · se guarda privado; solo lo ven tu empresa y el equipo ENQORA asignado.</span>
    </div>
  );
}

export function RetryAnalysis({ recordId }: { recordId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-form">
      <button type="button" className="btn btn-ghost btn-inline btn-sm" disabled={busy}
        onClick={async () => { setBusy(true); setErr(null); const e = await analyze(recordId); if (e) setErr(e); setBusy(false); router.refresh(); }}>
        {busy ? "Analizando…" : "Reintentar análisis"}
      </button>
      {err ? <small className="lookup-error">{err}</small> : null}
    </span>
  );
}
