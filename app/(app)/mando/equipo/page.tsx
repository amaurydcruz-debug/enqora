import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { STAFF_ROLES, type StaffRole } from "@/lib/cases";
import { myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";
import { StaffForm } from "./form";

export const metadata: Metadata = { title: "Equipo ENQORA" };

type Staff = { user_id: string; role: StaffRole; active: boolean; created_at: string };

export default async function TeamPage() {
  if ((await myStaffRole()) !== "enqora_admin") notFound();

  const supabase = await createClient();
  const { data } = await supabase.from("staff_members").select("user_id, role, active, created_at").order("created_at");
  const staff = (data ?? []) as Staff[];
  const { data: profileRows } = staff.length
    ? await supabase.from("profiles").select("id, email, full_name").in("id", staff.map((s) => s.user_id))
    : { data: [] };
  const profiles = new Map(
    ((profileRows ?? []) as { id: string; email: string; full_name: string | null }[]).map((p) => [p.id, p]),
  );

  return (
    <div className="stack">
      <div className="page-head">
        <span className="eyebrow">Centro de Mando</span>
        <h1>Equipo ENQORA</h1>
        <p>
          Profesionales, gestores y agentes que trabajan los casos. Cada persona solo accede a los casos que se le
          asignan; la supervisión (Administrador y Director de operaciones) ve todos.
        </p>
      </div>

      <div className="grid grid-wide">
        <section className="card">
          <h2>Integrantes</h2>
          <ul className="member-list">
            {staff.map((s) => {
              const p = profiles.get(s.user_id);
              return (
                <li key={s.user_id} className="member">
                  <div className="member-who">
                    <b>{p?.full_name || p?.email || s.user_id}</b>
                    {p?.full_name ? <span>{p.email}</span> : null}
                  </div>
                  <span className={`badge ${s.active ? "badge-gold" : "badge-muted"}`}>
                    {s.active ? STAFF_ROLES[s.role] : "Desactivado"}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card">
          <h2>Agregar o cambiar rol</h2>
          <p>La persona debe tener una cuenta ENQORA con segundo factor activo. Este cambio pide confirmar tu identidad.</p>
          <StaffForm />
        </section>
      </div>

      <p><Link href="/mando">← Volver al Centro de Mando</Link></p>
    </div>
  );
}
