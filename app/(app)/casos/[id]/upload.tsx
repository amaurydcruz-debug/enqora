"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { prepareUploadAction, registerDocumentAction } from "@/app/actions/cases";
import { Notice } from "@/components/auth-card";
import { createClient } from "@/lib/supabase/client";
import { UPLOAD_ACCEPT, UPLOAD_MAX_BYTES, UPLOAD_TYPES } from "@/lib/cases";

// Subida en 3 pasos: el servidor valida y firma → el navegador sube directo al
// almacenamiento privado → el servidor registra el documento en el expediente.
export function UploadDocument({ caseId, canInternal }: { caseId: string; canInternal: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [internal, setInternal] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function onFile(file: File) {
    setMsg(null);
    if (file.size > UPLOAD_MAX_BYTES) return setMsg({ kind: "error", text: "El archivo supera el máximo de 20 MB." });
    if (!UPLOAD_TYPES.includes(file.type)) {
      return setMsg({ kind: "error", text: "Tipo de archivo no permitido. Usa PDF, imagen, XML, CSV, Excel o Word." });
    }

    setBusy(true);
    try {
      const prep = await prepareUploadAction(caseId, file.name, file.size, file.type);
      if (prep.error || !prep.path || !prep.token) throw new Error(prep.error ?? "No se pudo preparar la subida.");

      const supabase = createClient();
      const { error } = await supabase.storage
        .from("expedientes")
        .uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type });
      if (error) throw new Error("La subida falló. Revisa tu conexión e intenta nuevamente.");

      const reg = await registerDocumentAction(caseId, prep.path, file.name, file.type, file.size, internal);
      if (reg.error) throw new Error(reg.error);

      setMsg({ kind: "ok", text: `${file.name} se agregó al expediente.` });
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
      <input
        ref={input} type="file" accept={UPLOAD_ACCEPT} className="sr-only" id={`file-${caseId}`} disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
        }}
      />
      <div className="upload-row">
        <label htmlFor={`file-${caseId}`} className={`btn btn-ghost btn-inline btn-sm${busy ? " is-busy" : ""}`} aria-disabled={busy}>
          {busy ? "Subiendo…" : "Adjuntar documento"}
        </label>
        {canInternal ? (
          <label className="check-inline">
            <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Solo equipo
          </label>
        ) : null}
      </div>
      <span className="hint">PDF, imagen, XML, CSV, Excel o Word · máximo 20 MB · se guarda cifrado y privado.</span>
    </div>
  );
}
