import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { designateCoadminAction, endStaffAccessAction, revokeTeamPassAction } from "@/app/actions/team";
import { Accordion } from "@/components/accordion";
import { Notice } from "@/components/auth-card";
import { Emblem } from "@/components/emblems";
import { SubmitButton } from "@/components/submit-button";
import { STAFF_ROLES, type StaffRole } from "@/lib/cases";
import { messageForCode } from "@/lib/db-errors";
import { myStaffRole } from "@/lib/staff";
import { createClient, currentUser } from "@/lib/supabase/server";
import { StaffForm } from "./form";
import { PassForm } from "./pass-form";

export const metadata: Metadata = { title: "Equipo ENQORA" };

type Member = { user_id: string; email: string | null; full_name: string | null; role: StaffRole; active: boolean; access_until: string | null; has_access: boolean };
type Pass = { id: string; email: string; role: StaffRole; work_day: string; valid_from: string; valid_until: string; note: string | null; used_at: string | null; revoked_at: string | null };

const AVISOS: Record<string, string> = {
  pase_anulado: "Enlace anulado: ya no sirve.",
  acceso_cortado: "Acceso cortado: la persona sale del Centro de Mando de inmediato.",
  coadmin: "Coadministrador designado: tiene las mismas facultades que el Administrador.",
};
const hour = (iso: string) => new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" }).format(new Date(iso));
const dayLabel = (d: string) => new Intl.DateTimeFormat("es-CL", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
const todayCl = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());

function passStatus(p: Pass): [string, string] {
  if (p.revoked_at) return ["muted", "Anulado"];
  if (p.used_at) return ["ok", `Usado a las ${hour(p.used_at)}`];
  if (Date.now() >= new Date(p.valid_until).getTime()) return ["muted", "Vencido sin usar"];
  return ["gold", "Pendiente"];
}

