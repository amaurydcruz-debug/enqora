// Llaves de acceso en el navegador (WebAuthn). Solo se usa en componentes de cliente.
export const aB64u = (b: ArrayBuffer | Uint8Array) => {
  const bytes = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = ""; for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
export const deB64u = (s: string) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

export async function soportaLlaves(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
  try { return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch { return false; }
}

// Nombre amable del dispositivo para la lista de llaves.
export function nombreDispositivo(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone"; if (/iPad/.test(ua)) return "iPad"; if (/Android/.test(ua)) return "Teléfono Android";
  if (/Mac/.test(ua)) return "Mac"; if (/Windows/.test(ua)) return "Computador Windows"; return "Mi dispositivo";
}
