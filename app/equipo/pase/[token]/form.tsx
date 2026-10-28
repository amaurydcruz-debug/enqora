"use client";

import { useActionState } from "react";
import { teamSignUpAction } from "@/app/actions/team";
import { Notice } from "@/components/auth-card";
import { PasswordField } from "@/components/password-field";
import { SubmitButton } from "@/components/submit-button";

// Primera vez en el equipo: crea la cuenta del correo invitado desde el enlace.
export function TeamSignUpForm({ token, email }: { token: string; email: string }) {
  const [state, action] = useActionState(teamSignUpAction, undefined);
  return (
    <form action={action}>
      {state?.error ? <Notice kind="error">{state.error}</Notice> : null}
      <input type="hidden" name="token" value={token} />
      <div className="field">
        <label htmlFor="team-email">Correo</label>
        <input id="team-email" className="input" value={email} readOnly />
      </div>
      <div className="field">
        <label htmlFor="team-name">Nombre y apellido</label>
        <input id="team-name" name="full_name" className="input" maxLength={120} autoComplete="name" required />
      </div>
      <PasswordField withMeter />
      <PasswordField name="confirm" label="Repite la contraseña" />
      <SubmitButton pendingText="Creando tu acceso…">Crear mi acceso</SubmitButton>
    </form>
  );
}
