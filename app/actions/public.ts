"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { after } from "next/server";
import { dbCode } from "@/lib/db-errors";
import { isValidRut, normalizeRut } from "@/lib/rut";
import { createClient } from "@/lib/supabase/server";

// Consulta pública por RUT (puerta de entrada). Solo datos abiertos del SII sobre personas
// jurídicas; una empresa por consulta y con límite por visitante (lo aplica la base de datos).

export type PublicCompany = {
  estado: "encontrada" | "no_encontrada" | "sin_datos";
  rut?: string;
  razon_social?: string;
  inicio_actividades?: string | null;
  termino_giro?: string | null;
  actividades?: { codigo: string; descripcion: string | null }[];
  total_actividades?: number;
  perfil?: {
    anio_comercial: number; tramo_ventas: string | null; trabajadores: number | null; region: string | null;
    rubro: string | null; subrubro: string | null; tipo_contribuyente: string | null;
  } | null;
  senales?: { codigo: string; gravedad: "alta" | "media" | "baja"; fecha?: string; anio?: number }[];
  fuentes?: { nombre: string; url: string; publicada: string }[];
  carga_parcial?: boolean;
  cargadas?: number;
  catalogo?: { code: string; module: string; name: string; price_from: number | null }[];
  consultado?: string;
  fuente?: string;
  fuente_url?: string;
  publicada?: string;
};

export type LookupState = { error?: string; result?: PublicCompany; query?: string } | undefined;

export async function lookupRutAction(_: LookupState, fd: FormData): Promise<LookupState> {
  try {
    return await lookup(fd);
  } catch (e) {
    // Nunca la pantalla de error general: queda registrado en los registros de Vercel.
    console.error("[ENQORA consulta RUT]", e instanceof Error ? e.message : e);
    return { error: "No pudimos hacer la consulta en este momento. Intenta nuevamente en unos segundos." };
  }
}

async function lookup(fd: FormData): Promise<LookupState> {
  const raw = String(fd.get("rut") ?? "").trim().slice(0, 20);
  const rut = normalizeRut(raw);
  if (!rut || !isValidRut(rut)) {
    return { error: "El RUT no es válido. Revisa el número y el dígito verificador.", query: raw };
  }

  // Identificador anónimo del visitante (hash de su IP): sirve solo para el límite de consultas.
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "desconocido";
  const client = createHash("sha256").update(`enqora-lookup:${ip}`).digest("hex").slice(0, 32);

  const supabase = await createClient({ headers: { "x-enqora-client": client } });
  const { data, error } = await supabase.rpc("lookup_public_company", { p_rut: rut });
  if (error) {
    const code = dbCode(error);
    if (code === "ENQ_DEMASIADAS_CONSULTAS") return { error: "Hiciste muchas consultas seguidas. Intenta nuevamente en una hora.", query: raw };
    if (code === "ENQ_RUT_INVALIDO") return { error: "El RUT no es válido. Revisa el número y el dígito verificador.", query: raw };
    console.error("[ENQORA consulta RUT]", error.message);
    return { error: "No pudimos hacer la consulta en este momento. Intenta nuevamente.", query: raw };
  }
  const result = { ...(data as PublicCompany), consultado: new Date().toISOString() };
  // Servicios del catálogo con su tarifa vigente publicada («desde»), para el informe inicial.
  if (result.estado === "encontrada") {
    const { data: cat } = await supabase.rpc("public_catalog");
    result.catalogo = ((cat ?? []) as { code: string; module: string; name: string; price_from: number | null }[])
      .map((c) => ({ code: c.code, module: c.module, name: c.name, price_from: c.price_from }));
  }
  // Sin datos del SII todavía: la propia consulta pone en marcha el conector (máximo una vez cada 10 minutos).
  if (result?.estado === "sin_datos") {
    try {
      wakeConnector(h);
    } catch {
      // El arranque del conector nunca debe impedir la respuesta al visitante.
    }
  }
  return { result, query: raw };
}

function wakeConnector(h: Headers) {
  const secret = process.env.CRON_SECRET;
  const service = process.env.ENQORA_SERVICE_TOKEN;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!secret || !service || !host) return;
  const proto = h.get("x-forwarded-proto") ?? "https";
  after(async () => {
    try {
      const supabase = await createClient();
      const { data: claimed } = await supabase.rpc("svc_claim_sync_trigger", { p_token: service, p_minutes: 10 });
      if (claimed !== true) return;
      await fetch(`${proto}://${host}/api/cron/nomina?origen=portada`, {
        headers: { authorization: `Bearer ${secret}` }, cache: "no-store", signal: AbortSignal.timeout(4_000),
      }).catch(() => undefined);
    } catch {
      // Silencioso: la consulta del visitante no depende del arranque del conector.
    }
  });
}
