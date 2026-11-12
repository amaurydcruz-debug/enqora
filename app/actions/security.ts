"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dbCode } from "@/lib/db-errors";
import { safeNext } from "@/lib/safe-next";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "");
  return UUID_RE.test(v) ? v : null;
};

// Resultado común: si la base pide reautenticación, se valida un código nuevo y se vuelve.
function finish(error: { message?: string } | null, ok: string, anchor: string) {
  const code = dbCode(error);
  if (code === "ENQ_REAUTH") redirect(`/mfa/reautenticar?next=${encodeURIComponent(`/seguridad#${anchor}`)}`);
  revalidatePath("/seguridad");
  redirect(error ? `/seguridad?error=${code ?? "ENQ_DATOS_INVALIDOS"}#${anchor}` : `/seguridad?aviso=${ok}#${anchor}`);
}

export async function revokeSessionAction(fd: FormData) {
  const session = uuid(fd, "session_id");
  if (!session) redirect("/seguridad");
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_session", { p_session: session });
  finish(error, "sesion", "sesiones");
}

export async function revokeOtherSessionsAction() {
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_other_sessions");
  finish(error, "sesiones", "sesiones");
}

export async function forgetDeviceAction(fd: FormData) {
  const device = uuid(fd, "device_id");
  if (!device) redirect("/seguridad");
  const supabase = await createClient();
  const { error } = await supabase.rpc("forget_device", { p_device: device });
  finish(error, "dispositivo", "dispositivos");
}

export async function acknowledgeAlertsAction(fd: FormData) {
  const supabase = await createClient();
  await supabase.rpc("acknowledge_security_alerts");
  revalidatePath("/", "layout");
  redirect(safeNext(fd.get("next"), "/seguridad"));
}

// Derechos del titular sobre sus datos personales (Ley 21.719): la persona los pide; el equipo los atiende.
export async function requestDataRightAction(fd: FormData) {
  const tipo = String(fd.get("tipo") ?? "");
  if (!["acceso", "rectificacion", "supresion", "oposicion", "portabilidad", "bloqueo"].includes(tipo)) redirect("/seguridad?error=ENQ_DATOS_INVALIDOS#datos");
  const supabase = await createClient();
  const { error } = await supabase.rpc("solicitar_derecho_datos", { p_tipo: tipo, p_detalle: String(fd.get("detalle") ?? "").slice(0, 2000) });
  finish(error, "derecho_solicitado", "datos");
}

export async function answerDataRightAction(fd: FormData) {
  const id = uuid(fd, "id");
  if (!id) redirect("/mando/derechos?error=ENQ_DATOS_INVALIDOS");
  const supabase = await createClient();
  const { error } = await supabase.rpc("responder_derecho_datos", {
    p_id: id, p_estado: String(fd.get("estado") ?? ""), p_respuesta: String(fd.get("respuesta") ?? "").slice(0, 4000), p_prorrogar: fd.get("prorrogar") === "on",
  });
  const code = dbCode(error);
  if (code === "ENQ_REAUTH") redirect(`/mfa/reautenticar?next=${encodeURIComponent("/mando/derechos")}`);
  revalidatePath("/mando/derechos");
  redirect(error ? `/mando/derechos?error=${code ?? "ENQ_DATOS_INVALIDOS"}` : "/mando/derechos?aviso=ok");
}
