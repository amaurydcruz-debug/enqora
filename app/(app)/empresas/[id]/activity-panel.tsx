"use client";

import { useState } from "react";

export type ActivityView = { id: number; when: string; who: string; text: string; kind: "datos" | "miembros" | "invitaciones" };

const KINDS = { todo: "Todo", datos: "Datos", miembros: "Miembros", invitaciones: "Invitaciones" } as const;
type Kind = keyof typeof KINDS;

// Actividad reciente: al abrir se ven las últimas cinco; «Explorar actividad» muestra el
// registro completo disponible, con filtros por tipo. El registro no se puede modificar.
export function ActivityPanel({ events }: { events: ActivityView[] }) {
  const [explore, setExplore] = useState(false);
  const [kind, setKind] = useState<Kind>("todo");

  if (!events.length) return <p className="muted-line">Sin actividad registrada todavía.</p>;

  const filtered = kind === "todo" ? events : events.filter((e) => e.kind === kind);
  const shown = explore ? filtered : events.slice(0, 5);

  return (
    <>
      {explore ? (
        <div className="filter-row" role="group" aria-label="Filtrar actividad">
          {(Object.keys(KINDS) as Kind[]).map((k) => (
            <button key={k} type="button" className={`filter-chip${kind === k ? " is-active" : ""}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
              {KINDS[k]}
            </button>
          ))}
        </div>
      ) : null}
      {shown.length ? (
        <ol className="act-list">
          {shown.map((e) => (
            <li key={e.id} className={`tl-${e.kind}`}>
              <span className="tl-dot" aria-hidden="true" />
              <span className="tl-text"><b>{e.who}</b> {e.text}</span>
              <time className="tl-when">{e.when}</time>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted-line">No hay movimientos de este tipo.</p>
      )}
      <div className="panel-actions">
        {!explore && events.length > 5 ? (
          <button type="button" className="btn btn-ghost btn-inline btn-sm" onClick={() => setExplore(true)}>
            Explorar actividad ({events.length})
          </button>
        ) : null}
        {explore ? (
          <button type="button" className="btn btn-ghost btn-inline btn-sm" onClick={() => { setExplore(false); setKind("todo"); }}>
            Ver solo lo último
          </button>
        ) : null}
      </div>
      <p className="hint">Registro de seguridad de la empresa. No se puede modificar ni borrar.</p>
    </>
  );
}
