import Link from "next/link";
import { pedirDocumentoAction } from "@/app/actions/boveda";
import { SubmitButton } from "@/components/submit-button";
import { ESTADOS, TIPOS } from "@/lib/boveda";
import { fechaCL } from "@/lib/informa";

export type VaultRow = { id: string; folio: string; titulo: string; estado: string; origen: string; version_final: number | null; created_at: string };

// Bóveda del caso: todos los documentos del caso (generados y subidos) y el pedido al Archivero.
export function BovedaCaso({ caseId, docs, canPost, worker }: { caseId: string; docs: VaultRow[]; canPost: boolean; worker: boolean }) {
  return (
    <div className="boveda-caso">
      {docs.length ? (
        <ul className="inf-cola">
          {docs.map((d) => (
            <li key={d.id} className="inf-cola-item">
              <span className="mono">{d.folio}</span>
              <span className={`badge ${ESTADOS[d.estado]?.tono === "ok" ? "badge-ok" : "badge-gold"}`}>{d.origen === "subido" ? "Archivo" : ESTADOS[d.estado]?.texto ?? d.estado}</span>
              <b>{d.titulo}</b>
              <small>
                {fechaCL(d.created_at)} ·{" "}
                {d.origen === "subido" ? <a href={`/boveda/${d.id}/archivo`}>Descargar</a>
                  : d.version_final ? <Link href={`/boveda/${d.id}/vista`}>Ver documento</Link>
                  : worker ? <Link href={`/mando/boveda/${d.id}`}>Abrir en la Bóveda</Link>
                  : "En preparación por el equipo ENQORA"}
              </small>
            </li>
          ))}
        </ul>
      ) : <p className="muted-line">Aún no hay documentos en la Bóveda de este caso.</p>}
      {canPost ? (
        <details className="partes-form">
          <summary className="btn btn-gold btn-inline btn-sm">Pedir un documento al Archivero</summary>
          <form action={pedirDocumentoAction} className="mini-form">
            <input type="hidden" name="case_id" value={caseId} />
            <label className="field"><span>¿Qué documento necesitas y para qué?</span>
              <textarea name="pedido" className="input" rows={2} maxLength={500} placeholder="Ej.: necesito el documento para registrar mi marca en INAPI" /></label>
            <label className="field"><span>Tipo (opcional: si no lo sabes, el Archivero lo identifica)</span>
              <select name="tipo" className="input" defaultValue=""><option value="">Que lo identifique el Archivero</option>{TIPOS.map((t) => <option key={t.key} value={t.key}>{t.titulo}</option>)}</select></label>
            <SubmitButton variant="gold" className="btn-inline" pendingText="El Archivero está registrando…">Enviar pedido</SubmitButton>
            <p className="muted-line">El equipo reúne los antecedentes, redacta con la normativa vigente y un profesional lo revisa antes de entregártelo aquí.</p>
          </form>
        </details>
      ) : null}
    </div>
  );
}
