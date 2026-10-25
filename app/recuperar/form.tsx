"use client";

import { useActionState } from "react";
import { requestResetAction } from "@/app/actions/auth";
import { Notice } from "@/components/auth-card";
import { SubmitButton } from "@/components/submit-button";

export function RequestResetForm() {
  const [state, action] = useActionState(requestResetAction, undefined);

  if (state?.ok) return <Notice kind="ok">{state.ok}</Notice>;

  return (
    <form action={action}>
      {state?.error ? <Notice kind="error">{state.error}</Notice> : null}
      <div className="field">
        <label htmlFor="email">Correo de tu cuenta</label>
        <input id="email" name="email" type="email" className="input" autoComplete="email" required />
      </div>
      <SubmitButton pendingText="Enviando…">Enviar enlace</SubmitButton>
      <p className="hint hint-after">
        Si activaste el segundo factor, también te pediremos el código de tu aplicación autenticadora.
      </p>
    </form>
  );
}
