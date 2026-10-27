import "server-only";
import { cache } from "react";
import { createClient, currentUser } from "@/lib/supabase/server";
import type { StaffRole } from "@/lib/cases";

// Rol del usuario actual en el equipo ENQORA (null si es cliente). Una consulta por solicitud.
export const myStaffRole = cache(async (): Promise<StaffRole | null> => {
  const user = await currentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("staff_members")
    .select("role, active")
    .eq("user_id", user.id)
    .maybeSingle();
  const row = data as { role: StaffRole; active: boolean } | null;
  return row?.active ? row.role : null;
});

export const isSupervisorRole = (r: StaffRole | null) => r === "enqora_admin" || r === "ops_director";
