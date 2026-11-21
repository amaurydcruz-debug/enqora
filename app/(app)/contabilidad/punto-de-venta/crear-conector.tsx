"use client";

import { useActionState } from "react";
import { crearConectorAction } from "@/app/actions/pos";
import { Notice } from "@/components/auth-card";
import { SubmitButton } from "@/components/submit-button";

// Crea la clave del conector. Se muestra UNA sola vez: ENQORA guarda solo su huella y no puede volver a mostrarla.
export function CrearConector({ companyId }: { companyId: string }) {
  const [state, action] = useActionState(crearConectorAction, undefined);
  return (
    <form action={action} className="mini-form">
      {state?.error ? <Notice kind="error">{state.error}</Notice> : null}
      {state?.clave ? (
        <div className="pos-clave" role="status">
          <b>Copia esta clave ahora y pégala en la configuración de tu punto de venta.</b>
          <code className="mono">{state.clave}</code>
          <small>No la volverás a ver. No la envíes por correo ni chat: si se filtra, revócala y crea otra.</small>
        </div>
      ) : null}
      <input type="hidden" name="company_id" value={companyId} />
      <div className="form-grid">
        <label className="field"><span>Nombre de la conexión</span><input name="nombre" className="input" required minLength={2} maxLength={80} placeholder="Ej.: Caja 1 del local" /></label>
        <label className="field"><span>Sistema</span><input name="sistema" className="input" maxLength={40} defaultValue="Vania POS" /></label>
      </div>
      <SubmitButton variant="gold" className="btn-inline btn-sm" pendingText="Creando…">Crear clave de conexión</SubmitButton>
    </form>
  );
}
