"use client";

import { useActionState } from "react";
import { confirmPhoneAction, sendPhoneCodeAction, type PhoneState } from "@/app/actions/notifications";
import { Notice } from "@/components/auth-card";
import { SubmitButton } from "@/components/submit-button";

// Verificación del celular para WhatsApp: código de 6 dígitos enviado por WhatsApp.
export function PhoneForm() {
  const [sent, send] = useActionState<PhoneState, FormData>(sendPhoneCodeAction, undefined);
  const [checked, confirm] = useActionState<PhoneState, FormData>(confirmPhoneAction, undefined);
  const step = checked?.step ?? sent?.step;
  const phone = checked?.phone ?? sent?.phone ?? "";

  if (step === "code") {
    return (
      <form action={confirm} className="mini-form">
        {sent?.ok && !checked ? <Notice kind="info">{sent.ok}</Notice> : null}
        {checked?.error ? <Notice kind="error">{checked.error}</Notice> : null}
        <input type="hidden" name="phone" value={phone} />
        <div className="field">
          <label htmlFor="wa-code">Código recibido</label>
          <input id="wa-code" name="code" className="input mono" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required />
        </div>
        <SubmitButton className="btn-inline btn-sm" pendingText="Verificando…">Verificar número</SubmitButton>
      </form>
    );
  }

  return (
    <form action={send} className="mini-form">
      {sent?.error ? <Notice kind="error">{sent.error}</Notice> : null}
      <div className="field">
        <label htmlFor="wa-phone">Celular</label>
        <input id="wa-phone" name="phone" type="tel" className="input mono" placeholder="+56 9 1234 5678" autoComplete="tel" required maxLength={16} />
      </div>
      <label className="check-inline">
        <input type="checkbox" name="consent" required />
        Acepto recibir avisos de ENQORA por WhatsApp en este número. Puedo desactivarlo cuando quiera.
      </label>
      <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="Enviando…">Enviar código por WhatsApp</SubmitButton>
    </form>
  );
}
