"use client";

import { useActionState, useState, useTransition } from "react";
import { confirmEnrollAction, startEnrollAction, type EnrollState } from "@/app/actions/mfa";
import { Notice } from "@/components/auth-card";
import { SubmitButton } from "@/components/submit-button";

export function EnrollTotp() {
  const [enroll, setEnroll] = useState<EnrollState>(undefined);
  const [starting, startTransition] = useTransition();
  const [state, confirm] = useActionState(confirmEnrollAction, undefined);

  const current = state?.factorId ? state : enroll;

  const generate = () =>
    startTransition(async () => {
      setEnroll(await startEnrollAction());
    });

  if (!current?.factorId) {
    return (
      <>
        {current?.error ? <Notice kind="error">{current.error}</Notice> : null}
        <button type="button" className="btn btn-gold" onClick={generate} disabled={starting}>
          {starting ? "Generando…" : "Generar código QR"}
        </button>
      </>
    );
  }

  return (
    <form action={confirm}>
      {state?.error ? <Notice kind="error">{state.error}</Notice> : null}
      <div className="qr-box">
        <img src={current.qr} alt="Código QR para tu aplicación autenticadora" />
      </div>
      <p className="hint" style={{ textAlign: "center", fontSize: "0.8rem", color: "var(--silver-dim)", margin: "0 0 6px" }}>
        ¿No puedes escanear? Ingresa esta clave manualmente:
      </p>
      <div className="secret">{current.secret}</div>
      <input type="hidden" name="factorId" value={current.factorId} />
      <div className="field">
        <label htmlFor="code">Código de 6 dígitos</label>
        <input
          id="code" name="code" className="input code" inputMode="numeric" autoComplete="one-time-code"
          pattern="\d{6}" maxLength={6} required autoFocus
        />
      </div>
      <SubmitButton pendingText="Verificando…">Activar y continuar</SubmitButton>
    </form>
  );
}
