import { createHash, createPublicKey, verify } from "node:crypto";

// Verificación WebAuthn pura (sin cookies ni encabezados), para poder probarla.
export const ALGS = [-7, -257, -8] as const; // ES256, RS256, EdDSA
export const b64u = (b: Buffer | Uint8Array) => Buffer.from(b).toString("base64url");
export const deB64u = (s: string) => Buffer.from(s, "base64url");
export const sha256 = (...partes: (Buffer | string)[]) => { const h = createHash("sha256"); for (const p of partes) h.update(p); return h.digest(); };

export type DatosAuth = { rpIdHash: Buffer; up: boolean; uv: boolean; contador: number };
export function leerAuthData(ad: Buffer): DatosAuth {
  if (ad.length < 37) throw new Error("authData");
  const flags = ad[32];
  return { rpIdHash: ad.subarray(0, 32), up: !!(flags & 0x01), uv: !!(flags & 0x04), contador: ad.readUInt32BE(33) };
}

export function revisarComun(clientDataJSON: Buffer, authData: Buffer, tipo: "webauthn.create" | "webauthn.get", desafio: string, rpId: string, origin: string): DatosAuth {
  const cd = JSON.parse(clientDataJSON.toString("utf8")) as { type?: string; challenge?: string; origin?: string };
  if (cd.type !== tipo) throw new Error("tipo");
  if (cd.challenge !== desafio) throw new Error("desafio");
  if (cd.origin !== origin) throw new Error("origen");
  const a = leerAuthData(authData);
  if (!a.rpIdHash.equals(sha256(rpId))) throw new Error("rpId");
  // Presencia y verificación del usuario (huella, rostro o PIN del dispositivo) obligatorias.
  if (!a.up || !a.uv) throw new Error("uv");
  return a;
}

export type Registro = { credentialId: string; clientDataJSON: string; authenticatorData: string; publicKey: string; alg: number };
export function verificarRegistro(r: Registro, desafio: string, rpId: string, origin: string): void {
  if (!/^[A-Za-z0-9_-]{16,1400}$/.test(r.credentialId)) throw new Error("credencial");
  if (!(ALGS as readonly number[]).includes(r.alg)) throw new Error("alg");
  revisarComun(deB64u(r.clientDataJSON), deB64u(r.authenticatorData), "webauthn.create", desafio, rpId, origin);
  createPublicKey({ key: deB64u(r.publicKey), format: "der", type: "spki" }); // la llave pública debe ser válida
}

export type Asercion = { credentialId: string; clientDataJSON: string; authenticatorData: string; signature: string };
export function verificarAsercion(a: Asercion, llave: { public_key: string; alg: number }, desafio: string, rpId: string, origin: string): { contador: number } {
  const cdj = deB64u(a.clientDataJSON);
  const ad = deB64u(a.authenticatorData);
  const datos = revisarComun(cdj, ad, "webauthn.get", desafio, rpId, origin);
  const key = createPublicKey({ key: deB64u(llave.public_key), format: "der", type: "spki" });
  const firmado = Buffer.concat([ad, sha256(cdj)]);
  const sig = deB64u(a.signature);
  const ok = llave.alg === -8 ? verify(null, firmado, key, sig)
    : llave.alg === -7 ? verify("sha256", firmado, { key, dsaEncoding: "der" }, sig)
    : verify("sha256", firmado, key, sig);
  if (!ok) throw new Error("firma");
  return { contador: datos.contador };
}
