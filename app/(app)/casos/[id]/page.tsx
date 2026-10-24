import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Notice } from "@/components/auth-card";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { SubmitButton } from "@/components/submit-button";
import { IconActivity, IconCheck, IconClock, IconShield, IconUsers } from "@/components/icons";
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
  statusClass,
  statusLabel,
  TASK_STATUSES,
  type CaseRow,
  type StaffRole,
} from "@/lib/cases";
import { messageForCode } from "@/lib/db-errors";
import { formatRut } from "@/lib/rut";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";
import { CommentForm } from "./comment-form";
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

  const [staffRole, companyRes, eventsRes, tasksRes, docsRes, assignRes, memberRes] = await Promise.all([
    myStaffRole(),
    supabase.from("companies").select("legal_name, trade_name, rut").eq("id", c.company_id).maybeSingle(),
    supabase.from("case_events").select("id, actor_id, kind, body, visibility, metadata, created_at").eq("case_id", id).order("created_at"),
    supabase.from("case_tasks").select("id, title, assignee_id, status, visibility, due_date").eq("case_id", id).order("created_at"),
    supabase.from("case_documents").select("id, file_name, size_bytes, visibility, uploaded_by, created_at").eq("case_id", id).order("created_at", { ascending: false }),
    supabase.from("case_assignments").select("user_id, role_in_case, assigned_at").eq("case_id", id),
    supabase.from("company_members").select("role").eq("company_id", c.company_id).eq("user_id", user.id).maybeSingle(),
  ]);

  const company = companyRes.data as { legal_name: string; trade_name: string | null; rut: string } | null;
  const events = (eventsRes.data ?? []) as Event[];
  const tasks = (tasksRes.data ?? []) as Task[];
  const docs = (docsRes.data ?? []) as Doc[];
  const assignments = (assignRes.data ?? []) as Assignment[];
  const memberRole = (memberRes.data as { role: string } | null)?.role ?? null;

  const supervisor = isSupervisorRole(staffRole);
  const assigned = assignments.some((a) => a.user_id === user.id);
  const worker = !!staffRole && (supervisor || assigned);
  const isClosed = CLOSED.includes(c.status);
  const canPost = !isClosed && (worker || (memberRole !== null && memberRole !== "viewer"));
  const canCancel = !worker && !!memberRole && ["owner", "admin"].includes(memberRole) && ["recibido", "esperando_cliente"].includes(c.status);

  // Nombres de las personas que aparecen en el caso.
  const people = new Set<string>();
  events.forEach((e) => e.actor_id && people.add(e.actor_id));
  tasks.forEach((t) => t.assignee_id && people.add(t.assignee_id));
  docs.forEach((d) => d.uploaded_by && people.add(d.uploaded_by));
  assignments.forEach((a) => people.add(a.user_id));
  events.forEach((e) => e.metadata?.usuario && people.add(e.metadata.usuario));

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
      default:
        return null;
    }
  };

  const flowIndex = FLOW.indexOf(c.status as (typeof FLOW)[number]);
  const taskPeople = [
    ...assignments.map((a) => a.user_id),
    ...(c.created_by ? [c.created_by] : []),
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  return (
    <div className="stack">
      <div className="page-head page-head-row">
        <div>
          <span className="eyebrow">
            <span className="mono">{c.folio}</span> · {MODULES[c.module]?.name ?? c.module}
          </span>
          <h1>{c.title}</h1>
          <p>
            {company ? `${company.trade_name || company.legal_name} · ${formatRut(company.rut)} · ` : ""}
            creado {fmt(c.created_at)}
          </p>
        </div>
        <div className="case-head-badges">
          <span className={statusClass(c.status)}>{statusLabel(c.status)}</span>
          {worker ? <span className="badge badge-muted">Prioridad {PRIORITIES[c.priority]?.toLowerCase()}</span> : null}
        </div>
      </div>

      {sp.aviso && AVISOS[sp.aviso] ? <Notice kind="ok">{AVISOS[sp.aviso]}</Notice> : null}
      {messageForCode(sp.error) ? <Notice kind="error">{messageForCode(sp.error)}</Notice> : null}

      {c.status !== "cancelado" ? (
        <ol className="flow" aria-label="Avance del caso">
          {FLOW.map((s, i) => (
            <li
              key={s}
              className={i < flowIndex || c.status === "cerrado" ? "done" : i === flowIndex ? "current" : ""}
              aria-current={i === flowIndex ? "step" : undefined}
            >
              <span className="flow-dot" />
              <span className="flow-label">{STATUSES[s].label}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {c.status === "cerrado" && c.result_summary ? (
        <div className="alert alert-ok alert-row">
          <IconCheck size={22} />
          <div>
            <b>Resultado verificado</b>
            <p>{c.result_summary}</p>
          </div>
        </div>
      ) : null}

      <div className="case-layout">
        <div className="stack">
          {c.description ? (
            <section className="card">
              <h2>Solicitud</h2>
              <p className="pre">{c.description}</p>
            </section>
          ) : null}

          <section className="card" id="historial">
            <h2 className="card-title"><IconActivity /> Historial y mensajes</h2>
            <ul className="timeline">
              {events.map((e) => {
                const action = describe(e);
                const isMsg = e.kind === "comentario" || e.kind === "nota_interna";
                return (
                  <li key={e.id} className={`tl-item${isMsg ? " tl-msg" : ""}${e.visibility === "interno" ? " tl-internal" : ""}`}>
                    <div className="tl-meta">
                      <b>{nameOf(e.actor_id)}</b> {action ?? ""}
                      {e.visibility === "interno" ? <span className="badge badge-muted">Interno</span> : null}
                      <span className="tl-when">{fmt(e.created_at)}</span>
                    </div>
                    {(isMsg || (e.kind === "estado" && e.body)) && e.body ? <p className="pre">{e.body}</p> : null}
                  </li>
                );
              })}
            </ul>
            {canPost ? <CommentForm caseId={c.id} canInternal={worker} /> : null}
            {isClosed ? <p className="muted-line">El caso está {statusLabel(c.status).toLowerCase()}; no admite nuevos mensajes.</p> : null}
          </section>
        </div>

        <aside className="stack">
          <section className="card" id="documentos">
            <h2 className="card-title"><IconShield /> Expediente</h2>
            {docs.length ? (
              <ul className="doc-list">
                {docs.map((d) => (
                  <li key={d.id}>
                    <a href={`/casos/${c.id}/documentos/${d.id}`} target="_blank" rel="noopener">{d.file_name}</a>
                    <span className="muted-line">
                      {formatBytes(d.size_bytes)} · {nameOf(d.uploaded_by)} · {fmt(d.created_at, false)}
                      {d.visibility === "interno" ? " · solo equipo" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted-line">Sin documentos todavía.</p>
            )}
            {canPost ? <UploadDocument caseId={c.id} canInternal={worker} /> : null}
          </section>

          <section className="card" id="tareas">
            <h2 className="card-title"><IconCheck /> Tareas</h2>
            {tasks.length ? (
              <ul className="task-list">
                {tasks.map((t) => {
                  const mine = t.assignee_id === user.id;
                  return (
                    <li key={t.id} className={`task task-${t.status}`}>
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
                          <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">OK</SubmitButton>
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
          </section>

          <section className="card" id="equipo">
            <h2 className="card-title"><IconUsers /> Equipo ENQORA</h2>
            {assignments.length ? (
              <ul className="member-list">
                {assignments.map((a) => (
                  <li key={a.user_id} className="member">
                    <div className="member-who">
                      <b>{nameOf(a.user_id)}</b>
                      <span className="muted-line">{CASE_ROLES[a.role_in_case] ?? a.role_in_case}</span>
                    </div>
                    {supervisor && !isClosed ? (
                      <form action={unassignAction}>
                        <input type="hidden" name="case_id" value={c.id} />
                        <input type="hidden" name="user_id" value={a.user_id} />
                        <ConfirmSubmit message="¿Retirar a esta persona del caso? Perderá el acceso al expediente." variant="ghost">Retirar</ConfirmSubmit>
                      </form>
                    ) : null}
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
          </section>

          {worker ? (
            <section className="card" id="estado">
              <h2 className="card-title"><IconClock /> Gestión del caso</h2>
              <form action={changeStatusAction} className="mini-form">
                <input type="hidden" name="case_id" value={c.id} />
                <label htmlFor="status" className="field-label">Cambiar estado</label>
                <select id="status" name="status" className="input input-sm" defaultValue={c.status}>
                  {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <textarea name="note" className="input" rows={2} maxLength={4000}
                  placeholder="Nota para el cliente. Para cerrar: describe el resultado verificado." aria-label="Nota" />
                <SubmitButton variant="gold" className="btn-inline btn-sm" pendingText="…">Actualizar estado</SubmitButton>
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
            </section>
          ) : canCancel ? (
            <section className="card" id="estado">
              <h2>¿Ya no necesitas esta solicitud?</h2>
              <form action={changeStatusAction}>
                <input type="hidden" name="case_id" value={c.id} />
                <input type="hidden" name="status" value="cancelado" />
                <ConfirmSubmit message="¿Cancelar esta solicitud?">Cancelar solicitud</ConfirmSubmit>
              </form>
            </section>
          ) : null}
        </aside>
      </div>

      <p><Link href={worker ? "/mando" : "/casos"}>← Volver</Link></p>
    </div>
  );
}
