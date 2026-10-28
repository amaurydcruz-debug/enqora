"use client";

import { useActionState, useState } from "react";
import { createTeamPassAction } from "@/app/actions/team";
import { Notice } from "@/components/auth-card";
import { SubmitButton } from "@/components/submit-button";

const ROLES: [string, string][] = [
  ["accountant_pro", "Contador autorizado"],
  ["lawyer_pro", "Abogado autorizado"],
  ["field_agent", "Gestor presencial"],
  ["ops_director", "Director de operaciones"],
];

// Genera el enlace de jornada. Se muestra una sola vez: cópialo y envíalo a la persona.
export function PassForm({ today }: { today: string }) {
  const [state, action] = useActionState(createTeamPassAction, undefined);
  const [copied, setCopied] = useState(false);
  const text = state?.link
    ? `Hola: este es tu enlace personal para trabajar hoy en ENQORA. Es de un solo uso y funciona solo en el horario de la jornada: ${state.link}`
    : "";

  return (
    <>
      {state?.link ? (
        <div className="token-box">
          <Notice kind="ok">Enlace generado para <b>{state.email}</b>. Cópialo y envíalo a esa persona: no se volverá a mostrar.</Notice>
          <div className="token-row">
            <input className="input mono" readOnly value={state.link} aria-label="Enlace de jornada" onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="btn btn-gold btn-inline btn-sm"
              onClick={() => navigator.clipboard?.writeText(state.link!).then(() => setCopied(true)).catch(() => setCopied(false))}>
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
          <p className="inline-form">
            <a className="btn btn-ghost btn-inline btn-sm" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">Enviar por WhatsApp</a>
            <a className="btn btn-ghost btn-inline btn-sm" href={`mailto:${state.email}?subject=${encodeURIComponent("Tu acceso de hoy a ENQORA")}&body=${encodeURIComponent(text)}`}>Enviar por correo</a>
          </p>
        </div>
      ) : null}
      <form action={action} className="catalog-form">
        {state?.error ? <Notice kind="error">{state.error}</Notice> : null}
        <div className="form-grid">
          <div className="field">
            <label htmlFor="pass-email">Correo de la persona</label>
            <input id="pass-email" name="email" type="email" className="input" required autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="pass-role">Rol para la jornada</label>
            <select id="pass-role" name="role" className="input" defaultValue="accountant_pro">
              {ROLES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="pass-day">Día de trabajo</label>
            <input id="pass-day" name="day" type="date" className="input" defaultValue={today} min={today} required />
          </div>
          <div className="field">
            <label htmlFor="pass-note">Nota interna (opcional)</label>
            <input id="pass-note" name="note" className="input" maxLength={200} placeholder="Ej.: cierre de IVA de octubre" />
          </div>
        </div>
        <SubmitButton pendingText="Generando…" className="btn-inline">Generar enlace de jornada</SubmitButton>
      </form>
    </>
  );
}
