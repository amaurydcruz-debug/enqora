"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { INTENT_COOKIE } from "@/lib/discovery";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/supabase/env";
import { setActiveCompany } from "@/lib/companies";
import { isRegime, isRole } from "@/lib/company-constants";
import { dbCode, dbMessage } from "@/lib/db-errors";
import { isValidRut, normalizeRut } from "@/lib/rut";
import { safeNext } from "@/lib/safe-next";

export type CompanyFormState = { error?: string; ok?: string; link?: string } | undefined;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const text = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? "").trim().slice(0, max);
const uuid = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "");
  return UUID_RE.test(v) ? v : null;
};

// Si la base pide reautenticación, se envía al usuario a validar un código nuevo y se lo devuelve.
function reauthOr(error: { message?: string } | null, back: string) {
  if (dbCode(error) === "ENQ_REAUTH") redirect(`/mfa/reautenticar?next=${encodeURIComponent(back)}`);
}

// ---------- Registrar empresa ----------
export async function createCompanyAction(_: CompanyFormState, fd: FormData): Promise<CompanyFormState> {
  const rut = normalizeRut(text(fd, "rut", 20));
  const legalName = text(fd, "legal_name", 160);
  const regime = text(fd, "tax_regime", 40);

  if (!rut || !isValidRut(rut)) return { error: "El RUT no es válido. Revisa el número y el dígito verificador." };
  if (legalName.length < 2) return { error: "Ingresa la razón social de la empresa." };
  if (!isRegime(regime)) return { error: "Selecciona un régimen tributario." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_company", {
    p_rut: rut,
    p_legal_name: legalName,
    p_trade_name: text(fd, "trade_name", 120),
    p_activity: text(fd, "activity", 200),
    p_tax_regime: regime,
  });
  if (error || !data) return { error: dbMessage(error) };

  await setActiveCompany(String(data));
  // Si el cliente llegó eligiendo un servicio en la puerta de entrada, continúa directo hacia él.
  if ((await cookies()).get(INTENT_COOKIE)?.value) redirect("/comenzar/continuar");
  redirect(`/empresas/${data}?aviso=creada`);
}

// ---------- Editar datos de la empresa ----------
export async function updateCompanyAction(_: CompanyFormState, fd: FormData): Promise<CompanyFormState> {
  const id = uuid(fd, "company_id");
  const legalName = text(fd, "legal_name", 160);
  const regime = text(fd, "tax_regime", 40);
  const address = text(fd, "address", 200);
  const commune = text(fd, "commune", 80);
  if (!id) return { error: "Empresa no válida." };
  if (legalName.length < 2) return { error: "Ingresa la razón social de la empresa." };
  if (!isRegime(regime)) return { error: "Selecciona un régimen tributario." };

  const supabase = await createClient();
  const base = {
    p_company: id,
    p_legal_name: legalName,
    p_trade_name: text(fd, "trade_name", 120),
    p_activity: text(fd, "activity", 200),
    p_tax_regime: regime,
  };
  const { error } = await supabase.rpc("update_company", { ...base, p_address: address, p_commune: commune });

  // Si la base aún no tiene la migración 0007 (domicilio), se guardan los demás datos igual.
  if (error && (error as { code?: string }).code === "PGRST202") {
    const { error: legacy } = await supabase.rpc("update_company", base);
    if (legacy) return { error: dbMessage(legacy) };
    revalidatePath(`/empresas/${id}`);
    return {
      ok: address || commune
        ? "Datos actualizados. El domicilio se podrá guardar cuando se active la actualización 0007 de la base de datos."
        : "Datos de la empresa actualizados.",
    };
  }
  if (error) return { error: dbMessage(error) };

  revalidatePath(`/empresas/${id}`);
  return { ok: "Datos de la empresa actualizados." };
}

