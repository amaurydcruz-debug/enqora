// Evita redirecciones abiertas: solo se aceptan rutas internas ("/algo"),
// nunca "//dominio", "/\dominio" ni URLs absolutas.
export function safeNext(value: unknown, fallback = "/panel"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (value.length > 200) return fallback;
  return value;
}
