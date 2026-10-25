import "server-only";
import { flowEnabled, flowGetStatus } from "@/lib/flow";
import { createClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SettleResult = "pagado" | "pendiente" | "rechazado" | "anulado" | "monto_invalido" | "duplicado" | "ya_confirmado" | "error";

// Consulta a Flow el estado real del pago (nunca confía en lo que llega en la petición) y lo
// informa a la base de datos con la clave de servicio. Idempotente: se puede llamar varias veces.
export async function settleFlowToken(token: string | null): Promise<SettleResult> {
  if (!flowEnabled() || !token || token.length > 200) return "error";
  let st;
  try {
    st = await flowGetStatus(token);
  } catch (e) {
    console.error("[ENQORA pagos] No se pudo consultar Flow:", e instanceof Error ? e.message : e);
    return "error";
  }
  if (!UUID_RE.test(st.commerceOrder) || !Number.isFinite(st.amount)) return "error";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("gateway_settle", {
    p_token: process.env.ENQORA_SERVICE_TOKEN,
    p_payment: st.commerceOrder,
    p_status: st.status,
    p_amount: Math.round(st.amount),
    p_currency: st.currency,
    p_order: st.flowOrder,
    p_media: st.media,
  });
  if (error) {
    console.error("[ENQORA pagos] gateway_settle:", error.message);
    return "error";
  }
  return (data as SettleResult) ?? "error";
}
