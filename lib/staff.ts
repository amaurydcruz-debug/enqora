import "server-only";
import { cache } from "react";
import { createClient, currentUser } from "@/lib/supabase/server";
import type { StaffRole } from "@/lib/cases";

// Rol vigente del usuario en el equipo ENQORA (null si es cliente o si su pase de jornada no está vigente).
// Administradores y agentes IA no dependen del pase. Una consulta por solicitud.
export const myStaffRole = cache(async (): Promise<StaffRole | null> => {
  const user = await currentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("staff_members")
    .select("role, active, access_until")
    .eq("user_id", user.id)
    .maybeSingle();
  const row = data as { role: StaffRole; active: boolean; access_until: string | null } | null;
  if (!row?.active) return null;
  if (row.role === "enqora_admin" || row.role === "ai_agent") return row.role;
  return row.access_until && new Date(row.access_until).getTime() > Date.now() ? row.role : null;
});

export const isSupervisorRole = (r: StaffRole | null) => r === "enqora_admin" || r === "ops_director";
