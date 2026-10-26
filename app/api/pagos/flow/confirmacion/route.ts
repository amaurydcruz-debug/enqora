import { after, NextResponse, type NextRequest } from "next/server";
import { flushDeliveries } from "@/lib/notify-delivery";
import { settleFlowToken } from "@/lib/flow-settle";

// Confirmación servidor a servidor de Flow (urlConfirmation): llega el token por POST.
// El estado se consulta siempre a Flow; la petición en sí no se considera prueba de pago.
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const token = form?.get("token");
  const result = await settleFlowToken(typeof token === "string" ? token : null);
  after(() => flushDeliveries(request.nextUrl.origin, true));
  return new NextResponse(result === "error" ? "ERROR" : "OK", {
    status: result === "error" ? 500 : 200,
    headers: { "cache-control": "no-store" },
  });
}
