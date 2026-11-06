"use client";

import { useActionState } from "react";
import { evaluarModeloAction, type EstadoLaboratorio } from "@/app/actions/laboratorio";
import { SubmitButton } from "@/components/submit-button";

type Prov = { id: string; nombre: string; modelo: string };

export function PanelEvaluacion({ proveedores }: { proveedores: Prov[] }) {
  const [estado, accion] = useActionState<EstadoLaboratorio, FormData>(evaluarModeloAction, null);
  const r = estado?.ok ? estado.resultado : null;

  return (
    <section className="card">
      <h2>Evaluar un modelo</h2>
      {proveedores.length ? (
        <form action={accion} className="inline-form" style={{ flexWrap: "wrap" }}>
          <select name="proveedor" className="input input-sm" defaultValue={proveedores[0].id} aria-label="Proveedor">
            {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre} · {p.modelo}</option>)}
          </select>
          <select name="modo" className="input input-sm" defaultValue="con_conocimiento" aria-label="Modo">
            <option value="con_conocimiento">Con conocimiento ENQORA</option>
            <option value="solo_modelo">Solo el modelo</option>
          </select>
          <SubmitButton className="btn-inline btn-sm" pendingText="Evaluando… (hasta 1 minuto)">Evaluar</SubmitButton>
        </form>
      ) : <p className="muted-line">No hay proveedores configurados.</p>}
      <p className="muted-line">
        «Solo el modelo» mide lo que el modelo sabe por sí mismo. «Con conocimiento ENQORA» le entrega las reglas verificadas de la base de
        conocimiento, como lo hace la plataforma. Una pregunta exige reconocer que falta un dato y pedirlo, en vez de inventarlo.
      </p>

      {estado && !estado.ok ? <p className="lookup-error" role="alert">{estado.error}</p> : null}
      {r ? (
        <>
          <p role="status">
            <b>{r.aciertos} de {r.total} correctas ({Math.round((r.aciertos / r.total) * 100)}%)</b> · {r.modelo} ·{" "}
            {r.modo === "con_conocimiento" ? "con conocimiento ENQORA" : "solo el modelo"} · {(r.ms_promedio / 1000).toFixed(1)} s promedio por pregunta
          </p>
          <ul className="ref-list" role="list">
            {r.casos.map((c) => (
              <li key={c.id}>
                <span className="ref-main">
                  <b>{c.pregunta}</b>
                  <small className="muted-line">
                    Esperado: {c.esperado} · Respondió: {c.obtenido}{c.error ? ` (${c.error})` : ""}{c.explicacion ? ` · ${c.explicacion}` : ""}
                  </small>
                </span>
                <span className={`status status-${c.correcto ? "ok" : "risk"}`}>{c.correcto ? "Correcta" : "Incorrecta"}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
