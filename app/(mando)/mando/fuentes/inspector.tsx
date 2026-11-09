"use client";

import { useState, useTransition } from "react";
import { inspeccionarFuenteAction, type EstadoInspector } from "@/app/actions/inspector";

// Inspector de fuentes: muestra archivos, licencia, columnas y primeras filas de una fuente de datos abiertos.
export function InspectorFuentes({ presets }: { presets: { id: string; nombre: string }[] }) {
  const [estado, setEstado] = useState<EstadoInspector>(null);
  const [pendiente, iniciar] = useTransition();
  const r = estado?.ok ? estado.r : null;
  // Se llama a la acción con manejo de errores: si el servidor corta la respuesta (tiempo agotado o caída),
  // se muestra el motivo en vez de dejar la pantalla sin resultado.
  const accion = (form: FormData) => {
    setEstado(null);
    iniciar(async () => {
      try {
        setEstado(await inspeccionarFuenteAction(null, form));
      } catch (e) {
        setEstado({ ok: false, error: `El servidor no entregó respuesta (${e instanceof Error ? e.message : "error de red"}). Intenta de nuevo; si se repite, copia este mensaje.` });
      }
    });
  };
  return (
    <section className="card" id="inspector">
      <h2>Inspector de fuentes</h2>
      <p className="muted-line">
        Antes de construir un conector, ENQORA revisa desde su servidor qué publica la fuente oficial: archivos, licencia, columnas y
        primeras filas. Solo lee; no guarda nada.
      </p>
      <form action={accion} className="inline-form" style={{ flexWrap: "wrap" }}>
        <select name="fuente" className="input input-sm" aria-label="Fuente" defaultValue={presets[0]?.id}>
          {presets.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <button type="submit" className="btn-inline btn-sm" disabled={pendiente}>{pendiente ? "Inspeccionando… (hasta 2 minutos)" : "Inspeccionar"}</button>
      </form>
      {pendiente ? <p className="muted-line" role="status">Leyendo el catálogo y los archivos de la fuente…</p> : null}
      {estado && !estado.ok ? <p className="lookup-error" role="alert">{estado.error}</p> : null}
      {r && !r.muestras.length && !r.avisos.length ? <p className="muted-line">La fuente respondió, pero no se encontraron archivos para mostrar.</p> : null}
      {r ? (
        <>
          {r.muestras.map((m, i) => (
            <div key={i} style={{ overflowX: "auto", marginTop: "1rem" }}>
              <p><b>{m.archivo}</b> · {m.tipo}{m.filas_aprox ? ` · ${m.filas_aprox}` : ""}</p>
              {m.columnas.length ? (
                <table className="table">
                  <thead><tr>{m.columnas.map((c, k) => <th key={k}>{c}</th>)}</tr></thead>
                  <tbody>{m.filas.map((f, k) => <tr key={k}>{f.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
                </table>
              ) : null}
              {m.nota ? <p className="muted-line">{m.nota}</p> : null}
            </div>
          ))}
          {r.avisos.map((a, i) => <p key={i} className="muted-line">Aviso: {a}</p>)}
          <p className="muted-line" style={{ marginTop: "1rem" }}>Resultado completo (cópialo y pégalo en la conversación con Claude):</p>
          <textarea className="input" readOnly rows={12} value={estado?.ok ? estado.texto : ""} style={{ width: "100%", fontFamily: "monospace", fontSize: "12px" }} />
        </>
      ) : null}
    </section>
  );
}
