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
