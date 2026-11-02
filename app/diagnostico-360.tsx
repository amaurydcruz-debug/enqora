"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AREAS, build360, CERTAINTY, LEVELS, questionsFor, type Answer, type Level } from "@/lib/diagnostic-360";
import type { Catalog, PublicProfileForReport, ServiceOffer } from "@/lib/initial-report";

// Diagnóstico empresarial 360° (Fase 1): autoevaluación de ~2 minutos + mapa por áreas + ruta de 3 servicios.
// Las respuestas viven solo en este navegador mientras la página está abierta: no se envían ni se guardan.

const clp = (n: number) => `$${n.toLocaleString("es-CL")}`;

export function PriceLine({ s }: { s: ServiceOffer }) {
  if (s.precio === 0) return <span className="report-price"><b>Sin costo</b></span>;
  if (!s.disponible) return <span className="report-price">Próximamente · Solicitar contacto</span>;
  if (!s.precio) return <span className="report-price">Precio según evaluación previa (sin costo)</span>;
  const welcome = s.bienvenida ? Math.round(s.precio * (100 - s.bienvenida.pct) / 100) : null;
  return (
    <span className="report-price">
      {welcome != null && s.bienvenida ? (
        <><b>{clp(welcome)}</b> tus primeros {s.bienvenida.meses} meses (−{s.bienvenida.pct}%) · luego desde {clp(s.precio)}</>
      ) : (
        <>Desde <b>{clp(s.precio)}</b></>
      )}
      {s.mercado ? <> · mercado {clp(s.mercado)}</> : null}
    </span>
  );
}

const OPTIONS: [Answer, string][] = [["si", "Sí"], ["no", "No"], ["no_se", "No sé"], ["ayuda", "Necesito ayuda"]];
const LEVEL_CLASS: Record<Level, string> = { solido: "is-solido", atencion: "is-atencion", prioritario: "is-prioritario", sin_info: "is-sininfo" };
const PRIO_LABEL = { alta: "Prioritario", media: "Atención", baja: "Oportunidad" } as const;

