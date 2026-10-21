"use client";

import { useActionState } from "react";
import { signInAction } from "@/app/actions/auth";
import { Notice } from "@/components/auth-card";
import { PasswordField } from "@/components/password-field";
import { SubmitButton } from "@/components/submit-button";

export function SignInForm({ next }: { next: string }) {
  const [state, action] = useActionState(signInAction, undefined);

  return (
    <form action={action} noValidate>
      {state?.error ? <Notice kind="error">{state.error}</Notice> : null}
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label htmlFor="email">Correo electrónico</label>
        <input id="email" name="email" type="email" className="input" autoComplete="username" required />
      </div>
      <PasswordField autoComplete="current-password" />
      <SubmitButton pendingText="Verificando…">Ingresar</SubmitButton>
    </form>
  );
}
