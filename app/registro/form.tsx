"use client";

import { useActionState } from "react";
import { signUpAction } from "@/app/actions/auth";
import { Notice } from "@/components/auth-card";
import { PasswordField } from "@/components/password-field";
import { SubmitButton } from "@/components/submit-button";

export function SignUpForm() {
  const [state, action] = useActionState(signUpAction, undefined);

  return (
    <form action={action}>
      {state?.error ? <Notice kind="error">{state.error}</Notice> : null}
      <div className="field">
        <label htmlFor="email">Correo electrónico</label>
        <input id="email" name="email" type="email" className="input" autoComplete="email" required />
      </div>
      <PasswordField withMeter />
      <PasswordField name="confirm" label="Repite la contraseña" />
      <div className="field field-check">
        <input id="terms" name="terms" type="checkbox" required />
        <label htmlFor="terms">
          Acepto que ENQORA trate mis datos para crear, verificar y proteger mi cuenta.
        </label>
      </div>
      <SubmitButton pendingText="Creando cuenta…">Crear cuenta</SubmitButton>
    </form>
  );
}
