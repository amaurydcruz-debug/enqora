import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "@/lib/supabase/env";

// Registro de uso de IA (migración 0049). Cada llamada a un modelo deja una fila con el módulo, el proveedor,
// el modelo, los tokens, las búsquedas web, la duración y si funcionó. NUNCA se guarda el contenido.
// Usa la clave de servicio ENQORA_SERVICE_TOKEN (no la service_role). Si falta o la base falla, no interrumpe
// al módulo: el registro es de mejor esfuerzo.

export type ModuloIA =
  | "consulta_estrategica" | "caso_publico" | "carpeta_tributaria" | "asesor_precios"
  | "vigilancia_normativa" | "agentes_casos" | "laboratorio" | "escuela";

export const MODULOS_IA: Record<string, string> = {
  consulta_estrategica: "Consulta Estratégica (pública)",
  caso_publico: "«Tu caso» (pública)",
  carpeta_tributaria: "Lectura de Carpeta Tributaria",
  asesor_precios: "Asesor de precios",
  vigilancia_normativa: "Vigilancia normativa",
  agentes_casos: "Agentes de casos",
  laboratorio: "Laboratorio de evaluación",
  escuela: "Escuela de agentes",
};

export type RegistroIA = {
  modulo: ModuloIA; proveedor?: string; modelo?: string;
  entrada?: number; salida?: number; busquedas?: number; ms: number; ok: boolean; motivo?: string;
};

export async function registrarUsoIA(r: RegistroIA): Promise<void> {
  const token = process.env.ENQORA_SERVICE_TOKEN;
  if (!token) return;
  try {
    const { url, key } = supabaseEnv();
    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await sb.rpc("svc_registrar_uso_ia", { p_token: token, p: { ...r, motivo: r.motivo?.slice(0, 300) } });
    if (error && !/svc_registrar_uso_ia|does not exist/i.test(error.message)) console.error("[ENQORA IA uso]", error.message);
  } catch (e) {
    console.error("[ENQORA IA uso]", e instanceof Error ? e.message : e);
  }
}

// Medidor para los módulos que llaman directo a la API de Anthropic (con búsqueda web o PDF).
// sumar(data) después de cada respuesta; fin(ok, motivo) una sola vez al terminar.
type RespuestaAPI = { usage?: { input_tokens?: number; output_tokens?: number; server_tool_use?: { web_search_requests?: number } } };
export function medirAnthropic(modulo: ModuloIA, modelo: string) {
  const t0 = Date.now();
  let entrada = 0, salida = 0, busquedas = 0, cerrado = false;
  return {
    sumar(d: RespuestaAPI | null | undefined) {
      entrada += d?.usage?.input_tokens ?? 0;
      salida += d?.usage?.output_tokens ?? 0;
      busquedas += d?.usage?.server_tool_use?.web_search_requests ?? 0;
    },
    async fin(ok: boolean, motivo?: string) {
      if (cerrado) return;
      cerrado = true;
      await registrarUsoIA({ modulo, proveedor: "anthropic", modelo, entrada, salida, busquedas, ms: Date.now() - t0, ok, motivo });
    },
  };
}
