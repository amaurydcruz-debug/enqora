"use client";

import { useActionState } from "react";
import { verifyMfaAction } from "@/app/actions/mfa";
import { Notice } from "@/components/auth-card";
import { SubmitButton } from "@/components/submit-button";

// purpose="reauth": confirma identidad antes de una operación sensible (no registra un ingreso nuevo).
export function VerifyMfaForm({ next, purpose = "login" }: { next: string; purpose?: "login" | "reauth" }) {
  const [state, action] = useActionState(verifyMfaAction, undefined);

  return (
    <form action={action}>
      {state?.error ? <Notice kind="error">{state.error}</Notice> : null}
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="purpose" value={purpose} />
      <div className="field">
        <label htmlFor="code">Código</label>
        <input
          id="code" name="code" className="input code" inputMode="numeric" autoComplete="one-time-code"
          pattern="\d{6}" maxLength={6} required autoFocus
        />
      </div>
      <SubmitButton pendingText="Verificando…">{purpose === "reauth" ? "Confirmar" : "Verificar"}</SubmitButton>
    </form>
  );
}
