"use client";

import { useActionState, useState } from "react";
import { invitarGestorAction, registrarGestorAction } from "@/app/actions/terreno";
import { Notice } from "@/components/auth-card";
import { SubmitButton } from "@/components/submit-button";

// Enlace personal listo para compartir por WhatsApp o copiar.
function Enlace({ link, nombre }: { link: string; nombre?: string }) {
  const [copiado, setCopiado] = useState(false);
  const texto = `Hola${nombre ? ` ${nombre.split(" ")[0]}` : ""}, este es tu enlace personal para instalar la app ENQORA Gestor y activarte: ${link} (vence en 7 días, úsalo solo tú).`;
  return (
    <div className="mini-form">
      <Notice kind="ok">Enlace creado. Compártelo solo con esa persona: es personal, sirve una vez y vence en 7 días.</Notice>
      <input className="input mono" value={link} readOnly aria-label="Enlace de invitación" onFocus={(e) => e.currentTarget.select()} />
      <div className="inline-form">
        <button type="button" className="btn btn-ghost btn-inline btn-sm" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopiado(true); } catch { /* sin portapapeles */ } }}>
          {copiado ? "Copiado" : "Copiar enlace"}
        </button>
        <a className="btn btn-gold btn-inline btn-sm" href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noopener noreferrer">Enviar por WhatsApp</a>
      </div>
    </div>
  );
}

export function RegistrarGestor() {
  const [state, action] = useActionState(registrarGestorAction, undefined);
  return (
    <details className="sub-block" open={!!state}>
      <summary className="sub-title">Registrar un gestor nuevo</summary>
      {state?.error ? <Notice kind="error">{state.error}</Notice> : null}
      {state?.link ? <Enlace link={state.link} nombre={state.nombre} /> : null}
      <form action={action} className="mini-form">
        <input name="nombre" className="input" required minLength={5} maxLength={120} placeholder="Nombre completo" aria-label="Nombre completo" />
        <div className="inline-form">
          <input name="run" className="input input-sm" maxLength={12} placeholder="RUN (12.345.678-9)" aria-label="RUN" />
          <input name="telefono" className="input input-sm" maxLength={16} inputMode="tel" placeholder="Celular (+56 9…)" aria-label="Celular" />
        </div>
        <input name="correo" type="email" className="input" required maxLength={160} placeholder="Correo (con él creará su cuenta)" aria-label="Correo" />
        <div className="inline-form">
          <input name="direccion" className="input" maxLength={240} placeholder="Dirección donde vive" aria-label="Dirección" />
          <input name="comuna" className="input input-sm" maxLength={80} placeholder="Comuna" aria-label="Comuna" />
        </div>
        <input name="cobertura" className="input" maxLength={400} placeholder="Comunas que cubre, separadas por coma (Santiago, Providencia…)" aria-label="Comunas que cubre" />
        <input name="nota" className="input" maxLength={500} placeholder="Nota interna (opcional)" aria-label="Nota" />
        <SubmitButton className="btn-inline btn-sm" pendingText="Registrando…">Registrar y crear enlace</SubmitButton>
      </form>
    </details>
  );
}

export function InvitarGestor({ id, nombre }: { id: string; nombre: string }) {
  const [state, action] = useActionState(invitarGestorAction, undefined);
  return state?.link ? <Enlace link={state.link} nombre={nombre} /> : (
    <form action={action}>
      {state?.error ? <Notice kind="error">{state.error}</Notice> : null}
      <input type="hidden" name="agent_id" value={id} />
      <input type="hidden" name="nombre" value={nombre} />
      <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Nuevo enlace</SubmitButton>
    </form>
  );
}
