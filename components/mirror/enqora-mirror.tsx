"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AGENT_KEYS,
  AGENTS,
  mirrorState,
  STAGES,
  STEP_STATUSES,
  type AgentKey,
  type AgentState,
  type MirrorStep,
  type Phase,
} from "@/lib/mirror";
import { AgentIcon } from "./agent-icons";
import { LABEL_W, mirrorLayout } from "./layout";
import { MirrorCore } from "./mirror-core";

// ENQORA MIRROR — Una ventana hacia la inteligencia de tu empresa.
// Cámara de inteligencia privada: núcleo 3D, agentes conectados y lectura del caso.
// Representa SOLO trabajo real: pasos registrados, estado del caso y documentos del caso.

const PHASE: Record<Phase, { title: string; text: string }> = {
  espera: { title: "Caso recibido", text: "El análisis comienza cuando el equipo asigna a su responsable." },
  trabajando: { title: "Análisis en proceso", text: "Analizamos tu situación con la normativa chilena y tus antecedentes." },
  revision: { title: "Revisión profesional", text: "Un profesional autorizado revisa las conclusiones." },
  listo: { title: "Diagnóstico disponible", text: "El análisis terminó. Tu diagnóstico está listo." },
  cerrado: { title: "Caso finalizado", text: "Todo el trabajo queda en el historial del caso." },
};

const AGENT_STATE_LABEL: Record<AgentState, string> = {
  inactivo: "En espera",
  trabajando: "Trabajando",
  completado: "Completado",
  revision: "Espera autorización",
};

// Clasificación real de los documentos del caso por formato (no por contenido).
const DOC_KINDS = [
  { key: "pdf", label: "PDF", test: /\.pdf$/i },
  { key: "xml", label: "XML (DTE)", test: /\.xml$/i },
  { key: "sheet", label: "Planillas", test: /\.(xlsx?|csv|ods)$/i },
  { key: "other", label: "Otros", test: /./ },
] as const;

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

const TZ = "America/Santiago";
const dayKey = (d: Date) => new Intl.DateTimeFormat("es-CL", { timeZone: TZ, dateStyle: "short" }).format(d);
const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  if (dayKey(d) === dayKey(new Date())) {
    return new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TZ }).format(d);
  }
  return new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", timeZone: TZ }).format(d);
};
const fmtFull = (iso: string) =>
  new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TZ }).format(new Date(iso));

