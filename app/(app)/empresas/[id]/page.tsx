import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Notice } from "@/components/auth-card";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { SubmitButton } from "@/components/submit-button";
import {
  changeRoleAction,
  removeMemberAction,
  revokeInvitationAction,
  selectCompanyAction,
} from "@/app/actions/companies";
import { activeCompany } from "@/lib/companies";
import { canManage, REGIMES, ROLES, type Company, type Role } from "@/lib/company-constants";
import { messageForCode } from "@/lib/db-errors";
import { formatRut } from "@/lib/rut";
import { createClient } from "@/lib/supabase/server";
import { EditCompanyForm } from "./company-form";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Empresa" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const AVISOS: Record<string, string> = {
  creada: "Empresa registrada. Eres su propietario.",
  unido: "Te uniste a la empresa.",
  rol: "Rol actualizado.",
  eliminado: "Miembro quitado de la empresa.",
  revocada: "Invitación revocada.",
};

const EVENTOS: Record<string, string> = {
  "empresa.creada": "Registró la empresa",
  "empresa.actualizada": "Actualizó los datos de la empresa",
  "invitacion.creada": "Invitó a",
  "invitacion.revocada": "Revocó la invitación de",
  "invitacion.aceptada": "Aceptó la invitación",
  "miembro.rol_cambiado": "Cambió el rol de un miembro",
  "miembro.eliminado": "Quitó a un miembro",
  "miembro.salio": "Salió de la empresa",
};

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago" }).format(
    new Date(iso),
  );

type Member = { user_id: string; role: Role; created_at: string };
type Profile = { id: string; email: string; full_name: string | null };
type Invitation = { id: string; email: string; role: Role; expires_at: string; created_at: string };
type AuditEvent = {
  id: number;
  actor_id: string | null;
  action: string;
  target: string | null;
  metadata: Record<string, string>;
  created_at: string;
};

