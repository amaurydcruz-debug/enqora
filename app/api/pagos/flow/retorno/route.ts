import { NextResponse, type NextRequest } from "next/server";
import { settleFlowToken, type SettleResult } from "@/lib/flow-settle";

// Regreso del cliente desde Flow (urlReturn). Flow lo envía por POST con el token.
// Se confirma el estado con Flow y se lleva al cliente a su facturación con el resultado.
const OUTCOME: Record<SettleResult, string> = {
  pagado: "pagado",
  ya_confirmado: "pagado",
  duplicado: "duplicado",
  pendiente: "pendiente",
  rechazado: "rechazado",
  anulado: "anulado",
  monto_invalido: "revision",
  error: "pendiente",
};

async function handle(request: NextRequest, token: string | null) {
  const result = await settleFlowToken(token);
  const dest = request.nextUrl.clone();
  dest.pathname = "/facturacion";
  dest.search = `?pago=${OUTCOME[result]}`;
  dest.hash = "cobros";
  return NextResponse.redirect(dest, 303);
}

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const token = form?.get("token");
  return handle(request, typeof token === "string" ? token : null);
}

export async function GET(request: NextRequest) {
  return handle(request, request.nextUrl.searchParams.get("token"));
}
