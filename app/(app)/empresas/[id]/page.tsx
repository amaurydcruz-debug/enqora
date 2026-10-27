import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Accordion, type AccordionItem } from "@/components/accordion";
import { Notice } from "@/components/auth-card";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { Emblem } from "@/components/emblems";
import { IconArrowRight } from "@/components/icons";
import { SubmitButton } from "@/components/submit-button";
import { revokeInvitationAction, selectCompanyAction } from "@/app/actions/companies";
import { activeCompany } from "@/lib/companies";
import { canManage, companyInitials, REGIMES, ROLES, type Company, type Role } from "@/lib/company-constants";
import { messageForCode } from "@/lib/db-errors";
import { formatRut } from "@/lib/rut";
import { createClient, currentUser } from "@/lib/supabase/server";
import { ActivityPanel, type ActivityView } from "./activity-panel";
import { CompanyDataPanel } from "./company-form";
import { InviteForm } from "./invite-form";
import { MandatesPanel } from "./mandates-panel";
import { MembersPanel, type MemberView } from "./members-panel";
import type { Mandate } from "@/lib/mandates";

export const metadata: Metadata = { title: "Empresa" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const AVISOS: Record<string, string> = {
  creada: "Empresa registrada. Eres su propietario.",
  unido: "Te uniste a la empresa.",
  rol: "Rol actualizado.",
  eliminado: "Miembro quitado de la empresa.",
  revocada: "Invitación revocada.",
  mandato_aceptado: "Listo. Ahora firma el mandato y sube el documento.",
  mandato_revocado: "Mandato revocado. ENQORA ya no puede actuar con él.",
};

// Sección que se abre sola tras una acción, para que el resultado quede a la vista.
const OPEN_AFTER: Record<string, string> = {
  rol: "miembros", eliminado: "miembros", revocada: "invitar", unido: "miembros", mandato_aceptado: "mandatos", mandato_revocado: "mandatos",
};

const EVENTOS: Record<string, { text: string; kind: ActivityView["kind"] }> = {
  "empresa.creada": { text: "registró la empresa", kind: "datos" },
  "empresa.actualizada": { text: "actualizó los datos de la empresa", kind: "datos" },
  "invitacion.creada": { text: "invitó a", kind: "invitaciones" },
  "invitacion.revocada": { text: "revocó la invitación de", kind: "invitaciones" },
  "invitacion.aceptada": { text: "aceptó la invitación", kind: "invitaciones" },
  "miembro.rol_cambiado": { text: "cambió el rol de", kind: "miembros" },
  "miembro.eliminado": { text: "quitó a", kind: "miembros" },
  "miembro.salio": { text: "salió de la empresa", kind: "miembros" },
};

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(iso));
const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Santiago" }).format(new Date(iso));
const fmtSize = (b: number | null) =>
  b == null ? "" : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;

type Member = { user_id: string; role: Role; created_at: string };
type Profile = { id: string; email: string; full_name: string | null };
type Invitation = { id: string; email: string; role: Role; expires_at: string; created_at: string };
type AuditEvent = { id: number; actor_id: string | null; action: string; target: string | null; metadata: Record<string, string>; created_at: string };
type Doc = { id: string; case_id: string; file_name: string; size_bytes: number | null; created_at: string };
type CaseLite = { id: string; folio: string; title: string };
type Authorization = { id: string; case_id: string; title: string; institution: string | null; valid_until: string | null; status: string; requested_at: string };

// Roles que el usuario actual puede asignar a otro miembro (la base de datos lo vuelve a validar).
function assignable(myRole: Role, targetRole: Role): Role[] {
  if (myRole === "owner") return ["owner", "admin", "accountant", "viewer"];
  if (myRole === "admin" && (targetRole === "accountant" || targetRole === "viewer")) return ["accountant", "viewer"];
  return [];
}

