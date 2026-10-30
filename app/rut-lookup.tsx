"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { lookupRutAction, type LookupState } from "@/app/actions/public";
import { EnqoraClockLoader } from "@/components/clock-loader";
import { buildInitialReport } from "@/lib/initial-report";
import { salesTrancheLabel } from "@/lib/public-data";
import type { PublicCompany } from "@/app/actions/public";
import { formatRut, isValidRut } from "@/lib/rut";

const fmtDate = (d?: string | null) =>
  d ? new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`)) : null;

// 01 · Primer contacto y 02 · Demostración de capacidad: hoja de vida pública de una empresa
// (persona jurídica) por su RUT, desde las nóminas oficiales del SII que el conector mantiene al día,
// con señales objetivas y la solución ENQORA para cada una.
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
              : "Ingresa el RUT de una empresa para consultar.");
          } else setLocalError(null);
        }}
      >
        <label htmlFor="rut" className="lookup-label">RUT de la empresa</label>
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
            : "Consulta disponible para empresas (personas jurídicas). Usamos solo información pública del SII."}
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
                <div className="lookup-acts">
                  <h4 className="lookup-acts-title">Actividades económicas vigentes{r.total_actividades && r.total_actividades > r.actividades.length ? ` (${r.actividades.length} de ${r.total_actividades})` : ""}</h4>
                  <ul>
                    {r.actividades.map((a) => <li key={a.codigo}><span className="mono">{a.codigo}</span> {a.descripcion}</li>)}
                  </ul>
                </div>
              ) : null}
              <InitialReportView r={r} />
            </>
          ) : r.estado === "no_encontrada" ? (
            <>
              <h3>No encontramos esta empresa</h3>
              <p className="lookup-note">
                El RUT {formatRut(r.rut ?? "")} no aparece en la nómina pública de personas jurídicas del SII. Si es el RUT de una
                persona, esta consulta no aplica: ENQORA no consulta información de personas naturales.
              </p>
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
          {r.estado !== "sin_datos" ? (
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
            <span>¿Qué necesita esta empresa?</span>
            <Link href="#servicios" className="btn btn-ghost btn-inline btn-sm">Explorar servicios</Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}

const clp = (n: number) => `$${n.toLocaleString("es-CL")}`;
const PRIO = { alta: ["is-alta", "Prioridad alta"], media: ["is-media", "Atención"], baja: ["is-baja", "Oportunidad"] } as const;

// Informe inicial: lo verificado, lo que falta comprobar, recomendaciones con su servicio y próximos pasos.
function InitialReportView({ r }: { r: PublicCompany }) {
  const rep = buildInitialReport(r, r.catalogo ?? []);
  const first = rep.recomendaciones[0];
  const when = r.consultado
    ? new Intl.DateTimeFormat("es-CL", { dateStyle: "long", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(r.consultado))
    : null;
  return (
    <div className="report">
      <div className="report-head">
        <span className="eyebrow">Informe inicial ENQORA</span>
        <small>{when ? `Consultado el ${when}` : null}{rep.completo ? "" : " · carga de nóminas del SII en curso: el informe se completará"}</small>
      </div>

      <h4 className="lookup-acts-title">Recomendaciones priorizadas</h4>
      <ol className="report-recs">
        {rep.recomendaciones.map((x) => (
          <li key={x.id} className={`lookup-signal ${PRIO[x.prioridad][0]}`}>
            <div className="report-tags">
              <span className="report-tag">{PRIO[x.prioridad][1]}</span>
              <span className="report-tag report-tag-muted">{x.tipo === "verificado" ? "Consta en el SII" : "Por confirmar"}</span>
            </div>
            <b>{x.titulo}</b>
            <details className="report-detail">
              <summary>Ver el detalle</summary>
              <dl>
                <div><dt>Qué observamos</dt><dd>{x.observado}</dd></div>
                <div><dt>Por qué importa</dt><dd>{x.importa}</dd></div>
                <div><dt>Qué falta confirmar</dt><dd>{x.falta}</dd></div>
                <div><dt>Qué recomienda ENQORA</dt><dd>{x.accion}</dd></div>
              </dl>
            </details>
            <span className="report-service">
              {x.servicio.nombre} ·{" "}
              {x.servicio.precio === 0 ? "Sin costo" : x.servicio.precio ? `desde ${clp(x.servicio.precio)} (tarifa vigente)` : "requiere evaluación previa"}
            </span>
            <Link href={`/comenzar?servicio=${x.servicio.categoria}`} className="lookup-signal-cta">Resolverlo con ENQORA →</Link>
          </li>
        ))}
      </ol>

      <h4 className="lookup-acts-title">Lo que aún debe comprobarse</h4>
      <ul className="report-check">
        {rep.porComprobar.map((c) => <li key={c.tema}><b>{c.tema}</b> <span>· {c.como}</span></li>)}
      </ul>

      <div className="lookup-deep">
        <b>Próximos pasos</b>
        <ol className="report-steps">{rep.proximas.map((p) => <li key={p}>{p}</li>)}</ol>
        <span className="report-note">
          Informe preliminar basado solo en datos públicos del SII. No afirma deudas ni incumplimientos: los confirma un profesional
          ENQORA con la información de la empresa. ENQORA nunca te pedirá la clave del SII.
        </span>
        <div className="inline-form">
          <Link href={`/comenzar?servicio=${first?.servicio.categoria ?? "contabilidad"}`} className="btn btn-gold btn-inline btn-sm">Crear mi cuenta y comenzar</Link>
          <button type="button" className="btn btn-ghost btn-inline btn-sm" onClick={() => window.print()}>Imprimir o guardar en PDF</button>
        </div>
      </div>
    </div>
  );
}
