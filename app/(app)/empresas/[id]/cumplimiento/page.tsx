import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  addItemAction,
  addObligationAction,
  generateObligationsAction,
  seedFromRubroAction,
  setObligationAction,
  updateItemAction,
} from "@/app/actions/compliance";
import { Notice } from "@/components/auth-card";
import { SubmitButton } from "@/components/submit-button";
import { messageForCode } from "@/lib/db-errors";
import { institution, INSTITUTIONS } from "@/lib/institutions";
import { LIFECYCLE, RUBROS, rubroByKey } from "@/lib/rubros";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";
import { createClient, currentUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Cumplimiento y vencimientos" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Item = {
  id: string; case_id: string | null; stage: string; institution: string; title: string; basis: string | null; source_url: string | null;
  condition: string | null; documents: string | null; public_cost: string | null; deadline: string | null; deadline_kind: string | null;
  responsible: string; status: string; evidence_document_id: string | null; observations: string | null; next_review: string | null;
  renewal_date: string | null; updated_at: string;
};
type Obligation = {
  id: string; kind: string; title: string; period: string; due_date: string; status: string; reference: string | null;
  evidence_document_id: string | null; note: string | null;
};
type Doc = { id: string; file_name: string; case_id: string };

const ITEM_STATUS: Record<string, [string, string]> = {
  por_evaluar: ["badge-muted", "Por evaluar"], no_aplica: ["badge-muted", "No aplica"], pendiente: ["badge-gold", "Pendiente"],
  en_preparacion: ["badge-gold", "En preparación"], presentado: ["badge-ok", "Presentado"], observado: ["badge-risk", "Observado"],
  obtenido: ["badge-ok", "Obtenido"], vencido: ["badge-risk", "Vencido"],
};
const OB_STATUS: Record<string, [string, string]> = {
  pendiente: ["badge-gold", "Pendiente"], preparada: ["badge-gold", "Preparada"], presentada: ["badge-ok", "Presentada"],
  pagada: ["badge-ok", "Pagada"], no_aplica: ["badge-muted", "No aplica"], vencida: ["badge-risk", "Vencida"],
};
const RESPONSIBLE: Record<string, string> = { cliente: "Tu empresa", enqora: "ENQORA", profesional: "Profesional", tercero: "Tercero" };
const AVISOS: Record<string, string> = {
  matriz_generada: "Matriz generada desde el mapa de requisitos de tu rubro. El equipo confirmará cuáles aplican.",
  item_agregado: "Requisito agregado.", item_actualizado: "Requisito actualizado.",
  calendario_generado: "Calendario de obligaciones actualizado.", obligacion_agregada: "Obligación agregada.", obligacion_actualizada: "Obligación actualizada.",
};
const fmt = (d: string | null) => (d ? new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`)) : "—");
const daysTo = (d: string) => Math.round((new Date(`${d}T00:00:00Z`).getTime() - new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime()) / 86400000);

// Expediente vivo de cumplimiento (M17): qué exige cada institución a esta empresa, quién lo hace,
// cuándo vence y con qué evidencia quedó cumplido; y el calendario de obligaciones recurrentes.
export default async function CompliancePage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aviso?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID_RE.test(id)) notFound();
  const supabase = await createClient();
  const user = await currentUser();
  if (!user) notFound();

  const [role, { data: co }, { data: member }, { data: itemRows }, { data: obRows }, { data: docRows }, { data: onb }] = await Promise.all([
    myStaffRole(),
    supabase.from("companies").select("id, legal_name, trade_name").eq("id", id).maybeSingle(),
    supabase.from("company_members").select("role").eq("company_id", id).eq("user_id", user.id).maybeSingle(),
    supabase.from("compliance_items").select("*").eq("company_id", id).order("stage").order("title"),
    supabase.from("obligations").select("*").eq("company_id", id).order("due_date"),
    supabase.from("case_documents").select("id, file_name, case_id").eq("company_id", id).order("created_at", { ascending: false }).limit(100),
    supabase.from("company_onboarding").select("answers").eq("company_id", id).maybeSingle(),
  ]);
  if (!co) notFound();
  const company = co as { id: string; legal_name: string; trade_name: string | null };
  const memberRole = (member as { role: string } | null)?.role ?? null;

  // Gestión de la matriz: supervisión o equipo asignado a algún caso de la empresa.
  let manage = isSupervisorRole(role);
  if (!manage && role && role !== "ai_agent") {
    const { data: cs } = await supabase.from("cases").select("id").eq("company_id", id);
    const ids = ((cs ?? []) as { id: string }[]).map((c) => c.id);
    if (ids.length) {
      const { count } = await supabase.from("case_assignments").select("case_id", { count: "exact", head: true }).in("case_id", ids).eq("user_id", user.id);
      manage = (count ?? 0) > 0;
    }
  }
  const editObligations = manage || (!!memberRole && ["owner", "admin", "accountant"].includes(memberRole));
  if (!manage && !memberRole) notFound();

  const items = (itemRows ?? []) as Item[];
  const obligations = (obRows ?? []) as Obligation[];
  const docs = (docRows ?? []) as Doc[];
  const docName = new Map(docs.map((d) => [d.id, d]));
  const answers = ((onb as { answers?: Record<string, unknown> } | null)?.answers ?? {}) as Record<string, unknown>;
  const rubro = rubroByKey(typeof answers.actividad === "string" ? answers.actividad : null);

  const done = items.filter((i) => ["obtenido", "presentado"].includes(i.status)).length;
  const active = items.filter((i) => i.status !== "no_aplica");
  const overdue = items.filter((i) => i.status === "vencido").length + obligations.filter((o) => o.status === "vencida").length;
  const upcoming = obligations.filter((o) => ["pendiente", "preparada", "vencida"].includes(o.status));
  const next30 = upcoming.filter((o) => daysTo(o.due_date) <= 30).length;
  const history = obligations.filter((o) => !["pendiente", "preparada", "vencida"].includes(o.status)).slice(-12).reverse();

  const evidenceSelect = (name: string, current: string | null) => (
    <select name={name} className="input input-sm" defaultValue={current ?? ""} aria-label="Evidencia">
      <option value="">Sin documento</option>
      {docs.map((d) => <option key={d.id} value={d.id}>{d.file_name}</option>)}
    </select>
  );

  const obligationRow = (o: Obligation) => {
    const d = daysTo(o.due_date);
    const ev = o.evidence_document_id ? docName.get(o.evidence_document_id) : null;
    return (
      <li key={o.id} id={`ob-${o.id}`} className={`ob-row ob-${o.status}`}>
        <div className="ob-main">
          <span className={`badge ${OB_STATUS[o.status]?.[0]}`}>{OB_STATUS[o.status]?.[1] ?? o.status}</span>
          <b>{o.title}</b>
          <small>
            Vence {fmt(o.due_date)}{["pendiente", "preparada"].includes(o.status) ? ` · ${d === 0 ? "hoy" : d === 1 ? "mañana" : d > 0 ? `en ${d} días` : `hace ${-d} días`}` : ""}
            {o.reference ? ` · Folio ${o.reference}` : ""}
            {ev ? <> · <Link href={`/casos/${ev.case_id}/documentos/${ev.id}`} target="_blank">{ev.file_name}</Link></> : null}
          </small>
          {o.note ? <small className="ob-note">{o.note}</small> : null}
        </div>
        {editObligations && o.status !== "no_aplica" ? (
          <details className="ob-edit">
            <summary>Actualizar</summary>
            <form action={setObligationAction} className="mini-form">
              <input type="hidden" name="company_id" value={id} />
              <input type="hidden" name="obligation_id" value={o.id} />
              <div className="inline-form">
                <select name="status" className="input input-sm" defaultValue={o.status === "vencida" ? "pendiente" : o.status} aria-label="Estado">
                  <option value="pendiente">Pendiente</option>
                  <option value="preparada">Preparada</option>
                  <option value="presentada">Presentada</option>
                  <option value="pagada">Pagada</option>
                  <option value="no_aplica">No aplica</option>
                </select>
                <input name="reference" className="input input-sm" maxLength={60} defaultValue={o.reference ?? ""} placeholder="Folio o comprobante" aria-label="Folio o comprobante" />
                {evidenceSelect("evidence_document_id", o.evidence_document_id)}
              </div>
              <input name="note" className="input input-sm" maxLength={1000} placeholder="Nota (obligatoria si no aplica)" aria-label="Nota" />
              <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Guardar</SubmitButton>
            </form>
          </details>
        ) : null}
      </li>
    );
  };

  return (
    <div className="page">
      <Link href={memberRole ? `/empresas/${id}` : "/mando"} className="back-link"><span aria-hidden="true">←</span> {memberRole ? "Empresa" : "Centro de Mando"}</Link>
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Expediente de cumplimiento</span>
          <h1>{company.trade_name || company.legal_name}</h1>
          <p className="hero-lead">Qué exige cada institución a tu empresa, quién lo hace, cuándo vence y con qué evidencia quedó cumplido. Nada se marca como cumplido sin evidencia.</p>
        </div>
      </header>

      {sp.aviso && AVISOS[sp.aviso] ? <Notice kind="ok">{AVISOS[sp.aviso]}</Notice> : null}
      {messageForCode(sp.error) ? <Notice kind="error">{messageForCode(sp.error)}</Notice> : null}

      <div className="kpis">
        <div className="kpi"><span>Requisitos aplicables</span><b>{active.length}</b></div>
        <div className="kpi"><span>Cumplidos con evidencia</span><b>{done}</b></div>
        <div className={`kpi${next30 ? " kpi-gold" : ""}`}><span>Vencen en 30 días</span><b>{next30}</b></div>
        <div className={`kpi${overdue ? " kpi-risk" : ""}`}><span>Vencidos</span><b>{overdue}</b></div>
      </div>

      {/* Calendario de obligaciones */}
      <section className="card" id="calendario">
        <h2>Calendario de obligaciones</h2>
        <p className="muted-line">Preparada, presentada y pagada son estados distintos: presentada o pagada requieren folio, comprobante o documento.</p>
        {upcoming.length ? <ul className="ob-list">{upcoming.map(obligationRow)}</ul> : <p className="muted-line">No hay obligaciones pendientes registradas.</p>}
        {editObligations ? (
          <div className="ob-tools">
            <form action={generateObligationsAction} className="inline-form">
              <input type="hidden" name="company_id" value={id} />
              <select name="months" className="input input-sm" defaultValue="3" aria-label="Meses">
                {[1, 3, 6, 12].map((m) => <option key={m} value={m}>{m === 1 ? "Próximo mes" : `Próximos ${m} meses`}</option>)}
              </select>
              <select name="f29_day" className="input input-sm" defaultValue="20" aria-label="Plazo del F29">
                <option value="20">F29 día 20 (facturador electrónico, por internet)</option>
                <option value="12">F29 día 12</option>
              </select>
              <label className="check-inline"><input type="checkbox" name="contrib_manual" /> Cotizaciones no electrónicas (día 10)</label>
              <SubmitButton variant="gold" className="btn-inline btn-sm" pendingText="…">Generar calendario</SubmitButton>
            </form>
            <details>
              <summary className="link-arrow">Agregar patente, renovación u otra obligación</summary>
              <form action={addObligationAction} className="mini-form">
                <input type="hidden" name="company_id" value={id} />
                <div className="inline-form">
                  <select name="kind" className="input input-sm" defaultValue="patente" aria-label="Tipo">
                    <option value="patente">Patente municipal</option>
                    <option value="renovacion">Renovación</option>
                    <option value="otro">Otra</option>
                  </select>
                  <input name="due" type="date" className="input input-sm" required aria-label="Fecha límite" />
                </div>
                <input name="title" className="input input-sm" required minLength={3} maxLength={200} placeholder="Ej.: Patente municipal 2° semestre" aria-label="Título" />
                <input name="note" className="input input-sm" maxLength={1000} placeholder="Nota (fuente de la fecha, monto informado por la municipalidad…)" aria-label="Nota" />
                <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Agregar</SubmitButton>
              </form>
            </details>
          </div>
        ) : null}
        {history.length ? (
          <details className="more">
            <summary>Historial ({history.length})</summary>
            <ul className="ob-list">{history.map(obligationRow)}</ul>
          </details>
        ) : null}
      </section>

      {/* Matriz de cumplimiento */}
      <section className="card" id="matriz">
        <h2>Matriz de cumplimiento</h2>
        {!items.length ? (
          <>
            <p className="muted-line">
              {rubro ? `Aún no hay requisitos registrados. El mapa de ${rubro.nombre.toLowerCase()} tiene ${rubro.requisitos.length} requisitos de partida.` : "Aún no hay requisitos registrados."}
            </p>
            {manage ? (
              <form action={seedFromRubroAction} className="inline-form">
                <input type="hidden" name="company_id" value={id} />
                <select name="rubro" className="input input-sm" defaultValue={rubro?.key ?? ""} aria-label="Rubro">
                  <option value="">Elegir rubro…</option>
                  {RUBROS.map((r) => <option key={r.key} value={r.key}>{r.nombre}</option>)}
                </select>
                <SubmitButton variant="gold" className="btn-inline btn-sm" pendingText="…">Generar matriz según el rubro</SubmitButton>
              </form>
            ) : <p className="muted-line">El equipo ENQORA preparará la matriz de tu empresa.</p>}
          </>
        ) : (
          <div className="matrix">
            {LIFECYCLE.map((st) => {
              const list = items.filter((i) => i.stage === st.key);
              if (!list.length) return null;
              return (
                <div key={st.key} className="matrix-stage">
                  <h3><span>{st.n}</span> {st.titulo}</h3>
                  <ul className="matrix-list">
                    {list.map((i) => {
                      const inst = institution(i.institution);
                      const ev = i.evidence_document_id ? docName.get(i.evidence_document_id) : null;
                      return (
                        <li key={i.id} id={`item-${i.id}`} className={`matrix-item item-${i.status}`}>
                          <div className="matrix-head">
                            <span className={`badge ${ITEM_STATUS[i.status]?.[0]}`}>{ITEM_STATUS[i.status]?.[1] ?? i.status}</span>
                            <b>{i.title}</b>
                          </div>
                          <dl className="matrix-data">
                            <div><dt>Institución</dt><dd>{inst?.sigla ?? i.institution}</dd></div>
                            <div><dt>Responsable</dt><dd>{RESPONSIBLE[i.responsible] ?? i.responsible}</dd></div>
                            <div><dt>Plazo</dt><dd>{i.deadline ? `${fmt(i.deadline)} (${i.deadline_kind === "legal" ? "legal" : "estimado"})` : "—"}</dd></div>
                            {i.condition ? <div><dt>Cuándo aplica</dt><dd>{i.condition}</dd></div> : null}
                            {i.public_cost ? <div><dt>Costo público</dt><dd>{i.public_cost}</dd></div> : null}
                            {i.documents ? <div><dt>Documentos</dt><dd>{i.documents}</dd></div> : null}
                            <div><dt>Evidencia</dt><dd>{ev ? <Link href={`/casos/${ev.case_id}/documentos/${ev.id}`} target="_blank">{ev.file_name}</Link> : "Sin evidencia"}</dd></div>
                            {i.renewal_date ? <div><dt>Renovación</dt><dd>{fmt(i.renewal_date)}</dd></div> : null}
                            {i.next_review ? <div><dt>Próxima revisión</dt><dd>{fmt(i.next_review)}</dd></div> : null}
                          </dl>
                          {i.observations ? <p className="pre muted-line">{i.observations}</p> : null}
                          {i.source_url ? <a href={i.source_url} target="_blank" rel="noopener noreferrer" className="watch-src">Fuente oficial ↗</a> : null}
                          {manage ? (
                            <details className="ob-edit">
                              <summary>Actualizar</summary>
                              <form action={updateItemAction} className="mini-form">
                                <input type="hidden" name="company_id" value={id} />
                                <input type="hidden" name="item_id" value={i.id} />
                                <div className="inline-form">
                                  <select name="status" className="input input-sm" defaultValue={i.status} aria-label="Estado">
                                    {Object.entries(ITEM_STATUS).map(([k, v]) => <option key={k} value={k}>{v[1]}</option>)}
                                  </select>
                                  <select name="responsible" className="input input-sm" defaultValue={i.responsible} aria-label="Responsable">
                                    {Object.entries(RESPONSIBLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                  </select>
                                  {evidenceSelect("evidence_document_id", i.evidence_document_id)}
                                </div>
                                <div className="inline-form">
                                  <label className="field-inline">Plazo <input type="date" name="deadline" className="input input-sm" defaultValue={i.deadline ?? ""} /></label>
                                  <select name="deadline_kind" className="input input-sm" defaultValue={i.deadline_kind ?? ""} aria-label="Tipo de plazo">
                                    <option value="">—</option><option value="legal">Legal</option><option value="estimado">Estimado</option>
                                  </select>
                                  <label className="field-inline">Renovación <input type="date" name="renewal_date" className="input input-sm" defaultValue={i.renewal_date ?? ""} /></label>
                                  <label className="field-inline">Revisar <input type="date" name="next_review" className="input input-sm" defaultValue={i.next_review ?? ""} /></label>
                                </div>
                                <input name="public_cost" className="input input-sm" maxLength={300} defaultValue={i.public_cost ?? ""} placeholder="Costo público (tasas, derechos), separado de honorarios" aria-label="Costo público" />
                                <textarea name="observations" className="input" rows={2} maxLength={2000} defaultValue={i.observations ?? ""} placeholder="Observaciones, rechazo o subsanación (obligatorio si no aplica)" aria-label="Observaciones" />
                                <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Guardar</SubmitButton>
                              </form>
                            </details>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
        {manage && items.length ? (
          <details className="more">
            <summary>Agregar un requisito</summary>
            <form action={addItemAction} className="mini-form">
              <input type="hidden" name="company_id" value={id} />
              <div className="inline-form">
                <select name="etapa" className="input input-sm" defaultValue="local" aria-label="Etapa">
                  {LIFECYCLE.map((s) => <option key={s.key} value={s.key}>{s.n} · {s.titulo}</option>)}
                </select>
                <select name="institucion" className="input input-sm" defaultValue="muni" aria-label="Institución">
                  {Object.values(INSTITUTIONS).map((x) => <option key={x.key} value={x.key}>{x.sigla}</option>)}
                </select>
                <select name="responsable" className="input input-sm" defaultValue="enqora" aria-label="Responsable">
                  {Object.entries(RESPONSIBLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <input name="tramite" className="input input-sm" required minLength={3} maxLength={200} placeholder="Trámite o requisito" aria-label="Trámite" />
              <input name="cuando" className="input input-sm" maxLength={400} placeholder="Cuándo aplica" aria-label="Cuándo aplica" />
              <input name="documentos" className="input input-sm" maxLength={1000} placeholder="Documentos necesarios" aria-label="Documentos" />
              <input name="url" type="url" className="input input-sm" pattern="https://.+" placeholder="https://… fuente oficial (opcional)" aria-label="Fuente oficial" />
              <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Agregar requisito</SubmitButton>
            </form>
          </details>
        ) : null}
      </section>
    </div>
  );
}
