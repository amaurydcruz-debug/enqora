import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { StaffRole } from "@/lib/cases";

// Rol del usuario actual en el equipo ENQORA (null si es cliente).
export async function myStaffRole(): Promise<StaffRole | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("staff_members")
    .select("role, active")
    .eq("user_id", user.id)
    .maybeSingle();
  const row = data as { role: StaffRole; active: boolean } | null;
  return row?.active ? row.role : null;
}

export const isSupervisorRole = (r: StaffRole | null) => r === "enqora_admin" || r === "ops_director";
