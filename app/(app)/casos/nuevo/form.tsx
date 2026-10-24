"use client";

import { useActionState } from "react";
import { createCaseAction } from "@/app/actions/cases";
import { Notice } from "@/components/auth-card";
import { SubmitButton } from "@/components/submit-button";
import { MODULES } from "@/lib/cases";

export function NewCaseForm({ companyId }: { companyId: string }) {
  const [state, action] = useActionState(createCaseAction, undefined);

  return (
    <form action={action}>
      {state?.error ? <Notice kind="error">{state.error}</Notice> : null}
      <input type="hidden" name="company_id" value={companyId} />
      <div className="field">
        <label htmlFor="module">¿Con qué necesitas ayuda?</label>
        <select id="module" name="module" className="input" defaultValue="contabilidad">
          {Object.entries(MODULES).map(([key, m]) => (
            <option key={key} value={key}>{m.name} — {m.help}</option>
          ))}
        </select>
      </div>
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
