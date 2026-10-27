"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
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
  fuente?: string;
  fuente_url?: string;
  publicada?: string;
};

export type LookupState = { error?: string; result?: PublicCompany; query?: string } | undefined;

export async function lookupRutAction(_: LookupState, fd: FormData): Promise<LookupState> {
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
    return { error: "No pudimos hacer la consulta en este momento. Intenta nuevamente.", query: raw };
  }
  return { result: data as PublicCompany, query: raw };
}
