import "server-only";
import { activeCompany } from "@/lib/companies";
import { createClient } from "@/lib/supabase/server";

export type BooksCompany = { id: string; name: string; rut: string; role: string | null; canBook: boolean };

// Empresa de la contabilidad: la indicada (?empresa=, para el equipo ENQORA) si el usuario puede verla,
// o la empresa activa. La base de datos vuelve a comprobar el acceso en cada consulta.
export async function booksCompany(requested?: string): Promise<BooksCompany | null> {
  const supabase = await createClient();
  const { active, companies } = await activeCompany();
  const id = requested && /^[0-9a-f-]{36}$/i.test(requested) ? requested : active?.id;
  if (!id) return null;
  const mine = companies.find((c) => c.id === id);
  if (mine) {
    return { id, name: mine.trade_name || mine.legal_name, rut: mine.rut, role: mine.role,
      canBook: ["owner", "admin", "accountant"].includes(mine.role) };
  }
  const { data } = await supabase.from("companies").select("id, legal_name, trade_name, rut").eq("id", id).maybeSingle();
  const row = data as { id: string; legal_name: string; trade_name: string | null; rut: string } | null;
  if (!row) return null;
  const { data: canRead } = await supabase.rpc("vat_figures", { p_company: id, p_period: new Date().toISOString().slice(0, 10) });
  if (!canRead) return null;
  return { id, name: row.trade_name || row.legal_name, rut: row.rut, role: null, canBook: true };
}
