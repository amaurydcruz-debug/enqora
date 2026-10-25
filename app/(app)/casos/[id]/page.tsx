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
import { quoteStatus, type MarketReference, type Quote, type Service, type Tariff } from "@/lib/pricing";
import type { Diagnosis, Finding } from "@/lib/diagnosis";
import { CHARGE_STATUSES, type Charge, type Plan, type PlanPrice, type PlanProposal } from "@/lib/billing";
import { answerText, QUESTIONS, type Answers } from "@/lib/onboarding";
import { Approvals } from "./approvals";
import { DiagnosisEditor } from "./diagnosis-editor";
import { PlanProposals } from "./plan-proposals";
import { DiagnosisReport, type ServiceRef } from "./diagnosis-report";
import { Quotes } from "./quotes";
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
  cotizacion_creada: "Cotización registrada.",
  cotizacion_aceptada: "Cotización aceptada. Quedó registrada con su versión y precio.",
  cotizacion_rechazada: "Registramos que no aceptas la cotización. El equipo la revisará contigo.",
  cotizacion_anulada: "Cotización anulada.",
  diagnostico_solicitado: "Recibimos tu solicitud de diagnóstico gratuito. El equipo ENQORA la revisará y te avisará aquí cuando el informe esté listo.",
  diagnostico_borrador: "Borrador del diagnóstico abierto.",
  diagnostico_guardado: "Resumen del diagnóstico guardado.",
  situacion_guardada: "Situación guardada en el borrador.",
  situacion_eliminada: "Situación eliminada del borrador.",
  diagnostico_enviado: "Diagnóstico enviado a revisión profesional.",
  cotizacion_pedida: "Pediste la cotización. El equipo ENQORA la preparará y la verás en este caso.",
  propuesta_creada: "Propuesta de plan registrada.",
  propuesta_rechazada: "Registramos tu respuesta. Puedes contratar un plan cuando quieras desde Planes.",
  propuesta_anulada: "Propuesta de plan anulada.",
};

const PLAN_ACTIONS: Record<string, string> = {
  enviada: "envió una propuesta de plan mensual",
  aceptada: "aceptó la propuesta de plan",
  rechazada: "no aceptó la propuesta de plan",
  anulada: "anuló la propuesta de plan",
};

