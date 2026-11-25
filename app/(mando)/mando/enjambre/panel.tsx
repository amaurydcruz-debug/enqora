"use client";

import { useActionState } from "react";
import { sincronizarHabilidadesAction, type EstadoSincronizar } from "@/app/actions/habilidades-enjambre";
import { SubmitButton } from "@/components/submit-button";

const ESTADO: Record<string, string> = { igual: "sin cambios", creada: "subida", actualizada: "actualizada", error: "error" };

export function PanelSincronizar() {
  const [estado, accion] = useActionState<EstadoSincronizar, FormData>(sincronizarHabilidadesAction, null);
  return (
    <form action={accion} className="inline-form" style={{ flexWrap: "wrap" }}>
      <SubmitButton className="btn-inline btn-sm" pendingText="Subiendo habilidades…">Subir o actualizar habilidades</SubmitButton>
      {estado && !estado.ok ? <p className="lookup-error" role="alert">{estado.error}</p> : null}
      {estado?.ok ? (
        <p role="status" className="muted-line">
          {estado.resultado.map((r) => `${r.nombre}: ${ESTADO[r.estado]}${r.detalle ? ` (${r.detalle})` : ""}`).join(" · ")}
        </p>
      ) : null}
    </form>
  );
}
