"use client";

import { useActionState, useState } from "react";
import { inviteAction } from "@/app/actions/companies";
import { Notice } from "@/components/auth-card";
import { SubmitButton } from "@/components/submit-button";
import { ROLE_HELP, ROLES, type Role } from "@/lib/company-constants";

export function InviteForm({ companyId, allowedRoles }: { companyId: string; allowedRoles: Role[] }) {
  const [state, action] = useActionState(inviteAction, undefined);
  const [copied, setCopied] = useState(false);

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
    <form action={action}>
      {state?.error ? <Notice kind="error">{state.error}</Notice> : null}
      {state?.ok && state.link ? (
        <div className="alert alert-ok">
          <p style={{ margin: "0 0 8px" }}>{state.ok}</p>
          <div className="copy-row">
            <input className="input mono" readOnly value={state.link} onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="btn btn-ghost btn-inline" onClick={copy}>{copied ? "Copiado" : "Copiar"}</button>
          </div>
        </div>
      ) : null}
      <input type="hidden" name="company_id" value={companyId} />
      <div className="field">
        <label htmlFor="invite-email">Correo de la persona</label>
        <input id="invite-email" name="email" type="email" className="input" required autoComplete="off" />
      </div>
      <div className="field">
        <label htmlFor="invite-role">Rol</label>
        <select id="invite-role" name="role" className="input" defaultValue="accountant">
          {allowedRoles.map((r) => (
            <option key={r} value={r}>{ROLES[r]} — {ROLE_HELP[r]}</option>
          ))}
        </select>
      </div>
      <SubmitButton pendingText="Creando invitación…" className="btn-inline">Crear invitación</SubmitButton>
    </form>
  );
}