// Equipo ENQORA: el acceso se habilita por jornada con un enlace personal de un solo uso.
export default async function TeamPage({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  if ((await myStaffRole()) !== "enqora_admin") notFound();
  const sp = await searchParams;
  const supabase = await createClient();
  const me = await currentUser();
  const today = todayCl();
  const [{ data: mRows }, { data: pRows }] = await Promise.all([
    supabase.rpc("team_overview"),
    supabase.from("team_passes").select("*").gte("work_day", today).order("work_day").order("created_at", { ascending: false }).limit(60),
  ]);
  const members = ((mRows ?? []) as Member[]).filter((m) => m.active);
  const passes = (pRows ?? []) as Pass[];
  const admins = members.filter((m) => m.role === "enqora_admin");
  const working = members.filter((m) => m.role !== "enqora_admin" && m.role !== "ai_agent" && m.has_access);

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Centro de Mando · Configuración</span>
          <h1>Equipo ENQORA</h1>
          <p className="hero-lead">
            Nadie del equipo se registra por su cuenta ni tiene acceso libre. Cada día generas un enlace personal para quien trabaja:
            sirve una sola vez, solo en el horario de la jornada (10:00 a 18:00) y el acceso termina al cierre del día.
          </p>
        </div>
      </header>
      {sp.aviso && AVISOS[sp.aviso] ? <Notice kind="ok">{AVISOS[sp.aviso]}</Notice> : null}
      {messageForCode(sp.error) ? <Notice kind="error">{messageForCode(sp.error)}</Notice> : null}

      <div className="kpis kpis-mando">
        <div className="kpi"><span>Trabajando hoy</span><b>{working.length}</b><small className="muted-line">con acceso vigente</small></div>
        <div className="kpi"><span>Enlaces pendientes</span><b>{passes.filter((p) => passStatus(p)[1] === "Pendiente").length}</b><small className="muted-line">hoy y próximos días</small></div>
        <div className="kpi"><span>Administradores</span><b>{admins.length}</b><small className="muted-line">incluye coadministradores</small></div>
      </div>

      <Accordion
        label="Equipo ENQORA"
        defaultOpen="pases"
        items={[
          {
            id: "pases",
            title: "Enlaces de jornada",
            description: "Genera el acceso de hoy para cada persona que trabaja",
            emblem: <Emblem name="invitar" />,
            content: (
              <>
                <PassForm today={today} />
                {passes.length ? (
                  <ul className="ref-list" role="list">
                    {passes.map((p) => {
                      const [tone, label] = passStatus(p);
                      return (
                        <li key={p.id}>
                          <span className="ref-main">
                            <b>{p.email} · {STAFF_ROLES[p.role]}</b>
                            <small>{dayLabel(p.work_day)} · {hour(p.valid_from)} a {hour(p.valid_until)}{p.note ? ` · ${p.note}` : ""}</small>
                          </span>
                          <span className={`status status-${tone}`}>{label}</span>
                          {label === "Pendiente" ? (
                            <form action={revokeTeamPassAction}>
                              <input type="hidden" name="pass_id" value={p.id} />
                              <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="Anulando…">Anular</SubmitButton>
                            </form>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : <p className="muted-line">No hay enlaces para hoy ni los próximos días.</p>}
              </>
            ),
          },
          {
            id: "integrantes",
            title: "Integrantes y acceso de hoy",
            description: "Quién tiene acceso en este momento",
            emblem: <Emblem name="miembros" />,
            status: <span>{working.length} trabajando</span>,
            content: (
              <ul className="people" role="list">
                {members.map((m) => (
                  <li key={m.user_id} className="person">
                    <div className="person-main">
                      <span className="person-avatar" aria-hidden="true">{(m.full_name || m.email || "?").slice(0, 1).toUpperCase()}</span>
                      <span className="person-who">
                        <b>{m.full_name || m.email}</b>
                        {m.full_name ? <small>{m.email}</small> : null}
                      </span>
                      <span className="person-tools">
                        <span className={`person-role${m.has_access ? "" : " is-off"}`}>
                          {m.role === "enqora_admin"
                            ? m.user_id === me?.id ? "Administrador (tú)" : "Administrador"
                            : m.has_access && m.access_until ? `${STAFF_ROLES[m.role]} · hasta ${hour(m.access_until)}` : `${STAFF_ROLES[m.role]} · sin acceso hoy`}
                        </span>
                        {m.has_access && m.role !== "enqora_admin" && m.role !== "ai_agent" ? (
                          <form action={endStaffAccessAction}>
                            <input type="hidden" name="user_id" value={m.user_id} />
                            <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="Cortando…">Cortar acceso</SubmitButton>
                          </form>
                        ) : null}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ),
          },
          {
            id: "coadmin",
            title: "Coadministradores",
            description: "Personas con las mismas facultades que el Administrador",
            emblem: <Emblem name="seguridad" />,
            status: <span>{admins.length}</span>,
            content: (
              <>
                <p className="panel-lead">
                  Un coadministrador entra sin enlace de jornada y puede hacer todo lo que hace el Administrador: generar enlaces, gestionar
                  el equipo, precios, cobros y la clave de servicio. Designa solo a personas de máxima confianza. La persona necesita una
                  cuenta ENQORA: si aún no tiene, envíale primero un enlace de jornada para que la cree. Este cambio pide confirmar tu identidad.
                </p>
                <form action={designateCoadminAction} className="inline-form">
                  <input name="email" type="email" className="input input-sm" required placeholder="correo@ejemplo.cl" aria-label="Correo del coadministrador" />
                  <SubmitButton className="btn-inline btn-sm" pendingText="Designando…">Designar coadministrador</SubmitButton>
                </form>
                <ul className="ref-list" role="list">
                  {admins.map((a) => <li key={a.user_id}><span className="ref-main"><b>{a.full_name || a.email}</b><small>{a.email}</small></span></li>)}
                </ul>
              </>
            ),
          },
          {
            id: "rol",
            title: "Cambiar rol o desactivar",
            description: "Quitar a alguien del equipo o retirar a un coadministrador",
            emblem: <Emblem name="configuracion" />,
            content: (
              <>
                <p className="panel-lead">Desactivar quita el acceso de forma permanente. Este cambio pide confirmar tu identidad.</p>
                <StaffForm />
              </>
            ),
          },
        ]}
      />
      <p className="muted-line"><Link href="/mando">Volver al resumen</Link></p>
    </div>
  );
}
