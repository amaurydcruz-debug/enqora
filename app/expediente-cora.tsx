"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { InvestigacionEnVivo, PropuestaView } from "@/app/cora-solucion";
import { PriceLine } from "@/app/diagnostico-360";
import { investigar } from "@/lib/cora/director";
import { ESTADOS, type Estado } from "@/lib/cora/secciones";
import type { Aplicacion } from "@/lib/cora/normativa-laboral";
import { LEVELS, type Answer } from "@/lib/diagnostic-360";
import type { Catalog, PublicProfileForReport } from "@/lib/initial-report";

// Expediente CORA (Etapa 1): investigación pública primero; después, solo lo que no se puede comprobar.
// Se construye en el navegador con datos públicos y las respuestas del visitante: no se envía ni se guarda.

const OPTIONS: [Answer, string][] = [["si", "Sí"], ["no", "No"], ["no_se", "No sé"], ["ayuda", "Necesito ayuda"]];
const LEVEL_CLASS = { solido: "is-solido", atencion: "is-atencion", prioritario: "is-prioritario", sin_info: "is-sininfo" } as const;
const PRIO = { alta: "Prioritario", media: "Atención", baja: "Oportunidad" } as const;
const ESTADO_TONE: Partial<Record<Estado, string>> = { confirmado: "status-ok", parcial: "status-gold", declarado: "status-gold", requiere_documentacion: "status-warn", requiere_autorizacion: "status-warn", requiere_profesional: "status-warn" };
const APLICA: Record<Aplicacion, string> = {
  potencial: "Potencialmente aplicable",
  por_confirmar: "Por confirmar",
  no_aplica_indicador: "No aplicaría según el indicador",
  sin_datos: "Sin datos para determinarla",
};

