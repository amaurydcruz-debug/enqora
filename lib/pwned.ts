import "server-only";
import { createHash } from "node:crypto";

// Comprueba si una contraseña aparece en filtraciones conocidas (Have I Been Pwned)
// usando k-anonimato: solo se envían los 5 primeros caracteres del hash SHA-1,
// nunca la contraseña ni el hash completo.
// Si el servicio no responde, devuelve null (no bloquea el registro); la protección
// definitiva la da la opción "Leaked password protection" de Supabase (plan Pro).
export async function isPasswordPwned(password: string): Promise<boolean | null> {
  const hash = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
      cache: "no-store",
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return null;
    const body = await res.text();
    return body.split("\n").some((line) => {
      const [s, count] = line.trim().split(":");
      return s === suffix && Number(count) > 0;
    });
  } catch {
    return null;
  }
}
