import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HallazgoWeb } from "@/lib/cora/web/hallazgos";
import { formatRut } from "@/lib/rut";

// Fuentes oficiales por vía legal (sin navegador ni CAPTCHA), convertidas al mismo formato que los
// hallazgos del bot para que el orquestador CORA las use igual.

// Registro de Empresas y Sociedades: datos abiertos ya cargados en ENQORA.
export async function registroEmpresas(supabase: SupabaseClient, rut: string): Promise<HallazgoWeb | null> {
  const { data, error } = await supabase.rpc("res_registro", { p_rut: rut });
  if (error || !data) return null;
  const d = data as { cargado: boolean; actualizado: string | null; actuaciones: { fecha: string | null; actuacion: string | null; tipo_social: string | null; capital: number | null; comuna: string | null; region: string | null }[] };
  if (!d.cargado) return null; // sin archivos completos, la ausencia de resultados no significa nada
  const rows = d.actuaciones.map((a) => [a.fecha ?? "", a.actuacion ?? "", a.tipo_social ?? "", a.capital != null ? `$${Math.round(a.capital).toLocaleString("es-CL")}` : "", [a.comuna, a.region].filter(Boolean).join(", ")]);
  return {
    portal: "res", estado: rows.length ? "encontrado" : "sin_resultados", consultado: d.actualizado ?? new Date().toISOString(),
    url: "https://datos.gob.cl/dataset/registro-de-empresas-y-sociedades", version: "datos-abiertos",
    detalle: rows.length ? `${rows.length} actuación(es) en el Registro de Empresas y Sociedades (datos abiertos).` : "Sin actuaciones en los datos abiertos del Registro (la empresa pudo constituirse por notaría).",
    coincidencias: rows.length, tabla: rows.length ? { headers: ["Fecha", "Actuación", "Tipo de sociedad", "Capital", "Comuna"], rows } : null,
  };
}

// Mercado Público: API oficial de ChileCompra (requiere ticket). Sin ticket no se consulta (null).
export async function mercadoPublico(rut: string): Promise<HallazgoWeb | null> {
  const ticket = process.env.MERCADOPUBLICO_TICKET?.trim();
  if (!ticket) return null;
  const url = `https://api.mercadopublico.cl/servicios/v1/Publico/Empresas/BuscarProveedor?rutempresaproveedor=${encodeURIComponent(formatRut(rut))}&ticket=${encodeURIComponent(ticket)}`;
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (!res.ok) { console.error("[ENQORA Mercado Público]", res.status); return null; }
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    const lista = (Object.values(data ?? {}).find((v) => Array.isArray(v)) as Record<string, unknown>[] | undefined) ?? [];
    const rows = lista.slice(0, 5).map((e) => [String(e.CodigoEmpresa ?? e.codigoEmpresa ?? ""), String(e.NombreEmpresa ?? e.nombreEmpresa ?? "")]).filter((r) => r[0]);
    return {
      portal: "mercado_publico", estado: rows.length ? "encontrado" : "sin_resultados", consultado: new Date().toISOString(),
      url: "https://www.mercadopublico.cl", version: "api-chilecompra",
      detalle: rows.length ? "Registrada como proveedora en Mercado Público." : "Sin registro como proveedora en Mercado Público para este RUT.",
      coincidencias: rows.length, tabla: rows.length ? { headers: ["Código de proveedor", "Nombre"], rows } : null,
    };
  } catch (e) {
    console.error("[ENQORA Mercado Público]", e instanceof Error ? e.message : e);
    return null;
  }
}
