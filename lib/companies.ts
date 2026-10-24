import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { Company, MyCompany, Role } from "@/lib/company-constants";

export const ACTIVE_COMPANY_COOKIE = "enq_empresa";

// Empresas a las que pertenece el usuario actual (RLS garantiza que solo vea las suyas).
export async function myCompanies(): Promise<MyCompany[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: memberships } = await supabase
    .from("company_members")
    .select("company_id, role")
    .eq("user_id", user.id);
  const rows = (memberships ?? []) as { company_id: string; role: Role }[];
  if (!rows.length) return [];

  const { data: companies } = await supabase
    .from("companies")
    .select("id, rut, legal_name, trade_name, activity, tax_regime, rut_verified, created_at")
    .in("id", rows.map((r) => r.company_id))
    .order("legal_name");

  const roleById = new Map(rows.map((r) => [r.company_id, r.role]));
  return ((companies ?? []) as Company[]).map((c) => ({ ...c, role: roleById.get(c.id) ?? "viewer" }));
}

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
