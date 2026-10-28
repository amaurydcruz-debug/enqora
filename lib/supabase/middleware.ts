import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseEnv } from "./env";

// Rutas accesibles sin sesión.
// «/mando/acceso» es la entrada propia del Centro de Mando (equipo ENQORA), separada de la de clientes.
// «/equipo/pase» es el enlace de jornada que el Administrador envía a cada integrante del equipo.
const PUBLIC_PREFIXES = ["/equipo/pase", "/mando/acceso", "/ingresar", "/registro", "/verificar-correo", "/recuperar", "/auth", "/comenzar", "/privacidad", "/terminos"];
// Páginas legales: siempre visibles, con o sin sesión y en cualquier etapa del segundo factor.
const ALWAYS = ["/privacidad", "/terminos"];
// Rutas que solo tienen sentido sin sesión.
const GUEST_ONLY = ["/ingresar", "/registro", "/mando/acceso"];

const startsWithAny = (path: string, list: string[]) =>
  list.some((p) => path === p || path.startsWith(p + "/"));

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = supabaseEnv();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser() valida el token contra Supabase Auth (no confía solo en la cookie).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  // La portada (/) es la puerta de entrada pública: bienvenida, consulta por RUT y galería.
  const isPublic = path === "/" || startsWithAny(path, PUBLIC_PREFIXES);

  const redirectTo = (target: string, keepNext = false) => {
    const dest = request.nextUrl.clone();
    dest.pathname = target;
    dest.search = "";
    if (keepNext && path !== "/") dest.searchParams.set("next", path);
    const res = NextResponse.redirect(dest);
    // Conserva las cookies de sesión renovadas.
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  // --- Sin sesión ---
  if (!user) {
    if (isPublic) return response;
    // El Centro de Mando tiene su propia entrada.
    return redirectTo(path === "/mando" || path.startsWith("/mando/") ? "/mando/acceso" : "/ingresar", true);
  }

  // --- Con sesión: nivel de autenticación (AAL) ---
  // aal1 = contraseña; aal2 = contraseña + segundo factor verificado en esta sesión.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const hasFactor = aal?.nextLevel === "aal2";
  const isAal2 = aal?.currentLevel === "aal2";

  // Cerrar sesión, confirmaciones por correo y páginas legales siempre deben funcionar.
  if (path.startsWith("/auth") || startsWithAny(path, ALWAYS)) return response;

  // 1) Tiene MFA pero no lo validó en esta sesión → pedir código.
  if (hasFactor && !isAal2) {
    if (path === "/mfa/verificar") return response;
    return redirectTo("/mfa/verificar", true);
  }

  // 2) No tiene MFA configurado → obligatorio antes de usar la plataforma.
  //    Excepción: restablecer contraseña tras un enlace de recuperación.
  if (!hasFactor) {
    if (path === "/mfa/configurar" || path === "/restablecer") return response;
    return redirectTo("/mfa/configurar", true);
  }

  // 3) Sesión completa (aal2). /mfa/reautenticar sigue disponible para operaciones sensibles.
  if (path === "/mfa/reautenticar") return response;
  if (startsWithAny(path, GUEST_ONLY) || path === "/" || path.startsWith("/mfa")) {
    return redirectTo(path === "/mando/acceso" ? "/mando" : "/panel");
  }

  return response;
}
