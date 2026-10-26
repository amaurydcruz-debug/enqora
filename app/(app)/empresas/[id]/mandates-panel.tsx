import Link from "next/link";
import { acceptMandateAction, revokeMandateAction } from "@/app/actions/mandates";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { Callout } from "@/components/disclosure";
import { SubmitButton } from "@/components/submit-button";
import { day, moment } from "@/lib/billing";
import { formatRut } from "@/lib/rut";
import { instList, MANDATE_KINDS, MANDATE_STATUSES, type Mandate } from "@/lib/mandates";
import { MandateUpload } from "./mandate-upload";

// Mandatos y representación de la empresa. Solo Propietario y Administradores.
// La autorización dentro de ENQORA no es un mandato: el mandato es el documento firmado y verificado.
export function MandatesPanel({ companyId, mandates, canManage }: { companyId: string; mandates: Mandate[]; canManage: boolean }) {
  if (!canManage) {
    return <p className="panel-lead">Los mandatos de representación los ven y gestionan el Propietario y los Administradores de la empresa.</p>;
  }
  return (
    <div className="mandates">
      <p className="panel-lead">
        Un mandato permite que ENQORA actúe ante una institución en tu nombre, solo para los trámites y el plazo que indica.
        Primero lo revisas, luego lo firma el representante legal y un abogado de ENQORA lo verifica. Puedes revocarlo cuando quieras.
      </p>
      {mandates.length ? (
        <ul className="quote-list" role="list">
          {mandates.map((m) => (
            <li key={m.id} className={`quote st-${m.status === "pendiente_firma" ? "enviada" : m.status === "vigente" ? "aceptada" : m.status}`} id={`mandato-${m.folio}`}>
              <div className="quote-head">
                <span className="quote-title">
                  <span className="mono">{m.folio}</span>
                  <b>{MANDATE_KINDS[m.kind].label} · {instList(m.institutions)}</b>
                </span>
                <span className={`status status-${MANDATE_STATUSES[m.status].tone}`}>{MANDATE_STATUSES[m.status].label}</span>
              </div>
              <dl className="data-grid">
                <div><dt>Representante</dt><dd>{m.representative_name}{m.representative_rut ? ` · ${m.representative_rut}` : ""}</dd></div>
                <div><dt>Vigencia</dt><dd>{day(m.valid_from, "medium")} al {day(m.valid_until, "medium")}</dd></div>
                {m.signer_name ? <div><dt>Firma</dt><dd>{m.signer_name} · {formatRut(m.signer_rut ?? "")} · {m.signer_role}</dd></div> : null}
                {m.verified_at ? <div><dt>Verificado</dt><dd>{moment(m.verified_at)}</dd></div> : null}
              </dl>
              <div className="quote-terms"><div><h5>Trámites permitidos</h5><p className="pre">{m.procedures}</p></div></div>
              {m.observation && m.status === "pendiente_firma" ? (
                <Callout kind="warn" title="El equipo legal observó el documento"><span className="pre">{m.observation}</span></Callout>
              ) : null}
              <div className="panel-actions">
                <Link href={`/empresas/${companyId}/mandatos/${m.id}`} className="btn btn-ghost btn-inline btn-sm">Ver texto completo</Link>
                {m.document_path ? <a href={`/mandatos/${m.id}/documento`} target="_blank" rel="noopener" className="btn btn-ghost btn-inline btn-sm">Documento firmado</a> : null}
              </div>

              {m.status === "pendiente_firma" && !m.accepted_at ? (
                <form action={acceptMandateAction} className="catalog-form">
                  <input type="hidden" name="mandate_id" value={m.id} />
                  <input type="hidden" name="company_id" value={companyId} />
                  <h5 className="sub-title">1 · Revisa e indica quién firma</h5>
                  <div className="form-grid">
                    <div className="field"><label htmlFor={`sn-${m.id}`}>Nombre de quien firma</label><input id={`sn-${m.id}`} name="signer_name" className="input" required minLength={3} maxLength={160} /></div>
                    <div className="field"><label htmlFor={`sr-${m.id}`}>RUT</label><input id={`sr-${m.id}`} name="signer_rut" className="input mono" required maxLength={12} placeholder="12.345.678-5" /></div>
                    <div className="field"><label htmlFor={`sc-${m.id}`}>Calidad</label><input id={`sc-${m.id}`} name="signer_role" className="input" required maxLength={80} defaultValue="Representante legal" /></div>
                  </div>
                  <label className="check-inline">
                    <input type="checkbox" name="confirm" required />
                    Leí el texto completo. Entiendo que ENQORA solo podrá actuar ante {instList(m.institutions)} para los trámites indicados y hasta el {day(m.valid_until)}.
                  </label>
                  <SubmitButton className="btn-inline btn-sm" pendingText="Registrando…">Confirmar y continuar</SubmitButton>
                </form>
              ) : null}
              {m.status === "pendiente_firma" && m.accepted_at ? (
                <div className="catalog-form">
                  <h5 className="sub-title">2 · Firma y sube el documento</h5>
                  <p className="muted-line">
                    {m.kind === "notarial"
                      ? "Imprime el texto y fírmalo ante notario. Sube la copia escaneada del documento autorizado."
                      : "Imprime el texto, fírmalo y sube una copia escaneada legible (todas las páginas)."}
                  </p>
                  <MandateUpload mandateId={m.id} />
                </div>
              ) : null}
              {m.status === "en_verificacion" ? <p className="muted-line">Recibimos el documento el {moment(m.document_uploaded_at)}. Un abogado de ENQORA lo está verificando.</p> : null}

              {["vigente", "pendiente_firma", "en_verificacion"].includes(m.status) ? (
                <details className="more inline-more">
                  <summary>Revocar</summary>
                  <form action={revokeMandateAction} className="mini-form">
                    <input type="hidden" name="mandate_id" value={m.id} />
                    <input type="hidden" name="company_id" value={companyId} />
                    <p className="muted-line">
                      ENQORA dejará de actuar con este mandato de inmediato. Si ya fue presentado ante una institución, también corresponde informarle la revocación.
                    </p>
                    <textarea name="reason" className="input" rows={2} maxLength={500} placeholder="Motivo (opcional)" aria-label="Motivo" />
                    <ConfirmSubmit message="¿Revocar este mandato?">Revocar mandato</ConfirmSubmit>
                  </form>
                </details>
              ) : null}
              {m.status === "revocado" ? <p className="muted-line">Revocado {moment(m.revoked_at)}{m.revoke_reason ? ` · ${m.revoke_reason}` : ""}.</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted-line">No hay mandatos. Si un trámite lo requiere, el equipo ENQORA te lo enviará aquí para revisarlo.</p>
      )}
    </div>
  );
}
