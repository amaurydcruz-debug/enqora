"use client";

import { useActionState, useState } from "react";
import { rotateServiceTokenAction } from "@/app/actions/billing";
import { Notice } from "@/components/auth-card";
import { SubmitButton } from "@/components/submit-button";

// Genera la clave de servicio y la muestra UNA sola vez para copiarla en Vercel
// (variable ENQORA_SERVICE_TOKEN). La base de datos guarda solo su hash.
export function ServiceToken({ configured, rotatedAt }: { configured: boolean; rotatedAt: string | null }) {
  const [state, action] = useActionState(rotateServiceTokenAction, undefined);
  const [copied, setCopied] = useState(false);

  if (state?.token) {
    return (
      <div className="token-box">
        <Notice kind="info">
          Copia esta clave ahora: no se volverá a mostrar. Pégala en Vercel → Settings → Environment Variables como
          <span className="mono"> ENQORA_SERVICE_TOKEN</span> (Production y Preview) y vuelve a desplegar.
        </Notice>
        <div className="token-row">
          <input className="input mono" readOnly value={state.token} aria-label="Clave de servicio" onFocus={(e) => e.currentTarget.select()} />
          <button
            type="button"
            className="btn btn-gold btn-inline btn-sm"
            onClick={() => navigator.clipboard?.writeText(state.token!).then(() => setCopied(true)).catch(() => setCopied(false))}
          >
            {copied ? "Copiada" : "Copiar"}
          </button>
        </div>
        <p className="muted-line">No la compartas por correo ni por chat. Si se expone, genera una nueva: la anterior deja de funcionar al instante.</p>
      </div>
    );
  }

  return (
    <form action={action} className="mini-form">
      {state?.error ? <Notice kind="error">{state.error}</Notice> : null}
      <p className="muted-line">
        {configured
          ? `Hay una clave configurada${rotatedAt ? ` desde el ${new Intl.DateTimeFormat("es-CL", { dateStyle: "long", timeZone: "America/Santiago" }).format(new Date(rotatedAt))}` : ""}. Generar una nueva invalida la anterior: los pagos en línea y la facturación diaria fallarán hasta actualizarla en Vercel.`
          : "Aún no hay clave de servicio. Sin ella no funcionan los pagos en línea ni la facturación diaria automática."}
      </p>
      <label className="check-inline">
        <input type="checkbox" name="confirm" required />
        Entiendo que debo copiar la clave en Vercel y que la anterior dejará de funcionar.
      </label>
      <SubmitButton variant={configured ? "ghost" : "gold"} className="btn-inline btn-sm" pendingText="Generando…">
        {configured ? "Generar una clave nueva" : "Generar clave de servicio"}
      </SubmitButton>
    </form>
  );
}
