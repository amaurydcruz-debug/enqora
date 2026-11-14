"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbCode } from "@/lib/db-errors";
import { isValidRut, normalizeRut } from "@/lib/rut";
import { SII_TRAMITES } from "@/lib/sii-mandate";
import { createClient } from "@/lib/supabase/server";

// Mandato Digital del SII (0055). Las reglas viven en la base; aquí solo se validan formatos.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "");
  return UUID_RE.test(v) ? v : null;
};

function volver(caseId: string, error: { message?: string } | null, ok: string): never {
  revalidatePath(`/casos/${caseId}`);
  if (dbCode(error) === "ENQ_MFA") redirect(`/mfa?next=${encodeURIComponent(`/casos/${caseId}#sii`)}`);
  redirect(`/casos/${caseId}?${error ? `error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}` : `aviso=${ok}`}#sii`);
}

export async function requestSiiMandateAction(fd: FormData) {
  const c = id(fd, "case_id");
  if (!c) redirect("/casos");
  const rut = normalizeRut(String(fd.get("rut") ?? ""));
  if (!rut || !isValidRut(rut)) redirect(`/casos/${c}?error=ENQ_RUT_INVALIDO#sii`);
  const tramites = fd.getAll("tramites").map(String).filter((t) => t in SII_TRAMITES);
  const vence = String(fd.get("vence") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_sii_mandate", {
    p_case: c, p_rut: rut.replace(/\./g, "").toUpperCase(), p_nombre: String(fd.get("nombre") ?? "").trim().slice(0, 120),
    p_tramites: tramites, p_vence: /^\d{4}-\d{2}-\d{2}$/.test(vence) ? vence : null,
  });
  volver(c, error, "sii_solicitado");
}

export async function siiMandateStepAction(fd: FormData) {
  const c = id(fd, "case_id");
  const m = id(fd, "mandate_id");
  if (!c || !m) redirect("/casos");
  const paso = String(fd.get("paso") ?? "");
  const supabase = await createClient();
  const { error } =
    paso === "otorgado" ? await supabase.rpc("grant_sii_mandate", { p_id: m })
      : paso === "aceptado" ? await supabase.rpc("accept_sii_mandate", { p_id: m })
        : await supabase.rpc("revoke_sii_mandate", { p_id: m, p_note: String(fd.get("nota") ?? "").slice(0, 500) || null });
  volver(c, error, `sii_${paso}`);
}
