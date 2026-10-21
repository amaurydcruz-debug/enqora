// Política de contraseñas de ENQORA.
// Supabase usa bcrypt, que solo considera los primeros 72 bytes: por eso el máximo.
export const PASSWORD_MIN = 14;
export const PASSWORD_MAX = 72;

export function passwordProblems(password: string, email?: string): string | null {
  if (password.length < PASSWORD_MIN) return `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`;
  if (new TextEncoder().encode(password).length > PASSWORD_MAX)
    return `La contraseña no puede superar ${PASSWORD_MAX} caracteres.`;
  if (/^(.)\1+$/.test(password)) return "La contraseña no puede ser un solo carácter repetido.";
  const local = email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && password.toLowerCase().includes(local))
    return "La contraseña no debe contener tu correo.";
  return null;
}

// Nivel 0–4 para el medidor visual (orientativo; la validación real ocurre en el servidor).
export function passwordLevel(password: string): number {
  if (!password) return 0;
  if (password.length < PASSWORD_MIN) return 1;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  let score = 2;
  if (password.length >= 18 || kinds >= 3) score = 3;
  if (password.length >= 22 || (kinds === 4 && password.length >= 16)) score = 4;
  return score;
}
