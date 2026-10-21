"use client";

import { useActionState } from "react";
import { resetPasswordAction } from "@/app/actions/auth";
import { Notice } from "@/components/auth-card";
import { PasswordField } from "@/components/password-field";
import { SubmitButton } from "@/components/submit-button";

export function ResetPasswordForm() {
  const [state, action] = useActionState(resetPasswordAction, undefined);

  return (
    <form action={action}>
      {state?.error ? <Notice kind="error">{state.error}</Notice> : null}
      <PasswordField label="Nueva contraseña" withMeter />
      <PasswordField name="confirm" label="Repite la nueva contraseña" />
      <SubmitButton pendingText="Guardando…">Guardar contraseña</SubmitButton>
    </form>
  );
}
