import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { custodiaAction, gestorEncargoAction } from "@/app/actions/terreno";
import { Notice } from "@/components/auth-card";
import { SubmitButton } from "@/components/submit-button";
import { messageForCode } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";
import { clp, CUSTODY, FIELD_STATUS, hora, type FieldFile, type FieldTask, type FieldTaskType } from "@/lib/terreno";

export const metadata: Metadata = { title: "Encargo" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AVISOS: Record<string, string> = {
  g_aceptar: "¡Aceptado! El cliente ve tu hora estimada de llegada. Si el encargo trae documentos, CORA te autorizará la descarga.",
  g_eta: "Hora estimada actualizada.",
  g_llegue: "Registrado: estás en la oficina.",
  g_realizado: "¡Bien hecho! ENQORA verificará el comprobante.",
  g_no_realizado: "Registramos que no se pudo completar. ENQORA lo reprogramará.",
  custodia: "Documento actualizado.",
};

type Doc = { id: string; name: string; custody: string };

// Detalle del encargo para el gestor: instrucciones, documentos (descarga solo con autorización de CORA),
// custodia de los papeles y cierre con comprobante.
export default async function GestorEncargo({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: tRow } = await supabase.from("field_tasks").select("*").eq("id", id).maybeSingle();
  const t = tRow as FieldTask | null;
  if (!t) notFound(); // la base solo muestra al gestor sus propios encargos
  const [{ data: tyRow }, { data: fRows }, { data: dRows }] = await Promise.all([
    supabase.from("field_task_types").select("*").eq("code", t.type_code).maybeSingle(),
    supabase.from("field_task_files").select("id, task_id, document_id, file_name, created_at").eq("task_id", id).order("file_name"),
    supabase.from("field_task_docs").select("id, name, custody").eq("task_id", id).order("name"),
  ]);
  const ty = tyRow as FieldTaskType | null;
  const files = (fRows ?? []) as FieldFile[];
  const docs = (dRows ?? []) as Doc[];
  const enCurso = t.status === "en_camino" || t.status === "en_oficina";
  const mapa = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${t.office_address}${t.comuna ? `, ${t.comuna}` : ""}, Chile`)}`;

  return (
    <div className="gestor-page">
      <Link href="/gestor" className="back-link"><span aria-hidden="true">←</span> Mis encargos</Link>
      <div className="terreno-head">
        <span className={`status status-${FIELD_STATUS[t.status].tone}`}>{FIELD_STATUS[t.status].label}</span>
        <b className="mono">{t.folio}</b>
        <span className="terreno-pago">{clp(t.gestor_fee)}</span>
      </div>
      <h1 className="gestor-title">{ty?.name ?? t.type_code}</h1>
      {sp.aviso && AVISOS[sp.aviso] ? <Notice kind="ok">{AVISOS[sp.aviso]}</Notice> : null}
      {messageForCode(sp.error) ? <Notice kind="error">{messageForCode(sp.error)}</Notice> : null}

      <section className="card">
        <p><b>{t.office_name}</b><br />{t.office_address}{t.comuna ? `, ${t.comuna}` : ""}</p>
        <a href={mapa} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-inline btn-sm">Abrir en el mapa ↗</a>
        {t.eta ? <p className="muted-line">Llegada estimada: {hora(t.eta)}</p> : null}
        {t.instructions ? <p className="pre">{t.instructions}</p> : null}
        {ty?.guidance ? <p className="muted-line">{ty.guidance}</p> : null}
      </section>

      {files.length ? (
        <section className="card">
          <h2 className="card-title">Documentos para descargar</h2>
          {t.status === "asignado" ? (
            <p className="muted-line">Acepta el encargo primero. Luego CORA autorizará la descarga.</p>
          ) : enCurso && !t.docs_ok_at ? (
            <Notice kind="info">Esperando que CORA autorice la descarga. Te llegará un aviso.</Notice>
          ) : null}
          <ul className="ref-list" role="list">
            {files.map((f) => (
              <li key={f.id}>
                <span className="ref-main"><b>{f.file_name}</b></span>
                {enCurso && t.docs_ok_at
                  ? <a href={`/gestor/encargo/${t.id}/archivo/${f.id}`} className="btn btn-gold btn-inline btn-sm">Descargar</a>
                  : <span className="status status-muted">Bloqueado</span>}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {t.status === "asignado" ? (
        <section className="card terreno-actions">
          <form action={gestorEncargoAction} className="inline-form">
            <input type="hidden" name="task_id" value={t.id} />
            <input type="hidden" name="accion" value="aceptar" />
            <select name="minutos" className="input input-sm" defaultValue="30" aria-label="Llego en">
              {[15, 30, 45, 60, 90, 120, 180].map((m) => <option key={m} value={m}>Llego en {m < 60 ? `${m} min` : `${m / 60} h`}</option>)}
            </select>
            <SubmitButton className="btn-inline" pendingText="…">Aceptar · {clp(t.gestor_fee)}</SubmitButton>
          </form>
          <form action={gestorEncargoAction} className="inline-form">
            <input type="hidden" name="task_id" value={t.id} />
            <input type="hidden" name="accion" value="rechazar" />
            <input name="nota" className="input input-sm" maxLength={300} placeholder="Motivo (opcional)" aria-label="Motivo" />
            <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Rechazar</SubmitButton>
          </form>
        </section>
      ) : null}

      {enCurso ? (
        <section className="card terreno-actions">
          {t.status === "en_camino" ? (
            <>
              <form action={gestorEncargoAction}>
                <input type="hidden" name="task_id" value={t.id} />
                <input type="hidden" name="accion" value="llegue" />
                <SubmitButton className="btn-inline" pendingText="…">Llegué a la oficina</SubmitButton>
              </form>
              <form action={gestorEncargoAction} className="inline-form">
                <input type="hidden" name="task_id" value={t.id} />
                <input type="hidden" name="accion" value="eta" />
                <select name="minutos" className="input input-sm" defaultValue="15" aria-label="Nueva hora">
                  {[10, 15, 30, 45, 60, 90].map((m) => <option key={m} value={m}>Llego en {m} min</option>)}
                </select>
                <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Actualizar hora</SubmitButton>
              </form>
            </>
          ) : null}
          <form action={gestorEncargoAction} className="mini-form">
            <input type="hidden" name="task_id" value={t.id} />
            <input type="hidden" name="accion" value="realizado" />
            <input name="comprobante" className="input" required minLength={3} maxLength={200} placeholder="Comprobante: N° de ingreso, carátula, repertorio o folio" aria-label="Comprobante" />
            <textarea name="nota" className="input" rows={2} maxLength={2000} placeholder="Qué se hizo y qué retiraste (opcional)" aria-label="Resultado" />
            <SubmitButton className="btn-inline" pendingText="…">Marcar realizado</SubmitButton>
          </form>
          <form action={gestorEncargoAction} className="mini-form">
            <input type="hidden" name="task_id" value={t.id} />
            <input type="hidden" name="accion" value="no_realizado" />
            <textarea name="nota" className="input" rows={2} required minLength={10} maxLength={2000} placeholder="Por qué no se pudo (falta un documento, oficina cerrada…)" aria-label="Motivo" />
            <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">No se pudo hacer</SubmitButton>
          </form>
        </section>
      ) : null}

      {["realizado", "no_realizado", "verificado"].includes(t.status) ? (
        <Notice kind={t.status === "verificado" ? "ok" : "info"}>
          {t.status === "verificado" ? `Verificado por ENQORA. Cuenta para tu liquidación (${clp(t.gestor_fee)}).` : "Registrado. ENQORA lo está revisando."}
          {t.receipt ? ` Comprobante: ${t.receipt}.` : ""}
        </Notice>
      ) : null}

      {docs.length ? (
        <section className="card">
          <h2 className="card-title">Papeles que llevas</h2>
          <ul className="ref-list" role="list">
            {docs.map((d) => (
              <li key={d.id}>
                <span className="ref-main"><b>{d.name}</b><small className="muted-line">{CUSTODY[d.custody] ?? d.custody}</small></span>
                {enCurso ? (
                  <form action={custodiaAction} className="inline-form">
                    <input type="hidden" name="doc_id" value={d.id} />
                    <input type="hidden" name="task_id" value={t.id} />
                    <input type="hidden" name="app" value="gestor" />
                    <select name="custodia" className="input input-sm" defaultValue={d.custody} aria-label={`Estado de ${d.name}`}>
                      {Object.entries(CUSTODY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Guardar</SubmitButton>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