// Roles que el usuario actual puede asignar a otro miembro.
function assignable(myRole: Role, targetRole: Role): Role[] {
  if (myRole === "owner") return ["owner", "admin", "accountant", "viewer"];
  if (myRole === "admin" && (targetRole === "accountant" || targetRole === "viewer")) return ["accountant", "viewer"];
  return [];
}

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aviso?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID_RE.test(id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // RLS: si el usuario no es miembro, la consulta no devuelve nada → 404.
  const { data: companyRow } = await supabase
    .from("companies")
    .select("id, rut, legal_name, trade_name, activity, tax_regime, rut_verified, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!companyRow || !user) notFound();
  const company = companyRow as Company;

  const { data: memberRows } = await supabase
    .from("company_members")
    .select("user_id, role, created_at")
    .eq("company_id", id)
    .order("created_at");
  const members = (memberRows ?? []) as Member[];
  const myRole = members.find((m) => m.user_id === user.id)?.role;
  if (!myRole) notFound();
  const manager = canManage(myRole);

  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .in("id", members.map((m) => m.user_id));
  const profiles = new Map(((profileRows ?? []) as Profile[]).map((p) => [p.id, p]));

  let invitations: Invitation[] = [];
  let events: AuditEvent[] = [];
  if (manager) {
    const [{ data: inv }, { data: ev }] = await Promise.all([
      supabase
        .from("company_invitations")
        .select("id, email, role, expires_at, created_at")
        .eq("company_id", id)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false }),
      supabase
        .from("audit_events")
        .select("id, actor_id, action, target, metadata, created_at")
        .eq("company_id", id)
        .order("created_at", { ascending: false })
        .limit(25),
    ]);
    invitations = (inv ?? []) as Invitation[];
    events = (ev ?? []) as AuditEvent[];
  }

  const { active } = await activeCompany();
  const who = (uid: string | null) => (uid ? profiles.get(uid)?.email ?? "Ex miembro" : "Sistema");
  const describeTarget = (e: AuditEvent) =>
    e.action.startsWith("miembro.") && e.target ? profiles.get(e.target)?.email ?? "ex miembro" : e.target ?? "";

  return (
    <div className="stack">
      <div className="page-head page-head-row">
        <div>
          <span className="eyebrow">Empresa · {ROLES[myRole]}</span>
          <h1>{company.trade_name || company.legal_name}</h1>
          <p>
            <span className="mono">{formatRut(company.rut)}</span> · {company.legal_name}{" "}
            <span className={`badge ${company.rut_verified ? "badge-ok" : "badge-muted"}`}>
              {company.rut_verified ? "RUT verificado" : "RUT sin verificar con SII"}
            </span>
          </p>
        </div>
        {active?.id !== company.id ? (
          <form action={selectCompanyAction}>
            <input type="hidden" name="company_id" value={company.id} />
            <input type="hidden" name="next" value={`/empresas/${company.id}`} />
            <SubmitButton variant="ghost" className="btn-inline" pendingText="Cambiando…">Usar esta empresa</SubmitButton>
          </form>
        ) : (
          <span className="badge badge-ok">Empresa activa</span>
        )}
      </div>

      {sp.aviso && AVISOS[sp.aviso] ? <Notice kind="ok">{AVISOS[sp.aviso]}</Notice> : null}
      {messageForCode(sp.error) ? <Notice kind="error">{messageForCode(sp.error)}</Notice> : null}

      <div className="grid grid-wide">
        <section className="card">
          <h2>Datos de la empresa</h2>
          {manager ? (
            <EditCompanyForm company={company} />
          ) : (
            <>
              <div className="row"><span>Razón social</span><span>{company.legal_name}</span></div>
              <div className="row"><span>Nombre de fantasía</span><span>{company.trade_name ?? "—"}</span></div>
              <div className="row"><span>Giro</span><span>{company.activity ?? "—"}</span></div>
              <div className="row"><span>Régimen</span><span>{REGIMES[company.tax_regime] ?? "Por definir"}</span></div>
            </>
          )}
        </section>

        <section className="card" id="miembros">
          <h2>Miembros</h2>
          <p>Cada persona solo puede hacer lo que su rol permite. Cambiar permisos pide confirmar tu identidad.</p>
          <ul className="member-list">
            {members.map((m) => {
              const p = profiles.get(m.user_id);
              const isMe = m.user_id === user.id;
              const options = isMe ? (myRole === "owner" ? assignable(myRole, m.role) : []) : assignable(myRole, m.role);
              const canRemove =
                !isMe && (myRole === "owner" || (myRole === "admin" && (m.role === "accountant" || m.role === "viewer")));
              return (
                <li key={m.user_id} className="member">
                  <div className="member-who">
                    <b>{p?.full_name || p?.email || "Miembro"}</b>
                    {p?.full_name ? <span>{p.email}</span> : null}
                    <span className="muted-line">Desde {fmt(m.created_at)}{isMe ? " · Tú" : ""}</span>
                  </div>
                  <div className="member-actions">
                    {options.length > 1 ? (
                      <form action={changeRoleAction} className="inline-form">
                        <input type="hidden" name="company_id" value={company.id} />
                        <input type="hidden" name="user_id" value={m.user_id} />
                        <select name="role" className="input input-sm" defaultValue={m.role} aria-label="Rol">
                          {options.map((r) => (
                            <option key={r} value={r}>{ROLES[r]}</option>
                          ))}
                        </select>
                        <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Cambiar</SubmitButton>
                      </form>
                    ) : (
                      <span className="badge badge-muted">{ROLES[m.role]}</span>
                    )}
                    {canRemove ? (
                      <form action={removeMemberAction}>
                        <input type="hidden" name="company_id" value={company.id} />
                        <input type="hidden" name="user_id" value={m.user_id} />
                        <ConfirmSubmit message={`¿Quitar a ${p?.email ?? "este miembro"} de la empresa? Perderá el acceso de inmediato.`}>
                          Quitar
                        </ConfirmSubmit>
                      </form>
                    ) : null}
                    {isMe ? (
                      <form action={removeMemberAction}>
                        <input type="hidden" name="company_id" value={company.id} />
                        <input type="hidden" name="user_id" value={m.user_id} />
                        <input type="hidden" name="leaving" value="1" />
                        <ConfirmSubmit message="¿Salir de esta empresa? Perderás el acceso a su información.">Salir</ConfirmSubmit>
                      </form>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {manager ? (
        <div className="grid grid-wide">
          <section className="card" id="invitar">
            <h2>Invitar a una persona</h2>
            <p>Genera un enlace personal para tu contador o tu equipo. Solo funciona con el correo indicado.</p>
            <InviteForm
              companyId={company.id}
              allowedRoles={myRole === "owner" ? ["admin", "accountant", "viewer"] : ["accountant", "viewer"]}
            />
            {invitations.length ? (
              <>
                <h3 className="sub-title">Invitaciones pendientes</h3>
                <ul className="member-list">
                  {invitations.map((i) => (
                    <li key={i.id} className="member">
                      <div className="member-who">
                        <b>{i.email}</b>
                        <span className="muted-line">{ROLES[i.role]} · vence {fmt(i.expires_at)}</span>
                      </div>
                      <form action={revokeInvitationAction}>
                        <input type="hidden" name="company_id" value={company.id} />
                        <input type="hidden" name="invitation_id" value={i.id} />
                        <ConfirmSubmit message={`¿Revocar la invitación de ${i.email}?`} variant="ghost">Revocar</ConfirmSubmit>
                      </form>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>

          <section className="card">
            <h2>Actividad reciente</h2>
            <p>Registro de seguridad de la empresa. No se puede modificar ni borrar.</p>
            {events.length ? (
              <ul className="audit-list">
                {events.map((e) => (
                  <li key={e.id}>
                    <span className="audit-when">{fmt(e.created_at)}</span>
                    <span>
                      <b>{who(e.actor_id)}</b> {(EVENTOS[e.action] ?? e.action).toLowerCase()}{" "}
                      {describeTarget(e)}
                      {e.metadata?.a ? ` (${ROLES[e.metadata.a as Role] ?? e.metadata.a})` : ""}
                      {e.metadata?.rol && e.action.startsWith("invitacion") ? ` (${ROLES[e.metadata.rol as Role] ?? e.metadata.rol})` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted-line">Sin actividad todavía.</p>
            )}
          </section>
        </div>
      ) : null}

      <p><Link href="/empresas">← Volver a empresas</Link></p>
    </div>
  );
}