// embebido: el expediente completo dentro de la Consulta Estratégica (sin preguntas, propuesta ni pie propios).
export function ExpedienteCora({ p, catalog, onClose, embebido = false, respuestas }: {
  p: PublicProfileForReport; catalog: Catalog; onClose: () => void; embebido?: boolean; respuestas?: Record<string, Answer>;
}) {
  const [own, setAnswers] = useState<Record<string, Answer>>({});
  const answers = respuestas ?? own;
  const [preguntas, setPreguntas] = useState(false);
  const exp = useMemo(() => investigar(p, catalog, answers), [p, catalog, answers]);
  const pendientes = exp.preguntas.length - exp.respondidas;
  const necesidad = useMemo(() => new Map(exp.necesidades.map((n) => [n.id, n])), [exp.necesidades]);
  const [pasos] = useState(() => exp.bitacora);

  const body = (
    <div className="report cora">
      <div className="report-head">
        <span className="eyebrow">CORA · Expediente de inteligencia empresarial</span>
        <small>
          Investigado el {new Intl.DateTimeFormat("es-CL", { dateStyle: "long", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(exp.generado))}
          {" "}· 16 agentes especializados · no se guarda
        </small>
      </div>

      <div className="cora-complete">
        <div>
          <span className="report-tag">Completitud del expediente</span>
          <b className="cora-pct">{exp.completitud.pct}%</b>
          <span className="report-note">
            {exp.completitud.conInformacion} de {exp.completitud.total} secciones con información · {exp.completitud.verificadas} verificadas en fuentes oficiales
          </span>
        </div>
        <div className="d360-progress" aria-hidden="true"><span style={{ width: `${exp.completitud.pct}%` }} /></div>
        <span className="report-note">
          No es una nota de salud de la empresa: indica cuánto pudo investigar CORA. Sube con tus respuestas y, desde la próxima etapa, con
          los documentos y autorizaciones que entregues.
        </span>
      </div>

      {exp.contradicciones.length ? (
        <div className="report-verdict is-alta" role="status">
          <span className="report-tag">El auditor de CORA detectó una contradicción</span>
          {exp.contradicciones.map((c) => <b key={c}>{c}</b>)}
        </div>
      ) : null}

      {embebido ? null : <>
      <div className="d360-cta">
        <span className="eyebrow">Lo que CORA no puede comprobar en fuentes públicas</span>
        <b>{pendientes ? `${pendientes} preguntas para completar tu expediente (unos 2 minutos).` : "Respondiste todas las preguntas: el expediente ya las considera."}</b>
        <span>Finanzas, clientes, inventario, marca, patente, presencia digital, sistemas y contratos: no hay una fuente pública lícita para esto. Tus respuestas no se envían ni se guardan.</span>
        <button type="button" className="btn btn-gold btn-inline btn-sm" onClick={() => setPreguntas((v) => !v)} aria-expanded={preguntas}>
          {preguntas ? "Ocultar preguntas" : pendientes ? "Responder" : "Revisar respuestas"}
        </button>
        {preguntas ? (
          <div className="natural-q">
            {exp.preguntas.map((q) => (
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
        ) : null}
      </div>

      <div className="d360-route">
        <span className="eyebrow">Tus 3 prioridades</span>
        <b>Estas son las áreas que CORA recomienda atender primero, y por qué.</b>
        {exp.prioridades.length ? (
          <ol className="report-recs">
            {exp.prioridades.map((s, i) => (
              <li key={s.id} className="lookup-signal">
                <span className="report-tag">Prioridad {i + 1}</span>
                <b>{s.nombre}</b>
                <span>{s.razon}</span>
                <PriceLine s={s} />
                <Link href={`/comenzar?servicio=${s.categoria}`} className="lookup-signal-cta">{s.disponible ? "Contratar o cotizar →" : "Solicitar contacto →"}</Link>
              </li>
            ))}
          </ol>
        ) : <span className="report-note">CORA no detectó necesidades que requieran un servicio con la información disponible.</span>}
        {exp.otras.length ? (
          <details className="report-detail">
            <summary>Otras necesidades detectadas ({exp.otras.length})</summary>
            <ul className="report-check">{exp.otras.map((s) => <li key={s.id}><b>{s.nombre}</b> <span>· <PriceLine s={s} /></span></li>)}</ul>
          </details>
        ) : null}
      </div>

      <PropuestaView propuesta={exp.propuesta} />
      </>}

      <h4 className="lookup-acts-title">Mapa del expediente (16 secciones)</h4>
      <ul className="d360-map">
        {exp.secciones.map((s) => (
          <li key={s.key} className={LEVEL_CLASS[s.nivel]}>
            <span className="d360-dot" aria-hidden="true" />
            <b>{s.nombre}</b>
            <span className="d360-level">{LEVELS[s.nivel]}</span>
            <span className="cora-estado">{ESTADOS[s.estado]}</span>
          </li>
        ))}
      </ul>

      {exp.hallazgos.length ? (
        <>
          <h4 className="lookup-acts-title">Hallazgos de CORA</h4>
          <ol className="report-recs">
            {exp.hallazgos.map((h) => (
              <li key={h.id} className={`lookup-signal ${h.prioridad === "alta" ? "is-alta" : h.prioridad === "baja" ? "is-baja" : ""}`}>
                <div className="report-tags">
                  <span className="report-tag">{PRIO[h.prioridad]}</span>
                  <span className="report-tag report-tag-muted">{ESTADOS[h.estado]} · Agente {h.agente}</span>
                  {h.profesional ? <span className="report-tag report-tag-muted">Requiere revisión profesional antes de actuar</span> : null}
                </div>
                <b>{h.encontro}</b>
                <details className="report-detail">
                  <summary>Por qué importa y qué hacer</summary>
                  <dl>
                    <div><dt>Por qué es importante</dt><dd>{h.importa}</dd></div>
                    {h.consecuencias ? <div><dt>Qué consecuencias podría tener</dt><dd>{h.consecuencias}</dd></div> : null}
                    <div><dt>Qué debería hacer</dt><dd>{h.hacer}</dd></div>
                    {h.siNoSeAtiende ? <div><dt>Qué pasaría si no se atiende</dt><dd>{h.siNoSeAtiende}</dd></div> : null}
                    {necesidad.get(h.id) ? <div><dt>Qué ganas al resolverlo</dt><dd>{necesidad.get(h.id)!.beneficio}</dd></div> : null}
                    {h.servicio ? <div><dt>Cómo ayuda ENQORA</dt><dd>{h.servicio.nombre} · <PriceLine s={h.servicio} /></dd></div> : null}
                    {necesidad.get(h.id)?.externa ? (
                      <div><dt>O por tu cuenta</dt><dd><a href={necesidad.get(h.id)!.externa!.url} target="_blank" rel="noopener noreferrer">{necesidad.get(h.id)!.externa!.nombre}</a>. {necesidad.get(h.id)!.externa!.nota}</dd></div>
                    ) : null}
                    <div><dt>Evidencia</dt><dd>{h.fuente} · {h.fecha}</dd></div>
                  </dl>
                </details>
              </li>
            ))}
          </ol>
        </>
      ) : null}

      <h4 className="lookup-acts-title">Expediente por sección</h4>
      <div className="cora-sections">
        {exp.secciones.map((s) => (
          <details key={s.key} className="cora-section">
            <summary>
              <b>{s.nombre}</b>
              <span className={`status ${ESTADO_TONE[s.estado] ?? "status-muted"}`}>{ESTADOS[s.estado]}</span>
            </summary>
            <dl className="cora-dl">
              {s.agente ? <div><dt>Investigador</dt><dd>Agente {s.agente.numero} · {s.agente.nombre}</dd></div> : null}
              <div><dt>Qué se investigó</dt><dd><ul className="report-check">{s.investigado.map((x) => <li key={x}>{x}</li>)}</ul></dd></div>
              <div><dt>Qué se encontró</dt><dd>{s.encontrado.length ? <ul className="report-check">{s.encontrado.map((x) => <li key={x}>{x}</li>)}</ul> : "Sin información de fuentes públicas ni respuestas."}</dd></div>
              {s.obligaciones?.length ? (
                <div>
                  <dt>Obligaciones (fundamento legal)</dt>
                  <dd>
                    <ul className="cora-obl">
                      {s.obligaciones.map((o) => (
                        <li key={o.id} className={o.aplicacion === "potencial" ? "is-on" : ""}>
                          <b>{o.nombre}</b> <span className="cora-estado">{APLICA[o.aplicacion]}</span>
                          <small>Fundamento: <a href={o.fuente.url} target="_blank" rel="noopener noreferrer">{o.fundamento}</a> (verificado el {o.fuente.verificada.split("-").reverse().join("-")})</small>
                          <small>Condición: {o.condicion} · Dato usado: {o.datos}</small>
                          {o.aplicacion === "potencial" ? <small>Falta: {o.falta} · Acredita el cumplimiento: {o.acredita}</small> : null}
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
              ) : null}
              {s.key === "tributacion" && exp.obligacionesTributarias.length ? (
                <div><dt>Calendario tributario</dt><dd><ul className="report-check">{exp.obligacionesTributarias.map((o) => <li key={o.que}>{o.que}: <b>{o.cuando}</b></li>)}</ul></dd></div>
              ) : null}
              <div><dt>Qué falta</dt><dd>{s.falta.length ? <ul className="report-check">{s.falta.map((x) => <li key={x}>{x}</li>)}</ul> : "—"}</dd></div>
              <div>
                <dt>Fuentes y fechas</dt>
                <dd>
                  <ul className="report-check">
                    {s.fuentes.map((f) => <li key={f.nombre}>{f.url ? <a href={f.url} target="_blank" rel="noopener noreferrer">{f.nombre}</a> : f.nombre} · {f.fecha}</li>)}
                  </ul>
                </dd>
              </div>
              <div><dt>Próxima acción</dt><dd>{s.proxima}</dd></div>
            </dl>
          </details>
        ))}
      </div>

      <details className="report-detail">
        <summary>Bitácora del equipo CORA</summary>
        <ul className="report-check">{exp.bitacora.map((b) => <li key={b.agente}><b>{b.agente}:</b> <span>{b.resultado}</span></li>)}</ul>
      </details>

      {embebido ? null : <div className="lookup-deep">
        <b>Próximos pasos</b>
        <ol className="report-steps">
          <li>Atiende tu prioridad 1 (solicitar atención no tiene costo ni compromiso).</li>
          <li>Crea tu cuenta y sube tu Carpeta Tributaria: un profesional ENQORA revisa gratis las secciones que requieren documentos.</li>
          <li>Recibe la cotización con precio y plazos antes de decidir.</li>
        </ol>
        <span className="report-note">
          CORA investiga solo fuentes públicas y lo que tú declaras. «Sin resultados localizados» no significa que algo no exista ni que haya incumplimiento. Las conclusiones legales,
          laborales o tributarias de alto impacto las confirma un profesional ENQORA. ENQORA nunca te pedirá claves del SII, Previred, AFC ni bancos.
        </span>
        <div className="inline-form">
          <Link href={`/comenzar?servicio=${exp.prioridades[0]?.categoria ?? "contabilidad"}`} className="btn btn-gold btn-inline btn-sm">Crear mi cuenta gratis</Link>
          <button type="button" className="btn btn-ghost btn-inline btn-sm" onClick={() => window.print()}>Guardar en PDF</button>
          <button type="button" className="btn btn-ghost btn-inline btn-sm" onClick={onClose}>Volver al informe</button>
        </div>
      </div>}
    </div>
  );
  return embebido ? body : <InvestigacionEnVivo pasos={pasos}>{body}</InvestigacionEnVivo>;
}
