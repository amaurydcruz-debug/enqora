"use client";

import { useActionState } from "react";
import { setStaffRoleAction } from "@/app/actions/cases";
import { Notice } from "@/components/auth-card";
import { SubmitButton } from "@/components/submit-button";
import { STAFF_ROLES } from "@/lib/cases";

export function StaffForm() {
  const [state, action] = useActionState(setStaffRoleAction, undefined);

  return (
    <form action={action}>
      {state?.error ? <Notice kind="error">{state.error}</Notice> : null}
      {state?.ok ? <Notice kind="ok">{state.ok}</Notice> : null}
      <div className="field">
        <label htmlFor="staff-email">Correo de la cuenta</label>
        <input id="staff-email" name="email" type="email" className="input" required autoComplete="off" />
      </div>
      <div className="field">
        <label htmlFor="staff-role">Rol en ENQORA</label>
        <select id="staff-role" name="role" className="input" defaultValue="accountant_pro">
          {Object.entries(STAFF_ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          <option value="">Desactivar del equipo</option>
        </select>
      </div>
      <SubmitButton pendingText="Guardando…" className="btn-inline">Guardar</SubmitButton>
    </form>
  );
}
