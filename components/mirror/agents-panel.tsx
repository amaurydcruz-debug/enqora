"use client";

import { useState } from "react";
import { FactTag } from "@/components/disclosure";
import { AGENT_KEYS, AGENTS, mirrorState, STAGES, STEP_STATUSES, type AgentKey, type AgentState, type MirrorStep } from "@/lib/mirror";
import { AgentIcon } from "./agent-icons";

// Agentes ENQORA bajo demanda: primero la lista con su estado real; al elegir un agente se
// despliega qué hace, qué información usa, su actividad, si requiere revisión o autorización
// y qué resultados produjo. Un agente solo figura «Trabajando» si tiene una tarea registrada.

const STATE: Record<AgentState, string> = {
  inactivo: "En espera",
  trabajando: "Trabajando",
  completado: "Completado",
  revision: "Requiere revisión profesional",
};

const TZ = "America/Santiago";
const fmt = (iso: string) =>
  new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TZ }).format(new Date(iso));

export function AgentsPanel({ steps, caseStatus }: { steps: MirrorStep[]; caseStatus: string }) {
  const { agents } = mirrorState(steps, caseStatus);
  const [open, setOpen] = useState<AgentKey | null>(null);
  const byAgent = (k: AgentKey) => steps.filter((s) => s.agent === k);

  return (
    <ul className="agent-list" role="list">
      {AGENT_KEYS.map((k) => {
        const own = byAgent(k);
        const st = agents[k];
        const isOpen = open === k;
        const working = [...own].reverse().find((s) => s.status === "trabajando");
        const review = own.filter((s) => s.status === "revision");
        const done = own.filter((s) => s.status === "completado");
        const sources = [...new Set(own.map((s) => s.detail).filter((d): d is string => !!d))];
        return (
          <li key={k} className={`agent-item st-${st}${isOpen ? " is-open" : ""}`}>
            <button type="button" className="agent-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : k)} disabled={!own.length}>
              <span className="agent-ico"><AgentIcon agent={k} size={18} /></span>
              <span className="agent-txt">
                <b>{AGENTS[k].name}</b>
                <small>{working ? working.title : own.length ? own[own.length - 1].title : "Sin tareas registradas en tu caso"}</small>
              </span>
              <span className={`agent-st st-${st}`}>{STATE[st]}</span>
            </button>
            {isOpen ? (
              <div className="agent-detail">
                <dl className="agent-facts">
                  <div><dt>Qué está haciendo</dt><dd>{working ? working.title : "No tiene una tarea en curso."}</dd></div>
                  <div><dt>Información que utiliza</dt><dd>{sources.length ? sources.join(" · ") : "No registrada."}</dd></div>
                  <div>
                    <dt>Qué necesita para continuar</dt>
                    <dd>
                      {review.length
                        ? "La revisión de un profesional autorizado."
                        : caseStatus === "esperando_cliente"
                          ? "Antecedentes tuyos: revisa las tareas pendientes del caso."
                          : "Nada pendiente de tu parte."}
                    </dd>
                  </div>
                  <div>
                    <dt>¿Requiere autorización?</dt>
                    <dd>{review.length ? <FactTag kind="revision" /> : "No por ahora."}</dd>
                  </div>
                </dl>
                <div>
                  <h4 className="sub-title">Actividad registrada</h4>
                  <ol className="act-list">
                    {[...own].reverse().map((s) => (
                      <li key={s.id} className={`tl-${s.status === "completado" ? "invitaciones" : s.status === "revision" ? "datos" : "miembros"}`}>
                        <span className="tl-dot" aria-hidden="true" />
                        <span className="tl-text">
                          <b>{s.title}</b> · {STAGES.find((x) => x.key === s.stage)?.label} · {STEP_STATUSES[s.status]}
                          {s.progress !== null && s.status === "trabajando" ? ` · ${s.progress}%` : ""}
                        </span>
                        <time className="tl-when">{fmt(s.updated_at)}</time>
                      </li>
                    ))}
                  </ol>
                </div>
                <div>
                  <h4 className="sub-title">Resultados</h4>
                  {done.length ? (
                    <ul className="plain-list">
                      {done.map((s) => <li key={s.id}>{s.title}</li>)}
                    </ul>
                  ) : (
                    <p className="muted-line">Aún no hay resultados de este agente.</p>
                  )}
                  {done.length ? <p className="hint">Son trabajos terminados, no conclusiones definitivas: el diagnóstico lo valida un profesional.</p> : null}
                </div>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
