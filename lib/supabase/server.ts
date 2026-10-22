import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env";

// Cliente de Supabase para Server Components, Server Actions y Route Handlers.
// La sesión vive en cookies httpOnly gestionadas por @supabase/ssr.
export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = supabaseEnv();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Llamado desde un Server Component: no puede escribir cookies.
          // El middleware ya renueva la sesión en cada petición.
        }
      },
    },
  });
}
