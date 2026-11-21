"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { aplicarPropuestasAction, enviarPreguntasAction } from "@/app/actions/conciliador";
import { Notice } from "@/components/auth-card";
import type { PreguntaPropuesta, Propuesta } from "@/lib/conciliador";

const CATEGORIAS: Record<string, string> = {
  comision_bancaria: "Comisión o cargo bancario", remuneraciones: "Remuneraciones", impuestos: "Pago de impuestos", prestamo: "Préstamo o crédito",
  traspaso: "Traspaso entre cuentas", aporte_retiro: "Aporte o retiro de socios", otro: "Otro",
};
const clp = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("es-CL")}`;

// Agente conciliador: muestra sus propuestas (marcadas las de certeza alta) y las preguntas para el cliente.
// Nada se aplica ni se envía hasta que la persona lo decide.
export function Conciliador({
  companyId, period, propuestas, preguntas, movimientos, documentos, puedePreguntar,
}: {
  companyId: string; period: string; propuestas: Propuesta[]; preguntas: PreguntaPropuesta[];
  movimientos: Record<string, { fecha: string; glosa: string; monto: number }>; documentos: Record<string, string>; puedePreguntar: boolean;
}) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(() => new Set(propuestas.filter((p) => p.certeza === "alta").map((p) => p.movement_id)));
  const [selQ, setSelQ] = useState<Set<string>>(() => new Set(preguntas.map((q) => q.movement_id)));
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const toggle = (set: Set<string>, id: string) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n; };

  if (!propuestas.length && !preguntas.length) return <p className="muted-line">El conciliador no tiene propuestas: no quedan movimientos pendientes que pueda explicar.</p>;

  return (
    <div className="cz">
      {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}
      {propuestas.length ? (
        <>
          <h4>Propuestas ({propuestas.length})</h4>
          <ul className="cz-lista">
            {propuestas.map((p) => {
              const m = movimientos[p.movement_id];
              return (
                <li key={p.movement_id}>
                  <label>
                    <input type="checkbox" checked={sel.has(p.movement_id)} onChange={() => setSel((s) => toggle(s, p.movement_id))} disabled={pending} />
                    <span>
                      <b>{m ? `${m.fecha.slice(8, 10)}-${m.fecha.slice(5, 7)} · ${m.glosa}` : "Movimiento"}</b>
                      <small>→ {p.tipo === "documento" ? (documentos[p.document_id] ?? "Documento") : CATEGORIAS[p.categoria] ?? p.categoria} · {p.motivo}</small>
                    </span>
                    <span className="mono">{m ? clp(m.monto) : ""}</span>
                    <span className={`badge ${p.certeza === "alta" ? "badge-ok" : "badge-gold"}`}>{p.certeza === "alta" ? "Segura" : "Revisar"}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="upload-row">
            <button type="button" className={`btn btn-gold btn-inline btn-sm${pending ? " is-busy" : ""}`} disabled={pending || !sel.size}
              onClick={() => start(async () => {
                const r = await aplicarPropuestasAction(companyId, period, propuestas.filter((p) => sel.has(p.movement_id))).catch(() => ({ error: "No se pudo aplicar.", ok: undefined }));
                setMsg(r.error ? { kind: "error", text: [r.ok, r.error].filter(Boolean).join(" ") } : { kind: "ok", text: r.ok ?? "Listo." });
                router.refresh();
              })}>
              {pending ? "Aplicando…" : `Aplicar ${sel.size} marcada(s)`}
            </button>
            <span className="hint">Las marcadas «Segura» vienen preseleccionadas. Revisa las demás.</span>
          </div>
        </>
      ) : null}

      {preguntas.length ? (
        <>
          <h4>Preguntas para el cliente ({preguntas.length})</h4>
          <p className="muted-line">Movimientos que nadie puede explicar con los documentos. El cliente responde con un toque desde su inicio.</p>
          <ul className="cz-lista">
            {preguntas.map((q) => (
              <li key={q.movement_id}>
                <label>
                  <input type="checkbox" checked={selQ.has(q.movement_id)} onChange={() => setSelQ((s) => toggle(s, q.movement_id))} disabled={pending || !puedePreguntar} />
                  <span><b>{q.pregunta}</b><small>Opciones: {q.opciones.join(" · ")}</small></span>
                </label>
              </li>
            ))}
          </ul>
          {puedePreguntar ? (
            <button type="button" className="btn btn-ghost btn-inline btn-sm" disabled={pending || !selQ.size}
              onClick={() => start(async () => {
                const r = await enviarPreguntasAction(companyId, period, preguntas.filter((q) => selQ.has(q.movement_id))).catch(() => ({ error: "No se pudieron enviar.", ok: undefined }));
                setMsg(r.error ? { kind: "error", text: r.error } : { kind: "ok", text: r.ok ?? "Enviadas." });
                router.refresh();
              })}>
              Enviar {selQ.size} pregunta(s) al cliente
            </button>
          ) : <p className="muted-line">Las preguntas las envía el contador o el equipo ENQORA.</p>}
        </>
      ) : null}
    </div>
  );
}
