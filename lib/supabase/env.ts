// Variables públicas de Supabase. Solo se usan la URL y la clave publicable (o anon):
// ENQORA Identity nunca necesita la clave service_role.
// Importante: las variables NEXT_PUBLIC_* se incorporan al compilar. Si se agregan o
// cambian en Vercel, hay que volver a desplegar (Redeploy) para que surtan efecto.

function readUrl() {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
}

function readKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    ""
  ).trim();
}

// Describe qué falta o está mal configurado, sin revelar ningún valor.
export function supabaseEnvProblems(): string[] {
  const problems: string[] = [];
  const url = readUrl();
  const key = readKey();

  if (!url) {
    problems.push("Falta NEXT_PUBLIC_SUPABASE_URL.");
  } else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
    problems.push(
      "NEXT_PUBLIC_SUPABASE_URL no tiene el formato esperado (https://xxxx.supabase.co, sin rutas ni barra final).",
    );
  }

  if (!key) {
    problems.push("Falta NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (o NEXT_PUBLIC_SUPABASE_ANON_KEY).");
  } else if (key.startsWith("sb_secret_")) {
    problems.push("La clave configurada es SECRETA. Usa la clave publishable (sb_publishable_…) o anon.");
  } else if (!key.startsWith("sb_publishable_") && !key.startsWith("eyJ")) {
    problems.push("La clave de Supabase no parece válida (debe empezar con sb_publishable_ o eyJ).");
  }

  return problems;
}

export function supabaseEnv() {
  const problems = supabaseEnvProblems();
  if (problems.length) throw new Error(`Configuración incompleta: ${problems.join(" ")}`);
  return { url: readUrl(), key: readKey() };
}

export function siteUrl() {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").trim();
  return raw.replace(/\/+$/, "");
}
