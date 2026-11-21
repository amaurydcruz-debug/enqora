"use client";

import { SubirDocumentos } from "@/components/subir-documentos";

// Adjuntar al expediente del caso: varios archivos a la vez o una foto desde la cámara del teléfono (0064).
// Cada archivo entra a la Bóveda con su número (DOC-…).
export function UploadDocument({ caseId, canInternal }: { caseId: string; canInternal: boolean }) {
  return <SubirDocumentos destino={{ tipo: "caso", id: caseId }} canInternal={canInternal} />;
}
