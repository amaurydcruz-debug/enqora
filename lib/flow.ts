import "server-only";
import { createHmac } from "node:crypto";

// Pasarela de pago Flow (Webpay, tarjetas, transferencia en línea y otros medios en Chile).
// Variables de entorno (solo en Vercel, nunca en el repositorio):
//   FLOW_API_KEY, FLOW_SECRET_KEY  · credenciales del comercio en Flow
//   FLOW_API_URL                   · https://sandbox.flow.cl/api (pruebas) o https://www.flow.cl/api (producción)
//   ENQORA_SERVICE_TOKEN           · clave de servicio generada en Centro de Mando → Cobros
// Firma: parámetros ordenados alfabéticamente, concatenados nombre+valor, HMAC-SHA256 con la clave secreta (parámetro «s»).

const apiUrl = () => (process.env.FLOW_API_URL || "https://sandbox.flow.cl/api").replace(/\/$/, "");

export const flowEnabled = () =>
  !!(process.env.FLOW_API_KEY && process.env.FLOW_SECRET_KEY && process.env.ENQORA_SERVICE_TOKEN);

export const flowIsSandbox = () => apiUrl().includes("sandbox");

function signed(params: Record<string, string>) {
  const all: Record<string, string> = { ...params, apiKey: process.env.FLOW_API_KEY ?? "" };
  const keys = Object.keys(all).sort();
  const toSign = keys.map((k) => `${k}${all[k]}`).join("");
  const s = createHmac("sha256", process.env.FLOW_SECRET_KEY ?? "").update(toSign).digest("hex");
  const body = new URLSearchParams();
  keys.forEach((k) => body.set(k, all[k]));
  body.set("s", s);
  return body;
}

export type FlowOrder = { url: string; token: string; flowOrder: number };

export async function flowCreatePayment(input: {
  commerceOrder: string;
  subject: string;
  amount: number;
  email: string;
  urlConfirmation: string;
  urlReturn: string;
}): Promise<FlowOrder> {
  const body = signed({
    commerceOrder: input.commerceOrder,
    subject: input.subject.slice(0, 120),
    currency: "CLP",
    amount: String(Math.round(input.amount)),
    email: input.email,
    paymentMethod: "9", // todos los medios habilitados en el comercio
    urlConfirmation: input.urlConfirmation,
    urlReturn: input.urlReturn,
  });
  const res = await fetch(`${apiUrl()}/payment/create`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const data = (await res.json().catch(() => null)) as Partial<FlowOrder> & { message?: string } | null;
  if (!res.ok || !data?.url || !data?.token) {
    throw new Error(`Flow payment/create ${res.status}: ${data?.message ?? "respuesta inválida"}`);
  }
  return { url: data.url, token: data.token, flowOrder: Number(data.flowOrder ?? 0) };
}

export type FlowStatus = {
  status: number; // 1 pendiente · 2 pagada · 3 rechazada · 4 anulada
  commerceOrder: string;
  amount: number;
  currency: string;
  flowOrder: string;
  media: string | null;
};

export async function flowGetStatus(token: string): Promise<FlowStatus> {
  const qs = signed({ token });
  const res = await fetch(`${apiUrl()}/payment/getStatus?${qs.toString()}`, { cache: "no-store" });
  const data = (await res.json().catch(() => null)) as {
    status?: number | string;
    commerceOrder?: string;
    amount?: number | string;
    currency?: string;
    flowOrder?: number | string;
    paymentData?: { media?: string } | null;
    message?: string;
  } | null;
  if (!res.ok || !data || data.status == null || !data.commerceOrder) {
    throw new Error(`Flow payment/getStatus ${res.status}: ${data?.message ?? "respuesta inválida"}`);
  }
  return {
    status: Number(data.status),
    commerceOrder: String(data.commerceOrder),
    amount: Number(data.amount),
    currency: String(data.currency ?? ""),
    flowOrder: String(data.flowOrder ?? ""),
    media: data.paymentData?.media ?? null,
  };
}