// ---------- Cambiar empresa activa ----------
export async function selectCompanyAction(fd: FormData) {
  const id = uuid(fd, "company_id");
  const next = safeNext(fd.get("next"), "/panel");
  if (!id) redirect("/empresas");

  // RLS: solo devuelve la empresa si el usuario es miembro.
  const supabase = await createClient();
  const { data } = await supabase.from("companies").select("id").eq("id", id).maybeSingle();
  if (!data) redirect("/empresas?error=ENQ_SIN_PERMISO");

  await setActiveCompany(id);
  revalidatePath("/", "layout");
  redirect(next);
}

// ---------- Invitar ----------
export async function inviteAction(_: CompanyFormState, fd: FormData): Promise<CompanyFormState> {
  const id = uuid(fd, "company_id");
  const email = text(fd, "email", 200).toLowerCase();
  const role = text(fd, "role", 20);
  if (!id) return { error: "Empresa no válida." };
  if (!EMAIL_RE.test(email)) return { error: "Ingresa un correo electrónico válido." };
  if (!isRole(role) || role === "owner") return { error: "Selecciona un rol válido." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_invitation", { p_company: id, p_email: email, p_role: role });
  reauthOr(error, `/empresas/${id}#invitar`);
  if (error || !data) return { error: dbMessage(error) };

  revalidatePath(`/empresas/${id}`);
  return {
    ok: `Invitación creada para ${email}. Copia el enlace y envíaselo: solo funciona con esa cuenta y vence en 7 días.`,
    link: `${siteUrl()}/invitacion/${data}`,
  };
}

// ---------- Revocar invitación ----------
export async function revokeInvitationAction(fd: FormData) {
  const id = uuid(fd, "company_id");
  const inv = uuid(fd, "invitation_id");
  if (!id || !inv) redirect("/empresas");

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_invitation", { p_invitation: inv });
  revalidatePath(`/empresas/${id}`);
  redirect(`/empresas/${id}?${error ? `error=${dbCode(error) ?? "ENQ_SIN_PERMISO"}` : "aviso=revocada"}`);
}

// ---------- Cambiar rol ----------
export async function changeRoleAction(fd: FormData) {
  const id = uuid(fd, "company_id");
  const user = uuid(fd, "user_id");
  const role = String(fd.get("role") ?? "");
  if (!id || !user || !isRole(role)) redirect("/empresas");

  const supabase = await createClient();
  const { error } = await supabase.rpc("change_member_role", { p_company: id, p_user: user, p_role: role });
  reauthOr(error, `/empresas/${id}#miembros`);
  revalidatePath(`/empresas/${id}`);
  redirect(`/empresas/${id}?${error ? `error=${dbCode(error) ?? "ENQ_SIN_PERMISO"}` : "aviso=rol"}#miembros`);
}

// ---------- Quitar miembro o salir de la empresa ----------
export async function removeMemberAction(fd: FormData) {
  const id = uuid(fd, "company_id");
  const user = uuid(fd, "user_id");
  const leaving = fd.get("leaving") === "1";
  if (!id || !user) redirect("/empresas");

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_member", { p_company: id, p_user: user });
  reauthOr(error, `/empresas/${id}#miembros`);
  if (error) redirect(`/empresas/${id}?error=${dbCode(error) ?? "ENQ_SIN_PERMISO"}#miembros`);

  revalidatePath("/", "layout");
  redirect(leaving ? "/empresas?aviso=saliste" : `/empresas/${id}?aviso=eliminado#miembros`);
}

// ---------- Aceptar invitación ----------
export async function acceptInvitationAction(fd: FormData) {
  const token = String(fd.get("token") ?? "");
  if (!/^[0-9a-f]{48}$/.test(token)) redirect("/empresas?error=ENQ_INVITACION_INVALIDA");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error || !data) redirect(`/invitacion/${token}?error=${dbCode(error) ?? "ENQ_INVITACION_INVALIDA"}`);

  await setActiveCompany(String(data));
  revalidatePath("/", "layout");
  redirect(`/empresas/${data}?aviso=unido`);
}
