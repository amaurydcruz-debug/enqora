import "server-only";
import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";

// Identificador de dispositivo: código aleatorio en una cookie protegida.
// La base de datos solo guarda su huella (SHA-256), nunca el código.
export const DEVICE_COOKIE = "enq_dispositivo";
const DEVICE_RE = /^[0-9a-f]{64}$/;

export async function requestInfo() {
  const h = await headers();
  const forwarded = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim();
  const ip = (forwarded || h.get("x-real-ip") || "").slice(0, 64) || null;
  const userAgent = (h.get("user-agent") ?? "").slice(0, 400) || null;
  return { ip, userAgent, label: deviceLabel(userAgent) };
}

// Devuelve el identificador del navegador actual; lo crea si no existe.
export async function deviceToken(): Promise<string> {
  const store = await cookies();
  const current = store.get(DEVICE_COOKIE)?.value;
  if (current && DEVICE_RE.test(current)) return current;

  const token = randomBytes(32).toString("hex");
  store.set(DEVICE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 400,
  });
  return token;
}

// "Chrome en Windows", "Safari en iPhone"… (orientativo, a partir del navegador).
export function deviceLabel(ua: string | null | undefined): string {
  const s = ua ?? "";
  if (!s) return "Dispositivo desconocido";

  const browser = /Edg\//.test(s)
    ? "Edge"
    : /OPR\/|Opera/.test(s)
      ? "Opera"
      : /SamsungBrowser/.test(s)
        ? "Samsung Internet"
        : /Firefox\/|FxiOS/.test(s)
          ? "Firefox"
          : /Chrome\/|CriOS/.test(s)
            ? "Chrome"
            : /Safari\//.test(s)
              ? "Safari"
              : "Navegador";

  const os = /iPhone/.test(s)
    ? "iPhone"
    : /iPad/.test(s)
      ? "iPad"
      : /Android/.test(s)
        ? "Android"
        : /Windows/.test(s)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(s)
            ? "Mac"
            : /CrOS/.test(s)
              ? "Chromebook"
              : /Linux/.test(s)
                ? "Linux"
                : "sistema desconocido";

  return `${browser} en ${os}`;
}
