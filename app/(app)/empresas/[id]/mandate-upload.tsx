"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { prepareMandateUploadAction, registerMandateDocumentAction } from "@/app/actions/mandates";
import { Notice } from "@/components/auth-card";
import { createClient } from "@/lib/supabase/client";

// Subida del mandato firmado: el servidor valida y firma → el navegador sube al almacenamiento
// privado «mandatos» → el servidor lo registra y el mandato pasa a verificación.
export function MandateUpload({ mandateId }: { mandateId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function onFile(file: File) {
    setMsg(null);
    setBusy(true);
    try {
      const prep = await prepareMandateUploadAction(mandateId, file.name, file.size, file.type);
      if (prep.error || !prep.path || !prep.token) throw new Error(prep.error ?? "No se pudo preparar la subida.");
      const supabase = createClient();
      const { error } = await supabase.storage.from("mandatos").uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type });
      if (error) throw new Error("La subida falló. Revisa tu conexión e intenta nuevamente.");
      const reg = await registerMandateDocumentAction(mandateId, prep.path, file.name);
      if (reg.error) throw new Error(reg.error);
      setMsg({ kind: "ok", text: "Recibimos el mandato firmado. Un abogado de ENQORA lo verificará." });
      router.refresh();
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "No se pudo subir el archivo." });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="upload">
      {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}
      <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" id={`man-${mandateId}`} disabled={busy}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
      <label htmlFor={`man-${mandateId}`} className={`btn btn-gold btn-inline btn-sm${busy ? " is-busy" : ""}`} aria-disabled={busy}>
        {busy ? "Subiendo…" : "Subir mandato firmado"}
      </label>
      <span className="hint">PDF, JPG o PNG · máximo 20 MB · se guarda privado y solo lo ven tu empresa y el equipo legal de ENQORA.</span>
    </div>
  );
}
