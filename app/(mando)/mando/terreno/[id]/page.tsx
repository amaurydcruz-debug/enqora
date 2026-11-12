import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { asignarEncargoAction, custodiaAction, gestorEncargoAction, revisarEncargoAction, verificarEncargoAction } from "@/app/actions/terreno";
import { Notice } from "@/components/auth-card";
import { SubmitButton } from "@/components/submit-button";
import { messageForCode } from "@/lib/db-errors";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";
import { createClient, currentUser } from "@/lib/supabase/server";
import { atrasado, clp, CUSTODY, FIELD_STATUS, fechaHora, hora, INSTITUTIONS, type FieldTask, type FieldTaskType } from "@/lib/terreno";

export const metadata: Metadata = { title: "Encargo en terreno" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const AVISOS: Record<string, string> = {
  creado: "Encargo creado en preparación. Revisa la lista de documentos y envíalo cuando esté listo.",
  rev_preparado: "Encargo enviado: al abogado si el tipo lo exige, o directo a despacho.",
  rev_aprobar: "Aprobado por el abogado. Quedó listo para despachar.",
  rev_observar: "Observado: vuelve a preparación con tu nota.",
  rev_cancelar: "Encargo cancelado.",
  asignado: "Encargo asignado. El gestor recibió el aviso con el pago y debe aceptarlo.",
  g_aceptar: "¡En camino! El cliente ve tu hora estimada de llegada.",
  g_eta: "Hora estimada actualizada.",
  g_llegue: "Registrado: estás en la oficina.",
  g_realizado: "Encargo realizado. El equipo lo verificará con tu comprobante.",
  g_no_realizado: "Registramos que no se pudo completar. El equipo lo reprogramará.",
  custodia: "Custodia del documento actualizada.",
  verificado: "Encargo verificado. El cliente fue informado y cuenta para la liquidación del gestor.",
  reprogramado: "El encargo vuelve a despacho para reintentar.",
};

type Ev = { id: number; actor_id: string | null; from_status: string | null; to_status: string | null; note: string | null; created_at: string };
type Doc = { id: string; name: string; custody: string; note: string | null; updated_at: string };
type Gestor = { id: string; nombre: string; hasta: string | null; activos: number };

export default async function EncargoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const role = await myStaffRole();
  if (!role || role === "ai_agent") notFound();
  const sp = await searchParams;
  const me = await currentUser();
  const supabase = await createClient();

  const { data: tRow } = await supabase.from("field_tasks").select("*").eq("id", id).maybeSingle();
  const t = tRow as FieldTask | null;
  if (!t) notFound(); // la base solo muestra el encargo a quien puede verlo (el gestor, solo los suyos)

  const gestor = role === "field_agent";
  const supervisor = isSupervisorRole(role);
  const [{ data: tyRow }, { data: dRows }, { data: eRows }, { data: cRow }, { data: coRow }, { data: gData }] = await Promise.all([
    supabase.from("field_task_types").select("*").eq("code", t.type_code).maybeSingle(),
    supabase.from("field_task_docs").select("id, name, custody, note, updated_at").eq("task_id", id).order("name"),
    supabase.from("field_task_events").select("*").eq("task_id", id).order("created_at", { ascending: false }),
    gestor ? Promise.resolve({ data: null }) : supabase.from("cases").select("folio, title").eq("id", t.case_id).maybeSingle(),
    gestor ? Promise.resolve({ data: null }) : supabase.from("companies").select("legal_name").eq("id", t.company_id).maybeSingle(),
    supervisor && t.status === "listo" ? supabase.rpc("gestores_disponibles") : Promise.resolve({ data: [] }),
  ]);
  const ty = tyRow as FieldTaskType | null;
  const docs = (dRows ?? []) as Doc[];
  const evs = (eRows ?? []) as Ev[];
  const caso = cRow as { folio: string; title: string } | null;
  const empresa = coRow as { legal_name: string } | null;
  const gestores = (Array.isArray(gData) ? gData : []) as Gestor[];
  const st = FIELD_STATUS[t.status];
  const esMio = t.gestor_id === me?.id;
  const puedeAbogado = (role === "lawyer_pro" || role === "enqora_admin") && t.created_by !== me?.id;
  const late = atrasado(t);

  return (
    <div className="page narrow">
      <Link href="/mando/terreno" className="back-link"><span aria-hidden="true">←</span> Despacho en terreno</Link>
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Encargo {t.folio}{caso ? ` · caso ${caso.folio}` : ""}</span>
          <h1>{ty?.name ?? t.type_code}</h1>
          <p className="hero-lead">
            <b>{t.office_name}</b> · {t.office_address}{t.comuna ? `, ${t.comuna}` : ""} · {INSTITUTIONS[ty?.institution ?? ""] ?? ""}
            {empresa ? ` · para ${empresa.legal_name}` : ""}
          </p>
          <p>
            <span className={`status status-${late ? "risk" : st.tone}`}>{late ? "Atrasado" : st.label}</span>
            {t.eta ? <span className="muted-line"> · llegada estimada {hora(t.eta)}</span> : null}
            {t.gestor_fee != null ? <span className="muted-line"> · pago del gestor {clp(t.gestor_fee)}</span> : null}
            {t.due_date ? <span className="muted-line"> · fecha límite {t.due_date.split("-").reverse().join("-")}</span> : null}
          </p>
        </div>
      </header>
      {sp.aviso && AVISOS[sp.aviso] ? <Notice kind="ok">{AVISOS[sp.aviso]}</Notice> : null}
      {messageForCode(sp.error) ? <Notice kind="error">{messageForCode(sp.error)}</Notice> : null}

      {t.instructions ? <section className="card"><h2>Instrucciones</h2><p className="pre">{t.instructions}</p></section> : null}
      {ty?.guidance ? <Notice kind="info">{ty.guidance}</Notice> : null}
      {t.lawyer_note ? <section className="card"><h2>Nota del abogado</h2><p className="pre">{t.lawyer_note}</p><small className="muted-line">{fechaHora(t.lawyer_at)}</small></section> : null}

      {/* ---------- Acciones según el estado y el rol ---------- */}
      {!gestor && ["preparacion", "observado"].includes(t.status) ? (
        <section className="card">
          <h2>Preparación</h2>
          <p className="muted-line">Revisa que el paquete esté completo. {ty?.requires_lawyer ? "Este tipo pasa por el abogado antes de despacharse." : "Al enviarlo queda listo para despachar si el cliente tiene la autorización (y el mandato) vigente."}</p>
          <form action={revisarEncargoAction} className="inline-form">
            <input type="hidden" name="task_id" value={t.id} />
            <input type="hidden" name="accion" value="preparado" />
            <input name="nota" className="input input-sm" maxLength={1000} placeholder="Nota (opcional)" aria-label="Nota" />
            <SubmitButton className="btn-inline btn-sm" pendingText="…">{ty?.requires_lawyer ? "Enviar al abogado" : "Marcar listo"}</SubmitButton>
          </form>
        </section>
      ) : null}

      {t.status === "revision_juridica" && puedeAbogado ? (
        <section className="card">
          <h2>Revisión jurídica</h2>
          <form action={revisarEncargoAction} className="mini-form">
            <input type="hidden" name="task_id" value={t.id} />
            <textarea name="nota" className="input" rows={2} maxLength={1000} placeholder="Qué revisaste (obligatorio para observar)" aria-label="Nota del abogado" />
            <div className="inline-form">
              <button type="submit" name="accion" value="aprobar" className="btn btn-gold btn-inline btn-sm">Aprobar</button>
              <button type="submit" name="accion" value="observar" className="btn btn-ghost btn-inline btn-sm">Observar y devolver</button>
            </div>
          </form>
        </section>
      ) : t.status === "revision_juridica" ? (
        <Notice kind="info">Esperando la revisión del abogado (debe ser una persona distinta de quien preparó el encargo).</Notice>
      ) : null}

      {t.status === "listo" && supervisor ? (
        <section className="card">
          <h2>Despachar</h2>
          {gestores.length ? (
            <form action={asignarEncargoAction} className="inline-form">
              <input type="hidden" name="task_id" value={t.id} />
              <select name="gestor_id" className="input input-sm" required aria-label="Gestor">
                {gestores.map((g) => <option key={g.id} value={g.id}>{g.nombre} · {g.activos} en curso</option>)}
              </select>
              <SubmitButton className="btn-inline btn-sm" pendingText="…">Asignar · pago {clp(ty?.gestor_fee ?? null)}</SubmitButton>
            </form>
          ) : <p className="muted-line">No hay gestores con acceso hoy. Créales un pase del día en Equipo.</p>}
        </section>
      ) : null}

      {gestor && esMio && ["en_camino", "en_oficina"].includes(t.status) ? (
        <section className="card">
          <h2>Terminar el encargo</h2>
          {t.status === "en_camino" ? (
            <form action={gestorEncargoAction} className="panel-actions">
              <input type="hidden" name="task_id" value={t.id} />
              <input type="hidden" name="accion" value="llegue" />
              <SubmitButton className="btn-inline" pendingText="…">Llegué a la oficina</SubmitButton>
            </form>
          ) : null}
          <form action={gestorEncargoAction} className="mini-form">
            <input type="hidden" name="task_id" value={t.id} />
            <input type="hidden" name="accion" value="realizado" />
            <input name="comprobante" className="input" required minLength={3} maxLength={200} placeholder="Comprobante: N° de ingreso, carátula, repertorio o folio" aria-label="Comprobante" />
            <textarea name="nota" className="input" rows={2} maxLength={2000} placeholder="Qué se hizo y qué retiraste (opcional)" aria-label="Resultado" />
            <SubmitButton className="btn-inline btn-sm" pendingText="…">Marcar realizado</SubmitButton>
          </form>
          <form action={gestorEncargoAction} className="mini-form">
            <input type="hidden" name="task_id" value={t.id} />
            <input type="hidden" name="accion" value="no_realizado" />
            <textarea name="nota" className="input" rows={2} required minLength={10} maxLength={2000} placeholder="Por qué no se pudo (falta un documento, oficina cerrada…)" aria-label="Motivo" />
            <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">No se pudo hacer</SubmitButton>
          </form>
        </section>
      ) : null}

      {["realizado", "no_realizado"].includes(t.status) ? (
        <section className="card">
          <h2>{t.status === "realizado" ? "Resultado del gestor" : "No realizado"}</h2>
          {t.receipt ? <p>Comprobante: <b className="mono">{t.receipt}</b></p> : null}
          {t.result ? <p className="pre">{t.result}</p> : null}
          <p className="muted-line">Registrado {fechaHora(t.done_at)}{t.arrived_at ? ` · llegó ${hora(t.arrived_at)}` : ""}</p>
          {supervisor && !esMio ? (
            <form action={verificarEncargoAction} className="mini-form">
              <input type="hidden" name="task_id" value={t.id} />
              <textarea name="nota" className="input" rows={2} maxLength={1000} placeholder="Qué comprobaste (obligatorio para devolver a despacho)" aria-label="Nota de verificación" />
              <div className="inline-form">
                {t.status === "realizado" ? <button type="submit" name="decision" value="ok" className="btn btn-gold btn-inline btn-sm">Verificar y avisar al cliente</button> : null}
                <button type="submit" name="decision" value="no" className="btn btn-ghost btn-inline btn-sm">Devolver a despacho</button>
              </div>
            </form>
          ) : null}
        </section>
      ) : null}

      {t.status === "verificado" ? <Notice kind="ok">Verificado el {fechaHora(t.verified_at)}. Comprobante {t.receipt}.</Notice> : null}

      <section className="card">
        <h2>Documentos y custodia</h2>
        <p className="muted-line">Cada documento físico se sigue desde que se recibe hasta que vuelve al cliente.</p>
        <ul className="ref-list" role="list">
          {docs.map((d) => (
            <li key={d.id}>
              <span className="ref-main"><b>{d.name}</b><small className="muted-line">{CUSTODY[d.custody] ?? d.custody}{d.note ? ` · ${d.note}` : ""} · {fechaHora(d.updated_at)}</small></span>
              {t.status !== "verificado" && t.status !== "cancelado" ? (
                <form action={custodiaAction} className="inline-form">
                  <input type="hidden" name="doc_id" value={d.id} />
                  <input type="hidden" name="task_id" value={t.id} />
                  <select name="custodia" className="input input-sm" defaultValue={d.custody} aria-label={`Custodia de ${d.name}`}>
                    {Object.entries(CUSTODY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Guardar</SubmitButton>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {supervisor && !["verificado", "cancelado"].includes(t.status) ? (
        <details className="card">
          <summary>Cancelar encargo</summary>
          <form action={revisarEncargoAction} className="inline-form">
            <input type="hidden" name="task_id" value={t.id} />
            <input type="hidden" name="accion" value="cancelar" />
            <input name="nota" className="input input-sm" required minLength={10} maxLength={1000} placeholder="Motivo (mínimo 10 caracteres)" aria-label="Motivo" />
            <SubmitButton variant="danger" className="btn-inline btn-sm" pendingText="…">Cancelar encargo</SubmitButton>
          </form>
        </details>
      ) : null}

      <section className="card">
        <h2>Historial del encargo</h2>
        <ul className="ref-list" role="list">
          {evs.map((e) => (
            <li key={e.id}>
              <span className="ref-main">
                <b>{e.to_status ? FIELD_STATUS[e.to_status as keyof typeof FIELD_STATUS]?.label ?? e.to_status : "Actualización"}</b>
                <small className="muted-line">{fechaHora(e.created_at)}{e.note ? ` · ${e.note}` : ""}</small>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
