import { requestFindingQuoteAction } from "@/app/actions/diagnosis";
import { Disclosure, Evidence, FactTag, NextAction } from "@/components/disclosure";
import { Emblem } from "@/components/emblems";
import { SubmitButton } from "@/components/submit-button";
import { CERTAINTY, FREE_DIAGNOSIS_NOTE, pad2, RISK, type Diagnosis, type Finding } from "@/lib/diagnosis";
import { clp } from "@/lib/pricing";

const fmt = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("es-CL", { dateStyle: "long", timeZone: "America/Santiago" }).format(new Date(iso)) : "—";

export type ServiceRef = { id: string; code: string; name: string };

const cost = (f: Finding) =>
  f.cost_min != null && f.cost_max != null && f.cost_max !== f.cost_min
    ? `Entre ${clp(f.cost_min)} y ${clp(f.cost_max)}`
    : f.cost_min != null
      ? `Desde ${clp(f.cost_min)}`
      : f.cost_max != null
        ? `Hasta ${clp(f.cost_max)}`
        : null;

function Block({ title, children, tag }: { title: string; children: React.ReactNode; tag?: React.ReactNode }) {
  return (
    <div className="diag-block">
      <h5>{title} {tag}</h5>
      {children}
    </div>
  );
}

// Informe interactivo de diagnóstico: situaciones numeradas, cada una con su análisis bajo demanda.
// Lo usan la ficha del caso (cliente y vista previa del equipo) y la versión imprimible.
export function DiagnosisReport({
  caseId,
  diagnosis,
  findings,
  services,
  approverName,
  canRequestQuote = false,
  expanded = false,
  preview = false,
}: {
  caseId: string;
  diagnosis: Diagnosis;
  findings: Finding[];
  services: Map<string, ServiceRef>;
  approverName?: string | null;
  canRequestQuote?: boolean;
  expanded?: boolean;
  preview?: boolean;
}) {
  const sorted = [...findings].sort((a, b) => a.position - b.position);
  const highRisk = sorted.filter((f) => f.risk_level === "alto").length;

  return (
    <article className="diag-report" aria-label={`Diagnóstico versión ${diagnosis.version}`}>
      <header className="diag-head">
        <Emblem name="diagnostico" size="md" />
        <div className="diag-head-text">
          <span className="eyebrow">Diagnóstico preliminar · versión {diagnosis.version}</span>
          <h4>{sorted.length === 1 ? "1 situación analizada" : `${sorted.length} situaciones analizadas`}{highRisk ? ` · ${highRisk} de riesgo alto` : ""}</h4>
          {preview ? (
            <FactTag kind="revision" />
          ) : (
            <small className="muted-line">
              Revisado y aprobado por {approverName ?? "un profesional ENQORA"} el {fmt(diagnosis.published_at)}.
            </small>
          )}
        </div>
      </header>

      {diagnosis.summary ? <p className="diag-summary pre">{diagnosis.summary}</p> : null}

      <dl className="diag-meta">
        {diagnosis.certainty ? (
          <div>
            <dt>Nivel de certeza</dt>
            <dd><b>{CERTAINTY[diagnosis.certainty].label}</b> <small>{CERTAINTY[diagnosis.certainty].help}</small></dd>
          </div>
        ) : null}
        {diagnosis.missing ? (
          <div>
            <dt>Qué falta para confirmarlo</dt>
            <dd className="pre">{diagnosis.missing}</dd>
          </div>
        ) : null}
      </dl>

      <div className="disclosures diag-findings">
        {sorted.map((f, i) => {
          const svc = f.service_id ? services.get(f.service_id) : null;
          const range = cost(f);
          return (
            <Disclosure
              key={f.id}
              id={`situacion-${pad2(i + 1)}`}
              group={expanded ? undefined : `diag-${diagnosis.id}`}
              open={expanded || undefined}
              tone={f.risk_level === "alto" ? "gold" : "neutral"}
              emblem={<span className="diag-n" aria-hidden="true">{pad2(i + 1)}</span>}
              title={<>Situación {pad2(i + 1)} · {f.title}</>}
              summary={CERTAINTY[f.certainty].label}
              meta={<span className={`status status-${RISK[f.risk_level].tone}`}>{RISK[f.risk_level].label}</span>}
              cta="Ver análisis"
            >
              <Block title="Qué está ocurriendo" tag={<FactTag kind="interpretacion" />}>
                <p className="pre">{f.situation}</p>
              </Block>
              {f.obligations || f.sources.length ? (
                <Block title="Qué establece la normativa">
                  {f.obligations ? <p className="pre">{f.obligations}</p> : null}
                  <Evidence
                    items={f.sources.map((s) => ({
                      label: s.titulo,
                      href: s.url || undefined,
                      detail: [s.articulo, s.vigencia].filter(Boolean).join(" · ") || undefined,
                    }))}
                  />
                </Block>
              ) : null}
              {f.causes ? <Block title="Posibles causas"><p className="pre">{f.causes}</p></Block> : null}
              {f.corrections ? (
                <Block title="Correcciones y alternativas por verificar" tag={<FactTag kind="alternativa" />}>
                  <p className="pre">{f.corrections}</p>
                </Block>
              ) : null}
              {f.benefits ? <Block title="Beneficios que podrían corresponder"><p className="pre">{f.benefits}</p></Block> : null}
              <Block title="Riesgo de no actuar">
                <p><span className={`status status-${RISK[f.risk_level].tone}`}>{RISK[f.risk_level].label}</span></p>
                {f.risk ? <p className="pre">{f.risk}</p> : null}
              </Block>
              {range || svc || f.cost_note ? (
                <Block title="Costo estimado de resolverlo" tag={<FactTag kind="estimacion" />}>
                  {range ? <p><b>{range}</b></p> : null}
                  {svc ? <p className="muted-line">Servicio ENQORA que ayudaría: {svc.name} <span className="mono">({svc.code})</span></p> : null}
                  {f.cost_note ? <p className="muted-line pre">{f.cost_note}</p> : null}
                  <p className="muted-line">El precio final se confirma en una cotización formal, con su alcance y exclusiones.</p>
                </Block>
              ) : null}
              <Block title="Certeza">
                <p><b>{CERTAINTY[f.certainty].label}.</b> {CERTAINTY[f.certainty].help}</p>
                {f.missing ? <p className="pre muted-line">Para confirmarlo falta: {f.missing}</p> : null}
              </Block>
              {!preview && !expanded ? (
                f.quote_requested_at ? (
                  <NextAction title="Pediste la cotización de esta situación">
                    El equipo ENQORA la preparará y la verás en «Cotización» dentro de este caso.
                  </NextAction>
                ) : canRequestQuote ? (
                  <NextAction
                    title="¿Quieres que ENQORA lo resuelva?"
                    action={
                      <form action={requestFindingQuoteAction}>
                        <input type="hidden" name="case_id" value={caseId} />
                        <input type="hidden" name="finding_id" value={f.id} />
                        <SubmitButton className="btn-inline btn-sm" pendingText="Enviando…">Pedir cotización</SubmitButton>
                      </form>
                    }
                  >
                    Recibirás una cotización formal. Pedirla no te compromete a contratar.
                  </NextAction>
                ) : null
              ) : null}
            </Disclosure>
          );
        })}
      </div>

      <p className="diag-note">{FREE_DIAGNOSIS_NOTE} Puedes llevar este informe a un contador o abogado independiente para verificarlo.</p>
    </article>
  );
}
