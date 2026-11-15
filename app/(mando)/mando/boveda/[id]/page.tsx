import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { anularFirmaAction, solicitarFirmaAction } from "@/app/actions/firma";
import { anularAction, autorizarEnviarAction, editarBorradorAction, enviarRevisionAction, redactorAction, retencionAction, revisarAction, secretariaAction } from "@/app/actions/boveda";
import { Notice } from "@/components/auth-card";
import { SubmitButton } from "@/components/submit-button";
import { ACCIONES, CLASES, ESTADOS, REVISORES, tipoPorKey } from "@/lib/boveda";
import { CALIDADES, ESTADOS_FIRMANTE, ESTADOS_SOLICITUD, MAPA_FIRMA, admiteFirma, codigoVerificacion, type Calidad } from "@/lib/firma";
import { messageForCode } from "@/lib/db-errors";
import { fechaCL } from "@/lib/informa";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Documento · Bóveda ENQORA" };
export const maxDuration = 60;

type D = {
  id: string; folio: string; company_id: string; case_id: string | null; tipo: string; clase: string; titulo: string; proposito: string | null;
  destinatario: string | null; origen: string; estado: string; confidencialidad: string; revisor_requerido: "abogado" | "contador" | "profesional";
  responsable_id: string | null; revisor_id: string | null; autorizado_por: string | null; autorizado_at: string | null; enviado_via: string | null;
  version_actual: number; version_final: number | null; sha256: string | null; antecedentes: { datos?: Record<string, string>; checklist?: { antecedente: string; estado: string }[];
  faltantes?: string[]; archivos_del_caso?: string[]; preparado_por?: string }; retencion_hasta: string; retencion_motivo: string; retencion_legal: boolean;
  anulado_motivo: string | null; mime_type: string | null; size_bytes: number | null; created_at: string;
};
type V = { version: number; cuerpo: string | null; faltantes: string[]; normas: string[]; sha256: string; autor_tipo: string; autor_agente: string | null; autor_id: string | null; nota: string | null; created_at: string };
type FR = { id: string; folio: string; estado: string; nivel: string; version: number; secuencial: boolean; vence_at: string; completada_at: string | null; sello: string | null; anulado_motivo: string | null; created_at: string };
type FS = { id: string; request_id: string; orden: number; nombre: string; correo: string; calidad: Calidad; estado: string; leido_at: string | null; firmado_at: string | null; rechazo_motivo: string | null; evidencia: { ip?: string; dispositivo?: string } };
type E = { id: number; accion: string; actor_id: string | null; actor_tipo: string; actor_agente: string | null; detalle: Record<string, unknown>; created_at: string; hash: string };

const AVISOS: Record<string, string> = {
  antecedentes: "La Secretaria reunió los antecedentes.", borrador: "El Redactor entregó un nuevo borrador. Previsualízalo antes de enviarlo a revisión.",
  borrador_editado: "Nueva versión guardada.", en_revision: "Enviado a revisión profesional.", aprobado: "Documento aprobado. Falta autorizar y enviar.",
  observado: "Documento observado: vuelve a borrador.", enviado: "Documento autorizado y enviado. La versión final quedó congelada.",
  anulado: "Documento anulado.", retencion: "Retención actualizada.", pedido: "Pedido registrado en la Bóveda.",
  firma_solicitada: "Documento enviado a firma: cada firmante recibió el aviso con su enlace.", firma_anulada: "Solicitud de firma anulada.",
};

