"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { firmarAction, rechazarFirmaAction, registrarLecturaAction, type FirmaState } from "@/app/actions/firma";
import { firmarConLlaveAction, opcionesFirmaAction } from "@/app/actions/llaves";
import { SubmitButton } from "@/components/submit-button";
import { TEXTO_ACEPTACION } from "@/lib/firma";
import { aB64u, deB64u, soportaLlaves } from "@/lib/webauthn-navegador";

// Panel de firma: se habilita cuando el firmante llegó al final del documento (queda registrado en la Bóveda).
export function FirmarPanel({ signer, sha, leido, conLlave }: { signer: string; sha: string; leido: boolean; conLlave: boolean }) {
  const router = useRouter();
  const [state, action] = useActionState<FirmaState, FormData>(firmarAction, undefined);
  const [lectura, setLectura] = useState(leido);
  const [acepto, setAcepto] = useState(false);
  const [soporta, setSoporta] = useState(false);
  const [huella, setHuella] = useState<{ cargando?: boolean; error?: string }>({});
  const [conCodigo, setConCodigo] = useState(!conLlave);
  useEffect(() => { if (conLlave) soportaLlaves().then((s) => { setSoporta(s); if (!s) setConCodigo(true); }); }, [conLlave]);

  // Firma con huella o Face ID: el dispositivo firma un desafío que contiene la huella del documento.
  async function firmarConHuella() {
    setHuella({ cargando: true });
    const o = await opcionesFirmaAction(signer, sha);
    if ("error" in o) return setHuella({ error: o.error });
    try {
      const cred = (await navigator.credentials.get({ publicKey: { challenge: deB64u(o.challenge), rpId: o.rpId, userVerification: "required", timeout: 120000,
        allowCredentials: o.allow.map((id) => ({ type: "public-key" as const, id: deB64u(id) })) } })) as PublicKeyCredential | null;
      const r = cred?.response as AuthenticatorAssertionResponse | undefined;
      if (!cred || !r) return setHuella({ error: "No se pudo usar la huella o Face ID." });
      const res = await firmarConLlaveAction(signer, sha, { credentialId: aB64u(cred.rawId), clientDataJSON: aB64u(r.clientDataJSON),
        authenticatorData: aB64u(r.authenticatorData), signature: aB64u(r.signature) });
      if (res.error) return setHuella({ error: res.error });
      router.replace(`/firmas/${signer}?aviso=firmado`);
      router.refresh();
    } catch {
      setHuella({ error: "Se canceló o no se pudo usar la huella o Face ID. Puedes intentarlo de nuevo o firmar con tu código." });
    }
  }
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
          <label className="check firma-acepto"><input type="checkbox" name="acepto" disabled={!lectura} required checked={acepto} onChange={(e) => setAcepto(e.target.checked)} /> {TEXTO_ACEPTACION}</label>
          {conLlave && soporta ? (
            <div className="firma-huella">
              <button type="button" className="btn btn-gold" onClick={firmarConHuella} disabled={!lectura || !acepto || huella.cargando}>{huella.cargando ? "Esperando tu huella o rostro…" : "Firmar con huella o Face ID"}</button>
              {huella.error ? <p className="alert alert-error" role="alert">{huella.error}</p> : null}
              {!conCodigo ? <button type="button" className="link-btn" onClick={() => setConCodigo(true)}>Prefiero firmar con el código del autenticador</button> : null}
            </div>
          ) : null}
          {conCodigo ? <>
          <label className="field"><span>Código de 6 dígitos de tu autenticador</span>
            <input name="code" className="input firma-codigo" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required disabled={!lectura} placeholder="000000" /></label>
          {state?.error ? <p className="alert alert-error" role="alert">{state.error}</p> : null}
          <SubmitButton variant={conLlave && soporta ? "ghost" : "gold"} pendingText="Firmando…" disabled={!lectura}>Firmar con el código</SubmitButton>
          </> : null}
          <p className="muted-line">Tu firma guarda la fecha y hora, tu sesión, el dispositivo y la huella del documento. ENQORA nunca te pide tu ClaveÚnica ni guarda tu huella digital: la huella o el rostro se verifican dentro de tu teléfono.{!conLlave ? " Para firmar con huella o Face ID, registra este dispositivo en Seguridad." : ""}</p>
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
