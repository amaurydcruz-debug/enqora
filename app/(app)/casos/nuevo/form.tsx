"use client";

import { useActionState, useState } from "react";
import { Emblem } from "@/components/emblems";
import { createCaseAction } from "@/app/actions/cases";
import { Notice } from "@/components/auth-card";
import { SubmitButton } from "@/components/submit-button";
import { MODULES, type ModuleKey } from "@/lib/cases";

export function NewCaseForm({ companyId, defaultModule = "contabilidad" }: { companyId: string; defaultModule?: string }) {
  const [state, action] = useActionState(createCaseAction, undefined);
  const [picked, setPicked] = useState(defaultModule);

  return (
    <form action={action}>
      {state?.error ? <Notice kind="error">{state.error}</Notice> : null}
      <input type="hidden" name="company_id" value={companyId} />
      <fieldset className="module-picker">
        <legend>¿Con qué necesitas ayuda?</legend>
        <div className="module-options">
          {(Object.keys(MODULES) as ModuleKey[]).map((key) => (
            <label key={key} className={`module-option${picked === key ? " is-selected" : ""}`}>
              <input type="radio" name="module" value={key} checked={picked === key} onChange={() => setPicked(key)} />
              <Emblem name={key} size="sm" />
              <span className="module-option-text">
                <b>{MODULES[key].name.replace("ENQORA ", "")}</b>
                <small>{MODULES[key].help}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <label htmlFor="title">Resume tu solicitud en una frase</label>
        <input id="title" name="title" className="input" required minLength={3} maxLength={160}
          placeholder="Ej.: El IVA de septiembre no cuadra con mis ventas" />
      </div>
      <div className="field">
        <label htmlFor="description">Cuéntanos más <span className="optional">(opcional)</span></label>
        <textarea id="description" name="description" className="input" rows={5} maxLength={4000}
          placeholder="Qué ocurrió, desde cuándo, qué has intentado. No incluyas contraseñas ni claves." />
        <span className="hint">Podrás adjuntar documentos en el siguiente paso.</span>
      </div>
      <SubmitButton pendingText="Creando solicitud…">Crear solicitud</SubmitButton>
    </form>
  );
}