export default async function DocumentoBovedaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const role = await myStaffRole();
  if (!role) notFound();
  const supervisor = isSupervisorRole(role);
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("vault_documents").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const d = data as D;
  const [{ data: vers }, { data: evs }, { data: integra }, { data: { user } }, { data: caso }] = await Promise.all([
    supabase.from("vault_versions").select("version, cuerpo, faltantes, normas, sha256, autor_tipo, autor_agente, autor_id, nota, created_at").eq("document_id", id).order("version", { ascending: false }),
    supabase.from("vault_events").select("id, accion, actor_id, actor_tipo, actor_agente, detalle, created_at, hash").eq("document_id", id).order("id", { ascending: false }).limit(80),
    supabase.rpc("vault_verificar_cadena", { p_doc: id }),
    supabase.auth.getUser(),
    d.case_id ? supabase.from("cases").select("folio, title, responsible_id").eq("id", d.case_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  // ENQORA SIGN (0060): si la migración no está pegada, la sección de firma no aparece.
  const [{ data: frs, error: fError }, { data: fss }] = await Promise.all([
    supabase.from("sign_requests").select("id, folio, estado, nivel, version, secuencial, vence_at, completada_at, sello, anulado_motivo, created_at").eq("document_id", id).order("created_at", { ascending: false }),
    supabase.from("sign_signers").select("id, request_id, orden, nombre, correo, calidad, estado, leido_at, firmado_at, rechazo_motivo, evidencia").order("orden"),
  ]);
  const solicitudes = (frs ?? []) as FR[];
  const firmantesDe = (r: string) => ((fss ?? []) as FS[]).filter((f) => f.request_id === r);
  const versiones = (vers ?? []) as V[];
  const eventos = (evs ?? []) as E[];
  const actual = versiones.find((v) => v.version === d.version_actual) ?? null;
  const uid = user?.id ?? "";
  const vioActual = eventos.some((e) => e.accion === "visualizado" && e.actor_id === uid && Number(e.detalle?.version) === d.version_actual);
  const puedeRevisar = role === "enqora_admin" || (d.revisor_requerido === "abogado" && role === "lawyer_pro") || (d.revisor_requerido === "contador" && role === "accountant_pro")
    || (d.revisor_requerido === "profesional" && ["lawyer_pro", "accountant_pro"].includes(role));
  const c = caso as { folio: string; title: string; responsible_id: string | null } | null;
  const puedeAutorizar = supervisor || c?.responsible_id === uid || d.responsable_id === uid;
  const generado = d.origen === "generado";
  const editable = generado && ["solicitado", "antecedentes", "borrador", "observado", "en_revision"].includes(d.estado);
  const tipo = tipoPorKey(d.tipo);
  const admite = admiteFirma(d.tipo, d.clase);
  const firmable = !fError && generado && ["enviado", "archivado"].includes(d.estado) && d.confidencialidad === "cliente" && !!d.version_final;
  const enCurso = solicitudes.some((r) => r.estado === "pendiente");
  const ant = d.antecedentes ?? {};

  return (
    <div className="page inf-mando">
      <Link href="/mando/boveda" className="back-link"><span aria-hidden="true">←</span> Bóveda de archivos</Link>
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">{d.folio} · {CLASES[d.clase] ?? d.clase}{generado ? ` · versión ${d.version_actual}` : " · archivo subido"}</span>
          <h1>{d.titulo}</h1>
          <p className="hero-lead">
            <span className={`badge ${ESTADOS[d.estado]?.tono === "ok" ? "badge-ok" : ESTADOS[d.estado]?.tono === "muted" ? "badge-muted" : "badge-gold"}`}>{ESTADOS[d.estado]?.texto ?? d.estado}</span>{" "}
            {c ? <>Caso <Link href={`/casos/${d.case_id}`}>{c.folio}</Link> · {c.title}</> : null}
          </p>
        </div>
        <div className="hero-actions">
          {generado && d.version_actual > 0 ? <Link href={`/boveda/${d.id}/vista?v=${d.version_actual}`} className="btn btn-gold btn-inline" target="_blank">Previsualizar versión {d.version_actual}</Link> : null}
          {!generado && d.estado !== "anulado" ? <a href={`/boveda/${d.id}/archivo`} className="btn btn-ghost btn-inline">Descargar archivo</a> : null}
        </div>
      </header>

      {sp.aviso && AVISOS[sp.aviso] ? <Notice kind="ok">{AVISOS[sp.aviso]}</Notice> : null}
      {messageForCode(sp.error) ? <Notice kind="error">{messageForCode(sp.error)}</Notice> : null}

      <section className="card">
        <h2>Ficha del documento</h2>
        <dl className="kv">
          <div><dt>Tipo</dt><dd>{tipo.titulo}</dd></div>
          {d.proposito ? <div><dt>Para qué</dt><dd>{d.proposito}</dd></div> : null}
          {d.destinatario ? <div><dt>Destinatario</dt><dd>{d.destinatario}</dd></div> : null}
          <div><dt>Confidencialidad</dt><dd>{d.confidencialidad === "cliente" ? "Visible para el cliente" : d.confidencialidad === "interno" ? "Interno del equipo" : "Reservado"}</dd></div>
          {generado ? <div><dt>Revisión requerida</dt><dd>{REVISORES[d.revisor_requerido]}</dd></div> : null}
          {d.sha256 ? <div><dt>Huella final (SHA-256)</dt><dd className="mono">{d.sha256}</dd></div> : null}
          {d.autorizado_at ? <div><dt>Autorizado</dt><dd>{fechaCL(d.autorizado_at, "long")} · vía {d.enviado_via === "cliente" ? "espacio del cliente" : d.enviado_via === "institucion" ? "presentación a la institución" : "descarga"}</dd></div> : null}
          <div><dt>Conservar hasta</dt><dd>{fechaCL(d.retencion_hasta, "long")}{d.retencion_legal ? " · retención legal" : ""} · {d.retencion_motivo}</dd></div>
          {d.anulado_motivo ? <div><dt>Anulado</dt><dd>{d.anulado_motivo}</dd></div> : null}
        </dl>
      </section>

      {generado && d.estado !== "anulado" ? (
        <section className="card boveda-flujo" aria-labelledby="flujo-t">
          <h2 id="flujo-t">Flujo del documento</h2>
          <ol className="boveda-pasos">
            {[["Pedido", ["solicitado"]], ["Antecedentes", ["antecedentes"]], ["Borrador", ["borrador", "observado"]], ["Revisión", ["en_revision"]], ["Aprobado", ["aprobado"]], ["Enviado", ["enviado", "archivado"]]].map(([t, es], i, arr) => {
              const idx = arr.findIndex(([, e]) => (e as string[]).includes(d.estado));
              return <li key={t as string} className={i < idx ? "is-done" : i === idx ? "is-now" : undefined}><span>{i + 1}</span>{t as string}</li>;
            })}
          </ol>

          {editable && d.estado !== "en_revision" ? (
            <div className="inline-form">
              <form action={secretariaAction}><input type="hidden" name="id" value={d.id} /><SubmitButton variant="ghost" className="btn-inline" pendingText="La Secretaria está reuniendo…">Secretaria: reunir antecedentes</SubmitButton></form>
              <form action={redactorAction}><input type="hidden" name="id" value={d.id} /><SubmitButton variant="gold" className="btn-inline" pendingText="El Redactor está escribiendo…">Redactor: preparar borrador</SubmitButton></form>
              {["borrador", "observado"].includes(d.estado) && d.version_actual > 0 ? (
                <form action={enviarRevisionAction}><input type="hidden" name="id" value={d.id} /><SubmitButton variant="ghost" className="btn-inline" pendingText="…">Enviar a revisión profesional</SubmitButton></form>
              ) : null}
            </div>
          ) : null}

          {d.estado === "en_revision" && puedeRevisar ? (
            <form action={revisarAction} className="mini-form">
              <input type="hidden" name="id" value={d.id} />
              {!vioActual ? <p className="alert alert-info">Primero previsualiza la versión {d.version_actual}: la aprobación exige revisión visual y queda registrada.</p> : null}
              <textarea name="nota" className="input" rows={2} required minLength={5} maxLength={1000} placeholder="Qué revisaste (normativa, datos, formato) u observaciones para corregir" aria-label="Nota de revisión" />
              <div className="inline-form">
                <button type="submit" name="decision" value="aprobar" className="btn btn-gold btn-inline" disabled={!vioActual}>Aprobar versión {d.version_actual}</button>
                <button type="submit" name="decision" value="observar" className="btn btn-ghost btn-inline">Observar (vuelve a borrador)</button>
              </div>
            </form>
          ) : d.estado === "en_revision" ? <p className="muted-line">Espera la revisión de un {REVISORES[d.revisor_requerido].toLowerCase()} del equipo.</p> : null}

          {d.estado === "aprobado" && puedeAutorizar ? (
            <form action={autorizarEnviarAction} className="mini-form">
              <input type="hidden" name="id" value={d.id} />
              <div className="inline-form">
                <select name="via" className="input input-sm" defaultValue="cliente" aria-label="Cómo se envía">
                  <option value="cliente">Enviar al espacio del cliente</option><option value="institucion">Presentado ante la institución</option><option value="descarga">Solo descarga interna</option>
                </select>
                <input name="nota" className="input" maxLength={500} placeholder="Nota (opcional)" aria-label="Nota" />
                <SubmitButton variant="gold" className="btn-inline" pendingText="…">Autorizar y enviar</SubmitButton>
              </div>
              <p className="muted-line">Al autorizar, la versión {d.version_actual} queda congelada con su huella SHA-256 y registrada a tu nombre.</p>
            </form>
          ) : d.estado === "aprobado" ? <p className="muted-line">Espera la autorización del responsable del caso o de la supervisión.</p> : null}

          {editable && d.estado !== "en_revision" ? (
            <details className="partes-form">
              <summary className="btn btn-ghost btn-inline btn-sm">Editar el borrador a mano</summary>
              <form action={editarBorradorAction} className="mini-form">
                <input type="hidden" name="id" value={d.id} />
                <textarea name="cuerpo" className="input mono" rows={18} required minLength={50} maxLength={120000} defaultValue={actual?.cuerpo ?? ""} aria-label="Cuerpo del documento" />
                <input name="nota" className="input" maxLength={1000} placeholder="Qué cambiaste (opcional)" aria-label="Nota" />
                <SubmitButton variant="ghost" className="btn-inline" pendingText="…">Guardar como nueva versión</SubmitButton>
                <p className="muted-line">Formato: # título, ## secciones, listas con «-» o «1.». Marca con [COMPLETAR: dato] lo que falte. Quien redacta a mano no puede aprobar esa versión.</p>
              </form>
            </details>
          ) : null}
        </section>
      ) : null}

      {!fError && generado && d.estado !== "anulado" ? (
        <section className="card" id="firma" aria-labelledby="firma-t">
          <h2 id="firma-t">Firma electrónica · ENQORA SIGN</h2>
          {solicitudes.map((r) => (
            <div key={r.id} className="firma-solicitud">
              <p><span className="mono">{r.folio}</span> <span className={`badge ${ESTADOS_SOLICITUD[r.estado]?.tono === "ok" ? "badge-ok" : ESTADOS_SOLICITUD[r.estado]?.tono === "muted" ? "badge-muted" : "badge-gold"}`}>{r.estado === "pendiente" && new Date(r.vence_at) < new Date() ? "Plazo vencido" : ESTADOS_SOLICITUD[r.estado]?.texto ?? r.estado}</span>{" "}
                <small>versión {r.version} · {r.secuencial ? "en orden" : "sin orden"} · vence {fechaCL(r.vence_at)}{r.completada_at ? ` · completada ${fechaCL(r.completada_at, "long")}` : ""}{r.sello ? ` · código ${codigoVerificacion(r.sello)}` : ""}{r.anulado_motivo ? ` · anulada: ${r.anulado_motivo}` : ""}</small></p>
              <ol className="firma-partes">
                {firmantesDe(r.id).map((f) => (
                  <li key={f.id} className={f.estado === "firmado" ? "is-ok" : f.estado === "rechazado" ? "is-no" : undefined}>
                    <b>{f.nombre}</b> <small>{CALIDADES[f.calidad] ?? f.calidad} · {f.correo}</small>
                    <span>{ESTADOS_FIRMANTE[f.estado] ?? f.estado}{f.firmado_at ? ` · ${fechaCL(f.firmado_at, "long")}` : f.leido_at ? " · leyó el documento" : ""}{f.evidencia?.ip ? ` · IP ${f.evidencia.ip}` : ""}{f.rechazo_motivo ? ` · «${f.rechazo_motivo}»` : ""}</span>
                  </li>
                ))}
              </ol>
              {r.estado === "pendiente" && puedeAutorizar ? (
                <form action={anularFirmaAction} className="inline-form">
                  <input type="hidden" name="doc" value={d.id} /><input type="hidden" name="id" value={r.id} />
                  <input name="motivo" className="input" required minLength={5} maxLength={500} placeholder="Motivo para anular la solicitud" aria-label="Motivo" />
                  <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Anular solicitud</SubmitButton>
                </form>
              ) : null}
            </div>
          ))}
          {!admite.ok ? <p className="alert alert-info">{admite.motivo}</p>
            : !firmable ? <p className="muted-line">{d.confidencialidad !== "cliente" ? "Solo se envían a firma documentos visibles para el cliente." : "Se envía a firma cuando el documento está autorizado y su versión final quedó congelada."}</p>
            : enCurso ? <p className="muted-line">Hay una solicitud de firma en curso para este documento.</p>
            : puedeAutorizar ? (
            <form action={solicitarFirmaAction} className="mini-form">
              <input type="hidden" name="id" value={d.id} />
              <p className="muted-line">Firmantes en orden. Cada uno necesita su cuenta ENQORA (con segundo factor): escribe el correo de esa cuenta. Integrantes de la empresa firman como cliente, representante o empleador; un trabajador o la contraparte, con su propia cuenta.</p>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="inline-form">
                  <input name={`correo_${i}`} type="email" className="input" required={i === 0} maxLength={254} placeholder={`Correo del firmante ${i + 1}${i ? " (opcional)" : ""}`} aria-label={`Correo del firmante ${i + 1}`} />
                  <select name={`calidad_${i}`} className="input input-sm" defaultValue={i === 0 ? "cliente" : "contraparte"} aria-label={`Calidad del firmante ${i + 1}`}>
                    {Object.entries(CALIDADES).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                  </select>
                </div>
              ))}
              <div className="inline-form">
                <label className="check"><input type="checkbox" name="secuencial" defaultChecked /> Firmar en este orden</label>
                <select name="vence_dias" className="input input-sm" defaultValue="15" aria-label="Plazo para firmar"><option value="5">Plazo: 5 días</option><option value="15">Plazo: 15 días</option><option value="30">Plazo: 30 días</option></select>
              </div>
              <input name="mensaje" className="input" maxLength={500} placeholder="Mensaje para los firmantes (opcional)" aria-label="Mensaje" />
              <SubmitButton variant="gold" className="btn-inline" pendingText="Enviando a firma…">Enviar a firma</SubmitButton>
            </form>
          ) : <p className="muted-line">Envía a firma el responsable del caso, el responsable del documento o la supervisión.</p>}
          <details>
            <summary>Qué se firma dónde</summary>
            <ul>{MAPA_FIRMA.map((m) => <li key={m.documento}><b>{m.donde}:</b> {m.documento}.</li>)}</ul>
          </details>
        </section>
      ) : null}

      {generado && (ant.checklist?.length || ant.datos) ? (
        <section className="card">
          <h2>Antecedentes {ant.preparado_por ? <small className="muted-line">· {ant.preparado_por}</small> : null}</h2>
          {ant.checklist?.length ? <ul className="boveda-check">{ant.checklist.map((c) => <li key={c.antecedente} className={c.estado === "falta" ? "is-falta" : "is-ok"}>{c.estado === "falta" ? "Falta" : "✓"} · {c.antecedente}</li>)}</ul> : null}
          {ant.datos ? <dl className="kv">{Object.entries(ant.datos).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl> : null}
          {ant.archivos_del_caso?.length ? <details><summary>Archivos del caso ({ant.archivos_del_caso.length})</summary><ul>{ant.archivos_del_caso.map((a) => <li key={a}>{a}</li>)}</ul></details> : null}
        </section>
      ) : null}

      {versiones.length ? (
        <section className="card">
          <h2>Versiones</h2>
          <ul className="inf-cola">
            {versiones.map((v) => (
              <li key={v.version} className="inf-cola-item">
                <b>Versión {v.version}</b>
                {d.version_final === v.version ? <span className="badge badge-ok">Final</span> : null}
                {v.faltantes.length ? <span className="badge badge-gold">{v.faltantes.length} dato(s) por completar</span> : null}
                <Link href={`/boveda/${d.id}/vista?v=${v.version}`} target="_blank">Previsualizar</Link>
                <small>{v.autor_tipo === "agente" ? `${v.autor_agente === "redactor" ? "Redactor" : v.autor_agente} (agente)` : "Persona del equipo"} · {fechaCL(v.created_at)} · SHA-256 {v.sha256.slice(0, 16)}…{v.nota ? ` · ${v.nota}` : ""}{v.normas.length ? ` · normas: ${v.normas.join(", ")}` : ""}</small>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card">
        <h2>Bitácora {integra === true ? <span className="badge badge-ok">Cadena íntegra</span> : integra === false ? <span className="badge badge-gold">Cadena alterada</span> : null}</h2>
        <ol className="inf-cola">
          {eventos.map((e) => (
            <li key={e.id} className="inf-cola-item">
              <b>{ACCIONES[e.accion] ?? e.accion}</b>
              <small>{new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(e.created_at))} · {e.actor_tipo === "agente" ? `${e.actor_agente} (agente) a pedido de ${e.actor_id === uid ? "ti" : "una persona del equipo"}` : e.actor_tipo === "sistema" ? "Sistema" : e.actor_id === uid ? "Tú" : "Persona registrada"}{typeof e.detalle?.version !== "undefined" ? ` · versión ${String(e.detalle.version)}` : ""}{e.detalle?.nota ? ` · «${String(e.detalle.nota)}»` : ""}</small>
            </li>
          ))}
        </ol>
        <p className="muted-line">Cada evento guarda la huella del anterior: si alguien alterara un registro, la cadena dejaría de cuadrar.</p>
      </section>

      {supervisor && d.estado !== "anulado" ? (
        <section className="card">
          <h2>Supervisión</h2>
          <form action={retencionAction} className="inline-form">
            <input type="hidden" name="id" value={d.id} />
            <label className="check"><input type="checkbox" name="legal" defaultChecked={d.retencion_legal} /> Retención legal</label>
            <input type="date" name="hasta" className="input input-sm" defaultValue={d.retencion_hasta} aria-label="Conservar hasta" />
            <input name="motivo" className="input" required minLength={5} maxLength={300} placeholder="Motivo (obligatorio)" aria-label="Motivo de retención" />
            <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Actualizar retención</SubmitButton>
          </form>
          <form action={anularAction} className="inline-form">
            <input type="hidden" name="id" value={d.id} />
            <input name="motivo" className="input" required minLength={5} maxLength={500} placeholder="Motivo de anulación (obligatorio)" aria-label="Motivo de anulación" />
            <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Anular documento</SubmitButton>
          </form>
        </section>
      ) : null}
    </div>
  );
}
