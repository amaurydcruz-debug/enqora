"use client";

import { useActionState } from "react";
import { buscarNormativaAction, indexarConocimientoAction, type EstadoBusqueda, type EstadoIndexar } from "@/app/actions/buscador";
import { SubmitButton } from "@/components/submit-button";
import { cita, ORIGENES } from "@/lib/conocimiento-tipos";

const COINCIDENCIA: Record<string, string> = { ambas: "Significado y palabras", significado: "Por significado", palabras: "Por palabras" };

export function PanelBuscador() {
  const [estado, accion] = useActionState<EstadoBusqueda, FormData>(buscarNormativaAction, null);
  return (
    <section className="card">
      <h2>Preguntar</h2>
      <form action={accion} className="inline-form" style={{ flexWrap: "wrap" }}>
        <input name="pregunta" className="input" style={{ flex: "1 1 22rem" }} maxLength={500} required minLength={3} defaultValue={estado?.pregunta ?? ""}
          placeholder="Ej.: ¿qué multa tiene declarar el F29 atrasado?" aria-label="Pregunta" />
        <SubmitButton className="btn-inline btn-sm" pendingText="Buscando…">Buscar</SubmitButton>
      </form>
      {estado?.error ? <p className="lookup-error" role="alert">{estado.error}</p> : null}
      {estado && !estado.error ? (
        <>
          <p role="status" className="muted-line">
            {estado.respaldo
              ? `Fuentes encontradas (${estado.porSignificado ? "búsqueda por significado y palabras" : "búsqueda solo por palabras"}).`
              : "No tengo fuente suficiente en el conocimiento verificado de ENQORA. No respondas de memoria: deriva a un profesional o pide una misión a ENQORA Informa."}
          </p>
          {estado.resultados.length ? (
            <ol className="ref-list" role="list">
              {estado.resultados.map((r) => (
                <li key={r.clave}>
                  <span className="ref-main">
                    <b>{r.titulo}</b>
                    <small className="muted-line">{ORIGENES[r.origen] ?? r.origen} · {COINCIDENCIA[r.coincidencia]}{r.similitud !== null ? ` · similitud ${r.similitud}` : ""}{r.relajada ? " · coincidencia parcial" : ""}</small>
                    <span style={{ whiteSpace: "pre-line", display: "block", margin: ".35rem 0" }}>{r.texto}</span>
                    <small className="muted-line">
                      {cita({ ...r, url: null })}
                      {r.url ? <> · <a href={r.url} target="_blank" rel="noopener noreferrer">ver fuente</a></> : null}
                    </small>
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

export function PanelIndexar() {
  const [estado, accion] = useActionState<EstadoIndexar, FormData>(indexarConocimientoAction, null);
  return (
    <form action={accion} className="inline-form" style={{ flexWrap: "wrap" }}>
      <SubmitButton className="btn-inline btn-sm btn-ghost" pendingText="Actualizando índice… (hasta 1 minuto)">Actualizar índice</SubmitButton>
      {estado && !estado.ok ? <p className="lookup-error" role="alert">{estado.error}</p> : null}
      {estado?.ok ? (
        <p role="status" className="muted-line">
          {estado.cargados.map((c) => `${ORIGENES[c.origen as keyof typeof ORIGENES] ?? c.origen}: ${c.nuevos} nuevos, ${c.actualizados} actualizados, ${c.inactivos} retirados`).join(" · ")}.
          {" "}Vectores calculados: {estado.vectorizados}.
          {estado.pendientes ? ` Faltan ${estado.pendientes}: vuelve a presionar para continuar.` : ""}
          {estado.motivo === "sin_token" ? " Sin HF_TOKEN no se calculan vectores: el buscador funciona solo por palabras." : estado.motivo ? ` El modelo de vectores no respondió (${estado.motivo}).` : ""}
        </p>
      ) : null}
    </form>
  );
}
