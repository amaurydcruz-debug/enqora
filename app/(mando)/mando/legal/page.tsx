import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  approveLegalDocumentAction,
  returnLegalDocumentAction,
  saveLegalDocumentAction,
  saveLegalProfileAction,
  sendLegalReviewAction,
} from "@/app/actions/legal";
import { Notice } from "@/components/auth-card";
import { Callout } from "@/components/disclosure";
import { Emblem } from "@/components/emblems";
import { SubmitButton } from "@/components/submit-button";
import { day, todayCl } from "@/lib/billing";
import { messageForCode } from "@/lib/db-errors";
import { DOC_STATUSES, PLACEHOLDERS, SCOPES, VERIFICACION, type LegalDocument, type LegalProfile } from "@/lib/legal";
import { INSTITUTIONS } from "@/lib/mandates";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Documentos legales" };

const AVISOS: Record<string, string> = {
  version_guardada: "Borrador guardado.",
  enviado_revision: "Versión marcada «En revisión jurídica». Envía el texto al estudio y registra su respuesta aquí.",
  aprobado: "Versión aprobada. Desde ahora es la que firman los clientes; las firmas de versiones anteriores ya no cuentan.",
  devuelto: "Versión devuelta a borrador con las observaciones del estudio.",
  retirado: "Documento retirado.",
  ficha_guardada: "Ficha legal del servicio guardada.",
};

const badge = (tone: string) => `badge badge-${tone}`;

