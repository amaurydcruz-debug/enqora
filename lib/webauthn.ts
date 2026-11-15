import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { b64u, deB64u, sha256 } from "@/lib/webauthn-verificar";
export { ALGS, b64u, deB64u, verificarAsercion, verificarRegistro, type Asercion, type Registro } from "@/lib/webauthn-verificar";

// Llaves de acceso (WebAuthn / passkeys) para firmar con huella o Face ID (0061).
// La biometría nunca sale del dispositivo: el navegador entrega la llave pública (SPKI) al registrar
// y una firma del dispositivo al usar la llave. Aquí se verifica todo con node:crypto, sin dependencias.

const COOKIE = "enq_wa";
const VIGENCIA_MS = 5 * 60 * 1000;


// Dominio (rpId) y origen esperados: los del sitio que atiende la petición.
export async function sitio(): Promise<{ rpId: string; origin: string }> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim().toLowerCase();
  const rpId = host.replace(/:\d+$/, "");
  const local = rpId === "localhost" || rpId === "127.0.0.1";
  return { rpId, origin: `${local ? (h.get("x-forwarded-proto") ?? "http") : "https"}://${host}` };
}

function secreto(): string {
  const s = process.env.ENQORA_SERVICE_TOKEN;
  if (!s || s.length < 32) throw new Error("ENQ_CLAVE_SERVICIO");
  return s;
}

type Desafio = { n: string; p: "registro" | "firma"; u: string; s?: string; h?: string; exp: number };

// El desafío depende de un número al azar y, al firmar, de la huella del documento y de la firma pedida:
// el dispositivo firma literalmente la huella del documento.
export const desafioDe = (d: Desafio) => b64u(sha256(d.n, "|", d.p, "|", d.u, "|", d.s ?? "", "|", d.h ?? ""));

export async function crearDesafio(d: Omit<Desafio, "n" | "exp">): Promise<string> {
  const full: Desafio = { ...d, n: b64u(randomBytes(32)), exp: Date.now() + VIGENCIA_MS };
  const cuerpo = b64u(Buffer.from(JSON.stringify(full)));
  const mac = b64u(createHmac("sha256", secreto()).update(cuerpo).digest());
  (await cookies()).set(COOKIE, `${cuerpo}.${mac}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: VIGENCIA_MS / 1000 });
  return desafioDe(full);
}

// Lee y borra el desafío (un solo uso).
export async function tomarDesafio(p: Desafio["p"], u: string): Promise<Desafio | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value ?? "";
  jar.delete(COOKIE);
  const [cuerpo, mac] = raw.split(".");
  if (!cuerpo || !mac) return null;
  const esperado = createHmac("sha256", secreto()).update(cuerpo).digest();
  const dado = deB64u(mac);
  if (dado.length !== esperado.length || !timingSafeEqual(dado, esperado)) return null;
  try {
    const d = JSON.parse(deB64u(cuerpo).toString("utf8")) as Desafio;
    return d.p === p && d.u === u && d.exp > Date.now() ? d : null;
  } catch { return null; }
}

