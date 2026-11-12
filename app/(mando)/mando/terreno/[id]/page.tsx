import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { adjuntarArchivoAction, asignarEncargoAction, autorizarDescargaAction, custodiaAction, quitarArchivoAction, revisarEncargoAction, verificarEncargoAction } from "@/app/actions/terreno";
import { Notice } from "@/components/auth-card";
import { SubmitButton } from "@/components/submit-button";
import { messageForCode } from "@/lib/db-errors";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";
import { createClient, currentUser } from "@/lib/supabase/server";
import { atrasado, clp, CUSTODY, FIELD_STATUS, fechaHora, hora, INSTITUTIONS, type FieldFile, type FieldTask, type FieldTaskType } from "@/lib/terreno";

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
  archivo: "Archivo adjuntado al encargo. El gestor podrá descargarlo solo cuando autorices la descarga.",
  archivo_quitado: "Archivo quitado del encargo.",
  descarga_ok: "Descarga autorizada. Se avisó al gestor.",
  descarga_retirada: "Autorización de descarga retirada.",
  verificado: "Encargo verificado. El cliente fue informado y cuenta para la liquidación del gestor.",
  reprogramado: "El encargo vuelve a despacho para reintentar.",
};

type Ev = { id: number; actor_id: string | null; from_status: string | null; to_status: string | null; note: string | null; created_at: string };
type Doc = { id: string; name: string; custody: string; note: string | null; updated_at: string };
type Gestor = { id: string; nombre: string; comuna: string | null; cobertura: string[]; activos: number };
type CaseDoc = { id: string; file_name: string };
type Descarga = { file_id: string; created_at: string };

export default async function EncargoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const role = await myStaffRole();
  if (!role || role === "ai_agent") notFound();
  if (role === "field_agent") redirect(`/gestor/encargo/${id}`);
  const sp = await searchParams;
  const me = await currentUser();
  const supabase = await createClient();

  const { data: tRow } = await supabase.from("field_tasks").select("*").eq("id", id).maybeSingle();
  const t = tRow as FieldTask | null;
  if (!t) notFound(); // la base solo muestra el encargo a quien puede verlo (el gestor, solo los suyos)

  const supervisor = isSupervisorRole(role);
  const [{ data: tyRow }, { data: dRows }, { data: eRows }, { data: cRow }, { data: coRow }, { data: gData }, { data: fRows }, { data: cdRows }, { data: dlRows }] = await Promise.all([
    supabase.from("field_task_types").select("*").eq("code", t.type_code).maybeSingle(),
    supabase.from("field_task_docs").select("id, name, custody, note, updated_at").eq("task_id", id).order("name"),
    supabase.from("field_task_events").select("*").eq("task_id", id).order("created_at", { ascending: false }),
    supabase.from("cases").select("folio, title").eq("id", t.case_id).maybeSingle(),
    supabase.from("companies").select("legal_name").eq("id", t.company_id).maybeSingle(),
    supervisor && t.status === "listo" ? supabase.rpc("gestores_disponibles") : Promise.resolve({ data: [] }),
    supabase.from("field_task_files").select("id, task_id, document_id, file_name, created_at").eq("task_id", id).order("file_name"),
    supabase.from("case_documents").select("id, file_name").eq("case_id", t.case_id).order("created_at", { ascending: false }).limit(50),
    supervisor ? supabase.from("field_task_downloads").select("file_id, created_at").order("created_at", { ascending: false }).limit(50) : Promise.resolve({ data: [] }),
  ]);
  const files = (fRows ?? []) as FieldFile[];
  const caseDocs = ((cdRows ?? []) as CaseDoc[]).filter((d) => !files.some((f) => f.document_id === d.id));
  const descargas = ((dlRows ?? []) as Descarga[]).filter((d) => files.some((f) => f.id === d.file_id));
  const enCurso = t.status === "en_camino" || t.status === "en_oficina";
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
      {["preparacion", "observado"].includes(t.status) ? (
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
                {gestores.map((g) => <option key={g.id} value={g.id}>{g.nombre}{g.comuna ? ` (${g.comuna})` : ""} · {g.activos} en curso</option>)}
              </select>
              <SubmitButton className="btn-inline btn-sm" pendingText="…">Asignar · pago {clp(ty?.gestor_fee ?? null)}</SubmitButton>
            </form>
          ) : <p className="muted-line">No hay gestores activos. Regístralos e invítalos en Despacho en terreno → Gestores.</p>}
        </section>
      ) : null}

      <section className="card">
        <h2>Documentos para el gestor</h2>
        <p className="muted-line">
          Adjunta archivos del expediente del caso (por ejemplo, el poder). El gestor los ve bloqueados hasta que acepte el encargo y tú autorices
          la descarga; cada descarga queda registrada.
        </p>
        {files.length ? (
          <ul className="ref-list" role="list">
            {files.map((f) => (
              <li key={f.id}>
                <span className="ref-main"><b>{f.file_name}</b>
                  <small className="muted-line">{descargas.filter((d) => d.file_id === f.id).length} descarga(s) del gestor{descargas.find((d) => d.file_id === f.id) ? ` · última ${fechaHora(descargas.find((d) => d.file_id === f.id)!.created_at)}` : ""}</small></span>
                {!["verificado", "cancelado", "realizado", "no_realizado"].includes(t.status) ? (
                  <form action={quitarArchivoAction}><input type="hidden" name="task_id" value={t.id} /><input type="hidden" name="file_id" value={f.id} />
                    <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Quitar</SubmitButton></form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : <p className="muted-line">Sin archivos adjuntos.</p>}
        {caseDocs.length && !["verificado", "cancelado", "realizado", "no_realizado"].includes(t.status) ? (
          <form action={adjuntarArchivoAction} className="inline-form">
            <input type="hidden" name="task_id" value={t.id} />
            <select name="document_id" className="input input-sm" aria-label="Documento del expediente">
              {caseDocs.map((d) => <option key={d.id} value={d.id}>{d.file_name}</option>)}
            </select>
            <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Adjuntar</SubmitButton>
          </form>
        ) : null}
        {files.length && supervisor ? (
          enCurso ? (
            t.docs_ok_at ? (
              <form action={autorizarDescargaAction} className="inline-form">
                <input type="hidden" name="task_id" value={t.id} /><input type="hidden" name="ok" value="0" />
                <span className="status status-ok">Descarga autorizada {fechaHora(t.docs_ok_at)}</span>
                <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Retirar autorización</SubmitButton>
              </form>
            ) : (
              <form action={autorizarDescargaAction}>
                <input type="hidden" name="task_id" value={t.id} /><input type="hidden" name="ok" value="1" />
                <SubmitButton className="btn-inline" pendingText="…">Autorizar descarga al gestor</SubmitButton>
              </form>
            )
          ) : <p className="muted-line">La descarga se autoriza cuando el gestor acepta el encargo.</p>
        ) : null}
      </section>

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
