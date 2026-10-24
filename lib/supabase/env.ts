// Variables públicas de Supabase. Solo se usan la URL y la clave publicable (o anon):
// ENQORA Identity nunca necesita la clave service_role.
// Importante: las variables NEXT_PUBLIC_* se incorporan al compilar. Si se agregan o
// cambian en Vercel, hay que volver a desplegar (Redeploy) para que surtan efecto.

const stripQuotes = (s: string) => s.trim().replace(/^["'`]+|["'`]+$/g, "").trim();

// Normaliza la URL de Supabase y corrige los errores de copia más comunes:
// comillas, espacios, rutas (/rest/v1), barra final, falta de https://
// y la dirección del panel (supabase.com/dashboard/project/<ref>).
function normalizeUrl(raw: string): string | null {
  let value = stripQuotes(raw);
  if (!value) return null;

  const dashboard = value.match(/supabase\.com\/dashboard\/project\/([a-z0-9]{10,})/i);
  if (dashboard) return `https://${dashboard[1].toLowerCase()}.supabase.co`;

  // Solo el identificador del proyecto (Project ID / Reference ID).
  if (/^[a-z0-9]{20}$/i.test(value)) return `https://${value.toLowerCase()}.supabase.co`;

  if (!/^[a-z]+:\/\//i.test(value)) value = `https://${value}`;

  try {
    const u = new URL(value);
    if (!u.hostname.includes(".")) return null;
    if (u.hostname.endsWith(".supabase.co")) u.protocol = "https:";
    if (u.protocol !== "https:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

// Muestra solo el inicio y el final del valor recibido, para diagnosticar sin exponerlo.
function masked(raw: string) {
  const v = raw.trim();
  if (v.length <= 14) return `${v.slice(0, 4)}… (${v.length} caracteres)`;
  return `${v.slice(0, 10)}…${v.slice(-12)} (${v.length} caracteres)`;
}

function rawUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
}

function readKey() {
  return stripQuotes(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  );
}

// Describe qué falta o está mal configurado, sin revelar valores completos.
export function supabaseEnvProblems(): string[] {
  const problems: string[] = [];
  const raw = rawUrl();
  const key = readKey();

  if (!raw.trim()) {
    problems.push("Falta NEXT_PUBLIC_SUPABASE_URL en el entorno Production.");
  } else if (!normalizeUrl(raw)) {
    problems.push(
      `NEXT_PUBLIC_SUPABASE_URL no es una dirección válida. Valor recibido: ${masked(raw)}. Debe ser la Project URL, por ejemplo https://abcdefghijklmnop.supabase.co`,
    );
  }

  if (!key) {
    problems.push("Falta NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (o NEXT_PUBLIC_SUPABASE_ANON_KEY) en el entorno Production.");
  } else if (key.startsWith("sb_secret_")) {
    problems.push("La clave configurada es SECRETA. Usa la clave publishable (sb_publishable_…) o anon.");
  } else if (!key.startsWith("sb_publishable_") && !key.startsWith("eyJ")) {
    problems.push(`La clave de Supabase no parece válida (debe empezar con sb_publishable_ o eyJ). Recibido: ${key.slice(0, 6)}…`);
  }

  return problems;
}

export function supabaseEnv() {
  const problems = supabaseEnvProblems();
  if (problems.length) throw new Error(`Configuración incompleta: ${problems.join(" ")}`);
  return { url: normalizeUrl(rawUrl()) as string, key: readKey() };
}

export function siteUrl() {
  const raw = stripQuotes(process.env.NEXT_PUBLIC_SITE_URL ?? "") || "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}