const DIAG_ACTIONS: Record<string, string> = {
  solicitado: "solicitó el diagnóstico gratuito",
  borrador: "abrió un borrador del diagnóstico",
  publicado: "entregó el diagnóstico",
  cotizacion_solicitada: "pidió cotizar la situación",
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

const QUOTE_ACTIONS: Record<string, string> = {
  enviada: "envió la cotización",
  aceptada: "aceptó la cotización",
  rechazada: "no aceptó la cotización",
  anulada: "anuló la cotización",
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

  const [staffRole, companyRes, eventsRes, tasksRes, docsRes, assignRes, memberRes, stepsRes, approvalsRes, authRes, quotesRes] = await Promise.all([
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
    // RLS: el cliente solo recibe las cotizaciones ya enviadas.
    supabase.from("quotes").select("*").eq("case_id", id).order("created_at", { ascending: false }),
  ]);
  // Diagnóstico (RLS: el cliente solo recibe la versión publicada).
  const { data: diagRows } = await supabase.from("diagnoses").select("*").eq("case_id", id).order("version", { ascending: false });
  const diagnoses = (diagRows ?? []) as Diagnosis[];
  const published = diagnoses.find((d) => d.status === "publicado") ?? null;
  const openDiag = diagnoses.find((d) => d.status === "borrador" || d.status === "en_revision") ?? null;
  const diagIds = [published?.id, openDiag?.id].filter(Boolean) as string[];
  const { data: findingRows } = diagIds.length
    ? await supabase.from("diagnosis_findings").select("*").in("diagnosis_id", diagIds).order("position")
    : { data: [] };
  const findings = (findingRows ?? []) as Finding[];
  const publishedFindings = published ? findings.filter((f) => f.diagnosis_id === published.id) : [];
  const openFindings = openDiag ? findings.filter((f) => f.diagnosis_id === openDiag.id) : [];

  const steps = (stepsRes.data ?? []) as MirrorStep[];
  const approvals = (approvalsRes.data ?? []) as Approval[];
  const authorizations = (authRes.data ?? []) as ClientAuthorization[];
  const quotes = (quotesRes.data ?? []) as Quote[];

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

  // Propuesta mensual y cobros del caso (M10). RLS: el cliente no recibe propuestas sin aprobar.
  const canSeeBilling = (!!memberRole && ["owner", "admin", "accountant"].includes(memberRole)) || supervisor;
  const [{ data: propRows }, { data: planRows }, { data: planPriceRows }, { data: chargeRows }] = await Promise.all([
    supabase.from("plan_proposals").select("*").eq("case_id", id).order("created_at", { ascending: false }),
    worker ? supabase.from("plans").select("*").eq("active", true).order("position") : Promise.resolve({ data: [] }),
    worker ? supabase.from("plan_prices").select("*").eq("status", "vigente") : Promise.resolve({ data: [] }),
    canSeeBilling ? supabase.from("charges").select("*").eq("case_id", id).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  const proposals = (propRows ?? []) as PlanProposal[];
  const casePlans = (planRows ?? []) as Plan[];
  const casePlanPrices = (planPriceRows ?? []) as PlanPrice[];
  const caseCharges = (chargeRows ?? []) as Charge[];
  const openCharges = caseCharges.filter((ch) => ["pendiente", "vencido"].includes(ch.status));
  const openProposals = proposals.filter((pp) => pp.status === "enviada");

  // Nombres de las personas que aparecen en el caso.
  const people = new Set<string>();
  proposals.forEach((pp) => pp.decided_by && people.add(pp.decided_by));
  events.forEach((e) => e.actor_id && people.add(e.actor_id));
  tasks.forEach((t) => t.assignee_id && people.add(t.assignee_id));
  docs.forEach((d) => d.uploaded_by && people.add(d.uploaded_by));
  assignments.forEach((a) => people.add(a.user_id));
  events.forEach((e) => e.metadata?.usuario && people.add(e.metadata.usuario));
  approvals.forEach((a) => [a.requested_by, a.decided_by].forEach((u) => u && people.add(u)));
  authorizations.forEach((a) => [a.requested_by, a.decided_by, a.revoked_by].forEach((u) => u && people.add(u)));
  quotes.forEach((q) => [q.created_by, q.decided_by].forEach((u) => u && people.add(u)));
  if (published?.published_by) people.add(published.published_by);

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

  // Catálogo para cotizar (equipo) y referencias de mercado de los servicios cotizados.
  let quoteServices: Service[] = [];
  let quoteTariffs: Tariff[] = [];
  if (worker && !isClosed) {
    const [{ data: sv }, { data: tf }] = await Promise.all([
      supabase.from("services").select("*").eq("active", true).order("code"),
      supabase.from("service_tariffs").select("*").eq("status", "vigente"),
    ]);
    quoteServices = (sv ?? []) as Service[];
    quoteTariffs = (tf ?? []) as Tariff[];
  }
  const quotedServices = [...new Set(quotes.map((q) => q.service_id))];
  const { data: refRows } = quotedServices.length
    ? await supabase.from("market_references").select("*").in("service_id", quotedServices)
    : { data: [] };
  const references = (refRows ?? []) as MarketReference[];

  // Servicios citados en el diagnóstico (el equipo, además, elige entre todo el catálogo).
  const findingServiceIds = [...new Set(findings.map((f) => f.service_id).filter(Boolean))] as string[];
  const { data: svcRows } = worker
    ? await supabase.from("services").select("id, code, name").order("code")
    : findingServiceIds.length
      ? await supabase.from("services").select("id, code, name").in("id", findingServiceIds)
      : { data: [] };
  const serviceRefs = (svcRows ?? []) as ServiceRef[];
  const serviceMap = new Map(serviceRefs.map((s) => [s.id, s]));

  // Perfil del onboarding: contexto para el equipo que trabaja el caso.
  const { data: onbRow } = worker
    ? await supabase.from("company_onboarding").select("answers").eq("company_id", c.company_id).maybeSingle()
    : { data: null };
  const onboarding = ((onbRow as { answers: Answers } | null)?.answers ?? null) as Answers | null;

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
      case "cotizacion":
        return `${QUOTE_ACTIONS[e.metadata?.accion ?? ""] ?? "actualizó una cotización"} «${e.metadata?.titulo ?? e.body ?? ""}»`;
      case "diagnostico":
        return `${DIAG_ACTIONS[e.metadata?.accion ?? ""] ?? "actualizó el diagnóstico"}${e.metadata?.accion === "cotizacion_solicitada" ? ` «${e.metadata?.titulo ?? e.body ?? ""}»` : e.metadata?.version ? ` (versión ${e.metadata.version})` : ""}`;
      case "plan":
        return `${PLAN_ACTIONS[e.metadata?.accion ?? ""] ?? "actualizó la propuesta de plan"}${e.metadata?.titulo || e.body ? ` «${e.metadata?.titulo ?? e.body}»` : ""}`;
      case "pago":
        return `registró el pago del cobro ${e.metadata?.folio ?? ""}`;
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
  const openQuotes = quotes.filter((q) => quoteStatus(q) === "enviada");
  const reviewQuotes = quotes.filter((q) => q.status === "pendiente_aprobacion" || q.status === "observada");
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
  const freeDiagnosis = (c as CaseRow & { origin?: string }).origin === "diagnostico_gratuito";
  const diagnosisState = worker && openDiag
    ? { tone: openDiag.status === "en_revision" ? "gold" : "muted", text: openDiag.status === "en_revision" ? `v${openDiag.version} en revisión` : `Borrador v${openDiag.version}` }
    : published
      ? { tone: "ok", text: `Entregado · v${published.version}` }
      : c.status === "cerrado" && c.result_summary
        ? { tone: "ok", text: "Resultado verificado" }
        : reviewSteps.length || openDiag
          ? { tone: "gold", text: "En revisión profesional" }
          : { tone: "muted", text: freeDiagnosis ? "En preparación" : "Aún no disponible" };
  const canRequestQuote = !worker && !isClosed && !!memberRole && ["owner", "admin", "accountant"].includes(memberRole);

  // Sección que se abre sola tras una acción, para ver su resultado.
  const OPEN_AFTER: Record<string, string> = {
    tarea: "tareas", analisis: "investigando", asignado: "agentes", retirado: "agentes", estado: "gestion", prioridad: "gestion",
    aprobacion_solicitada: "proximas", aprobacion_aprobar: "proximas", aprobacion_rechazar: "proximas", aprobacion_devolver: "proximas",
    aprobacion_anulada: "proximas", autorizacion_solicitada: "proximas", autorizada: "proximas", autorizacion_rechazada: "proximas",
    autorizacion_revocada: "proximas", autorizacion_anulada: "proximas",
    cotizacion_creada: "cotizacion", cotizacion_aceptada: "cotizacion", cotizacion_rechazada: "cotizacion", cotizacion_anulada: "cotizacion",
    diagnostico_solicitado: "diagnostico", diagnostico_borrador: "diagnostico", diagnostico_guardado: "diagnostico",
    situacion_guardada: "diagnostico", situacion_eliminada: "diagnostico", diagnostico_enviado: "diagnostico", cotizacion_pedida: "diagnostico",
    propuesta_creada: "plan", propuesta_rechazada: "plan", propuesta_anulada: "plan",
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
          {freeDiagnosis ? <p className="muted-line">Primera consulta gratuita (diagnóstico gratuito).</p> : null}
          {worker && onboarding ? (
            <details className="onb-answers">
              <summary>Perfil de la empresa (respuestas del onboarding)</summary>
              <dl>
                {QUESTIONS.filter((q) => onboarding[q.key] !== undefined).map((q) => (
                  <div key={q.key}><dt>{q.title}</dt><dd>{answerText(q.key, onboarding[q.key])}</dd></div>
                ))}
              </dl>
            </details>
          ) : null}
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
      tone: published && !worker && c.status === "esperando_cliente" ? "gold" : "default",
      content: (
        <>
          {published ? (
            <>
              <DiagnosisReport
                caseId={c.id}
                diagnosis={published}
                findings={publishedFindings}
                services={serviceMap}
                approverName={published.published_by ? nameOf(published.published_by) : null}
                canRequestQuote={canRequestQuote}
              />
              <div className="panel-actions">
                <a href={`/casos/${c.id}/diagnostico`} target="_blank" rel="noopener" className="btn btn-ghost btn-inline btn-sm">Versión para imprimir o guardar en PDF</a>
              </div>
            </>
          ) : null}
          {worker ? (
            <div className="sub-block">
              {published ? <h4 className="sub-title">Nueva versión</h4> : null}
              <DiagnosisEditor caseId={c.id} open={openDiag} published={published} openFindings={openFindings} services={serviceRefs} isClosed={isClosed} />
            </div>
          ) : null}
          {c.status === "cerrado" && c.result_summary ? (
            <div className="result-box">
              <FactTag kind="verificado" />
              <h4>Resultado verificado</h4>
              <p className="pre">{c.result_summary}</p>
            </div>
          ) : null}
          {!worker && !published && reviewSteps.length ? (
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
          {!worker && !published && !(c.status === "cerrado" && c.result_summary) ? (
            <p className="panel-lead">
              {freeDiagnosis
                ? "Tu diagnóstico gratuito se publicará aquí cuando un profesional autorizado lo apruebe: situaciones numeradas, con su normativa y fuente, alternativas, riesgos, costo estimado y nivel de certeza."
                : "El diagnóstico con sus recomendaciones se publicará aquí cuando un profesional autorizado lo valide."}{" "}
              Ninguna conclusión se presenta como confirmada antes de esa revisión.
            </p>
          ) : null}
        </>
      ),
    },
    {
      id: "cotizacion",
      aliases: ["cotizaciones"],
      title: "Cotización",
      emblem: <Emblem name="contabilidad" size="sm" />,
      tone: openQuotes.length && canDecide ? "gold" : "default",
      status: openQuotes.length
        ? <span className="status status-gold">{openQuotes.length === 1 ? "1 espera tu decisión" : `${openQuotes.length} esperan tu decisión`}</span>
        : worker && reviewQuotes.length
          ? <span className="status status-gold">{reviewQuotes.length} en revisión</span>
          : <span>{quotes.some((q) => q.status === "aceptada") ? "Aceptada" : quotes.length ? `${quotes.length} registrada${quotes.length === 1 ? "" : "s"}` : "Sin cotización"}</span>,
      content: (
        <Quotes
          caseId={c.id}
          quotes={quotes}
          references={references}
          services={quoteServices}
          tariffs={quoteTariffs}
          names={names}
          canDecide={canDecide}
          worker={worker}
          isAgent={staffRole === "ai_agent"}
          isClosed={isClosed}
        />
      ),
    },
    ...(proposals.length || (worker && ["verificacion", "cerrado"].includes(c.status))
      ? [{
          id: "plan",
          aliases: ["propuesta"],
          title: "Plan mensual",
          emblem: <Emblem name="planes" size="sm" />,
          tone: (openProposals.length && canDecide ? "gold" : "default") as AccordionItem["tone"],
          status: openProposals.length
            ? <span className="status status-gold">Propuesta por decidir</span>
            : <span>{proposals.some((pp) => pp.status === "aceptada") ? "Contratado" : proposals.length ? `${proposals.length} propuesta${proposals.length === 1 ? "" : "s"}` : "Sin propuesta"}</span>,
          content: (
            <PlanProposals
              caseId={c.id}
              proposals={proposals}
              plans={casePlans}
              prices={casePlanPrices}
              names={names}
              worker={worker}
              canDecide={canDecide}
              canPropose={["verificacion", "cerrado"].includes(c.status)}
              isAgent={staffRole === "ai_agent"}
            />
          ),
        } satisfies AccordionItem]
      : []),
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
        {published && !worker && c.status === "esperando_cliente" ? (
          <Callout
            kind="warn"
            title="Tu diagnóstico está listo"
            action={<a href="#diagnostico" className="btn btn-gold btn-inline btn-sm">Ver diagnóstico</a>}
          >
            Revisado y aprobado por un profesional ENQORA. Explora cada situación y decide cómo seguir.
          </Callout>
        ) : null}
        {openQuotes.length && canDecide ? (
          <Callout
            kind="warn"
            title={openQuotes.length === 1 ? "Tienes una cotización por revisar" : `Tienes ${openQuotes.length} cotizaciones por revisar`}
            action={<a href="#cotizacion" className="btn btn-gold btn-inline btn-sm">Ver cotización</a>}
          >
            Revisa el alcance, el precio y las condiciones antes de decidir.
          </Callout>
        ) : null}
        {openProposals.length && canDecide ? (
          <Callout
            kind="info"
            title="ENQORA te propone un plan mensual"
            action={<a href="#plan" className="btn btn-ghost btn-inline btn-sm">Ver propuesta</a>}
          >
            Basado en lo que se resolvió en este caso y en las obligaciones que continúan. Tú decides.
          </Callout>
        ) : null}
        {openCharges.length && !worker ? (
          <Callout
            kind="warn"
            title={openCharges.length === 1 ? `Cobro ${openCharges[0].folio}: ${CHARGE_STATUSES[openCharges[0].status].label.toLowerCase()}` : `${openCharges.length} cobros por pagar en este caso`}
            action={<Link href="/facturacion#cobros" className="btn btn-gold btn-inline btn-sm">Pagar</Link>}
          >
            Corresponde a la cotización aceptada. Puedes pagar en línea o por transferencia.
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
