import Link from "next/link";
import { instList } from "@/lib/mandates";
import { estadoDocumento, VERIFICACION, type CaseLegalStatus } from "@/lib/legal";

// Documentos legales del caso y ficha legal del trámite. El caso no pasa a ejecución sin ellos.
const ESTADOS = {
  firmado: { label: "Firmado", cls: "badge badge-ok" },
  por_firmar: { label: "Por firmar", cls: "badge badge-gold" },
  sin_aprobar: { label: "En revisión jurídica", cls: "badge badge-warn" },
} as const;

export function LegalDocs({
  caseId,
  companyId,
  status,
  canSign,
  worker,
}: {
  caseId: string;
  companyId: string;
  status: CaseLegalStatus;
  canSign: boolean;
  worker: boolean;
}) {
  const sinAprobar = status.documentos.some((d) => !d.document_id);
  return (
    <>
      <p className="panel-lead">
        {status.faltan.length === 0
          ? "Los documentos legales exigidos están firmados. ENQORA puede ejecutar el trabajo dentro de lo autorizado."
          : sinAprobar
            ? "ENQORA está terminando la revisión jurídica de estos documentos. El trabajo no se ejecuta hasta que estén aprobados y firmados."
            : "Antes de ejecutar el trabajo, la empresa debe firmar estos documentos. Firma el Propietario o un Administrador."}
      </p>
      <ul className="auth-list">
        {status.documentos.map((d) => {
          const st = estadoDocumento(d);
          return (
            <li key={d.code} className="auth-item">
              <div className="auth-head">
                <b>{d.title}</b>
                <span className={ESTADOS[st].cls}>{ESTADOS[st].label}</span>
              </div>
              <small>
                {d.scope === "empresa" ? "Se firma una vez para la empresa" : "Se firma en cada caso"}
                {d.version ? ` · versión ${d.version}` : ""}
                {d.firma ? ` · firmó ${d.firma.firmante}` : ""}
              </small>
              <div className="row-actions">
                {d.firma ? (
                  <Link href={`/legal/firma/${d.firma.id}`} className="btn btn-ghost btn-sm">Ver copia firmada</Link>
                ) : d.document_id ? (
                  <Link
                    href={`/legal/firmar?doc=${d.document_id}&empresa=${companyId}${d.scope === "caso" ? `&caso=${caseId}` : ""}`}
                    className={`btn btn-sm ${canSign ? "btn-gold" : "btn-ghost"}`}
                  >
                    {canSign ? "Leer y firmar" : "Leer"}
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {status.fichas.length ? (
        <>
          <h3 className="sub-title">Ficha legal del trámite</h3>
          {status.fichas.map((f) => (
            <dl key={f.service_code} className="auth-meta">
              <dt>Servicio</dt>
              <dd>{f.service_code} · {f.service_name}</dd>
              <dt>Organismos</dt>
              <dd>{f.institutions.length ? instList(f.institutions) : "Ninguno"}</dd>
              <dt>Representación</dt>
              <dd>
                {f.represents
                  ? "ENQORA actúa a nombre de la empresa solo con un mandato especial vigente para ese trámite."
                  : "ENQORA prepara; la empresa presenta con sus propias credenciales."}
              </dd>
              <dt>Formalidad</dt>
              <dd>{f.formalidad}</dd>
              {f.base_legal ? <><dt>Base legal</dt><dd>{f.base_legal}</dd></> : null}
              {worker ? (
                <>
                  <dt>Verificación</dt>
                  <dd>
                    {VERIFICACION[f.verificacion].label}
                    {f.fuente_url ? <> · <a href={f.fuente_url} target="_blank" rel="noreferrer">fuente</a></> : null}
                    {f.nota ? ` · ${f.nota}` : ""}
                  </dd>
                </>
              ) : null}
            </dl>
          ))}
        </>
      ) : null}
    </>
  );
}
