import { SubmitButton } from "@/components/submit-button";
import { logStepAction, updateStepAction } from "@/app/actions/mirror";
import { AGENTS, STAGES, STEP_STATUSES, type MirrorStep } from "@/lib/mirror";

// Consola del equipo: registra y actualiza los pasos reales que muestra ENQORA MIRROR.
export function MirrorConsole({ caseId, steps }: { caseId: string; steps: MirrorStep[] }) {
  const open = steps.filter((s) => s.status !== "completado");

  return (
    <section className="card" id="mirror-consola">
      <h2>Consola MIRROR (equipo)</h2>
      <p>Lo que registres aquí es lo que el cliente ve en la ventana de inteligencia. Registra solo trabajo realizado o en curso.</p>

      {open.length ? (
        <ul className="member-list">
          {open.map((s) => (
            <li key={s.id} className="member">
              <div className="member-who">
                <b>{AGENTS[s.agent]?.short} · {s.title}</b>
                <span className="muted-line">
                  {STAGES.find((x) => x.key === s.stage)?.label} · {STEP_STATUSES[s.status]}
                  {s.visibility === "interno" ? " · interno" : ""}
                </span>
              </div>
              <form action={updateStepAction} className="inline-form">
                <input type="hidden" name="case_id" value={caseId} />
                <input type="hidden" name="step_id" value={s.id} />
                <select name="status" className="input input-sm" defaultValue={s.status} aria-label="Estado del paso">
                  {Object.entries(STEP_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input name="progress" type="number" min={0} max={100} className="input input-sm input-num"
                  defaultValue={s.progress ?? ""} placeholder="%" aria-label="Avance medible (opcional)" />
                <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">OK</SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      ) : null}

      <form action={logStepAction} className="mini-form">
        <input type="hidden" name="case_id" value={caseId} />
        <div className="inline-form">
          <select name="agent" className="input input-sm" defaultValue="tributario" aria-label="Agente">
            {Object.entries(AGENTS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
          </select>
          <select name="stage" className="input input-sm" defaultValue="normativa" aria-label="Etapa">
            {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
        <input name="title" className="input input-sm" required minLength={3} maxLength={160}
          placeholder="Qué se está haciendo (ej.: Revisión del RCV de septiembre)" aria-label="Título del paso" />
        <textarea name="detail" className="input" rows={2} maxLength={2000}
          placeholder="Fundamento o evidencia (fuente, norma, documento)" aria-label="Detalle" />
        <div className="comment-actions">
          <div className="inline-form">
            <select name="status" className="input input-sm" defaultValue="trabajando" aria-label="Estado">
              {Object.entries(STEP_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input name="progress" type="number" min={0} max={100} className="input input-sm input-num" placeholder="%"
              aria-label="Avance medible (opcional)" />
            <label className="check-inline"><input type="checkbox" name="internal" /> Interno</label>
          </div>
          <SubmitButton variant="gold" className="btn-inline btn-sm" pendingText="…">Registrar paso</SubmitButton>
        </div>
      </form>
    </section>
  );
}
