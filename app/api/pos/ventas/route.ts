import { NextResponse, type NextRequest } from "next/server";
import { createClient as createSupabase } from "@supabase/supabase-js";
import { dbCode } from "@/lib/db-errors";
import { supabaseEnv } from "@/lib/supabase/env";

// API del punto de venta (0068): el POS envía el resumen diario de ventas con su clave de conexión.
//   POST /api/pos/ventas
//   Authorization: Bearer enq_pos_…  (la crea el dueño en Contabilidad → Punto de venta; se puede revocar)
//   { "dias": [{ "fecha": "2026-11-20", "n_ventas": 42, "total": 385900, "efectivo": 120000, "debito": 200000,
//                "credito": 65900, "transferencia": 0, "otros": 0, "neto": null, "iva": null, "exento": null }] }
// Hasta 62 días por envío y 60 envíos por hora. Reenviar un día lo reemplaza. Ver docs/API-PUNTO-DE-VENTA.md.
export const dynamic = "force-dynamic";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-max-age": "86400",
};
const responder = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: CORS });

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(request: NextRequest) {
  const clave = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!/^enq_pos_[0-9a-f]{48}$/.test(clave)) return responder({ ok: false, error: "clave_invalida" }, 401);
  const body = (await request.json().catch(() => null)) as { dias?: unknown } | null;
  if (!body || !Array.isArray(body.dias) || !body.dias.length || body.dias.length > 62) {
    return responder({ ok: false, error: "formato", detalle: "Envía { dias: [...] } con 1 a 62 días." }, 400);
  }
  const { url, key } = supabaseEnv();
  const supabase = createSupabase(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc("pos_api_cargar", { p_clave: clave, p_dias: body.dias });
  if (error) {
    const code = dbCode(error);
    const status = code === "ENQ_SIN_PERMISO" ? 401 : code === "ENQ_DEMASIADAS_CONSULTAS" ? 429 : code === "ENQ_PERIODO_CERRADO" ? 409 : 400;
    return responder({ ok: false, error: code ?? "error" }, status);
  }
  return responder({ ok: true, ...(data as object) });
}
