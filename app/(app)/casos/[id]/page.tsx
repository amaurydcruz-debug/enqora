import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Notice } from "@/components/auth-card";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { SubmitButton } from "@/components/submit-button";
import {
  assignAction,
  changeStatusAction,
  createTaskAction,
  setPriorityAction,
  taskStatusAction,
  unassignAction,
} from "@/app/actions/cases";
import {
  CASE_ROLES,
  CLOSED,
  FLOW,
  formatBytes,
  MODULES,
  PRIORITIES,
  STAFF_ROLES,
  STATUSES,
  NEXT_STEP,
  statusLabel,
  statusTone,
  TASK_STATUSES,
  type CaseRow,
  type StaffRole,
} from "@/lib/cases";
import { messageForCode } from "@/lib/db-errors";
import { formatRut } from "@/lib/rut";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";
import { Accordion, type AccordionItem } from "@/components/accordion";
import { Callout, FactTag } from "@/components/disclosure";
import { Emblem } from "@/components/emblems";
import { AgentsPanel } from "@/components/mirror/agents-panel";
import { MirrorStage } from "@/components/mirror/mirror-stage";
import { AGENT_KEYS, AGENTS, mirrorState, STAGES, type MirrorStep } from "@/lib/mirror";
import type { Approval, ClientAuthorization } from "@/lib/approvals";
import { Approvals } from "./approvals";
import { Authorizations } from "./authorizations";
import { CommentForm } from "./comment-form";
import { MirrorConsole } from "./mirror-console";
import { UploadDocument } from "./upload";

