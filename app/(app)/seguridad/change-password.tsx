"use client";

import { useActionState } from "react";
import { changePasswordAction } from "@/app/actions/mfa";
import { Notice } from "@/components/auth-card";
import { PasswordField } from "@/components/password-field";
import { SubmitButton } from "@/components/submit-button";

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePasswordAction, undefined);

  return (
    <form action={action}>
      {state?.error ? <Notice kind="error">{state.error}</Notice> : null}
      {state?.ok ? <Notice kind="ok">{state.ok}</Notice> : null}
      <PasswordField label="Nueva contraseña" withMeter />
      <PasswordField name="confirm" label="Repite la nueva contraseña" />
      <div className="field">
        <label htmlFor="code">Código de tu aplicación autenticadora</label>
        <input
          id="code" name="code" className="input code" inputMode="numeric" autoComplete="one-time-code"
          pattern="\d{6}" maxLength={6} required
        />
      </div>
      <SubmitButton pendingText="Actualizando…">Cambiar contraseña</SubmitButton>
    </form>
  );
}
