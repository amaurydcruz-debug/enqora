"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AGENT_KEYS, AGENTS, mirrorState, STAGES, type AgentKey, type MirrorStep } from "@/lib/mirror";
import { MirrorCore } from "./mirror-core";

// ENQORA MIRROR · escenario central del espacio de trabajo del caso.
// El núcleo 3D es el protagonista; debajo, solo la etapa actual, una frase breve y el
// progreso real. Las nueve etapas se consultan con «Ver proceso completo».
// Todo se deriva de datos registrados: pasos de análisis, estado del caso y autorizaciones.

type StageState = "pendiente" | "en_curso" | "completado" | "requiere_info" | "esperando_autorizacion" | "revision";
const STAGE_STATE_LABEL: Record<StageState, string> = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  completado: "Completado",
  requiere_info: "Requiere tu respuesta",
  esperando_autorizacion: "Esperando autorización",
  revision: "Revisión profesional",
};

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function MirrorStage({
  steps,
  caseStatus,
  pendingAuthorizations,
  live = true,
}: {
  steps: MirrorStep[];
  caseStatus: string;
  pendingAuthorizations: number;
  live?: boolean;
}) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [showProcess, setShowProcess] = useState(false);
  const { agents, current, phase, message } = mirrorState(steps, caseStatus);

  // La ventana se actualiza sola mientras el caso avanza (solo con la pestaña visible).
  useEffect(() => {
    if (!live || phase === "cerrado" || phase === "listo") return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 20000);
    return () => clearInterval(t);
  }, [live, phase, router]);

  const tasks: Partial<Record<AgentKey, string>> = {};
  for (const s of steps) if (s.status === "trabajando") tasks[s.agent] = s.title;

  const finished = phase === "cerrado";
  const stageState = (i: number): StageState => {
    if (finished || i < current) return "completado";
    if (i > current) return "pendiente";
    const key = STAGES[i].key;
    if (caseStatus === "esperando_cliente") return "requiere_info";
    if (key === "disponible") return pendingAuthorizations ? "esperando_autorizacion" : "completado";
    if (key === "autorizacion" || steps.some((s) => s.stage === key && s.status === "revision")) return "revision";
    return "en_curso";
  };
  const currentState = stageState(current);

  // Avance medible solo si el equipo lo registró en la tarea en curso.
  const measured = [...steps].reverse().find((s) => s.status === "trabajando" && s.progress !== null) ?? null;
  const counts = {
    trabajando: AGENT_KEYS.filter((k) => agents[k] === "trabajando").length,
    revision: AGENT_KEYS.filter((k) => agents[k] === "revision").length,
  };

  return (
    <div className={`ws-stage mirror-${phase}`}>
      <div className="ws-chamber" aria-hidden="true">
        <MirrorCore agents={agents} tasks={tasks} phase={phase} selected={null} reduced={reduced} stage />
        <div className="ws-vignette" />
      </div>

      <div className="ws-now" aria-live="polite">
        <div className="ws-now-head">
          <span className="ws-count">
            {String(Math.min(current + 1, STAGES.length)).padStart(2, "0")} <i>/ {String(STAGES.length).padStart(2, "0")}</i>
          </span>
          <h2 className="ws-stage-title">{STAGES[current].label}</h2>
          <span className={`ws-state st-${currentState}`}>{STAGE_STATE_LABEL[currentState]}</span>
        </div>
        <p className="ws-message">{message}</p>

        <div className="ws-bar" role="img" aria-label={`Etapa ${current + 1} de ${STAGES.length}`}>
          {STAGES.map((s, i) => (
            <span key={s.key} className={`seg st-${stageState(i)}`} />
          ))}
        </div>

        {measured ? (
          <p className="ws-measured">
            {AGENTS[measured.agent]?.short}: {measured.title}
            <span className="ws-measured-bar" role="progressbar" aria-valuenow={measured.progress ?? 0} aria-valuemin={0} aria-valuemax={100}>
              <span className={`fill-p${Math.round((measured.progress ?? 0) / 10)}`} />
            </span>
            <b>{measured.progress}%</b>
          </p>
        ) : null}

        <div className="ws-now-actions">
          {counts.trabajando || counts.revision ? (
            <span className="ws-agents-line">
              {[counts.trabajando ? `${counts.trabajando} agente${counts.trabajando > 1 ? "s" : ""} trabajando` : null,
                counts.revision ? `${counts.revision} en revisión profesional` : null].filter(Boolean).join(" · ")}
            </span>
          ) : null}
          <button type="button" className="ws-process-toggle" aria-expanded={showProcess} aria-controls="ws-process" onClick={() => setShowProcess((v) => !v)}>
            {showProcess ? "Ocultar proceso" : "Ver proceso completo"}
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>

        <div id="ws-process" className={`ws-process${showProcess ? " is-open" : ""}`} inert={!showProcess}>
          <div className="ws-process-clip">
            <ol className="ws-stages" aria-label="Etapas del análisis">
              {STAGES.map((s, i) => {
                const st = stageState(i);
                return (
                  <li key={s.key} className={`st-${st}`} aria-current={i === current ? "step" : undefined}>
                    <span className="ws-stage-n">{String(i + 1).padStart(2, "0")}</span>
                    <span className="ws-stage-name">{s.label}</span>
                    <span className="ws-stage-st">{STAGE_STATE_LABEL[st]}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
