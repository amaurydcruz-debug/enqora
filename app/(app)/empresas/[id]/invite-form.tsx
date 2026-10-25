"use client";

import { useActionState, useState } from "react";
import { inviteAction } from "@/app/actions/companies";
import { Notice } from "@/components/auth-card";
import { SubmitButton } from "@/components/submit-button";
import { ROLE_HELP, ROLES, type Role } from "@/lib/company-constants";

// Qué puede hacer cada rol, en lenguaje simple (coincide con los permisos de la base de datos).
const ROLE_CAN: Record<Role, string[]> = {
  owner: ["Todo lo de un administrador", "Nombrar propietarios y administradores"],
  admin: ["Editar los datos de la empresa", "Invitar contadores y lectores", "Ver la actividad de la empresa"],
  accountant: ["Trabajar la contabilidad y los casos", "Ver y subir documentos", "No administra miembros"],
  viewer: ["Consultar la información", "No modifica datos", "No administra miembros"],
};

// Invitar a una persona: correo, rol y lo que ese rol permite. Genera un enlace personal
// que solo funciona con el correo indicado.
export function InviteForm({ companyId, allowedRoles }: { companyId: string; allowedRoles: Role[] }) {
  const [state, action] = useActionState(inviteAction, undefined);
  const [copied, setCopied] = useState(false);
  const [role, setRole] = useState<Role>(allowedRoles.includes("accountant") ? "accountant" : allowedRoles[0]);

  const copy = async () => {
    if (!state?.link) return;
    try {
      await navigator.clipboard.writeText(state.link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <form action={action} className="invite-form">
      {state?.error ? <Notice kind="error">{state.error}</Notice> : null}
      {state?.ok && state.link ? (
        <div className="alert alert-ok">
          <p className="invite-ok">{state.ok}</p>
          <div className="copy-row">
            <input className="input mono" readOnly value={state.link} aria-label="Enlace de invitación" onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="btn btn-ghost btn-inline" onClick={copy}>{copied ? "Copiado" : "Copiar"}</button>
          </div>
        </div>
      ) : null}
      <input type="hidden" name="company_id" value={companyId} />
      <div className="field">
        <label htmlFor="invite-email">Correo de la persona</label>
        <input id="invite-email" name="email" type="email" className="input" required autoComplete="off" placeholder="contador@estudio.cl" />
      </div>

      <fieldset className="role-picker">
        <legend>Rol y permisos</legend>
        <div className="role-options">
          {allowedRoles.map((r) => (
            <label key={r} className={`role-option${role === r ? " is-selected" : ""}`}>
              <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} />
              <span className="role-name">{ROLES[r]}</span>
              <span className="role-help">{ROLE_HELP[r]}</span>
              <ul className="role-can">
                {ROLE_CAN[r].map((t) => <li key={t}>{t}</li>)}
              </ul>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="panel-actions">
        <SubmitButton
          pendingText="Creando invitación…"
          className="btn-inline"
          status={state?.ok ? "done" : state?.error ? "error" : "idle"}
          doneText="Invitación creada"
          errorText="Crear invitación"
        >
          Crear invitación
        </SubmitButton>
      </div>
      <span className="hint">El enlace vence en 7 días. Por seguridad, invitar pide confirmar tu identidad.</span>
    </form>
  );
}