// Biblioteca legal: el equipo redacta, el estudio jurídico revisa y la supervisión aprueba.
// Ningún caso pasa a ejecución sin los documentos aprobados y firmados por la empresa.
export default async function LegalAdminPage({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const role = await myStaffRole();
  if (!role) notFound();
  const sp = await searchParams;
  const supervisor = isSupervisorRole(role);
  const canEdit = supervisor || role === "lawyer_pro";
  const supabase = await createClient();

  const [{ data: dRows }, { data: pRows }, { data: sRows }, { data: sigRows }] = await Promise.all([
    supabase.from("legal_documents").select("*").order("code").order("version", { ascending: false }),
    supabase.from("service_legal_profiles").select("*"),
    supabase.from("services").select("code, name, active").order("code"),
    supabase.from("legal_signatures").select("document_id").eq("status", "vigente").limit(5000),
  ]);
  const docs = (dRows ?? []) as LegalDocument[];
  const profiles = new Map(((pRows ?? []) as LegalProfile[]).map((p) => [p.service_code, p]));
  const services = (sRows ?? []) as { code: string; name: string; active: boolean }[];
  const signedCount = new Map<string, number>();
  for (const s of (sigRows ?? []) as { document_id: string }[]) signedCount.set(s.document_id, (signedCount.get(s.document_id) ?? 0) + 1);

  const codes = [...new Set(docs.map((d) => d.code))];
  const byCode = (code: string) => docs.filter((d) => d.code === code);
  const exigidos = codes.filter((c) => {
    const v = byCode(c);
    return v.some((d) => d.status !== "retirado") && ["empresa", "caso"].includes(v[0].scope);
  });
  const sinAprobar = exigidos.filter((c) => !byCode(c).some((d) => d.status === "aprobado"));
  const enRevision = docs.filter((d) => d.status === "en_revision").length;
  const porConfirmar = [...profiles.values()].filter((p) => p.verificacion === "por_confirmar").length;
  const today = todayCl();

  return (
    <div className="page">
      <Link href="/mando" className="back-link"><span aria-hidden="true">←</span> Centro de Mando</Link>
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Centro de Mando · Respaldo legal</span>
          <h1>Documentos legales</h1>
          <p className="hero-lead">
            Lo que el cliente firma antes de que ENQORA trabaje o actúe a nombre de su RUT, y la ficha legal de cada trámite.
            El equipo redacta, el estudio jurídico revisa y la supervisión aprueba. Ningún caso pasa a ejecución sin los documentos
            aprobados y firmados.
          </p>
        </div>
        <Emblem name="legal" size="xl" />
      </header>

      {sp.aviso && AVISOS[sp.aviso] ? <Notice kind="ok">{AVISOS[sp.aviso]}</Notice> : null}
      {messageForCode(sp.error) ? <Notice kind="error">{messageForCode(sp.error)}</Notice> : null}

      <div className="kpis kpis-mando">
        <div className={`kpi${sinAprobar.length ? " kpi-gold" : ""}`}><span>Exigidos sin aprobar</span><b>{sinAprobar.length}</b></div>
        <div className="kpi"><span>En revisión jurídica</span><b>{enRevision}</b></div>
        <div className="kpi"><span>Firmas vigentes</span><b>{[...signedCount.values()].reduce((a, b) => a + b, 0)}</b></div>
        <div className={`kpi${porConfirmar ? " kpi-gold" : ""}`}><span>Fichas por confirmar</span><b>{porConfirmar}</b></div>
      </div>

      {sinAprobar.length ? (
        <Callout kind="info" title="Los casos no pueden pasar a ejecución todavía">
          Faltan por aprobar: {sinAprobar.map((c) => byCode(c)[0].title).join(", ")}. Pasos: 1) revisa el borrador; 2) márcalo «En
          revisión jurídica» y envía el texto al estudio; 3) cuando el estudio responda, corrige lo que pida (o devuélvelo a borrador)
          y la supervisión lo aprueba registrando el estudio, la referencia de su informe y la fecha.
        </Callout>
      ) : null}

      {codes.map((code) => {
        const versions = byCode(code);
        const last = versions[0];
        const approved = versions.find((d) => d.status === "aprobado") ?? null;
        const anchor = code.toLowerCase();
        return (
          <section key={code} className="card" id={anchor}>
            <div className="auth-head">
              <h2 className="card-title">{last.title}</h2>
              <span className={badge(DOC_STATUSES[last.status].tone)}>v{last.version} · {DOC_STATUSES[last.status].label}</span>
            </div>
            <p className="muted-line">
              {code} · {SCOPES[last.scope]}
              {approved ? ` · vigente: v${approved.version}, revisada por ${approved.review_firm} (${approved.reviewed_on ? day(approved.reviewed_on) : "—"}) · ${signedCount.get(approved.id) ?? 0} firma(s)` : " · sin versión aprobada"}
            </p>

            {last.status === "borrador" && canEdit ? (
              <form action={saveLegalDocumentAction} className="catalog-form">
                <input type="hidden" name="code" value={code} />
                <input type="hidden" name="kind" value={last.kind} />
                <input type="hidden" name="scope" value={last.scope} />
                <input type="hidden" name="institution" value={last.institution ?? ""} />
                <div className="field"><label htmlFor={`t-${anchor}`}>Título</label><input id={`t-${anchor}`} name="title" className="input" defaultValue={last.title} required /></div>
                <div className="field">
                  <label htmlFor={`b-${anchor}`}>Texto (datos automáticos: {PLACEHOLDERS.join(" ")})</label>
                  <textarea id={`b-${anchor}`} name="body" className="input legal-body" defaultValue={last.body} required />
                </div>
                <SubmitButton variant="ghost" pendingText="Guardando…">Guardar borrador</SubmitButton>
              </form>
            ) : (
              <details>
                <summary>Ver texto de la v{last.version}</summary>
                <p className="pre legal-doc">{last.body}</p>
              </details>
            )}
            {last.review_note ? <p className="muted-line">Observación: {last.review_note}</p> : null}

            <div className="row-actions">
              {last.status === "borrador" && canEdit ? (
                <form action={sendLegalReviewAction}>
                  <input type="hidden" name="document_id" value={last.id} />
                  <input type="hidden" name="anchor" value={anchor} />
                  <SubmitButton pendingText="Enviando…">Enviar a revisión jurídica</SubmitButton>
                </form>
              ) : null}
            </div>

            {last.status === "en_revision" ? (
              <div className="legal-version">
                {supervisor ? (
                  <form action={approveLegalDocumentAction} className="catalog-form">
                    <input type="hidden" name="document_id" value={last.id} />
                    <input type="hidden" name="anchor" value={anchor} />
                    <h3 className="sub-title">Registrar la revisión del estudio y aprobar</h3>
                    <div className="form-grid">
                      <div className="field"><label htmlFor={`f-${anchor}`}>Estudio jurídico</label><input id={`f-${anchor}`} name="review_firm" className="input" required minLength={3} /></div>
                      <div className="field"><label htmlFor={`r-${anchor}`}>Referencia del informe o correo</label><input id={`r-${anchor}`} name="review_reference" className="input" required minLength={5} /></div>
                      <div className="field"><label htmlFor={`d-${anchor}`}>Fecha de revisión</label><input id={`d-${anchor}`} name="reviewed_on" type="date" className="input" max={today} required /></div>
                    </div>
                    <div className="field"><label htmlFor={`n-${anchor}`}>Nota (opcional)</label><input id={`n-${anchor}`} name="review_note" className="input" /></div>
                    <label className="check-inline">
                      <input type="checkbox" name="confirm" required />
                      <span>El estudio revisó exactamente este texto (v{last.version}) y no tiene observaciones pendientes.</span>
                    </label>
                    <SubmitButton pendingText="Aprobando…">Aprobar versión {last.version}</SubmitButton>
                  </form>
                ) : <p className="muted-line">La aprobación la registra la supervisión (Administrador ENQORA o Director de operaciones).</p>}
                {canEdit ? (
                  <form action={returnLegalDocumentAction} className="mini-form">
                    <input type="hidden" name="document_id" value={last.id} />
                    <input type="hidden" name="anchor" value={anchor} />
                    <input name="note" className="input input-sm" placeholder="Observaciones del estudio (mínimo 10 caracteres)" required minLength={10} />
                    <SubmitButton variant="ghost" pendingText="Devolviendo…">Devolver a borrador</SubmitButton>
                  </form>
                ) : null}
              </div>
            ) : null}

            {canEdit && ["aprobado", "reemplazado", "retirado"].includes(last.status) ? (
              <details className="legal-version">
                <summary>Crear una versión nueva</summary>
                <p className="muted-line">La versión nueva nace como borrador. Al aprobarla, los clientes deberán volver a firmar.</p>
                <form action={saveLegalDocumentAction} className="catalog-form">
                  <input type="hidden" name="code" value={code} />
                  <input type="hidden" name="kind" value={last.kind} />
                  <input type="hidden" name="scope" value={last.scope} />
                  <input type="hidden" name="institution" value={last.institution ?? ""} />
                  <div className="field"><label htmlFor={`nt-${anchor}`}>Título</label><input id={`nt-${anchor}`} name="title" className="input" defaultValue={last.title} required /></div>
                  <div className="field"><label htmlFor={`nb-${anchor}`}>Texto</label><textarea id={`nb-${anchor}`} name="body" className="input legal-body" defaultValue={last.body} required /></div>
                  <SubmitButton variant="ghost" pendingText="Creando…">Crear versión {last.version + 1}</SubmitButton>
                </form>
              </details>
            ) : null}

            {versions.length > 1 ? (
              <details className="legal-version">
                <summary>Historial ({versions.length} versiones)</summary>
                <ul className="auth-list">
                  {versions.map((v) => (
                    <li key={v.id} className="auth-item">
                      <div className="auth-head"><b>v{v.version}</b><span className={badge(DOC_STATUSES[v.status].tone)}>{DOC_STATUSES[v.status].label}</span></div>
                      <small>
                        {v.review_firm ? `Revisada por ${v.review_firm}${v.reviewed_on ? ` (${day(v.reviewed_on)})` : ""} · ` : ""}
                        {signedCount.get(v.id) ?? 0} firma(s) · huella {v.body_hash.slice(0, 12)}…
                      </small>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}

            {supervisor && last.status !== "retirado" ? (
              <details className="legal-version">
                <summary>Retirar este documento</summary>
                <p className="muted-line">Un documento retirado deja de exigirse a los clientes. Úsalo solo si el estudio lo indica.</p>
                <form action={returnLegalDocumentAction} className="mini-form">
                  <input type="hidden" name="document_id" value={last.id} />
                  <input type="hidden" name="anchor" value={anchor} />
                  <input type="hidden" name="retire" value="1" />
                  <input name="note" className="input input-sm" placeholder="Motivo (mínimo 10 caracteres)" required minLength={10} />
                  <SubmitButton variant="ghost" pendingText="Retirando…">Retirar</SubmitButton>
                </form>
              </details>
            ) : null}
          </section>
        );
      })}

      <section className="card" id="fichas">
        <h2 className="card-title">Ficha legal de cada trámite</h2>
        <p className="panel-lead">
          Ante qué organismo se actúa, si ENQORA representa al cliente y qué formalidad exige el mandato. Lo que no esté confirmado en
          una fuente oficial queda «por confirmar por el estudio». La ficha se muestra al cliente en el caso.
        </p>
        <ul className="auth-list">
          {services.map((s) => {
            const p = profiles.get(s.code);
            return (
              <li key={s.code} className="auth-item" id={`ficha-${s.code.toLowerCase()}`}>
                <div className="auth-head">
                  <b>{s.code} · {s.name}</b>
                  {p ? <span className={badge(VERIFICACION[p.verificacion].tone)}>{VERIFICACION[p.verificacion].label}</span> : <span className={badge("warn")}>Sin ficha</span>}
                </div>
                {p ? (
                  <small>
                    {p.institutions.length ? p.institutions.map((i) => INSTITUTIONS[i] ?? i).join(", ") : "Sin organismos"} ·{" "}
                    {p.represents ? "ENQORA representa con mandato" : "ENQORA prepara, el cliente presenta"} · {p.formalidad}
                    {p.base_legal ? ` · ${p.base_legal}` : ""}
                    {p.fuente_url ? <> · <a href={p.fuente_url} target="_blank" rel="noreferrer">fuente</a></> : null}
                    {p.nota ? ` · ${p.nota}` : ""}
                  </small>
                ) : null}
                {canEdit ? (
                  <details>
                    <summary>Editar ficha</summary>
                    <form action={saveLegalProfileAction} className="catalog-form">
                      <input type="hidden" name="service_code" value={s.code} />
                      <fieldset className="field">
                        <legend>Organismos</legend>
                        <div className="inline-form">
                          {Object.entries(INSTITUTIONS).map(([k, label]) => (
                            <label key={k} className="check-inline">
                              <input type="checkbox" name="institutions" value={k} defaultChecked={p?.institutions.includes(k)} /> <span>{label}</span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      <label className="check-inline">
                        <input type="checkbox" name="represents" defaultChecked={p?.represents} />
                        <span>ENQORA actúa a nombre del cliente ante el organismo (exige mandato vigente)</span>
                      </label>
                      <div className="field"><label htmlFor={`fo-${s.code}`}>Formalidad del mandato</label><textarea id={`fo-${s.code}`} name="formalidad" className="input" defaultValue={p?.formalidad ?? ""} required minLength={10} /></div>
                      <div className="form-grid">
                        <div className="field"><label htmlFor={`bl-${s.code}`}>Base legal</label><input id={`bl-${s.code}`} name="base_legal" className="input" defaultValue={p?.base_legal ?? ""} /></div>
                        <div className="field">
                          <label htmlFor={`ve-${s.code}`}>Verificación</label>
                          <select id={`ve-${s.code}`} name="verificacion" className="input" defaultValue={p?.verificacion ?? "por_confirmar"}>
                            {Object.entries(VERIFICACION).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                          </select>
                        </div>
                        <div className="field"><label htmlFor={`fu-${s.code}`}>Fuente oficial (https)</label><input id={`fu-${s.code}`} name="fuente_url" type="url" className="input" defaultValue={p?.fuente_url ?? ""} /></div>
                      </div>
                      <div className="field"><label htmlFor={`no-${s.code}`}>Nota</label><input id={`no-${s.code}`} name="nota" className="input" defaultValue={p?.nota ?? ""} /></div>
                      <SubmitButton variant="ghost" pendingText="Guardando…">Guardar ficha</SubmitButton>
                    </form>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
