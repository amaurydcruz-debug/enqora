import {
  deleteFindingAction,
  draftDiagnosisAction,
  saveDiagnosisAction,
  saveFindingAction,
  submitDiagnosisAction,
} from "@/app/actions/diagnosis";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { Callout, Disclosure } from "@/components/disclosure";
import { SubmitButton } from "@/components/submit-button";
import { CERTAINTY, DIAGNOSIS_STATUSES, pad2, RISK, type Diagnosis, type Finding } from "@/lib/diagnosis";
import { DiagnosisReport, type ServiceRef } from "./diagnosis-report";

function FindingForm({
  caseId,
  diagnosisId,
  finding,
  services,
  nextPosition,
}: {
  caseId: string;
  diagnosisId: string;
  finding?: Finding;
  services: ServiceRef[];
  nextPosition: number;
}) {
  const f = finding;
  const sources = [...(f?.sources ?? [])];
  while (sources.length < Math.max(2, (f?.sources.length ?? 0) + 1) && sources.length < 10) sources.push({ titulo: "" });
  return (
    <form action={saveFindingAction} className="diag-form">
      <input type="hidden" name="case_id" value={caseId} />
      <input type="hidden" name="diagnosis_id" value={diagnosisId} />
      {f ? <input type="hidden" name="finding_id" value={f.id} /> : null}
      <div className="diag-form-row">
        <label className="field-mini diag-pos">
          <span>N°</span>
          <input name="position" type="number" min={1} max={30} className="input input-sm" defaultValue={f?.position ?? nextPosition} />
        </label>
        <label className="field-mini grow">
          <span>Título de la situación</span>
          <input name="title" className="input input-sm" required minLength={3} maxLength={160} defaultValue={f?.title ?? ""}
            placeholder="Ej.: Declaraciones de IVA pendientes" />
        </label>
      </div>
      <label className="field-mini">
        <span>Qué está ocurriendo, según los antecedentes</span>
        <textarea name="situation" className="input" rows={3} required minLength={10} maxLength={4000} defaultValue={f?.situation ?? ""} />
      </label>
      <label className="field-mini">
        <span>Qué establece la normativa (obligaciones)</span>
        <textarea name="obligations" className="input" rows={3} maxLength={4000} defaultValue={f?.obligations ?? ""} />
      </label>
      <fieldset className="diag-sources">
        <legend>Fuentes oficiales (título obligatorio; enlace con https://)</legend>
        {sources.map((s, i) => (
          <div key={i} className="diag-source-row">
            <input name="src_titulo" className="input input-sm" maxLength={200} defaultValue={s.titulo} placeholder="Norma o documento" aria-label={`Fuente ${i + 1}: título`} />
            <input name="src_articulo" className="input input-sm" maxLength={120} defaultValue={s.articulo ?? ""} placeholder="Artículo" aria-label={`Fuente ${i + 1}: artículo`} />
            <input name="src_vigencia" className="input input-sm" maxLength={80} defaultValue={s.vigencia ?? ""} placeholder="Vigencia" aria-label={`Fuente ${i + 1}: vigencia`} />
            <input name="src_url" type="url" className="input input-sm" maxLength={400} defaultValue={s.url ?? ""} placeholder="https://" aria-label={`Fuente ${i + 1}: enlace`} />
          </div>
        ))}
      </fieldset>
      <div className="diag-form-grid">
        <label className="field-mini">
          <span>Posibles causas</span>
          <textarea name="causes" className="input" rows={2} maxLength={2000} defaultValue={f?.causes ?? ""} />
        </label>
        <label className="field-mini">
          <span>Correcciones y alternativas por verificar</span>
          <textarea name="corrections" className="input" rows={2} maxLength={4000} defaultValue={f?.corrections ?? ""} />
        </label>
        <label className="field-mini">
          <span>Beneficios que podrían corresponder (con requisitos)</span>
          <textarea name="benefits" className="input" rows={2} maxLength={2000} defaultValue={f?.benefits ?? ""} />
        </label>
        <label className="field-mini">
          <span>Riesgo de no actuar (sin exagerar)</span>
          <textarea name="risk" className="input" rows={2} maxLength={2000} defaultValue={f?.risk ?? ""} />
        </label>
      </div>
      <div className="diag-form-row wrap">
        <label className="field-mini">
          <span>Nivel de riesgo</span>
          <select name="risk_level" className="input input-sm" required defaultValue={f?.risk_level ?? "medio"}>
            {Object.entries(RISK).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <label className="field-mini">
          <span>Certeza</span>
          <select name="certainty" className="input input-sm" required defaultValue={f?.certainty ?? "media"}>
            {Object.entries(CERTAINTY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <label className="field-mini grow">
          <span>Servicio ENQORA que ayudaría</span>
          <select name="service_id" className="input input-sm" defaultValue={f?.service_id ?? ""}>
            <option value="">Ninguno</option>
            {services.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
          </select>
        </label>
      </div>
      <div className="diag-form-row wrap">
        <label className="field-mini">
          <span>Costo estimado desde (CLP)</span>
          <input name="cost_min" inputMode="numeric" className="input input-sm" defaultValue={f?.cost_min ?? ""} />
        </label>
        <label className="field-mini">
          <span>hasta (CLP)</span>
          <input name="cost_max" inputMode="numeric" className="input input-sm" defaultValue={f?.cost_max ?? ""} />
        </label>
        <label className="field-mini grow">
          <span>Nota del costo (gastos externos, supuestos)</span>
          <input name="cost_note" className="input input-sm" maxLength={500} defaultValue={f?.cost_note ?? ""} />
        </label>
      </div>
      <label className="field-mini">
        <span>Qué falta para confirmarlo</span>
        <textarea name="missing" className="input" rows={2} maxLength={2000} defaultValue={f?.missing ?? ""} />
      </label>
      <div className="comment-actions">
        <SubmitButton variant={f ? "ghost" : "gold"} className="btn-inline btn-sm" pendingText="Guardando…">
          {f ? "Guardar situación" : "Agregar situación"}
        </SubmitButton>
      </div>
    </form>
  );
}

// Redacción del diagnóstico por el equipo ENQORA (incluidos agentes IA). Publicarlo exige
// la aprobación de un profesional autorizado en «Próximas acciones» o en el Centro de Mando.
export function DiagnosisEditor({
  caseId,
  open,
  published,
  openFindings,
  services,
  isClosed,
}: {
  caseId: string;
  open: Diagnosis | null;
  published: Diagnosis | null;
  openFindings: Finding[];
  services: ServiceRef[];
  isClosed: boolean;
}) {
  const serviceMap = new Map(services.map((s) => [s.id, s]));

  if (!open) {
    if (isClosed) return null;
    return (
      <form action={draftDiagnosisAction} className="diag-start">
        <input type="hidden" name="case_id" value={caseId} />
        <p className="muted-line">
          {published
            ? `Hay una versión ${published.version} entregada. Una nueva versión parte de ella y la reemplaza cuando se apruebe.`
            : "Prepara el informe por situaciones. El cliente lo verá solo cuando un profesional lo apruebe."}
        </p>
        <SubmitButton variant={published ? "ghost" : "gold"} className="btn-inline btn-sm" pendingText="Preparando…">
          {published ? `Preparar versión ${published.version + 1}` : "Preparar diagnóstico"}
        </SubmitButton>
      </form>
    );
  }

  if (open.status === "en_revision") {
    return (
      <div className="diag-editor">
        <Callout kind="info" title={`Versión ${open.version} en revisión profesional`} action={<a href="#aprobaciones" className="btn btn-ghost btn-inline btn-sm">Ver aprobación</a>}>
          Mientras se revisa no se puede editar. Si la devuelven con observaciones, volverá a borrador.
        </Callout>
        <DiagnosisReport caseId={caseId} diagnosis={open} findings={openFindings} services={serviceMap} preview />
      </div>
    );
  }

  const sorted = [...openFindings].sort((a, b) => a.position - b.position);
  const nextPosition = (sorted.at(-1)?.position ?? 0) + 1;
  const ready = !!open.summary && !!open.certainty && sorted.length > 0;

  return (
    <div className="diag-editor">
      <div className="diag-editor-head">
        <span className={`status status-${DIAGNOSIS_STATUSES[open.status].tone}`}>{DIAGNOSIS_STATUSES[open.status].label} · v{open.version}</span>
        <small className="muted-line">Solo el equipo ENQORA ve el borrador.</small>
      </div>
      {open.review_note ? (
        <Callout kind="warn" title="Devuelto con observaciones">
          <span className="pre">{open.review_note}</span>
        </Callout>
      ) : null}

      <form action={saveDiagnosisAction} className="diag-form">
        <input type="hidden" name="case_id" value={caseId} />
        <input type="hidden" name="diagnosis_id" value={open.id} />
        <label className="field-mini">
          <span>Resumen para el cliente</span>
          <textarea name="summary" className="input" rows={3} maxLength={4000} defaultValue={open.summary ?? ""}
            placeholder="Qué encontramos, en palabras simples." />
        </label>
        <div className="diag-form-row wrap">
          <label className="field-mini">
            <span>Certeza general</span>
            <select name="certainty" className="input input-sm" defaultValue={open.certainty ?? ""}>
              <option value="">Elegir…</option>
              {Object.entries(CERTAINTY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
          <label className="field-mini grow">
            <span>Qué falta para confirmarlo</span>
            <input name="missing" className="input input-sm" maxLength={2000} defaultValue={open.missing ?? ""} />
          </label>
        </div>
        <div className="comment-actions">
          <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="Guardando…">Guardar resumen</SubmitButton>
        </div>
      </form>

      <div className="disclosures">
        {sorted.map((f) => (
          <Disclosure
            key={f.id}
            group={`diag-edit-${open.id}`}
            emblem={<span className="diag-n" aria-hidden="true">{pad2(f.position)}</span>}
            title={f.title}
            summary={`${RISK[f.risk_level].label} · ${CERTAINTY[f.certainty].label} · ${f.sources.length} fuente${f.sources.length === 1 ? "" : "s"}`}
            cta="Editar"
          >
            <FindingForm caseId={caseId} diagnosisId={open.id} finding={f} services={services} nextPosition={nextPosition} />
            <form action={deleteFindingAction} className="diag-delete">
              <input type="hidden" name="case_id" value={caseId} />
              <input type="hidden" name="finding_id" value={f.id} />
              <ConfirmSubmit message="¿Eliminar esta situación del borrador?" variant="ghost">Eliminar situación</ConfirmSubmit>
            </form>
          </Disclosure>
        ))}
        <Disclosure group={`diag-edit-${open.id}`} tone="gold" emblem={<span className="diag-n" aria-hidden="true">+</span>}
          title="Agregar situación" summary={`Situación ${pad2(nextPosition)}`} cta="Agregar">
          <FindingForm caseId={caseId} diagnosisId={open.id} services={services} nextPosition={nextPosition} />
        </Disclosure>
      </div>

      <form action={submitDiagnosisAction} className="diag-submit">
        <input type="hidden" name="case_id" value={caseId} />
        <input type="hidden" name="diagnosis_id" value={open.id} />
        <p className="muted-line">
          {ready
            ? "Al enviarlo, un profesional autorizado lo revisa. Quien lo envía no puede aprobarlo."
            : "Para enviarlo necesitas el resumen, la certeza general y al menos una situación."}
        </p>
        <SubmitButton className="btn-inline btn-sm" pendingText="Enviando…" disabled={!ready}>Enviar a revisión profesional</SubmitButton>
      </form>
    </div>
  );
}
