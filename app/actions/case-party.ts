"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbCode } from "@/lib/db-errors";
import { isValidRut, normalizeRut } from "@/lib/rut";
import { createClient } from "@/lib/supabase/server";

// Partes del conflicto laboral (0057). Las reglas (permisos, conflicto de interés, avisos) viven en la base.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function setCasePartyAction(fd: FormData) {
  const c = String(fd.get("case_id") ?? "");
  if (!UUID_RE.test(c)) redirect("/casos");
  const lado = String(fd.get("lado") ?? "");
  const rutTxt = String(fd.get("contraparte_rut") ?? "").trim();
  const nombre = String(fd.get("contraparte_nombre") ?? "").trim().slice(0, 160);
  const rut = rutTxt ? normalizeRut(rutTxt) : null;
  if (rutTxt && (!rut || !isValidRut(rut))) redirect(`/casos/${c}?error=ENQ_RUT_INVALIDO#partes`);
  if (!["trabajador", "empleador"].includes(lado) || (!rut && nombre.length < 2)) redirect(`/casos/${c}?error=ENQ_DATOS_INVALIDOS#partes`);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_case_party", {
    p_case: c, p_lado: lado, p_contraparte_rut: rut ? rut.replace(/\./g, "").toUpperCase() : null, p_contraparte_nombre: nombre || null,
  });
  revalidatePath(`/casos/${c}`);
  if (dbCode(error) === "ENQ_MFA") redirect(`/mfa?next=${encodeURIComponent(`/casos/${c}#partes`)}`);
  if (error) redirect(`/casos/${c}?error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}#partes`);
  const r = (data ?? {}) as { conflicto_profesional?: boolean; casos_opuestos?: number };
  redirect(`/casos/${c}?aviso=${r.conflicto_profesional ? "partes_conflicto" : "partes_ok"}#partes`);
}
