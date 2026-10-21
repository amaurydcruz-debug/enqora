import "server-only";
import { cookies } from "next/headers";

// Marca de corta duración que solo se crea al abrir un enlace de recuperación válido.
// Impide que alguien con una sesión abierta cambie la contraseña sin reautenticarse
// entrando directamente a /restablecer.
const NAME = "enq_recovery";
const MAX_AGE = 15 * 60; // 15 minutos

export async function markRecovery() {
  const store = await cookies();
  store.set(NAME, "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function hasRecovery() {
  const store = await cookies();
  return store.get(NAME)?.value === "1";
}

export async function clearRecovery() {
  const store = await cookies();
  store.delete(NAME);
}
