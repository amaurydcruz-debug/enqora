"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { lookupRutAction, type LookupState } from "@/app/actions/public";
import { CasoForm } from "@/app/cora-caso";
import { PriceLine } from "@/app/diagnostico-360";
import { objetivosOrdenados } from "@/lib/cora/caso";
import { ConsultaEstrategica } from "@/app/consulta-estrategica";
import { ESTADO_SITUACION, investigarPersona, PREGUNTAS_PERSONA, preguntaVisible, type ExpedientePersona, type PersonaAnswers } from "@/lib/cora/personas";
import { EnqoraClockLoader } from "@/components/clock-loader";
import type { Catalog } from "@/lib/initial-report";
import { salesTrancheLabel } from "@/lib/public-data";
import type { PublicCompany } from "@/app/actions/public";
import { formatRut, isValidRut } from "@/lib/rut";
import { VozBarra } from "@/components/voz-barra";
import { rutDesdeVoz } from "@/lib/voz/interpretar";
import { activarModoVoz, escuchar, hablar, modoVozActivo, soporteVoz } from "@/lib/voz/navegador";

// «7 7 0 5 8 3 1 1, guion, K»: el RUT leído dígito por dígito para confirmarlo en voz alta.
const rutHablado = (rut: string) => { const [c, dv] = rut.split("-"); return `${c.split("").join(" ")}, guion, ${dv}`; };

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
  const formRef = useRef<HTMLFormElement>(null);
  const [vozAviso, setVozAviso] = useState<string | null>(null);
  const [vozOcupada, setVozOcupada] = useState(false);

  // Piloto de voz: CORA saluda, escucha el RUT, lo confirma en voz alta y lanza la consulta.
  async function iniciarVoz() {
    const sop = soporteVoz();
    if (!sop.escuchar) {
      setVozAviso("Tu navegador aún no permite dictar por voz. Usa Chrome o Edge, o escribe el RUT.");
      if (sop.hablar) { activarModoVoz(true); await hablar("Tu navegador aún no me deja escucharte. Escribe el RUT de tu empresa y te cuento lo que encontré."); }
      return;
    }
    setVozAviso(null); setVozOcupada(true); activarModoVoz(true);
    await hablar("Hola, soy CORA. Dime el RUT de tu empresa y te cuento lo que la ley ya te da.");
    for (let intento = 0; intento < 3 && modoVozActivo(); intento++) {
      const txt = await escuchar(10_000);
      if (txt === null) { setVozAviso("No pude usar el micrófono. Revisa el permiso del navegador o escribe el RUT."); activarModoVoz(false); break; }
      const leido = rutDesdeVoz(txt);
      if (leido) {
        setRut(formatRut(leido)); setLocalError(null);
        await hablar(`Entendí ${rutHablado(leido)}. Estoy revisando la información pública de tu empresa.`);
        setTimeout(() => formRef.current?.requestSubmit(), 50);
        break;
      }
      if (intento < 2) await hablar(txt ? "No alcancé a entenderlo bien. Dímelo dígito por dígito, y al final el dígito verificador." : "No te escuché. Dime el RUT de tu empresa, dígito por dígito.");
      else { await hablar("No logré entender el RUT. Puedes escribirlo en pantalla."); activarModoVoz(false); }
    }
    setVozOcupada(false);
  }

  // Resultados que no siguen en la conversación por voz: se avisa y se pasa a pantalla.
  useEffect(() => {
    if (!r || !modoVozActivo()) return;
    if (r.estado === "persona_natural") { void hablar("Este RUT es de una persona. Te hago unas preguntas breves en pantalla.").then(() => activarModoVoz(false)); }
    else if (r.estado === "no_encontrada") { void hablar("No encontré esa empresa en la información pública del S I I. Revisa el RUT en pantalla.").then(() => activarModoVoz(false)); }
  }, [r]);

  return (
    <div className="lookup">
      <div className="voz-inicio">
        <button type="button" className="voz-btn" onClick={() => void iniciarVoz()} disabled={vozOcupada || pending} aria-describedby="voz-aviso">
          <span className="voz-btn-orbe" aria-hidden="true" />
          <span><b>Habla con CORA</b><small>Dile el RUT de tu empresa en voz alta</small></span>
        </button>
        <small id="voz-aviso" className="lookup-hint">
          {vozAviso ?? "Piloto de voz con el micrófono y la voz de tu navegador (mejor en Chrome o Edge). ENQORA no recibe ni guarda tu audio. También puedes escribir."}
        </small>
      </div>
      <VozBarra />
      <form
        ref={formRef}
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
            : "Empresas: usamos solo información pública del SII. Personas: una conversación breve, sin guardar nada."}
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
              <ConsultaEstrategica r={r} />
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

