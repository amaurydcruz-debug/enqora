"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseEnv } from "./env";

// Cliente de Supabase para el navegador. Se usa solo para subir archivos con
// enlaces firmados que el servidor genera después de validar los permisos.
export function createClient() {
  const { url, key } = supabaseEnv();
  return createBrowserClient(url, key);
}
