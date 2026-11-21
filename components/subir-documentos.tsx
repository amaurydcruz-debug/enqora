"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  prepareSolicitudUploadAction,
  prepareUploadAction,
  registerDocumentAction,
  registerSolicitudDocumentAction,
} from "@/app/actions/cases";
import { Notice } from "@/components/auth-card";
import { createClient } from "@/lib/supabase/client";
import { UPLOAD_ACCEPT, UPLOAD_MAX_BYTES, UPLOAD_TYPES } from "@/lib/cases";

export type DestinoDocumentos = { tipo: "caso"; id: string } | { tipo: "solicitud"; id: string };

const LADO_MAX = 2200;
const CALIDAD = 0.85;

// Fotos de la cámara: se reducen y pasan a JPEG en el teléfono antes de subir (más rápido y liviano).
// Si el navegador no puede leer la imagen, se sube tal cual cuando su tipo está permitido.
export async function prepararImagen(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const liviana = (file.type === "image/jpeg" || file.type === "image/png") && file.size <= 1_500_000;
  if (liviana) return file;
  try {
    const bmp = await createImageBitmap(file);
    const escala = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * escala);
    canvas.height = Math.round(bmp.height * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", CALIDAD));
    if (!blob) return file;
    const base = (file.name.replace(/\.[^.]+$/, "") || "foto").slice(0, 70);
    return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}

// Subida de documentos (uno o varios) o fotos desde la cámara, a un caso o a una solicitud.
// Cada archivo: el servidor valida y firma → el navegador sube directo al almacenamiento privado →
// el servidor lo registra. En un caso entra a la Bóveda con su número (DOC-…); en una solicitud queda
// guardado y pasa al expediente cuando el equipo abre el caso.
export function SubirDocumentos({
  destino,
  canInternal = false,
  compacto = false,
}: {
  destino: DestinoDocumentos;
  canInternal?: boolean;
  compacto?: boolean;
}) {
  const router = useRouter();
  const uid = useId();
  const archivos = useRef<HTMLInputElement>(null);
  const camara = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [internal, setInternal] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function subirUno(original: File): Promise<string | null> {
    const file = await prepararImagen(original);
    if (file.size > UPLOAD_MAX_BYTES) return `${original.name}: supera el máximo de 20 MB.`;
    if (!UPLOAD_TYPES.includes(file.type)) return `${original.name}: tipo no permitido (usa PDF, foto, XML, CSV, Excel o Word).`;
    const prep =
      destino.tipo === "caso"
        ? await prepareUploadAction(destino.id, file.name, file.size, file.type)
        : await prepareSolicitudUploadAction(destino.id, file.name, file.size, file.type);
    if (prep.error || !prep.path || !prep.token) return `${original.name}: ${prep.error ?? "no se pudo preparar la subida."}`;
    const { error } = await createClient().storage.from("expedientes").uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type });
    if (error) return `${original.name}: la subida falló. Revisa tu conexión.`;
    const reg =
      destino.tipo === "caso"
        ? await registerDocumentAction(destino.id, prep.path, file.name, file.type, file.size, internal)
        : await registerSolicitudDocumentAction(destino.id, prep.path, file.name, file.type, file.size);
    return reg.error ? `${original.name}: ${reg.error}` : null;
  }

  async function onFiles(list: FileList | null) {
    const files = Array.from(list ?? []).slice(0, 10);
    if (!files.length) return;
    setMsg(null);
    const errores: string[] = [];
    let ok = 0;
    for (let i = 0; i < files.length; i++) {
      setBusy(files.length > 1 ? `Subiendo ${i + 1} de ${files.length}…` : "Subiendo…");
      const e = await subirUno(files[i]).catch(() => `${files[i].name}: no se pudo subir.`);
      if (e) errores.push(e);
      else ok++;
    }
    setBusy(null);
    if (archivos.current) archivos.current.value = "";
    if (camara.current) camara.current.value = "";
    const destinoTxt = destino.tipo === "caso" ? "al expediente" : "a tu solicitud";
    if (ok) router.refresh();
    setMsg(
      errores.length
        ? { kind: "error", text: `${ok ? `${ok} ${ok === 1 ? "documento enviado" : "documentos enviados"} ${destinoTxt}. ` : ""}${errores.join(" ")}` }
        : { kind: "ok", text: `${ok === 1 ? "Documento enviado" : `${ok} documentos enviados`} ${destinoTxt}. Quedan guardados y numerados.` },
    );
  }

  return (
    <div className={`upload${compacto ? " upload-compacto" : ""}`}>
      {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}
      <input ref={archivos} id={`${uid}-a`} type="file" multiple accept={UPLOAD_ACCEPT} className="sr-only" disabled={!!busy}
        onChange={(e) => void onFiles(e.target.files)} />
      <input ref={camara} id={`${uid}-c`} type="file" accept="image/*" capture="environment" className="sr-only" disabled={!!busy}
        onChange={(e) => void onFiles(e.target.files)} />
      <div className="upload-row">
        <label htmlFor={`${uid}-c`} className={`btn btn-gold btn-inline btn-sm${busy ? " is-busy" : ""}`} aria-disabled={!!busy}>
          {busy ?? "Tomar foto"}
        </label>
        {busy ? null : (
          <label htmlFor={`${uid}-a`} className="btn btn-ghost btn-inline btn-sm">Subir archivos</label>
        )}
        {canInternal ? (
          <label className="check-inline">
            <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Solo equipo
          </label>
        ) : null}
      </div>
      <span className="hint">Foto del documento, PDF, XML, Excel o Word · hasta 10 a la vez · máximo 20 MB cada uno · se guardan cifrados y privados.</span>
    </div>
  );
}
