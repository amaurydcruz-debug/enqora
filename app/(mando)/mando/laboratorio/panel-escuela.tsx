"use client";

import { useActionState } from "react";
import { rendirExamenEscuelaAction, type EstadoEscuela } from "@/app/actions/escuela";
import { SubmitButton } from "@/components/submit-button";

type Prov = { id: string; nombre: string; modelo: string };

const ENFOQUE: Record<string, string> = {
  normativa: "Normativa", calculo: "Cálculo", critico: "Crítico", alternativas: "Alternativas", investigacion: "Investigación",
};
const COMPLEJIDAD: Record<string, string> = { simple: "Simple", media: "Media", compleja: "Compleja" };

const segundos = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const miles = (n: number) => n.toLocaleString("es-CL");
const usd = (n: number | null | undefined) => (n === null || n === undefined ? null : `US$ ${n.toFixed(n < 1 ? 4 : 2)}`);

export function PanelEscuela({ proveedores, misiones }: { proveedores: Prov[]; misiones: number }) {
  const [estado, accion] = useActionState<EstadoEscuela, FormData>(rendirExamenEscuelaAction, null);
  const r = estado?.ok ? estado.resultado : null;
  const factor = r && r.tokens_agente ? (r.tokens_escuela / r.tokens_agente).toFixed(1) : null;

  return (
    <div>
      {proveedores.length ? (
        <form action={accion} className="inline-form" style={{ flexWrap: "wrap" }}>
          <select name="proveedor" className="input input-sm" defaultValue={proveedores[0].id} aria-label="Proveedor de los alumnos">
            {proveedores.map((p) => <option key={p.id} value={p.id}>Alumnos: {p.nombre} · {p.modelo}</option>)}
          </select>
          <SubmitButton className="btn-inline btn-sm" pendingText="Rindiendo examen… (2 a 4 minutos)">Rendir examen ({misiones} misiones)</SubmitButton>
        </form>
      ) : <p className="muted-line">No hay proveedores configurados.</p>}

      {estado && !estado.ok ? <p className="lookup-error" role="alert">{estado.error}</p> : null}
      {r ? (
        <>
          <p role="status" style={{ marginTop: "1rem" }}>
            <b>Escuela: {r.aciertos_escuela} de {r.total}</b> · <b>Agente individual: {r.aciertos_agente} de {r.total}</b>
            {" · "}
            {r.aciertos_escuela > r.aciertos_agente ? "La escuela supera al agente individual." : r.aciertos_escuela === r.aciertos_agente ? "Empate: la escuela todavía no demuestra mejora." : "La escuela rinde menos que el agente individual."}
          </p>
          <p className="muted-line">
            Tokens: escuela {miles(r.tokens_escuela)} · agente {miles(r.tokens_agente)}{factor ? ` (la escuela consume ${factor} veces más)` : ""}
            {usd(r.costo_escuela) ? ` · Costo: escuela ${usd(r.costo_escuela)} · agente ${usd(r.costo_agente)}` : " · Costo en USD: configura ENQORA_IA_PRECIOS para verlo"}
            {" · "}Tiempo acumulado: escuela {segundos(r.ms_escuela)} · agente {segundos(r.ms_agente)}
          </p>
          <p className="muted-line">
            Tribunal: {r.tribunal_modelo} ({r.independencia}). Memoria usada: {estado?.ok ? estado.memoria : 0} estrategias aprobadas.
            {estado?.ok && estado.guardado ? ` Examen guardado en la memoria académica${estado.lecciones ? `, con ${estado.lecciones} estrategias propuestas para revisión humana` : ""}.` : " El examen no se guardó: falta ejecutar la migración 0031 en Supabase."}
          </p>
          <ul className="ref-list" role="list">
            {r.misiones.map((m) => (
              <li key={m.mision}>
                <span className="ref-main">
                  <b>{m.problema}</b>
                  <small className="muted-line">
                    {COMPLEJIDAD[m.complejidad]} · Esperado (motor contable): {m.esperado}
                  </small>
                  <small className="muted-line">
                    Escuela: {m.respuesta_escuela} {m.correcto_escuela ? "✓" : "✗"} · Agente individual: {m.agente.falta_dato ? "Se abstiene" : m.agente.valor !== null ? `$${Math.round(m.agente.valor).toLocaleString("es-CL")}` : "Sin respuesta"} {m.agente.correcto ? "✓" : "✗"}
                    {" · "}{miles(m.tokens_escuela)} tokens · {segundos(m.ms_escuela)}
                  </small>
                  <small className="muted-line">
                    Alumnos: {m.alumnos.map((a) => `${ENFOQUE[a.perspectiva]} ${a.correcto ? "✓" : "✗"}${a.puntaje !== undefined ? ` (${a.puntaje}/10)` : ""}`).join(" · ")}
                  </small>
                  {m.tribunal.omitido ? <small className="muted-line">{m.tribunal.omitido}</small> : null}
                  {m.tribunal.fundamento ? <small className="muted-line">Tribunal: {m.tribunal.fundamento}</small> : null}
                  {m.alumnos.filter((a) => a.errores).map((a) => (
                    <small key={a.perspectiva} className="muted-line">Error detectado ({ENFOQUE[a.perspectiva]}): {a.errores}</small>
                  ))}
                </span>
                <span className={`status status-${m.correcto_escuela ? "ok" : "risk"}`}>{m.correcto_escuela ? "Correcta" : "Incorrecta"}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