export const metadata: Metadata = { title: "Caso" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fmt = (iso: string | null | undefined, withTime = true) =>
  iso
    ? new Intl.DateTimeFormat("es-CL", {
        dateStyle: "medium",
        ...(withTime ? { timeStyle: "short" as const } : {}),
        timeZone: "America/Santiago",
      }).format(new Date(iso))
    : "—";
const fmtDate = (d: string | null) => (d ? fmt(`${d}T12:00:00Z`, false) : "—");

const AVISOS: Record<string, string> = {
  creado: "Solicitud creada. El equipo ENQORA la revisará y te mantendrá informado aquí.",
  estado: "Estado actualizado.",
  prioridad: "Prioridad actualizada.",
  asignado: "Equipo del caso actualizado.",
  retirado: "Persona retirada del caso.",
  tarea: "Tareas actualizadas.",
  analisis: "Avance del análisis registrado en ENQORA MIRROR.",
  aprobacion_solicitada: "Solicitud de aprobación enviada.",
  aprobacion_aprobar: "Aprobación registrada.",
  aprobacion_rechazar: "Solicitud rechazada con observaciones.",
  aprobacion_devolver: "Solicitud devuelta con observaciones.",
  aprobacion_anulada: "Solicitud de aprobación anulada.",
  autorizacion_solicitada: "Autorización enviada al cliente.",
  autorizada: "Autorización registrada. ENQORA actuará solo dentro de lo que autorizaste.",
  autorizacion_rechazada: "Rechazaste la autorización. El equipo revisará el caso contigo.",
  autorizacion_revocada: "Autorización revocada. ENQORA detendrá esa gestión.",
  autorizacion_anulada: "Solicitud de autorización anulada.",
};

const APPROVAL_ACTIONS: Record<string, string> = {
  solicitada: "solicitó aprobación",
  aprobada: "aprobó",
  rechazada: "rechazó",
  devuelta: "devolvió con observaciones",
  anulada: "anuló la solicitud de aprobación",
};
const AUTH_ACTIONS: Record<string, string> = {
  solicitada: "solicitó tu autorización para",
  autorizada: "autorizó",
  rechazada: "no autorizó",
  revocada: "revocó la autorización de",
  anulada: "anuló la solicitud de autorización",
};

type Event = {
  id: number;
  actor_id: string | null;
  kind: string;
  body: string | null;
  visibility: string;
  metadata: Record<string, string>;
  created_at: string;
};
type Task = { id: string; title: string; assignee_id: string | null; status: string; visibility: string; due_date: string | null };
type Doc = { id: string; file_name: string; size_bytes: number | null; visibility: string; uploaded_by: string | null; created_at: string };
type Assignment = { user_id: string; role_in_case: string; assigned_at: string };
type Profile = { id: string; email: string; full_name: string | null };
type Staff = { user_id: string; role: StaffRole; active: boolean };

export default async function CasePage({
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
  if (!user) notFound();

  // RLS: si no tiene acceso, no hay fila → 404.
  const { data: caseRow } = await supabase.from("cases").select("*").eq("id", id).maybeSingle();
  if (!caseRow) notFound();
  const c = caseRow as CaseRow;

  const [staffRole, companyRes, eventsRes, tasksRes, docsRes, assignRes, memberRes, stepsRes, approvalsRes, authRes] = await Promise.all([
    myStaffRole(),
    supabase.from("companies").select("legal_name, trade_name, rut").eq("id", c.company_id).maybeSingle(),
    supabase.from("case_events").select("id, actor_id, kind, body, visibility, metadata, created_at").eq("case_id", id).order("created_at"),
    supabase.from("case_tasks").select("id, title, assignee_id, status, visibility, due_date").eq("case_id", id).order("created_at"),
    supabase.from("case_documents").select("id, file_name, size_bytes, visibility, uploaded_by, created_at").eq("case_id", id).order("created_at", { ascending: false }),
    supabase.from("case_assignments").select("user_id, role_in_case, assigned_at").eq("case_id", id),
    supabase.from("company_members").select("role").eq("company_id", c.company_id).eq("user_id", user.id).maybeSingle(),
    supabase
      .from("case_analysis_steps")
      .select("id, agent, stage, title, detail, status, progress, visibility, created_at, updated_at")
      .eq("case_id", id)
      .order("created_at"),
    // RLS: el cliente no recibe aprobaciones internas.
    supabase.from("approvals").select("*").eq("case_id", id).order("requested_at", { ascending: false }),
    supabase.from("client_authorizations").select("*").eq("case_id", id).order("requested_at", { ascending: false }),
  ]);
  const steps = (stepsRes.data ?? []) as MirrorStep[];
  const approvals = (approvalsRes.data ?? []) as Approval[];
  const authorizations = (authRes.data ?? []) as ClientAuthorization[];

  const company = companyRes.data as { legal_name: string; trade_name: string | null; rut: string } | null;
  const events = (eventsRes.data ?? []) as Event[];
  const tasks = (tasksRes.data ?? []) as Task[];
  const docs = (docsRes.data ?? []) as Doc[];
  const assignments = (assignRes.data ?? []) as Assignment[];
  const memberRole = (memberRes.data as { role: string } | null)?.role ?? null;

  const supervisor = isSupervisorRole(staffRole);
  const messages = events.filter((e) => e.kind === "comentario" || e.kind === "nota_interna").length;
  const openTasks = tasks.filter((t) => t.status !== "hecha").length;
  const assigned = assignments.some((a) => a.user_id === user.id);
  const worker = !!staffRole && (supervisor || assigned);
  const isClosed = CLOSED.includes(c.status);
  const canPost = !isClosed && (worker || (memberRole !== null && memberRole !== "viewer"));
  const canCancel = !worker && !!memberRole && ["owner", "admin"].includes(memberRole) && ["recibido", "esperando_cliente"].includes(c.status);
  const myOpenTasks = tasks.filter((t) => t.assignee_id === user.id && t.status !== "hecha").length;

  // Nombres de las personas que aparecen en el caso.
  const people = new Set<string>();
  events.forEach((e) => e.actor_id && people.add(e.actor_id));
  tasks.forEach((t) => t.assignee_id && people.add(t.assignee_id));
  docs.forEach((d) => d.uploaded_by && people.add(d.uploaded_by));
  assignments.forEach((a) => people.add(a.user_id));
  events.forEach((e) => e.metadata?.usuario && people.add(e.metadata.usuario));
  approvals.forEach((a) => [a.requested_by, a.decided_by].forEach((u) => u && people.add(u)));
  authorizations.forEach((a) => [a.requested_by, a.decided_by, a.revoked_by].forEach((u) => u && people.add(u)));

  let allStaff: Staff[] = [];
  if (supervisor) {
    const { data } = await supabase.from("staff_members").select("user_id, role, active").eq("active", true);
    allStaff = (data ?? []) as Staff[];
    allStaff.forEach((s) => people.add(s.user_id));
  }
  const [{ data: profileRows }, { data: staffRows }] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name").in("id", [...people]),
    supabase.from("staff_members").select("user_id, role, active").in("user_id", [...people]),
  ]);
  const profiles = new Map(((profileRows ?? []) as Profile[]).map((p) => [p.id, p]));
  const staffById = new Map(((staffRows ?? []) as Staff[]).map((s) => [s.user_id, s.role]));

  const nameOf = (uid: string | null) => {
    if (!uid) return "ENQORA";
    if (uid === user.id) return "Tú";
    const p = profiles.get(uid);
    const role = staffById.get(uid);
    const base = p?.full_name || p?.email || "Participante";
    return role ? `${base} · ${STAFF_ROLES[role]}` : base;
  };

  const names: Record<string, string> = Object.fromEntries([...people].map((uid) => [uid, nameOf(uid)]));

  const describe = (e: Event) => {
    switch (e.kind) {
      case "creado":
        return "creó la solicitud";
      case "estado":
        return `cambió el estado a «${statusLabel(e.metadata?.a ?? "")}»`;
      case "documento":
        return `agregó el documento «${e.body ?? ""}»`;
      case "asignacion":
        return e.metadata?.rol === "retirado"
          ? `retiró a ${nameOf(e.metadata?.usuario ?? null)} del caso`
          : `asignó a ${nameOf(e.metadata?.usuario ?? null)} como ${CASE_ROLES[e.metadata?.rol ?? ""] ?? e.metadata?.rol}`;
      case "tarea":
        return e.metadata?.accion === "creada"
          ? `creó la tarea «${e.body ?? ""}»`
          : `marcó la tarea «${e.body ?? ""}» como ${(TASK_STATUSES[e.metadata?.accion ?? ""] ?? "").toLowerCase()}`;
      case "prioridad":
        return `ajustó la prioridad a ${(PRIORITIES[e.metadata?.prioridad ?? ""] ?? "").toLowerCase()}`;
      case "aprobacion":
        return `${APPROVAL_ACTIONS[e.metadata?.accion ?? ""] ?? "actualizó una aprobación"} «${e.metadata?.titulo ?? e.body ?? ""}»`;
      case "autorizacion":
        return `${AUTH_ACTIONS[e.metadata?.accion ?? ""] ?? "actualizó una autorización"} «${e.metadata?.titulo ?? e.body ?? ""}»`;
      default:
        return null;
    }
  };

  const flowIndex = FLOW.indexOf(c.status as (typeof FLOW)[number]);
  const taskPeople = [
    ...assignments.map((a) => a.user_id),
    ...(c.created_by ? [c.created_by] : []),
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  // ---------- Resúmenes para las opciones ----------
  const clientDocs = docs.filter((d) => d.visibility === "cliente");
  const visibleDocs = worker ? docs : clientDocs;
  const working = steps.filter((s) => s.status === "trabajando");
  const reviewSteps = steps.filter((s) => s.status === "revision");
  const pendingAuths = authorizations.filter((a) => a.status === "pendiente");
  const pendingApprovals = approvals.filter((a) => a.status === "pendiente");
  const canDecide = !!memberRole && ["owner", "admin"].includes(memberRole);
  const { agents } = mirrorState(steps, c.status);
  const agentCount = (st: string) => AGENT_KEYS.filter((k) => agents[k] === st).length;
  const agentSummary = [
    agentCount("trabajando") ? `${agentCount("trabajando")} trabajando` : null,
    agentCount("revision") ? `${agentCount("revision")} en revisión` : null,
    agentCount("completado") ? `${agentCount("completado")} completado${agentCount("completado") > 1 ? "s" : ""}` : null,
    agentCount("inactivo") ? `${agentCount("inactivo")} en espera` : null,
  ].filter(Boolean).join(" · ");
  const responsible = c.responsible_id ? nameOf(c.responsible_id) : null;
  const diagnosisState = c.status === "cerrado" && c.result_summary
    ? { tone: "ok", text: "Resultado verificado" }
    : reviewSteps.length
      ? { tone: "gold", text: "En revisión profesional" }
      : { tone: "muted", text: "Aún no disponible" };

  // Sección que se abre sola tras una acción, para ver su resultado.
  const OPEN_AFTER: Record<string, string> = {
    tarea: "tareas", analisis: "investigando", asignado: "agentes", retirado: "agentes", estado: "gestion", prioridad: "gestion",
    aprobacion_solicitada: "proximas", aprobacion_aprobar: "proximas", aprobacion_rechazar: "proximas", aprobacion_devolver: "proximas",
    aprobacion_anulada: "proximas", autorizacion_solicitada: "proximas", autorizada: "proximas", autorizacion_rechazada: "proximas",
    autorizacion_revocada: "proximas", autorizacion_anulada: "proximas",
  };

  const timeline = (
    <>
      <ul className="timeline">
        {[...events].reverse().map((e) => {
          const action = describe(e);
          const isMsg = e.kind === "comentario" || e.kind === "nota_interna";
          return (
            <li key={e.id} className={`tl-item${isMsg ? " tl-msg" : ""}${e.visibility === "interno" ? " tl-internal" : ""}`}>
              <div className="tl-meta">
                <b>{nameOf(e.actor_id)}</b> {action ?? ""}
                {e.visibility === "interno" ? <span className="badge badge-muted">Interno</span> : null}
                <span className="tl-when">{fmt(e.created_at)}</span>
              </div>
              {(isMsg ||
                (e.kind === "estado" && e.body) ||
                ((e.kind === "aprobacion" || e.kind === "autorizacion") && !["solicitada", "anulada"].includes(e.metadata?.accion ?? ""))) &&
              e.body ? (
                <p className="pre">{e.body}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );

  const items: AccordionItem[] = [
    {
      id: "investigando",
      aliases: ["mirror", "mirror-consola"],
      title: "¿Qué está investigando ENQORA?",
      emblem: <Emblem name="investigacion" size="sm" />,
      status: <span>{working.length ? (working.length === 1 ? "1 tarea en curso" : `${working.length} tareas en curso`) : "Sin tareas en curso"}</span>,
      content: (
        <>
          {working.length ? (
            <ul className="explore-list">
              {working.map((s) => (
                <li key={s.id}>
                  <b>{s.title}</b>
                  <small>
                    {AGENTS[s.agent]?.name ?? s.agent} · {STAGES.find((x) => x.key === s.stage)?.label}
                    {s.progress !== null ? ` · ${s.progress}%` : ""}
                    {s.detail ? ` · ${s.detail}` : ""}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="panel-lead">En este momento no hay tareas de análisis en curso. {NEXT_STEP[c.status] ? `Próximo paso: ${NEXT_STEP[c.status].toLowerCase()}.` : ""}</p>
          )}
          {worker && !isClosed ? <MirrorConsole caseId={c.id} steps={steps} /> : null}
        </>
      ),
    },
    {
      id: "documentos",
      title: "Documentos del caso",
      emblem: <Emblem name="documentos" size="sm" />,
      status: <span>{visibleDocs.length === 1 ? "1 documento" : `${visibleDocs.length} documentos`}</span>,
      content: (
        <>
          {visibleDocs.length ? (
            <ul className="file-list">
              {visibleDocs.map((d) => (
                <li key={d.id}>
                  <a href={`/casos/${c.id}/documentos/${d.id}`} target="_blank" rel="noopener" className="file-line">
                    <Emblem name="documentos" size="sm" />
                    <span className="file-main">
                      <b>{d.file_name}</b>
                      <small>
                        {formatBytes(d.size_bytes)} · {nameOf(d.uploaded_by)} · {fmt(d.created_at, false)}
                        {d.visibility === "interno" ? " · solo equipo" : ""}
                      </small>
                    </span>
                    <span className="file-open">Abrir</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted-line">Aún no hay documentos en tu caso.</p>
          )}
          {canPost ? <UploadDocument caseId={c.id} canInternal={worker} /> : null}
        </>
      ),
    },
    {
      id: "agentes",
      aliases: ["equipo"],
      title: "Agentes y responsables",
      emblem: <Emblem name="agentes" size="sm" />,
      status: <span>{agentSummary.split(" · ").slice(0, 2).join(" · ")}</span>,
      content: (
        <>
          <AgentsPanel steps={steps} caseStatus={c.status} />
          <div className="sub-block">
            <h4 className="sub-title">Responsables ENQORA</h4>
            {assignments.length ? (
              <ul className="people" role="list">
                {assignments.map((a) => (
                  <li key={a.user_id} className="person">
                    <div className="person-main">
                      <span className="person-avatar" aria-hidden="true">{(profiles.get(a.user_id)?.full_name || profiles.get(a.user_id)?.email || "?").slice(0, 1).toUpperCase()}</span>
                      <span className="person-who">
                        <b>{nameOf(a.user_id)}</b>
                        <small>{CASE_ROLES[a.role_in_case] ?? a.role_in_case}</small>
                      </span>
                      {supervisor && !isClosed ? (
                        <form action={unassignAction} className="person-tools">
                          <input type="hidden" name="case_id" value={c.id} />
                          <input type="hidden" name="user_id" value={a.user_id} />
                          <ConfirmSubmit message="¿Retirar a esta persona del caso? Perderá el acceso al expediente." variant="ghost">Retirar</ConfirmSubmit>
                        </form>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted-line">El equipo se asignará en breve.</p>
            )}
            {supervisor && !isClosed ? (
              <form action={assignAction} className="mini-form">
                <input type="hidden" name="case_id" value={c.id} />
                <select name="user_id" className="input input-sm" required defaultValue="" aria-label="Persona del equipo">
                  <option value="" disabled>Elegir persona del equipo…</option>
                  {allStaff.map((s) => (
                    <option key={s.user_id} value={s.user_id}>
                      {profiles.get(s.user_id)?.email ?? s.user_id} · {STAFF_ROLES[s.role]}
                    </option>
                  ))}
                </select>
                <div className="comment-actions">
                  <select name="role_in_case" className="input input-sm" defaultValue="responsable" aria-label="Rol en el caso">
                    {Object.entries(CASE_ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Asignar</SubmitButton>
                </div>
              </form>
            ) : null}
          </div>
        </>
      ),
    },
    {
      id: "historial",
      aliases: ["mensajes"],
      title: "Historial y mensajes",
      emblem: <Emblem name="mensajes" size="sm" />,
      status: <span>{messages === 1 ? "1 mensaje" : `${messages} mensajes`} · {events.length} movimientos</span>,
      content: (
        <>
          {canPost ? <CommentForm caseId={c.id} canInternal={worker} /> : null}
          {isClosed ? <p className="muted-line">El caso está {statusLabel(c.status).toLowerCase()}; no admite nuevos mensajes.</p> : null}
          <div className="acc-scroll">{timeline}</div>
        </>
      ),
    },
    {
      id: "tareas",
      title: "Tareas pendientes",
      emblem: <Emblem name="tareas" size="sm" />,
      tone: myOpenTasks ? "gold" : "default",
      status: myOpenTasks
        ? <span className="status status-gold">{myOpenTasks === 1 ? "1 es tuya" : `${myOpenTasks} son tuyas`}</span>
        : <span>{openTasks ? `${openTasks} pendiente${openTasks === 1 ? "" : "s"}` : "Sin pendientes"}</span>,
      content: (
        <>
          {tasks.length ? (
            <ul className="task-list">
              {tasks.map((t) => {
                const mine = t.assignee_id === user.id;
                return (
                  <li key={t.id} className={`task task-${t.status}${mine ? " is-mine" : ""}`}>
                    <div>
                      <b>{t.title}</b>
                      <span className="muted-line">
                        {t.assignee_id ? nameOf(t.assignee_id) : "Sin asignar"}
                        {t.due_date ? ` · vence ${fmtDate(t.due_date)}` : ""}
                        {t.visibility === "interno" ? " · interna" : ""}
                      </span>
                    </div>
                    {!isClosed && (worker || mine) ? (
                      <form action={taskStatusAction} className="inline-form">
                        <input type="hidden" name="case_id" value={c.id} />
                        <input type="hidden" name="task_id" value={t.id} />
                        <select name="status" className="input input-sm" defaultValue={t.status} aria-label="Estado de la tarea">
                          {Object.entries(TASK_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Guardar</SubmitButton>
                      </form>
                    ) : (
                      <span className="badge badge-muted">{TASK_STATUSES[t.status]}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted-line">Sin tareas.</p>
          )}
          {worker && !isClosed ? (
            <form action={createTaskAction} className="mini-form">
              <input type="hidden" name="case_id" value={c.id} />
              <input name="title" className="input input-sm" placeholder="Nueva tarea" required minLength={3} maxLength={200} aria-label="Nueva tarea" />
              <div className="inline-form">
                <select name="assignee_id" className="input input-sm" defaultValue="" aria-label="Responsable de la tarea">
                  <option value="">Sin asignar</option>
                  {taskPeople.map((uid) => <option key={uid} value={uid}>{nameOf(uid)}</option>)}
                </select>
                <input type="date" name="due_date" className="input input-sm" aria-label="Vencimiento" />
              </div>
              <div className="comment-actions">
                <label className="check-inline"><input type="checkbox" name="internal" /> Interna</label>
                <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Agregar tarea</SubmitButton>
              </div>
            </form>
          ) : null}
        </>
      ),
    },
    {
      id: "expediente",
      title: "Expediente",
      emblem: <Emblem name="expediente" size="sm" />,
      status: <span>{MODULES[c.module]?.name.replace("ENQORA ", "") ?? c.module}</span>,
      content: (
        <>
          <dl className="data-grid">
            <div><dt>Folio</dt><dd className="mono">{c.folio}</dd></div>
            <div><dt>Servicio</dt><dd>{MODULES[c.module]?.name ?? c.module}</dd></div>
            <div><dt>Empresa</dt><dd>{company ? `${company.trade_name || company.legal_name} · ${formatRut(company.rut)}` : "—"}</dd></div>
            <div><dt>Creado</dt><dd>{fmt(c.created_at)}</dd></div>
            <div><dt>Profesional responsable</dt><dd>{responsible ?? "Por asignar"}</dd></div>
            {c.due_date ? <div><dt>Fecha límite</dt><dd>{fmtDate(c.due_date)}</dd></div> : null}
            {worker ? <div><dt>Prioridad</dt><dd>{PRIORITIES[c.priority]}</dd></div> : null}
          </dl>
          {c.description ? (
            <div className="sub-block">
              <h4 className="sub-title">Tu solicitud</h4>
              <p className="pre">{c.description}</p>
            </div>
          ) : null}
          {c.status !== "cancelado" ? (
            <div className="sub-block">
              <h4 className="sub-title">Avance del caso</h4>
              <ol className="flow" aria-label="Avance del caso">
                {FLOW.map((st, i) => (
                  <li
                    key={st}
                    className={i < flowIndex || c.status === "cerrado" ? "done" : i === flowIndex ? "current" : ""}
                    aria-current={i === flowIndex ? "step" : undefined}
                  >
                    <span className="flow-dot" />
                    <span className="flow-label">{STATUSES[st].label}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {canCancel ? (
            <form action={changeStatusAction} className="person-danger">
              <input type="hidden" name="case_id" value={c.id} />
              <input type="hidden" name="status" value="cancelado" />
              <span>¿Ya no necesitas esta solicitud? Puedes cancelarla mientras no haya comenzado el trabajo.</span>
              <ConfirmSubmit message="¿Cancelar esta solicitud?">Cancelar solicitud</ConfirmSubmit>
            </form>
          ) : null}
        </>
      ),
    },
    {
      id: "diagnostico",
      title: "Diagnóstico y recomendaciones",
      emblem: <Emblem name="diagnostico" size="sm" />,
      status: <span className={`status status-${diagnosisState.tone}`}>{diagnosisState.text}</span>,
      content: (
        <>
          {c.status === "cerrado" && c.result_summary ? (
            <div className="result-box">
              <FactTag kind="verificado" />
              <h4>Resultado verificado</h4>
              <p className="pre">{c.result_summary}</p>
            </div>
          ) : null}
          {reviewSteps.length ? (
            <div className="sub-block">
              <FactTag kind="revision" />
              <ul className="explore-list">
                {reviewSteps.map((s) => (
                  <li key={s.id}>
                    <b>{s.title}</b>
                    <small>{AGENTS[s.agent]?.name ?? s.agent} · aún no es una conclusión definitiva</small>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {!(c.status === "cerrado" && c.result_summary) ? (
            <p className="panel-lead">
              El diagnóstico con sus recomendaciones se publicará aquí cuando un profesional autorizado lo valide.
              Ninguna conclusión se presenta como confirmada antes de esa revisión.
            </p>
          ) : null}
        </>
      ),
    },
    {
      id: "proximas",
      aliases: ["autorizaciones", "aprobaciones"],
      title: "Próximas acciones",
      emblem: <Emblem name="proximas" size="sm" />,
      tone: pendingAuths.length && canDecide ? "gold" : "default",
      status: pendingAuths.length
        ? <span className="status status-gold">{pendingAuths.length === 1 ? "1 autorización pendiente" : `${pendingAuths.length} autorizaciones pendientes`}</span>
        : worker && pendingApprovals.length
          ? <span className="status status-gold">{pendingApprovals.length} aprobación{pendingApprovals.length === 1 ? "" : "es"} pendiente{pendingApprovals.length === 1 ? "" : "s"}</span>
          : <span>{NEXT_STEP[c.status] ?? ""}</span>,
      content: (
        <>
          {NEXT_STEP[c.status] ? (
            <div className="next-action">
              <div>
                <span className="eyebrow">Próximo paso</span>
                <b>{NEXT_STEP[c.status]}</b>
              </div>
            </div>
          ) : null}
          <Authorizations
            caseId={c.id}
            items={authorizations}
            names={names}
            canDecide={canDecide}
            canRequest={worker && staffRole !== "ai_agent"}
            isClosed={isClosed}
          />
          {worker ? (
            <Approvals
              caseId={c.id}
              items={approvals}
              names={names}
              me={user.id}
              role={staffRole}
              supervisor={supervisor}
              assigned={assigned}
              responsibleId={c.responsible_id}
              isClosed={isClosed}
            />
          ) : null}
        </>
      ),
    },
  ];

  if (worker) {
    items.push({
      id: "gestion",
      aliases: ["estado"],
      title: "Gestión del caso",
      emblem: <Emblem name="configuracion" size="sm" />,
      status: <span>Prioridad {PRIORITIES[c.priority]?.toLowerCase()}</span>,
      content: (
        <>
          <p className="panel-lead">Solo el equipo ENQORA ve esta opción.</p>
          <form action={changeStatusAction} className="mini-form">
            <input type="hidden" name="case_id" value={c.id} />
            <label htmlFor="status" className="field-label">Cambiar estado</label>
            <select id="status" name="status" className="input input-sm" defaultValue={c.status}>
              {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <textarea name="note" className="input" rows={2} maxLength={4000}
              placeholder="Nota para el cliente. Para cerrar: describe el resultado verificado." aria-label="Nota" />
            <SubmitButton variant="gold" className="btn-inline btn-sm" pendingText="Actualizando…">Actualizar estado</SubmitButton>
          </form>
          <form action={setPriorityAction} className="mini-form">
            <input type="hidden" name="case_id" value={c.id} />
            <div className="inline-form">
              <select name="priority" className="input input-sm" defaultValue={c.priority} aria-label="Prioridad">
                {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input type="date" name="due_date" className="input input-sm" defaultValue={c.due_date ?? ""} aria-label="Fecha límite" />
              <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Guardar</SubmitButton>
            </div>
          </form>
        </>
      ),
    });
  }

  const backHref = worker ? "/mando" : "/casos";

  return (
    <div className="page ws-page">
      <section className={`ws${c.status === "cancelado" ? " is-cancelled" : ""}`} aria-label={`Caso ${c.folio}`}>
        {/* A · Encabezado compacto */}
        <header className="ws-head">
          <Link href={backHref} className="ws-back" aria-label="Volver"><span aria-hidden="true">←</span></Link>
          <div className="ws-title">
            <span className="ws-wordmark">ENQORA <em>MIRROR</em> <span className="mono">{c.folio}</span></span>
            <h1>{c.title}</h1>
          </div>
          <span className={`status status-${statusTone(c.status)} ws-status`}>{statusLabel(c.status)}</span>
          {c.status !== "cancelado" ? (
            <Link href={`/casos/${c.id}/mirror`} className="btn btn-ghost btn-inline btn-sm ws-full">Pantalla completa</Link>
          ) : null}
        </header>

        {sp.aviso && AVISOS[sp.aviso] ? <Notice kind="ok">{AVISOS[sp.aviso]}</Notice> : null}
        {messageForCode(sp.error) ? <Notice kind="error">{messageForCode(sp.error)}</Notice> : null}

        {/* B · Núcleo MIRROR y etapa actual */}
        {c.status !== "cancelado" ? (
          <MirrorStage steps={steps} caseStatus={c.status} pendingAuthorizations={pendingAuths.length} />
        ) : (
          <p className="panel-lead ws-cancelled">Esta solicitud fue cancelada. Su historial sigue disponible.</p>
        )}

        {/* Lo importante nunca queda escondido */}
        {pendingAuths.length && canDecide ? (
          <Callout
            kind="warn"
            title={pendingAuths.length === 1 ? "Una autorización espera tu decisión" : `${pendingAuths.length} autorizaciones esperan tu decisión`}
            action={<a href="#autorizaciones" className="btn btn-gold btn-inline btn-sm">Revisar</a>}
          >
            ENQORA no actuará ante ninguna institución sin tu autorización explícita.
          </Callout>
        ) : null}
        {myOpenTasks && !worker ? (
          <Callout kind="info" title={myOpenTasks === 1 ? "Tienes una tarea pendiente en este caso" : `Tienes ${myOpenTasks} tareas pendientes en este caso`} action={<a href="#tareas" className="btn btn-ghost btn-inline btn-sm">Ver tareas</a>} />
        ) : null}

        {/* C · Panel de exploración */}
        <div className="ws-panel">
          <Accordion
            label="Explorar el caso"
            variant="tiles"
            compact
            className="ws-options"
            items={items}
            defaultOpen={(sp.aviso && OPEN_AFTER[sp.aviso]) || null}
          />
        </div>
      </section>
    </div>
  );
}
