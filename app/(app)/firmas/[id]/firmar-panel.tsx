"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { firmarAction, rechazarFirmaAction, registrarLecturaAction, type FirmaState } from "@/app/actions/firma";
import { SubmitButton } from "@/components/submit-button";
import { TEXTO_ACEPTACION } from "@/lib/firma";

// Panel de firma: se habilita cuando el firmante llegó al final del documento (queda registrado en la Bóveda).
export function FirmarPanel({ signer, sha, leido }: { signer: string; sha: string; leido: boolean }) {
  const [state, action] = useActionState<FirmaState, FormData>(firmarAction, undefined);
  const [lectura, setLectura] = useState(leido);
  const fin = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (lectura || !fin.current) return;
    const obs = new IntersectionObserver(async ([e]) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      const r = await registrarLecturaAction(signer);
      if (r.ok) setLectura(true);
    }, { threshold: 1 });
    obs.observe(fin.current);
    return () => obs.disconnect();
  }, [lectura, signer]);

  return (
    <>
      <div ref={fin} className="firma-fin" aria-hidden="true" />
      <section className="card firma-panel" aria-labelledby="firmar-t">
        <h2 id="firmar-t">Firmar el documento</h2>
        {!lectura ? <p className="alert alert-info">Lee el documento hasta el final: la firma se habilita cuando llegas al término.</p> : null}
        <form action={action} className="mini-form">
          <input type="hidden" name="id" value={signer} />
          <input type="hidden" name="sha" value={sha} />
          <label className="check firma-acepto"><input type="checkbox" name="acepto" disabled={!lectura} required /> {TEXTO_ACEPTACION}</label>
          <label className="field"><span>Código de 6 dígitos de tu autenticador</span>
            <input name="code" className="input firma-codigo" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required disabled={!lectura} placeholder="000000" /></label>
          {state?.error ? <p className="alert alert-error" role="alert">{state.error}</p> : null}
          <SubmitButton variant="gold" pendingText="Firmando…" disabled={!lectura}>Firmar documento</SubmitButton>
          <p className="muted-line">Tu firma guarda la fecha y hora, tu sesión, el dispositivo y la huella del documento. ENQORA nunca te pide tu ClaveÚnica ni guarda tu huella digital.</p>
        </form>
        <details className="partes-form">
          <summary className="btn btn-ghost btn-inline btn-sm">No quiero firmar</summary>
          <form action={rechazarFirmaAction} className="mini-form">
            <input type="hidden" name="id" value={signer} />
            <textarea name="motivo" className="input" rows={2} required minLength={5} maxLength={500} placeholder="Explica por qué no firmas (por ejemplo, un dato que debe corregirse)" aria-label="Motivo" />
            <SubmitButton variant="ghost" className="btn-inline" pendingText="…">Registrar que no firmo</SubmitButton>
          </form>
        </details>
      </section>
    </>
  );
}
