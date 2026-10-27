import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { createClient, currentUser } from "@/lib/supabase/server";
import type { Company, MyCompany, Role } from "@/lib/company-constants";

export const ACTIVE_COMPANY_COOKIE = "enq_empresa";

// Empresas a las que pertenece el usuario actual (RLS garantiza que solo vea las suyas).
// Una sola consulta (membresía + empresa) y una vez por solicitud.
export const myCompanies = cache(async (): Promise<MyCompany[]> => {
  const user = await currentUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("company_members")
    .select("role, companies(id, rut, legal_name, trade_name, activity, tax_regime, rut_verified, created_at)")
    .eq("user_id", user.id);
  const rows = (data ?? []) as unknown as { role: Role; companies: Company | Company[] | null }[];
  return rows
    .map((r) => ({ company: Array.isArray(r.companies) ? r.companies[0] : r.companies, role: r.role }))
    .filter((r): r is { company: Company; role: Role } => !!r.company)
    .map((r) => ({ ...r.company, role: r.role }))
    .sort((a, b) => a.legal_name.localeCompare(b.legal_name, "es"));
});

// Empresa activa: la elegida por el usuario (cookie) si sigue siendo miembro; si no, la primera.
export async function activeCompany(list?: MyCompany[]) {
  const companies = list ?? (await myCompanies());
  const store = await cookies();
  const chosen = store.get(ACTIVE_COMPANY_COOKIE)?.value;
  const active = companies.find((c) => c.id === chosen) ?? companies[0] ?? null;
  return { companies, active };
}

export async function setActiveCompany(id: string) {
  const store = await cookies();
  store.set(ACTIVE_COMPANY_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
}