function consultedAt(iso?: string) {
  return iso ? new Intl.DateTimeFormat("es-CL", { dateStyle: "long", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(iso)) : null;
}

// CORA PERSONAS (modalidad pública): con un RUT de persona, CORA no consulta ninguna fuente sobre ella.
// Hasta 8 preguntas (según lo respondido), respondidas en el navegador, arman su perfil emprendedor, sus necesidades y su plan.
// Nada se envía ni se guarda.
function NaturalFlow({ r }: { r: PublicCompany }) {
  const [a, setA] = useState<Partial<PersonaAnswers>>({});
  const catalog = (r.catalogo ?? []) as Catalog;
  // Conversación: una pregunta a la vez, solo las que aplican según lo ya respondido
  // (sin inicio de actividades no se pregunta por impuestos; sin movimiento, no se pregunta por local, marca o crecimiento).
  const visibles = PREGUNTAS_PERSONA.filter((q) => preguntaVisible(q.key, a));
  const siguiente = visibles.find((q) => !a[q.key]);
  const completo = !!a.venta && !siguiente;
  const respuestas = { contador: "nadie", trabajadores: "no", lugar: "casa", cuentas: "si", crecer: "no", marca: "no", ...a } as PersonaAnswers;
  return (
    <>
      <h3>CORA Personas · RUT {formatRut(r.rut ?? "")}</h3>
      <section className="cora-carta" aria-label="Orientación inicial">
        <span className="report-tag">CORA · Orientación inicial</span>
        <h4>Tu actividad económica es el punto de partida.</h4>
        <p>
          Para proteger a las personas, CORA no consulta fuentes con el RUT de alguien: cualquiera podría escribir uno ajeno. Por eso partimos
          de lo que tú nos cuentes, con la normativa vigente, y nada se envía ni se guarda.
        </p>
        <dl className="cora-identidad">
          <div><dt>Si vendes con boletas o facturas</dt><dd>Primera categoría: declaración mensual de IVA (F29) y renta anual en abril.</dd></div>
          <div><dt>Si emites boletas de honorarios</dt><dd>Segunda categoría: retención en cada boleta y renta anual en abril.</dd></div>
          <div><dt>Si aún no inicias actividades</dt><dd>Te orientamos para formalizarte con el giro y el régimen correctos.</dd></div>
        </dl>
        <p className="report-note">Esta orientación es inicial: las obligaciones exactas dependen de tu régimen tributario, que se confirma con tus documentos.</p>
      </section>
      <div className="cora-chat">
        {visibles.filter((q) => a[q.key]).map((q) => (
          <div key={q.key} className="cora-turn">
            <span className="cora-q">{q.q}</span>
            <span className="cora-a">{q.options.find(([v]) => v === a[q.key])?.[1]}</span>
            <button type="button" className="cora-edit" onClick={() => setA((x) => { const y = { ...x }; for (const k of PREGUNTAS_PERSONA.slice(PREGUNTAS_PERSONA.findIndex((z) => z.key === q.key)).map((z) => z.key)) delete y[k]; return y; })}>Cambiar</button>
          </div>
        ))}
        {siguiente ? (
          <fieldset className="cora-ask">
            <legend>{siguiente.q}</legend>
            <span className="report-note">Por qué te lo pregunto: {siguiente.porque}</span>
            <div className="natural-opts">
              {siguiente.options.map(([v, label]) => (
                <button key={v} type="button" className="natural-opt" onClick={() => setA((x) => ({ ...x, [siguiente.key]: v }))}>{label}</button>
              ))}
            </div>
            <span className="report-note">Pregunta {visibles.filter((q) => a[q.key]).length + 1} de {visibles.length}.</span>
          </fieldset>
        ) : null}
      </div>
      {completo ? <PersonaReport e={investigarPersona(respuestas, catalog)} when={consultedAt(r.consultado)} rut={r.rut ?? ""} /> : null}
    </>
  );
}

function PersonaReport({ e, when, rut }: { e: ExpedientePersona; when: string | null; rut: string }) {
  const [relato, setRelato] = useState("");
  const servicios = e.prioridades.filter((n) => n.servicio?.disponible);
  return (
    <div className="report cora">
      <div className="report-head">
        <span className="eyebrow">CORA Personas · tu orientación</span>
        <small>{when ? `Generado el ${when}` : null} · según tus respuestas y la normativa vigente · no se guarda</small>
      </div>

      <section className="cora-carta" aria-label="Tu perfil tributario">
        <span className="report-tag">Tu perfil tributario (según lo que nos dijiste)</span>
        <h4>{e.categoria}</h4>
        <dl className="cora-identidad">{e.perfil.map((x) => <div key={x.etiqueta}><dt>{x.etiqueta}</dt><dd>{x.valor}</dd></div>)}</dl>
      </section>

      <section className="cora-eval" aria-label="Evaluación de situación">
        <span className="report-tag">Evaluación de situación</span>
        <ul>{e.situacion.map((x) => <li key={x.tema}><b>{x.tema}</b> <span className="report-note">· {ESTADO_SITUACION[x.estado]}</span><span>{x.detalle}</span></li>)}</ul>
      </section>

      {e.prioridades.length ? (
        <section aria-label="Plan de acción">
          <span className="report-tag">Tu plan de acción: {e.prioridades.length === 1 ? "lo primero" : `las ${e.prioridades.length} prioridades`}</span>
          <ol className="report-recs cora-oport">
            {e.prioridades.map((n) => (
              <li key={n.id} className="lookup-signal">
                <b>{n.necesidad}</b>
                <dl className="cora-oport-dl">
                  <dt>Por qué</dt><dd>{n.evidencia}</dd>
                  {n.consecuencia ? <><dt>Qué está en juego</dt><dd>{n.consecuencia}</dd></> : null}
                  <dt>Próximo paso</dt><dd>{n.proximo}</dd>
                  {n.servicio?.disponible ? <><dt>Con ENQORA</dt><dd>{n.servicio.nombre} · <PriceLine s={n.servicio} /></dd></> : null}
                </dl>
              </li>
            ))}
          </ol>
          {!servicios.length ? <p className="report-note">Aún no hay un servicio publicado para estas prioridades: un profesional ENQORA puede evaluarlas contigo y cotizarlas.</p> : null}
        </section>
      ) : null}

      {e.impacto.length ? (
        <section className="cora-eval" aria-label="Ejemplos de impacto">
          <span className="report-tag">Ejemplos calculados (no son ahorros garantizados)</span>
          <ul>
            {e.impacto.map((i) => (
              <li key={i.titulo}><b>{i.titulo}</b><span>{i.resultado}</span>
                <span className="report-note">Datos: {i.datos} Supuestos: {i.supuestos} Fórmula: {i.formula} Por confirmar: {i.confirmar}</span></li>
            ))}
          </ul>
        </section>
      ) : null}

      {e.obligaciones.length ? (
        <>
          <h4 className="lookup-acts-title">Lo que podrías tener que cumplir y cuándo (según tu perfil)</h4>
          <table className="report-cal">
            <tbody>{e.obligaciones.map((o) => <tr key={o.que}><th scope="row">{o.que}{o.nota ? <small>{o.nota}</small> : null}</th><td>{o.cuando}</td></tr>)}</tbody>
          </table>
        </>
      ) : null}
      {e.beneficios.length ? (
        <>
          <h4 className="lookup-acts-title">Programas que podrían aplicar</h4>
          <ul className="report-insights">
            {e.beneficios.map((b) => <li key={b.nombre}><a href={b.url} target="_blank" rel="noopener noreferrer"><b>{b.nombre}</b></a>. {b.porque} <span className="report-note">Falta confirmar: {b.falta}</span></li>)}
          </ul>
        </>
      ) : null}

      <CasoForm rut={rut} razon="" relato={relato} setRelato={setRelato} objetivos={objetivosOrdenados(e.prioridades.map((n) => n.necesidad))} titulo="Descubramos qué necesita tu negocio: ¿qué quieres conseguir?" />
      <div className="lookup-deep">
        <b>Tu expediente personal</b>
        <span>Con tu cuenta ENQORA, y con tu autorización, un profesional confirma esta orientación con tu Carpeta Tributaria y tus fechas quedan en un calendario con alertas. ENQORA nunca te pedirá tu clave del SII.</span>
        <div className="inline-form">
          <Link href={`/comenzar?servicio=${e.prioridades[0]?.servicio?.categoria ?? "formalizacion"}`} className="btn btn-gold btn-inline btn-sm">Crear mi cuenta gratis</Link>
          <button type="button" className="btn btn-ghost btn-inline btn-sm" onClick={() => window.print()}>Guardar en PDF</button>
        </div>
      </div>
    </div>
  );
}