// Ficha de empresa: encabezado con lo esencial y un panel de opciones. Solo una sección
// abierta a la vez; el contenido aparece cuando el usuario lo elige.
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
  const user = await currentUser();

  // RLS: si el usuario no es miembro, la consulta no devuelve nada → 404.
  // «*» incluye el domicilio cuando la migración 0007 ya está aplicada, y no falla si aún no.
  const { data: companyRow } = await supabase.from("companies").select("*").eq("id", id).maybeSingle();
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

  const [{ data: profileRows }, { data: docRows, count: docCount }, { data: authRows }, { active }, { data: mandateRows }] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name").in("id", members.map((m) => m.user_id)),
    supabase
      .from("case_documents")
      .select("id, case_id, file_name, size_bytes, created_at", { count: "exact" })
      .eq("company_id", id)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("client_authorizations")
      .select("id, case_id, title, institution, valid_until, status, requested_at")
      .eq("company_id", id)
      .in("status", ["pendiente", "autorizada"])
      .order("requested_at", { ascending: false })
      .limit(30),
    activeCompany(),
    // RLS: solo Propietario y Administradores ven los mandatos (nunca los borradores internos).
    supabase.from("mandates").select("*").eq("company_id", id).order("created_at", { ascending: false }).limit(30),
  ]);
  const mandates = (mandateRows ?? []) as Mandate[];
  const mandatesToSign = mandates.filter((m) => m.status === "pendiente_firma").length;
  const profiles = new Map(((profileRows ?? []) as Profile[]).map((p) => [p.id, p]));
  const docs = (docRows ?? []) as Doc[];
  const auths = (authRows ?? []) as Authorization[];

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
        .limit(50),
    ]);
    invitations = (inv ?? []) as Invitation[];
    events = (ev ?? []) as AuditEvent[];
  }

  // Casos de los documentos y autorizaciones (folio y título).
  const caseIds = [...new Set([...docs.map((d) => d.case_id), ...auths.map((a) => a.case_id)])];
  const { data: caseRows } = caseIds.length
    ? await supabase.from("cases").select("id, folio, title").in("id", caseIds)
    : { data: [] };
  const cases = new Map(((caseRows ?? []) as CaseLite[]).map((c) => [c.id, c]));

  // ---------- Datos derivados ----------
  const name = company.trade_name || company.legal_name;
  const isActive = active?.id === company.id;
  const today = new Date().toISOString().slice(0, 10);
  const pendingAuths = auths.filter((a) => a.status === "pendiente");
  const validAuths = auths.filter((a) => a.status === "autorizada" && (!a.valid_until || a.valid_until >= today));
  const owners = members.filter((m) => m.role === "owner").length;

  const memberViews: MemberView[] = members.map((m) => {
    const p = profiles.get(m.user_id);
    const isMe = m.user_id === user.id;
    return {
      userId: m.user_id,
      name: p?.full_name || p?.email || "Miembro",
      email: p?.email ?? null,
      role: m.role,
      since: fmtDay(m.created_at),
      isMe,
      roleOptions: isMe ? (myRole === "owner" ? assignable(myRole, m.role) : []) : assignable(myRole, m.role),
      canRemove: !isMe && (myRole === "owner" || (myRole === "admin" && (m.role === "accountant" || m.role === "viewer"))),
    };
  });

  const who = (uid: string | null) => (uid ? profiles.get(uid)?.full_name || profiles.get(uid)?.email || "Ex miembro" : "Sistema");
  const activity: ActivityView[] = events.map((e) => {
    const ev = EVENTOS[e.action] ?? { text: e.action, kind: "datos" as const };
    const target = e.action.startsWith("miembro.") && e.target
      ? profiles.get(e.target)?.email ?? "un ex miembro"
      : e.action.startsWith("invitacion.") && e.action !== "invitacion.aceptada" ? e.target ?? "" : "";
    const role = e.metadata?.a ?? (e.action.startsWith("invitacion") ? e.metadata?.rol : undefined);
    const roleText = role ? ` (${ROLES[role as Role] ?? role})` : "";
    return { id: e.id, when: fmt(e.created_at), who: who(e.actor_id), text: `${ev.text} ${target}${roleText}`.trim(), kind: ev.kind };
  });

  // ---------- Opciones ----------
  const items: AccordionItem[] = [
    {
      id: "datos",
      title: "Datos de la empresa",
      description: "RUT, razón social, giro, régimen y domicilio",
      emblem: <Emblem name="datos" />,
      status: <span className={`status status-${company.rut_verified ? "ok" : "warn"}`}>{company.rut_verified ? "RUT verificado" : "RUT por verificar"}</span>,
      content: <CompanyDataPanel company={company} canEdit={manager} />,
    },
    {
      id: "miembros",
      title: "Miembros y permisos",
      description: "Administra quién puede acceder",
      emblem: <Emblem name="miembros" />,
      status: <span>{members.length === 1 ? "1 miembro activo" : `${members.length} miembros activos`}</span>,
      content: <MembersPanel companyId={company.id} members={memberViews} />,
    },
  ];

  if (manager) {
    items.push({
      id: "invitar",
      title: "Invitar a una persona",
      description: "Incorpora a tu contador o a tu equipo",
      emblem: <Emblem name="invitar" />,
      status: invitations.length ? <span>{invitations.length === 1 ? "1 invitación pendiente" : `${invitations.length} pendientes`}</span> : undefined,
      content: (
        <>
          <InviteForm companyId={company.id} allowedRoles={myRole === "owner" ? ["admin", "accountant", "viewer"] : ["accountant", "viewer"]} />
          {invitations.length ? (
            <div className="sub-block">
              <h4 className="sub-title">Invitaciones pendientes</h4>
              <ul className="people" role="list">
                {invitations.map((i) => (
                  <li key={i.id} className="person">
                    <div className="person-main">
                      <span className="person-avatar is-pending" aria-hidden="true">@</span>
                      <span className="person-who">
                        <b>{i.email}</b>
                        <small>{ROLES[i.role]} · vence {fmt(i.expires_at)}</small>
                      </span>
                      <form action={revokeInvitationAction} className="person-tools">
                        <input type="hidden" name="company_id" value={company.id} />
                        <input type="hidden" name="invitation_id" value={i.id} />
                        <ConfirmSubmit message={`¿Revocar la invitación de ${i.email}?`} variant="ghost">Revocar</ConfirmSubmit>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ),
    });
    items.push({
      id: "actividad",
      title: "Actividad reciente",
      description: "Consulta los movimientos registrados",
      emblem: <Emblem name="actividad" />,
      status: events[0] ? <span>Último: {fmtDay(events[0].created_at)}</span> : undefined,
      content: <ActivityPanel events={activity} />,
    });
  }

  items.push(
    {
      id: "seguridad",
      title: "Seguridad y autorizaciones",
      description: "Controla el acceso y las autorizaciones",
      emblem: <Emblem name="seguridad" />,
      tone: pendingAuths.length ? "gold" : "default",
      status: pendingAuths.length
        ? <span className="status status-gold">{pendingAuths.length === 1 ? "1 autorización pendiente" : `${pendingAuths.length} pendientes`}</span>
        : <span className="status status-ok">Protegida</span>,
      content: (
        <>
          <ul className="sec-list" role="list">
            <li className="is-ok"><b>Acceso con verificación en dos pasos</b><span>Todos los miembros entran con su contraseña y un código de su aplicación autenticadora.</span></li>
            <li className="is-ok"><b>Información aislada</b><span>Solo los miembros de esta empresa ven sus datos. El equipo ENQORA accede únicamente a los casos que se le asignan.</span></li>
            <li className="is-ok"><b>Acciones sensibles protegidas</b><span>Invitar personas y cambiar permisos pide confirmar tu identidad.</span></li>
            <li className={owners > 1 ? "is-ok" : "is-info"}>
              <b>{owners === 1 ? "1 propietario" : `${owners} propietarios`}</b>
              <span>{owners > 1 ? "Más de una persona puede administrar la empresa por completo." : "Si quieres un respaldo, puedes nombrar a otro propietario desde Miembros y permisos."}</span>
            </li>
            <li className={company.rut_verified ? "is-ok" : "is-info"}>
              <b>{company.rut_verified ? "RUT verificado" : "RUT por verificar"}</b>
              <span>{company.rut_verified ? "El RUT fue verificado por ENQORA." : "ENQORA lo verificará con el SII en el diagnóstico inicial."}</span>
            </li>
          </ul>

          <div className="sub-block">
            <h4 className="sub-title">Autorizaciones</h4>
            <p className="panel-lead">ENQORA no actúa ante ninguna institución sin tu autorización explícita. Puedes revocar una autorización cuando quieras desde su caso.</p>
            {pendingAuths.length || validAuths.length ? (
              <ul className="auth-list" role="list">
                {[...pendingAuths, ...validAuths].map((a) => {
                  const c = cases.get(a.case_id);
                  const pending = a.status === "pendiente";
                  return (
                    <li key={a.id}>
                      <Link href={`/casos/${a.case_id}#autorizaciones`} className={`auth-line${pending ? " is-pending" : ""}`}>
                        <span className="auth-main">
                          <b>{a.title}</b>
                          <small>{[a.institution, c ? `${c.folio} · ${c.title}` : null].filter(Boolean).join(" · ")}</small>
                        </span>
                        <span className={`status status-${pending ? "gold" : "ok"}`}>
                          {pending ? "Espera tu decisión" : a.valid_until ? `Vigente hasta ${fmtDay(a.valid_until + "T12:00:00")}` : "Vigente"}
                        </span>
                        <IconArrowRight size={15} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="muted-line">No hay autorizaciones pendientes ni vigentes.</p>
            )}
          </div>
          <div className="panel-actions">
            <Link href="/seguridad" className="btn btn-ghost btn-inline btn-sm">Seguridad de mi cuenta <IconArrowRight size={14} /></Link>
          </div>
        </>
      ),
    },
    {
      id: "mandatos",
      aliases: ["representacion"],
      title: "Mandatos y representación",
      description: "Qué puede hacer ENQORA en tu nombre y ante quién",
      emblem: <Emblem name="legal" />,
      tone: mandatesToSign && manager ? "gold" : "default",
      status: mandatesToSign
        ? <span className="status status-gold">{mandatesToSign === 1 ? "1 por firmar" : `${mandatesToSign} por firmar`}</span>
        : <span>{mandates.some((m) => m.status === "vigente") ? `${mandates.filter((m) => m.status === "vigente").length} vigente${mandates.filter((m) => m.status === "vigente").length === 1 ? "" : "s"}` : "Sin mandatos"}</span>,
      content: <MandatesPanel companyId={id} mandates={mandates} canManage={manager} />,
    },
    {
      id: "documentos",
      title: "Documentos",
      description: "Antecedentes de los casos de la empresa",
      emblem: <Emblem name="documentos" />,
      status: <span>{docCount ? (docCount === 1 ? "1 documento" : `${docCount} documentos`) : "Sin documentos"}</span>,
      content: docs.length ? (
        <>
          <ul className="file-list" role="list">
            {docs.map((d) => {
              const c = cases.get(d.case_id);
              return (
                <li key={d.id}>
                  <a href={`/casos/${d.case_id}/documentos/${d.id}`} target="_blank" rel="noopener" className="file-line">
                    <Emblem name="documentos" size="sm" />
                    <span className="file-main">
                      <b>{d.file_name}</b>
                      <small>{[c ? c.folio : null, fmtDay(d.created_at), fmtSize(d.size_bytes)].filter(Boolean).join(" · ")}</small>
                    </span>
                    <span className="file-open">Abrir</span>
                  </a>
                </li>
              );
            })}
          </ul>
          {docCount && docCount > docs.length ? <p className="muted-line">Se muestran los {docs.length} más recientes. El resto está en el expediente de cada caso.</p> : null}
        </>
      ) : (
        <>
          <p className="panel-lead">Los documentos se reúnen en el expediente de cada caso. Aún no hay documentos en los casos de esta empresa.</p>
          <div className="panel-actions">
            <Link href="/casos" className="btn btn-ghost btn-inline btn-sm">Ir a mis casos <IconArrowRight size={14} /></Link>
          </div>
        </>
      ),
    },
    {
      id: "configuracion",
      title: "Configuración",
      description: "Empresa activa y acceso",
      emblem: <Emblem name="configuracion" />,
      status: isActive ? <span className="status status-ok">Empresa activa</span> : undefined,
      content: (
        <ul className="settings-list" role="list">
          <li>
            <span className="settings-text">
              <b>Empresa activa</b>
              <small>{isActive ? "Esta es la empresa con la que trabajas ahora en ENQORA." : "Cambia a esta empresa para ver sus casos en tu Centro de control."}</small>
            </span>
            {isActive ? (
              <span className="status status-ok">Activa</span>
            ) : (
              <form action={selectCompanyAction}>
                <input type="hidden" name="company_id" value={company.id} />
                <input type="hidden" name="next" value={`/empresas/${company.id}`} />
                <SubmitButton variant="gold" className="btn-inline btn-sm" pendingText="Cambiando…">Usar esta empresa</SubmitButton>
              </form>
            )}
          </li>
          <li>
            <span className="settings-text">
              <b>Tu rol</b>
              <small>{ROLES[myRole]}. Para cambiarlo, pide a un propietario que lo haga desde Miembros y permisos.</small>
            </span>
          </li>
          <li>
            <span className="settings-text">
              <b>Salir de la empresa</b>
              <small>Desde Miembros y permisos, en tu propia ficha, con «Administrar».</small>
            </span>
            <a href="#miembros" className="btn btn-ghost btn-inline btn-sm">Ir a miembros</a>
          </li>
        </ul>
      ),
    },
  );

  return (
    <div className="page company-page">
      <Link href="/empresas" className="back-link"><span aria-hidden="true">←</span> Empresas</Link>

      <header className="company-hero">
        <div className="company-hero-glow" aria-hidden="true" />
        <span className="company-crest" aria-hidden="true">{companyInitials(name)}</span>
        <div className="company-hero-text">
          <span className="eyebrow">ENQORA · Empresa</span>
          <h1>{name}</h1>
          <p className="company-sub">
            <span className="mono">{formatRut(company.rut)}</span>
            <span aria-hidden="true">·</span>
            <span>{company.legal_name}</span>
          </p>
          <div className="company-chips">
            {isActive ? <span className="status status-ok">Empresa activa</span> : null}
            <span className={`status status-${company.rut_verified ? "ok" : "warn"}`}>{company.rut_verified ? "RUT verificado" : "RUT por verificar"}</span>
            <span className="tag">{ROLES[myRole]}</span>
          </div>
          <p className="company-summary">
            {[REGIMES[company.tax_regime] ?? "Régimen por definir", company.activity, members.length === 1 ? "1 miembro" : `${members.length} miembros`]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="company-links">
            <Link href={`/empresas/${company.id}/hoja-de-vida`} className="btn btn-gold btn-inline btn-sm">Hoja de vida <IconArrowRight size={14} /></Link>
            <Link href={`/empresas/${company.id}/cumplimiento`} className="btn btn-ghost btn-inline btn-sm">Cumplimiento y vencimientos <IconArrowRight size={14} /></Link>
          </p>
        </div>
      </header>

      {sp.aviso && AVISOS[sp.aviso] ? <Notice kind="ok">{AVISOS[sp.aviso]}</Notice> : null}
      {messageForCode(sp.error) ? <Notice kind="error">{messageForCode(sp.error)}</Notice> : null}

      <section aria-label="Opciones de la empresa">
        <Accordion
          label="Opciones de la empresa"
          variant="tiles"
          items={items}
          defaultOpen={(sp.aviso && OPEN_AFTER[sp.aviso]) || (sp.error ? "miembros" : null)}
        />
      </section>
    </div>
  );
}
