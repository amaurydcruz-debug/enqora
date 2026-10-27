import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Accordion } from "@/components/accordion";
import { Emblem } from "@/components/emblems";
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
    <div className="page">
      <Link href="/mando" className="back-link"><span aria-hidden="true">←</span> Centro de Mando</Link>
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Centro de Mando</span>
          <h1>Equipo ENQORA</h1>
          <p className="hero-lead">
            Profesionales, gestores y agentes que trabajan los casos. Cada persona solo accede a los casos que se le
            asignan; la supervisión (Administrador y Director de operaciones) ve todos.
          </p>
        </div>
      </header>

      <Accordion
        label="Equipo ENQORA"
        defaultOpen="integrantes"
        items={[
          {
            id: "integrantes",
            title: "Integrantes",
            description: "Quién trabaja en ENQORA y con qué rol",
            emblem: <Emblem name="miembros" />,
            status: <span>{staff.filter((s) => s.active).length} activos</span>,
            content: (
              <ul className="people" role="list">
                {staff.map((s) => {
                  const p = profiles.get(s.user_id);
                  return (
                    <li key={s.user_id} className="person">
                      <div className="person-main">
                        <span className="person-avatar" aria-hidden="true">{(p?.full_name || p?.email || "?").slice(0, 1).toUpperCase()}</span>
                        <span className="person-who">
                          <b>{p?.full_name || p?.email || s.user_id}</b>
                          {p?.full_name ? <small>{p.email}</small> : null}
                        </span>
                        <span className="person-tools">
                          <span className={`person-role${s.active ? "" : " is-off"}`}>{s.active ? STAFF_ROLES[s.role] : "Desactivado"}</span>
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ),
          },
          {
            id: "agregar",
            title: "Agregar o cambiar rol",
            description: "La persona necesita una cuenta ENQORA con segundo factor activo",
            emblem: <Emblem name="invitar" />,
            content: (
              <>
                <p className="panel-lead">Este cambio pide confirmar tu identidad.</p>
                <StaffForm />
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
