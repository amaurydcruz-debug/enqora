"use client";

import { useActionState } from "react";
import { probarComputadorAction, sincronizarHabilidadesAction, type EstadoPrueba, type EstadoSincronizar } from "@/app/actions/habilidades-enjambre";
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

export function PanelProbar() {
  const [estado, accion] = useActionState<EstadoPrueba, FormData>(probarComputadorAction, null);
  return (
    <form action={accion} className="stack">
      <SubmitButton className="btn-inline btn-sm btn-ghost" pendingText="Probando el computador… (hasta 2 minutos)">Probar computador</SubmitButton>
      {estado && "error" in estado ? <p className="lookup-error" role="alert">{estado.error}</p> : null}
      {estado && "pasos" in estado ? (
        <>
          <p role="status" className="muted-line">
            {estado.pasos.every((p) => p.ok) ? "Todo funcionó." : `${estado.pasos.filter((p) => !p.ok).length} paso(s) con problemas.`} Duración: {Math.round(estado.ms / 1000)} s.
          </p>
          <ul className="ref-list" role="list">
            {estado.pasos.map((p) => (
              <li key={p.paso}>
                <span className="ref-main"><b>{p.paso}</b><small className="muted-line">{p.detalle}</small></span>
                <span className={`status status-${p.ok ? "ok" : "warn"}`}>{p.ok ? "OK" : "Revisar"}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </form>
  );
}