const IconCheck = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
const IconDoc = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 3h7l4 4v14H7z" />
    <path d="M14 3v4h4M10 12h5M10 15.5h5" />
  </svg>
);
const IconPerson = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 20.5c1.4-3.6 4.2-5.5 7.5-5.5s6.1 1.9 7.5 5.5" />
  </svg>
);
const IconArrow = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export function EnqoraMirror({
  steps,
  caseStatus,
  immersive = false,
  live = true,
  caseInfo,
  documents,
}: {
  steps: MirrorStep[];
  caseStatus: string;
  immersive?: boolean;
  live?: boolean;
  caseInfo?: { id: string; folio: string };
  documents?: { file_name: string }[];
}) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [selected, setSelected] = useState<AgentKey | null>(null);
  const chamberRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const { agents, current, phase, message } = mirrorState(steps, caseStatus);

  // Medida real de la cámara: las etiquetas de los agentes se ubican con la misma composición que el núcleo 3D.
  useEffect(() => {
    const el = chamberRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Actualiza la ventana mientras el caso está en curso (solo con la pestaña visible).
  useEffect(() => {
    if (!live || phase === "cerrado" || phase === "listo") return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 20000);
    return () => clearInterval(t);
  }, [live, phase, router]);

  // Último paso de cada agente (los pasos vienen en orden cronológico) y su tarea en curso.
  const lastStep: Partial<Record<AgentKey, MirrorStep>> = {};
  for (const s of steps) lastStep[s.agent] = s;
  const tasks: Partial<Record<AgentKey, string>> = {};
  for (const k of AGENT_KEYS) if (agents[k] === "trabajando" && lastStep[k]) tasks[k] = lastStep[k]!.title;

  const recent = [...steps].reverse().slice(0, 4);
  const agentSteps = selected ? steps.filter((s) => s.agent === selected).reverse().slice(0, 4) : [];
  const waitingAuth = Object.values(agents).includes("revision");
  const stageNo = Math.min(current + 1, STAGES.length);
  const layout = size.w ? mirrorLayout(size.w, size.h) : null;

  const docs = documents ?? [];
  const docCounts = DOC_KINDS.map((k) => ({ ...k, n: 0 }));
  for (const d of docs) {
    const kind = docCounts.find((k) => k.test.test(d.file_name))!;
    kind.n++;
  }

  const agentText = (k: AgentKey) => lastStep[k]?.title ?? "Sin tareas registradas";
  const caseLink = caseInfo ? (immersive ? { href: `/casos/${caseInfo.id}`, label: "Ver ficha" } : { href: `/casos/${caseInfo.id}/mirror`, label: "Pantalla completa" }) : null;

  return (
    <section
      className={`mirror mirror-${phase}${immersive ? " mirror-immersive" : ""}${layout?.wide ? " is-wide" : ""}`}
      aria-label="ENQORA MIRROR, ventana de inteligencia"
    >
      <div className="mirror-chamber" ref={chamberRef}>
        <MirrorCore agents={agents} tasks={tasks} phase={phase} selected={selected} reduced={reduced} />
        <div className="mirror-vignette" aria-hidden="true" />
      </div>

      <header className="mirror-brand">
        <span className="mirror-wordmark">ENQORA <em>MIRROR</em></span>
        <span className="mirror-sub">Inteligencia empresarial</span>
      </header>

      {/* Estado del caso: siempre visible */}
      <div className={`mirror-case mirror-phase-${phase}`}>
        <span className="mirror-case-mark" aria-hidden="true"><span className="mirror-dot" /></span>
        <div className="mirror-case-text">
          {caseInfo ? <span className="mirror-case-folio">Caso <span className="mono">{caseInfo.folio}</span></span> : null}
          <strong>{PHASE[phase].title}</strong>
          <p>{PHASE[phase].text}</p>
        </div>
        {caseLink ? (
          <Link href={caseLink.href} className="mirror-case-link">
            {caseLink.label} <IconArrow />
          </Link>
        ) : null}
      </div>

      {/* Etapa actual y proceso real */}
      <div className="mirror-lead">
        <span className="mirror-count">
          {String(stageNo).padStart(2, "0")} <i>/ {String(STAGES.length).padStart(2, "0")}</i>
        </span>
        <h2>{STAGES[current].label}</h2>
        <div className="mirror-bar" aria-hidden="true">
          {STAGES.map((s, i) => (
            <span key={s.key} className={i < current || phase === "cerrado" ? "done" : i === current ? "current" : ""} />
          ))}
        </div>
        <ol className="mirror-stages" aria-label="Etapas del análisis">
          {STAGES.map((s, i) => {
            const st = i < current || phase === "cerrado" ? "done" : i === current ? "current" : "";
            return (
              <li key={s.key} className={st} aria-current={i === current ? "step" : undefined}>
                <span className="stage-mark" aria-hidden="true">{st === "done" ? <IconCheck /> : null}</span>
                {s.label}
              </li>
            );
          })}
        </ol>
      </div>

      {/* Agentes integrados a la cámara (composición amplia) */}
      {layout?.wide
        ? layout.anchors.map((a) => (
            <button
              key={a.key}
              type="button"
              className={`mirror-agent side-${a.side} st-${agents[a.key]}${selected === a.key ? " is-selected" : ""}`}
              style={{ left: a.boxX, top: a.boxY, width: LABEL_W }}
              onClick={() => setSelected(selected === a.key ? null : a.key)}
              aria-pressed={selected === a.key}
            >
              <span className="agent-icon"><AgentIcon agent={a.key} /></span>
              <span className="agent-body">
                <small>Agente</small>
                <span className="agent-name">{AGENTS[a.key].short}</span>
                <span className="agent-task">{agentText(a.key)}</span>
                <span className="agent-pill">{AGENT_STATE_LABEL[agents[a.key]]}</span>
              </span>
            </button>
          ))
        : null}

      {/* Agentes (composición compacta) */}
      <ul className="mirror-agents" aria-label="Agentes">
        {AGENT_KEYS.map((k) => (
          <li key={k}>
            <button
              type="button"
              className={`mirror-agent-row st-${agents[k]}${selected === k ? " is-selected" : ""}`}
              onClick={() => setSelected(selected === k ? null : k)}
              aria-pressed={selected === k}
            >
              <span className="agent-icon"><AgentIcon agent={k} size={18} /></span>
              <span className="agent-body">
                <span className="agent-name">{AGENTS[k].short}</span>
                <span className="agent-pill">{AGENT_STATE_LABEL[agents[k]]}</span>
                {lastStep[k] ? <span className="agent-task">{lastStep[k]!.title}</span> : null}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {/* Lectura del caso */}
      <div className="mirror-band">
        <div className="band-activity">
          {selected ? (
            <>
              <div className="band-head">
                <span>{AGENTS[selected].name}</span>
                <button type="button" className="band-back" onClick={() => setSelected(null)}>Ver toda la actividad</button>
              </div>
              {agentSteps.length ? (
                <ol className="band-steps">
                  {agentSteps.map((s) => (
                    <li key={s.id} className={`st-${s.status}`}>
                      <span className="tl-dot" aria-hidden="true" />
                      <span className="tl-body">
                        <span className="tl-title">{s.title}</span>
                        <small>
                          {STAGES.find((x) => x.key === s.stage)?.label} · {STEP_STATUSES[s.status]} · {fmtFull(s.updated_at)}
                        </small>
                        {s.progress !== null && s.status === "trabajando" ? (
                          <span className="tl-progress" role="progressbar" aria-valuenow={s.progress} aria-valuemin={0} aria-valuemax={100}>
                            <span className={`fill-p${Math.round(s.progress / 10)}`} />
                          </span>
                        ) : null}
                        {s.detail ? <small className="tl-detail">{s.detail}</small> : null}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="band-empty">Sin tareas registradas para este agente en tu caso.</p>
              )}
            </>
          ) : (
            <>
              <div className="band-head"><span>Actividad registrada</span></div>
              {recent.length ? (
                <ol className="band-timeline">
                  {recent.map((s) => (
                    <li key={s.id} className={`st-${s.status}`}>
                      <span className="tl-dot" aria-hidden="true" />
                      <time dateTime={s.updated_at} suppressHydrationWarning>{fmtWhen(s.updated_at)}</time>
                      <span className="tl-text"><b>{AGENTS[s.agent]?.short}</b> · {s.title}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="band-empty">Aún no hay actividad registrada en tu caso.</p>
              )}
            </>
          )}
        </div>

        <div className="band-message">
          <span className={`band-wave${phase === "trabajando" ? " is-live" : ""}`} aria-hidden="true">
            <i /><i /><i /><i /><i />
          </span>
          <p aria-live="polite">“{message}”</p>
          {waitingAuth ? (
            <p className="band-auth">
              <IconPerson /> Hay conclusiones esperando la autorización de un profesional.
            </p>
          ) : null}
        </div>

        <div className="band-docs">
          <div className="band-head">
            <span>Documentos del caso</span>
            <span className="docs-total">{docs.length} <small>{docs.length === 1 ? "recibido" : "recibidos"}</small></span>
          </div>
          {docs.length ? (
            <>
              <div className="docs-bar" aria-hidden="true">
                {docCounts.filter((k) => k.n).map((k) => (
                  <span key={k.key} className={`docs-seg docs-${k.key}`} style={{ flexGrow: k.n }} />
                ))}
              </div>
              <ul className="docs-kinds">
                {docCounts.map((k) => (
                  <li key={k.key} className={`docs-${k.key}`}>
                    <IconDoc />
                    <span>{k.label}</span>
                    <b>{k.n}</b>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="band-empty">Aún no hay documentos en tu caso.</p>
          )}
        </div>

        <p className="mirror-legal">Muestra el trabajo registrado en tu caso. No representa cálculos ni resultados que aún no existan.</p>
      </div>
    </section>
  );
}
