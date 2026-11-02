"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { lookupRutAction, type LookupState } from "@/app/actions/public";
import { PriceLine } from "@/app/diagnostico-360";
import { PropuestaView } from "@/app/cora-solucion";
import { ExpedienteCora } from "@/app/expediente-cora";
import { investigarPersona, PREGUNTAS_PERSONA, type ExpedientePersona, type PersonaAnswers } from "@/lib/cora/personas";
import { EnqoraClockLoader } from "@/components/clock-loader";
import { buildInitialReport, type Catalog, type InitialReport } from "@/lib/initial-report";
import { salesTrancheLabel } from "@/lib/public-data";
import type { PublicCompany } from "@/app/actions/public";
import { formatRut, isValidRut } from "@/lib/rut";

const fmtDate = (d?: string | null) =>
  d ? new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`)) : null;

// 01 · Primer contacto y 02 · Demostración de capacidad.
// Empresa (persona jurídica): hoja de vida pública desde las nóminas oficiales del SII, con el análisis ENQORA.
// Persona natural con giro: el SII no publica sus datos; 4 preguntas (respondidas en el navegador) arman el diagnóstico.
export function RutLookup() {
  // Si la consulta falla en el servidor o la página quedó abierta desde una versión anterior de ENQORA,
  // se muestra un mensaje y la consulta se puede reintentar (nunca la pantalla de error general).
  const [state, action, pending] = useActionState(async (prev: LookupState, fd: FormData): Promise<LookupState> => {
    try {
      return await lookupRutAction(prev, fd);
    } catch {
      return { error: "No pudimos completar la consulta. Recarga la página (F5) e intenta nuevamente." };
    }
  }, undefined);
  const [rut, setRut] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const valid = isValidRut(rut);
  const r = state?.result;

  return (
    <div className="lookup">
      <form
        action={action}
        className="lookup-form"
        onSubmit={(e) => {
          // Nunca un botón «muerto»: si el RUT no es válido, se explica por qué no se consulta.
          if (!valid) {
            e.preventDefault();
            setLocalError(rut.trim()
              ? "El RUT no es válido: revisa el número y el dígito verificador (ej.: 76.123.456-7)."
              : "Ingresa un RUT para consultar.");
          } else setLocalError(null);
        }}
      >
        <label htmlFor="rut" className="lookup-label">RUT de tu empresa o tu RUT personal si emprendes a tu nombre</label>
        <div className="lookup-row">
          <input
            id="rut"
            name="rut"
            className="input lookup-input mono"
            inputMode="text"
            autoComplete="off"
            placeholder="76.123.456-7"
            maxLength={12}
            value={rut}
            onChange={(e) => { setRut(formatRut(e.target.value)); setLocalError(null); }}
            aria-describedby="rut-hint"
          />
          <button type="submit" className="btn btn-gold lookup-btn" disabled={pending} aria-busy={pending}>
            {pending ? "Consultando…" : "Consultar"}
          </button>
        </div>
        <span id="rut-hint" className="lookup-hint">
          {rut && !valid && rut.replace(/[^0-9kK]/g, "").length >= 8
            ? "El dígito verificador no coincide."
            : "Empresas: usamos solo información pública del SII. Personas: 7 preguntas, sin guardar nada."}
        </span>
      </form>

      {pending ? <EnqoraClockLoader mode="datos" label="Buscando en la información pública del SII" /> : null}

      {localError ? <p className="lookup-error" role="alert">{localError}</p> : null}
      {!pending && !localError && state?.error ? <p className="lookup-error" role="alert">{state.error}</p> : null}

      {!pending && r ? (
        <section className="lookup-result" aria-live="polite">
          <span className="eyebrow">02 · Esto encontramos</span>
          {r.estado === "encontrada" ? (
            <>
              <h3>{r.razon_social}</h3>
              <dl className="lookup-facts">
                <div><dt>RUT</dt><dd className="mono">{formatRut(r.rut ?? "")}</dd></div>
                <div><dt>Inicio de actividades</dt><dd>{fmtDate(r.inicio_actividades) ?? "No informado"}</dd></div>
                <div>
                  <dt>Situación</dt>
                  <dd>{r.termino_giro ? `Término de giro el ${fmtDate(r.termino_giro)}` : "Sin término de giro informado"}</dd>
                </div>
              </dl>
              {r.carga_parcial ? (
                <p className="lookup-note">Datos de la nómina de razón social del SII. Las actividades y el tamaño se completan cuando termine la carga de las demás nóminas.</p>
              ) : null}
              {r.perfil ? (
                <dl className="lookup-facts">
                  <div><dt>Tamaño por ventas ({r.perfil.anio_comercial})</dt><dd>{salesTrancheLabel(r.perfil.tramo_ventas) ?? "No informado"}</dd></div>
                  <div><dt>Trabajadores informados</dt><dd>{r.perfil.trabajadores ?? "No informado"}</dd></div>
                  {r.perfil.rubro ? <div><dt>Rubro</dt><dd>{r.perfil.rubro}</dd></div> : null}
                  {r.perfil.region ? <div><dt>Región</dt><dd>{r.perfil.region}</dd></div> : null}
                </dl>
              ) : null}
              {r.actividades?.length ? (
                <details className="lookup-acts">
                  <summary className="lookup-acts-title">Actividades económicas vigentes ({r.total_actividades ?? r.actividades.length})</summary>
                  <ul>
                    {r.actividades.map((a) => <li key={a.codigo}><span className="mono">{a.codigo}</span> {a.descripcion}</li>)}
                  </ul>
                </details>
              ) : null}
              <InitialReportView r={r} />
            </>
          ) : r.estado === "persona_natural" ? (
            <NaturalFlow r={r} />
          ) : r.estado === "no_encontrada" ? (
            <>
              <h3>No encontramos esta empresa</h3>
              <p className="lookup-note">
                El RUT {formatRut(r.rut ?? "")} no aparece en las nóminas públicas de empresas del SII. Si la empresa es muy reciente,
                puede que el SII aún no la publique: revisa el RUT o consúltalo directamente en el SII.
              </p>
              <a href="https://www.sii.cl/como_se_hace_para/situacion_trib_terceros.html" target="_blank" rel="noopener noreferrer"
                className="btn btn-ghost btn-inline btn-sm">Abrir la consulta del SII</a>
            </>
          ) : (
            <>
              <h3>Estamos sincronizando las fuentes oficiales</h3>
              <p className="lookup-note">
                {r.cargadas
                  ? `El conector de ENQORA ya cargó ${r.cargadas.toLocaleString("es-CL")} empresas desde las nóminas públicas del SII y sigue avanzando; este RUT aún no está entre ellas. Vuelve a consultarlo en un rato.`
                  : "Tu consulta puso en marcha el conector de ENQORA con las nóminas públicas del SII. La primera carga toma unos minutos; vuelve a consultar este RUT en un rato."}
              </p>
              <div className="lookup-deep">
                <b>Mientras tanto, puedes verlo tú mismo en el SII</b>
                <span>
                  El SII ofrece gratis la «Consulta de situación tributaria de terceros»: muestra la razón social, las actividades
                  vigentes, si la empresa está autorizada a emitir documentos y si tiene observaciones. La haces directamente en el sitio del SII.
                </span>
                <a href="https://www.sii.cl/como_se_hace_para/situacion_trib_terceros.html" target="_blank" rel="noopener noreferrer"
                  className="btn btn-ghost btn-inline btn-sm">Abrir la consulta del SII</a>
              </div>
            </>
          )}
          {r.estado === "encontrada" || r.estado === "no_encontrada" ? (
            <p className="lookup-source">
              Información pública según el Servicio de Impuestos Internos
              {r.publicada ? `, publicada el ${fmtDate(r.publicada)}` : ""}.{" "}
              {r.fuentes?.length
                ? r.fuentes.map((f, i) => <span key={f.url}>{i ? " · " : ""}<a href={f.url} target="_blank" rel="noopener noreferrer">{f.nombre}</a></span>)
                : r.fuente_url ? <a href={r.fuente_url} target="_blank" rel="noopener noreferrer">Ver fuente</a> : null}.
              {" "}El SII advierte que estos datos son preliminares; no constituyen una verificación de ENQORA.
            </p>
          ) : null}
          <div className="lookup-next">
            <span>¿Buscas otro servicio?</span>
            <Link href="#servicios" className="btn btn-ghost btn-inline btn-sm">Explorar servicios</Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}

const NIVEL = {
  alerta: ["is-alta", "Requiere acción"],
  atencion: ["is-media", "Requiere revisión"],
  sin_alertas: ["is-baja", "Sin alertas"],
} as const;

function consultedAt(iso?: string) {
  return iso ? new Intl.DateTimeFormat("es-CL", { dateStyle: "long", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(iso)) : null;
}

// Informe: veredicto, análisis, obligaciones con fecha y los 3 servicios que lo resuelven.
function ReportView({ rep, when, intro }: { rep: InitialReport; when: string | null; intro?: string }) {
  const first = rep.servicios[0];
  return (
    <div className="report">
      <div className="report-head">
        <span className="eyebrow">Diagnóstico ENQORA</span>
        <small>{when ? `Generado el ${when}` : null}{rep.completo ? "" : " · carga de nóminas del SII en curso: se completará"}</small>
      </div>

      <div className={`report-verdict ${NIVEL[rep.nivel][0]}`}>
        <span className="report-tag">{NIVEL[rep.nivel][1]}</span>
        <b>{rep.veredicto}</b>
      </div>
      {intro ? <p className="report-note">{intro}</p> : null}

      {rep.conclusiones.length ? (
        <>
          <h4 className="lookup-acts-title">Nuestro análisis</h4>
          <ul className="report-insights">{rep.conclusiones.map((c) => <li key={c}>{c}</li>)}</ul>
        </>
      ) : null}

      {rep.obligaciones.length ? (
        <>
          <h4 className="lookup-acts-title">Lo que debes cumplir y cuándo</h4>
          <table className="report-cal">
            <tbody>
              {rep.obligaciones.map((o) => (
                <tr key={o.que}>
                  <th scope="row">{o.que}{o.nota ? <small>{o.nota}</small> : null}</th>
                  <td>{o.cuando}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      {rep.servicios.length ? (
        <>
          <h4 className="lookup-acts-title">Lo que ENQORA te recomienda</h4>
          <ol className="report-recs">
            {rep.servicios.map((s) => (
              <li key={s.id} className="lookup-signal">
                <b>{s.nombre}</b>
                <span>{s.porque}</span>
                <PriceLine s={s} />
                <Link href={`/comenzar?servicio=${s.categoria}`} className="lookup-signal-cta">{s.disponible ? "Contratar o cotizar →" : "Solicitar contacto →"}</Link>
              </li>
            ))}
          </ol>
        </>
      ) : null}

      <div className="lookup-deep">
        <b>Diagnóstico completo gratis</b>
        <span>Crea tu cuenta, sube tu Carpeta Tributaria Electrónica (la generas gratis en sii.cl) y un profesional ENQORA confirma este análisis, el costo y los plazos antes de actuar. ENQORA nunca te pedirá tu clave del SII.</span>
        <details className="report-detail">
          <summary>Qué revisa el diagnóstico completo</summary>
          <ul className="report-check">{rep.porComprobar.map((c) => <li key={c}>{c}</li>)}</ul>
        </details>
        <div className="inline-form">
          <Link href={`/comenzar?servicio=${first?.categoria ?? "contabilidad"}`} className="btn btn-gold btn-inline btn-sm">Crear mi cuenta gratis</Link>
          <button type="button" className="btn btn-ghost btn-inline btn-sm" onClick={() => window.print()}>Guardar en PDF</button>
        </div>
      </div>
    </div>
  );
}

// Empresa: informe público y, a continuación, el expediente CORA (investigación por 16 agentes).
// El expediente CORA reemplaza al diagnóstico 360°: incluye sus preguntas, su mapa y sus beneficios.
function InitialReportView({ r }: { r: PublicCompany }) {
  const [cora, setCora] = useState(false);
  const catalog = (r.catalogo ?? []) as Catalog;
  if (cora) return <ExpedienteCora p={r} catalog={catalog} onClose={() => setCora(false)} />;
  return (
    <>
      <ReportView rep={buildInitialReport(r, catalog)} when={consultedAt(r.consultado)} />
      <div className="d360-cta">
        <span className="eyebrow">CORA · Inteligencia empresarial</span>
        <b>Abre el expediente completo de esta empresa: 16 secciones investigadas por agentes especializados.</b>
        <span>Identidad, tributación, obligaciones laborales, previsionales y de seguridad con su fundamento legal, permisos, marca, oportunidades y más.
          CORA te muestra qué encontró, en qué fuente, qué falta verificar y tus 3 prioridades. Nada se guarda.</span>
        <button type="button" className="btn btn-gold btn-inline btn-sm" onClick={() => setCora(true)}>Abrir expediente CORA</button>
      </div>
    </>
  );
}

// CORA PERSONAS (modalidad pública): con un RUT de persona, CORA no consulta ninguna fuente sobre ella.
// 7 preguntas, respondidas en el navegador, arman su perfil emprendedor, sus necesidades y su plan.
// Nada se envía ni se guarda.
function NaturalFlow({ r }: { r: PublicCompany }) {
  const [a, setA] = useState<Partial<PersonaAnswers>>({});
  const done = PREGUNTAS_PERSONA.every((q) => a[q.key]);
  const catalog = (r.catalogo ?? []) as Catalog;
  return (
    <>
      <h3>CORA Personas · RUT {formatRut(r.rut ?? "")}</h3>
      <p className="lookup-note">
        Para proteger a las personas, CORA no investiga a nadie solo por su RUT: cualquiera podría escribir uno ajeno. Si este es tu RUT
        y emprendes o quieres emprender, responde 7 preguntas y CORA arma tu perfil, tus necesidades y tu plan al instante.
        Tus respuestas no se envían ni se guardan.
      </p>
      <div className="natural-q">
        {PREGUNTAS_PERSONA.map((q) => (
          <fieldset key={q.key}>
            <legend>{q.q}</legend>
            <div className="natural-opts">
              {q.options.map(([v, label]) => (
                <button key={v} type="button" className={`natural-opt${a[q.key] === v ? " is-on" : ""}`} aria-pressed={a[q.key] === v}
                  onClick={() => setA((x) => ({ ...x, [q.key]: v }))}>{label}</button>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      {done ? <PersonaReport e={investigarPersona(a as PersonaAnswers, catalog)} when={consultedAt(r.consultado)} /> : (
        <p className="report-note">Responde las {PREGUNTAS_PERSONA.length - Object.keys(a).length} preguntas que faltan para ver tu expediente.</p>
      )}
    </>
  );
}

function PersonaReport({ e, when }: { e: ExpedientePersona; when: string | null }) {
  return (
    <div className="report cora">
      <div className="report-head">
        <span className="eyebrow">CORA Personas · tu perfil emprendedor</span>
        <small>{when ? `Generado el ${when}` : null} · según tus respuestas y la normativa vigente · no se guarda</small>
      </div>
      <dl className="lookup-facts">{e.perfil.map((x) => <div key={x.etiqueta}><dt>{x.etiqueta}</dt><dd>{x.valor}</dd></div>)}</dl>
      {e.fortalezas.length ? (
        <>
          <h4 className="lookup-acts-title">Tus fortalezas</h4>
          <ul className="report-insights">{e.fortalezas.map((f) => <li key={f}>{f}</li>)}</ul>
        </>
      ) : null}
      {e.conclusiones.length ? (
        <>
          <h4 className="lookup-acts-title">Lo que CORA entiende de tu situación</h4>
          <ul className="report-insights">{e.conclusiones.map((c) => <li key={c}>{c}</li>)}</ul>
        </>
      ) : null}
      <PropuestaView propuesta={e.propuesta} />
      {e.obligaciones.length ? (
        <>
          <h4 className="lookup-acts-title">Lo que debes cumplir y cuándo</h4>
          <table className="report-cal">
            <tbody>{e.obligaciones.map((o) => <tr key={o.que}><th scope="row">{o.que}{o.nota ? <small>{o.nota}</small> : null}</th><td>{o.cuando}</td></tr>)}</tbody>
          </table>
        </>
      ) : null}
      {e.beneficios.length ? (
        <>
          <h4 className="lookup-acts-title">Oportunidades que podrían aplicar</h4>
          <ul className="report-insights">
            {e.beneficios.map((b) => <li key={b.nombre}><a href={b.url} target="_blank" rel="noopener noreferrer"><b>{b.nombre}</b></a>. {b.porque} <span className="report-note">Falta confirmar: {b.falta}</span></li>)}
          </ul>
        </>
      ) : null}
      <div className="lookup-deep">
        <b>Tu expediente personal completo</b>
        <span>Con tu cuenta ENQORA podrás, con tu autorización, sumar tu Carpeta Tributaria y otros documentos para que un profesional confirme este análisis. ENQORA nunca te pedirá tu clave del SII.</span>
        <div className="inline-form">
          <Link href={`/comenzar?servicio=${e.propuesta.planes[0]?.etapas[0]?.necesidad.servicio?.categoria ?? "formalizacion"}`} className="btn btn-gold btn-inline btn-sm">Crear mi cuenta gratis</Link>
          <button type="button" className="btn btn-ghost btn-inline btn-sm" onClick={() => window.print()}>Guardar en PDF</button>
        </div>
      </div>
    </div>
  );
}
