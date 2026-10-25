"use client";

import { useActionState, useMemo, useState } from "react";
import { saveOnboardingAction } from "@/app/actions/diagnosis";
import { Notice } from "@/components/auth-card";
import { FactTag } from "@/components/disclosure";
import { Emblem } from "@/components/emblems";
import { SubmitButton } from "@/components/submit-button";
import { MODULES, type ModuleKey } from "@/lib/cases";
import { categoryByKey } from "@/lib/discovery";
import { answerText, isComplete, QUESTIONS, suggestRoutes, type Answers } from "@/lib/onboarding";

// Onboarding guiado: una pregunta a la vez, por opciones. Al final, la ruta sugerida
// (reglas explícitas sobre las respuestas) y la solicitud del diagnóstico gratuito.
export function OnboardingWizard({
  companyId,
  companyName,
  initial,
  defaultModule,
  freeAvailable,
  canEdit,
}: {
  companyId: string;
  companyName: string;
  initial: Answers;
  defaultModule: ModuleKey | null;
  freeAvailable: boolean;
  canEdit: boolean;
}) {
  const [state, action] = useActionState(saveOnboardingAction, undefined);
  const [answers, setAnswers] = useState<Answers>(initial);
  const total = QUESTIONS.length;
  const [step, setStep] = useState(isComplete(initial) || !canEdit ? total : 0);
  const routes = useMemo(() => suggestRoutes(answers), [answers]);
  const [module, setModule] = useState<ModuleKey>(defaultModule ?? routes[0]?.module ?? "general");
  const complete = isComplete(answers);

  const q = step < total ? QUESTIONS[step] : null;
  const value = q ? answers[q.key] : undefined;
  const chosen = (v: string) => (Array.isArray(value) ? value.includes(v) : value === v);

  const pick = (v: string) => {
    if (!q) return;
    if (q.multi) {
      const list = Array.isArray(value) ? value : [];
      const next = list.includes(v) ? list.filter((x) => x !== v) : list.length < q.multi ? [...list, v] : list;
      setAnswers((a) => {
        const copy = { ...a };
        if (next.length) copy[q.key] = next;
        else delete copy[q.key];
        return copy;
      });
    } else {
      setAnswers((a) => ({ ...a, [q.key]: v }));
      setStep((s) => Math.min(s + 1, total));
    }
  };
  const canNext = q ? !q.required || (Array.isArray(value) ? value.length > 0 : !!value) : false;

  return (
    <div className="onb">
      <ol className="onb-dots" aria-label="Avance">
        {QUESTIONS.map((x, i) => (
          <li key={x.key} className={i < step ? "done" : i === step ? "current" : ""} aria-current={i === step ? "step" : undefined}>
            <span className="sr-only">{x.title}</span>
          </li>
        ))}
        <li className={step === total ? "current" : ""} aria-current={step === total ? "step" : undefined}>
          <span className="sr-only">Tu ruta</span>
        </li>
      </ol>

      {q ? (
        <section className="onb-step" aria-labelledby={`q-${q.key}`} key={q.key}>
          <span className="eyebrow">Pregunta {step + 1} de {total}{q.required ? "" : " · opcional"}</span>
          <h2 id={`q-${q.key}`}>{q.title}</h2>
          {q.lead ? <p className="panel-lead">{q.lead}</p> : null}
          <div className={`onb-options${q.options.some((o) => o.emblem) ? " with-emblem" : ""}`} role="group" aria-label={q.title}>
            {q.options.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`onb-option${chosen(o.value) ? " is-selected" : ""}`}
                aria-pressed={chosen(o.value)}
                onClick={() => pick(o.value)}
                disabled={!canEdit}
              >
                {o.emblem ? <Emblem name={o.emblem} size="sm" /> : null}
                <span className="onb-option-text">
                  <b>{o.label}</b>
                  {o.help ? <small>{o.help}</small> : null}
                </span>
                <span className="onb-check" aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className="onb-nav">
            <button type="button" className="btn btn-ghost btn-inline btn-sm" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              Anterior
            </button>
            {q.multi || !q.required ? (
              <button type="button" className="btn btn-gold btn-inline btn-sm" onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
                {value ? "Continuar" : "Omitir"}
              </button>
            ) : value ? (
              <button type="button" className="btn btn-ghost btn-inline btn-sm" onClick={() => setStep((s) => s + 1)}>Continuar</button>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="onb-review" aria-labelledby="ruta-titulo">
          <span className="eyebrow">Tu ruta ENQORA · {companyName}</span>
          <h2 id="ruta-titulo">{complete ? "Esto es lo que te sugerimos revisar" : "Faltan algunas respuestas"}</h2>

          {complete && routes.length ? (
            <>
              <p className="panel-lead">
                <FactTag kind="interpretacion" /> Sugerencias según tus respuestas. No son un diagnóstico: el diagnóstico lo
                prepara el equipo ENQORA y lo valida un profesional.
              </p>
              <ol className="route-list">
                {routes.map((r, i) => (
                  <li key={r.category} className="route-item">
                    <span className="route-n">{String(i + 1).padStart(2, "0")}</span>
                    <Emblem name={categoryByKey(r.category)?.emblem ?? r.module} size="sm" />
                    <span className="route-text">
                      <b>{r.title}</b>
                      <small>{r.reason}</small>
                    </span>
                  </li>
                ))}
              </ol>
            </>
          ) : complete ? (
            <p className="panel-lead">Con tus respuestas no vemos un tema puntual. Cuéntanos qué necesitas y el equipo lo revisará.</p>
          ) : (
            <p className="panel-lead">Responde las preguntas obligatorias para ver tu ruta y pedir tu diagnóstico gratuito.</p>
          )}

          <details className="onb-answers">
            <summary>Tus respuestas</summary>
            <dl>
              {QUESTIONS.map((x, i) => (
                <div key={x.key}>
                  <dt>{x.title}</dt>
                  <dd>
                    {answerText(x.key, answers[x.key]) ?? <span className="muted-line">Sin responder</span>}
                    {canEdit ? <button type="button" className="link-btn" onClick={() => setStep(i)}>Cambiar</button> : null}
                  </dd>
                </div>
              ))}
            </dl>
          </details>

          {canEdit ? (
            <form action={action} className="onb-form">
              {state?.error ? <Notice kind="error">{state.error}</Notice> : null}
              <input type="hidden" name="company_id" value={companyId} />
              <input type="hidden" name="answers" value={JSON.stringify(answers)} />

              {freeAvailable && complete ? (
                <div className="onb-free">
                  <div className="onb-free-head">
                    <Emblem name="diagnostico" size="md" />
                    <div>
                      <h3>Tu diagnóstico gratuito</h3>
                      <p className="muted-line">
                        El equipo ENQORA revisa tu situación y te entrega un informe por situaciones: qué ocurre, qué exige la
                        normativa, alternativas, riesgos, costo estimado y nivel de certeza. Puedes llevarlo a un contador o abogado
                        independiente para verificarlo.
                      </p>
                    </div>
                  </div>
                  <fieldset className="field">
                    <legend className="field-label">Área del diagnóstico</legend>
                    <select name="module" className="input" value={module} onChange={(e) => setModule(e.target.value as ModuleKey)}>
                      {(Object.keys(MODULES) as ModuleKey[]).map((k) => (
                        <option key={k} value={k}>{MODULES[k].name.replace("ENQORA ", "")} · {MODULES[k].help}</option>
                      ))}
                    </select>
                  </fieldset>
                  <div className="field">
                    <label htmlFor="title">En una frase, ¿qué necesitas resolver?</label>
                    <input id="title" name="title" className="input" maxLength={160} placeholder="Ej.: Tengo tres meses de IVA sin declarar" />
                  </div>
                  <div className="field">
                    <label htmlFor="description">Cuéntanos más <span className="optional">(opcional)</span></label>
                    <textarea id="description" name="description" className="input" rows={4} maxLength={4000}
                      placeholder="Qué ocurrió, desde cuándo y qué documentos tienes. No incluyas contraseñas ni claves." />
                  </div>
                  <div className="panel-actions">
                    <SubmitButton name="intent" value="diagnostico" pendingText="Enviando…">Pedir mi diagnóstico gratuito</SubmitButton>
                    <SubmitButton name="intent" value="guardar" variant="ghost" className="btn-inline" pendingText="Guardando…">
                      Solo guardar mis respuestas
                    </SubmitButton>
                  </div>
                </div>
              ) : (
                <div className="panel-actions">
                  <SubmitButton name="intent" value="guardar" pendingText="Guardando…" disabled={!Object.keys(answers).length}>
                    Guardar mis respuestas
                  </SubmitButton>
                  {!complete ? (
                    <button type="button" className="btn btn-ghost btn-inline" onClick={() => setStep(QUESTIONS.findIndex((x) => x.required && !answers[x.key]))}>
                      Responder lo que falta
                    </button>
                  ) : null}
                </div>
              )}
            </form>
          ) : (
            <p className="muted-line">Tu rol en esta empresa es de solo lectura: puedes ver las respuestas, pero no cambiarlas.</p>
          )}
        </section>
      )}
    </div>
  );
}
