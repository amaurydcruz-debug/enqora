"use client";

import { useActionState } from "react";
import { gestorSignUpAction } from "@/app/actions/terreno";
import { Notice } from "@/components/auth-card";
import { PasswordField } from "@/components/password-field";
import { SubmitButton } from "@/components/submit-button";

// Primera vez: el gestor crea su cuenta con el correo que ENQORA registró.
export function GestorSignUpForm({ token, email }: { token: string; email: string }) {
  const [state, action] = useActionState(gestorSignUpAction, undefined);
  return (
    <form action={action}>
      {state?.error ? <Notice kind="error">{state.error}</Notice> : null}
      <input type="hidden" name="token" value={token} />
      <div className="field">
        <label htmlFor="g-email">Correo</label>
        <input id="g-email" className="input" value={email} readOnly />
      </div>
      <div className="field">
        <label htmlFor="g-name">Nombre y apellido</label>
        <input id="g-name" name="full_name" className="input" maxLength={120} autoComplete="name" required />
      </div>
      <PasswordField withMeter />
      <PasswordField name="confirm" label="Repite la contraseña" />
      <label className="check-inline">
        <input type="checkbox" name="terms" required />
        <span>Acepto los <a href="/terminos" target="_blank">Términos</a> y la <a href="/privacidad" target="_blank">Política de privacidad</a>.</span>
      </label>
      <SubmitButton pendingText="Creando tu cuenta…">Crear mi cuenta</SubmitButton>
    </form>
  );
}
