"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { opcionesRegistroAction, registrarLlaveAction, revocarLlaveAction } from "@/app/actions/llaves";
import { SubmitButton } from "@/components/submit-button";
import { aB64u, deB64u, nombreDispositivo, soportaLlaves } from "@/lib/webauthn-navegador";

export type Llave = { id: string; nombre: string; created_at: string; last_used_at: string | null };

// Huella o Face ID para firmar documentos (ENQORA SIGN). La biometría queda en tu dispositivo.
export function LlavesFirma({ llaves }: { llaves: Llave[] }) {
  const router = useRouter();
  const [soporta, setSoporta] = useState<boolean | null>(null);
  const [estado, setEstado] = useState<{ ok?: string; error?: string; cargando?: boolean }>({});
  useEffect(() => { soportaLlaves().then(setSoporta); }, []);
  const fecha = (d: string | null) => d ? new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: "America/Santiago" }).format(new Date(d)) : "nunca";

  async function registrar() {
    setEstado({ cargando: true });
    const o = await opcionesRegistroAction();
    if ("error" in o) return setEstado({ error: o.error });
    try {
      const cred = (await navigator.credentials.create({ publicKey: {
        challenge: deB64u(o.challenge), rp: { id: o.rpId, name: "ENQORA" },
        user: { id: deB64u(o.userId), name: o.userName, displayName: o.userName },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }, { type: "public-key", alg: -8 }],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
        attestation: "none", timeout: 120000,
        excludeCredentials: o.exclude.map((id) => ({ type: "public-key" as const, id: deB64u(id) })),
      } })) as PublicKeyCredential | null;
      const r = cred?.response as AuthenticatorAttestationResponse | undefined;
      const pk = r?.getPublicKey?.();
      if (!cred || !r || !pk) return setEstado({ error: "Tu navegador no entrega la llave de este dispositivo. Actualízalo o usa otro navegador; mientras tanto puedes firmar con tu código." });
      const res = await registrarLlaveAction({ credentialId: aB64u(cred.rawId), clientDataJSON: aB64u(r.clientDataJSON), authenticatorData: aB64u(r.getAuthenticatorData()),
        publicKey: aB64u(pk), alg: r.getPublicKeyAlgorithm(), nombre: nombreDispositivo() });
      if (res.reauth) { window.location.href = res.reauth; return; }
      if (res.error) return setEstado({ error: res.error });
      setEstado({ ok: "Listo: ya puedes firmar con la huella o Face ID de este dispositivo." });
      router.refresh();
    } catch (e) {
      setEstado({ error: (e as Error)?.name === "InvalidStateError" ? "Este dispositivo ya está registrado." : "Se canceló o no se pudo usar la huella o Face ID." });
    }
  }

  return (
    <div className="llaves-firma" id="llaves">
      {llaves.length ? (
        <ul className="rows">
          {llaves.map((k) => (
            <li key={k.id} className="row-item">
              <span className="row-text"><b>{k.nombre}</b><small>Registrada el {fecha(k.created_at)} · último uso: {fecha(k.last_used_at)}</small></span>
              <form action={revocarLlaveAction}><input type="hidden" name="id" value={k.id} /><SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Quitar</SubmitButton></form>
            </li>
          ))}
        </ul>
      ) : <p className="empty-inline">Aún no registras ningún dispositivo para firmar con huella o Face ID.</p>}
      {soporta === false ? <p className="note">Este navegador o dispositivo no permite huella o Face ID. Puedes firmar con el código de tu autenticador.</p> : (
        <button type="button" className="btn btn-gold btn-inline" onClick={registrar} disabled={estado.cargando || soporta === null}>{estado.cargando ? "Esperando tu huella o rostro…" : "Registrar huella o Face ID de este dispositivo"}</button>
      )}
      {estado.ok ? <p className="alert alert-ok" role="status">{estado.ok}</p> : null}
      {estado.error ? <p className="alert alert-error" role="alert">{estado.error}</p> : null}
      <p className="note">Tu huella o rostro nunca salen del teléfono: ENQORA guarda solo una llave pública. Al firmar, tu dispositivo firma la huella del documento. Registrar pide tu código del autenticador si pasaron más de 15 minutos desde el último.</p>
    </div>
  );
}