export function Diagnostic360({ p, catalog, onClose }: { p: PublicProfileForReport; catalog: Catalog; onClose: () => void }) {
  const qs = useMemo(() => questionsFor(p), [p]);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [done, setDone] = useState(false);
  const answered = qs.filter((q) => answers[q.id]).length;
  const rep = useMemo(() => (done ? build360(p, answers, catalog) : null), [done, p, answers, catalog]);

  if (!rep) {
    return (
      <div className="d360">
        <div className="report-head">
          <span className="eyebrow">Diagnóstico 360° · autoevaluación</span>
          <small>{answered} de {qs.length} respondidas · unos 2 minutos · tus respuestas no se envían ni se guardan</small>
        </div>
        <div className="d360-progress" aria-hidden="true"><span style={{ width: `${(answered / qs.length) * 100}%` }} /></div>
        <div className="natural-q">
          {AREAS.map((area) => {
            const list = qs.filter((q) => q.area === area.key);
            if (!list.length) return null;
            return (
              <div key={area.key} className="d360-area">
                <h4 className="lookup-acts-title">{area.nombre}</h4>
                {list.map((q) => (
                  <fieldset key={q.id}>
                    <legend>{q.q}</legend>
                    {q.ayuda ? <small className="d360-help">{q.ayuda}</small> : null}
                    <div className="natural-opts">
                      {[...OPTIONS, ...(q.noAplica ? [["na", q.noAplica] as [Answer, string]] : [])].map(([v, label]) => (
                        <button key={v} type="button" className={`natural-opt${answers[q.id] === v ? " is-on" : ""}`} aria-pressed={answers[q.id] === v}
                          onClick={() => setAnswers((x) => ({ ...x, [q.id]: v }))}>{label}</button>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>
            );
          })}
        </div>
        <div className="inline-form">
          <button type="button" className="btn btn-gold btn-inline btn-sm" disabled={answered < qs.length} onClick={() => setDone(true)}>
            {answered < qs.length ? `Responde ${qs.length - answered} más para ver tu diagnóstico` : "Ver mi diagnóstico 360°"}
          </button>
          <button type="button" className="btn btn-ghost btn-inline btn-sm" onClick={onClose}>Volver al informe</button>
        </div>
      </div>
    );
  }

  return (
    <div className="report d360">
      <div className="report-head">
        <span className="eyebrow">Diagnóstico empresarial 360° ENQORA</span>
        <small>Generado el {new Intl.DateTimeFormat("es-CL", { dateStyle: "long", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date())} · no se guarda</small>
      </div>

      <p className="d360-profile">{rep.perfil.map((x) => x.valor).join(" · ")}</p>

      <div className="report-verdict">
        <span className="report-tag">Resumen ejecutivo</span>
        <b>{rep.resumen}</b>
        <span className="report-note">{rep.base.veredicto}</span>
      </div>

      <h4 className="lookup-acts-title">Mapa de tu empresa</h4>
      <ul className="d360-map">
        {rep.areas.map((a) => (
          <li key={a.key} className={LEVEL_CLASS[a.nivel]}>
            <span className="d360-dot" aria-hidden="true" />
            <b>{a.nombre}</b>
            <span className="d360-level">{LEVELS[a.nivel]}</span>
          </li>
        ))}
      </ul>
      <details className="report-detail">
        <summary>Ver el fundamento de cada área</summary>
        <dl>
          {rep.areas.map((a) => (
            <div key={a.key}><dt>{a.nombre} · {LEVELS[a.nivel]}</dt><dd><ul className="report-check">{a.fundamento.map((f) => <li key={f}>{f}</li>)}</ul></dd></div>
          ))}
        </dl>
      </details>
      <p className="report-note">
        Cómo se obtiene: cada área se clasifica con los datos públicos del SII y tus respuestas. «Prioritario» = un dato público o una respuesta
        sobre una obligación legal que requiere acción; «Necesita atención» = una mejora o algo por confirmar; «Sólido» = tus respuestas no muestran
        brechas; «Sin información suficiente» = no hay datos para concluir. Es una orientación, no una certificación ni una evaluación oficial o auditada.
      </p>

      <div className="d360-route">
        <span className="eyebrow">Tu ruta recomendada</span>
        <b>Estas son las áreas que recomendamos atender primero para fortalecer tu empresa.</b>
        {rep.ruta.length ? (
          <ol className="report-recs">
            {rep.ruta.map((s, i) => (
              <li key={s.id} className="lookup-signal">
                <span className="report-tag">Paso {i + 1}</span>
                <b>{s.nombre}</b>
                <span>{s.porque}</span>
                <PriceLine s={s} />
                <Link href={`/comenzar?servicio=${s.categoria}`} className="lookup-signal-cta">{s.disponible ? "Contratar o cotizar →" : "Solicitar contacto →"}</Link>
              </li>
            ))}
          </ol>
        ) : <span className="report-note">No detectamos necesidades que requieran un servicio. Puedes pedir el diagnóstico completo gratuito para confirmarlo.</span>}
      </div>

      {rep.hallazgos.length ? (
        <>
          <h4 className="lookup-acts-title">Hallazgos priorizados</h4>
          <ol className="report-recs">
            {rep.hallazgos.map((h) => (
              <li key={h.id} className={`lookup-signal ${h.prioridad === "alta" ? "is-alta" : h.prioridad === "baja" ? "is-baja" : ""}`}>
                <div className="report-tags">
                  <span className="report-tag">{PRIO_LABEL[h.prioridad]}</span>
                  <span className="report-tag report-tag-muted">{CERTAINTY[h.certeza]} · {h.fuente}</span>
                </div>
                <b>{h.detectado}</b>
                <details className="report-detail">
                  <summary>Por qué importa y qué hacer</summary>
                  <dl>
                    <div><dt>Por qué importa</dt><dd>{h.importa}</dd></div>
                    {h.riesgo ? <div><dt>Qué puede ocurrir si no se atiende</dt><dd>{h.riesgo}</dd></div> : null}
                    <div><dt>Qué recomienda ENQORA</dt><dd>{h.recomienda}</dd></div>
                    <div><dt>Servicio</dt><dd>{h.servicio.nombre} · <PriceLine s={h.servicio} /></dd></div>
                  </dl>
                </details>
              </li>
            ))}
          </ol>
        </>
      ) : null}

      {rep.base.obligaciones.length ? (
        <>
          <h4 className="lookup-acts-title">Obligaciones y próximas fechas</h4>
          <table className="report-cal">
            <tbody>
              {rep.base.obligaciones.map((o) => (
                <tr key={o.que}><th scope="row">{o.que}{o.nota ? <small>{o.nota}</small> : null}</th><td>{o.cuando}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      {rep.beneficios.length ? (
        <>
          <h4 className="lookup-acts-title">Oportunidades: beneficios que podrían aplicar</h4>
          <ul className="report-insights">
            {rep.beneficios.map((b) => (
              <li key={b.nombre}>
                <a href={b.url} target="_blank" rel="noopener noreferrer"><b>{b.nombre}</b></a>. {b.porque} <span className="report-note">Falta confirmar: {b.falta}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {rep.porConfirmar.length ? (
        <details className="report-detail">
          <summary>Lo que respondiste «No sé» y cómo confirmarlo ({rep.porConfirmar.length})</summary>
          <ul className="report-check">{rep.porConfirmar.map((c) => <li key={c.tema}><b>{c.tema}.</b> <span>{c.como}</span></li>)}</ul>
        </details>
      ) : null}

      <div className="lookup-deep">
        <b>Próximos pasos</b>
        <ol className="report-steps">
          <li>Elige el primer paso de tu ruta y solicita la atención (sin compromiso).</li>
          <li>Crea tu cuenta y sube tu Carpeta Tributaria (gratis en sii.cl): un profesional ENQORA confirma este diagnóstico gratis.</li>
          <li>Recibe la cotización con el precio y los plazos antes de decidir.</li>
        </ol>
        <span className="report-note">
          Este diagnóstico no se guarda: si lo quieres conservar, guárdalo en PDF. ENQORA nunca te pedirá tu clave del SII.
        </span>
        <span className="report-note">
          Fuentes: {rep.fuentes.map((f, i) => (
            <span key={f.nombre}>{i ? " · " : ""}{f.url ? <a href={f.url} target="_blank" rel="noopener noreferrer">{f.nombre}</a> : f.nombre} ({f.fecha})</span>
          ))}.
        </span>
        <div className="inline-form">
          <Link href={`/comenzar?servicio=${rep.ruta[0]?.categoria ?? "contabilidad"}`} className="btn btn-gold btn-inline btn-sm">Crear mi cuenta gratis</Link>
          <button type="button" className="btn btn-ghost btn-inline btn-sm" onClick={() => window.print()}>Guardar en PDF</button>
          <button type="button" className="btn btn-ghost btn-inline btn-sm" onClick={() => setDone(false)}>Cambiar respuestas</button>
        </div>
      </div>
    </div>
  );
}
