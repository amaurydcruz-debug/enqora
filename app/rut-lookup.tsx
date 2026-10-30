"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { lookupRutAction, type LookupState } from "@/app/actions/public";
import { EnqoraClockLoader } from "@/components/clock-loader";
import { salesTrancheLabel, SIGNALS } from "@/lib/public-data";
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
              {r.senales?.length ? (
                <div className="lookup-signals">
                  <h4 className="lookup-acts-title">Lo que conviene revisar</h4>
                  <ul>
                    {r.senales.map((sg) => {
                      const t = SIGNALS[sg.codigo];
                      if (!t) return null;
                      return (
                        <li key={sg.codigo} className={`lookup-signal is-${sg.gravedad}`}>
                          <b>{t.titulo(sg)}</b>
                          <span>{t.detalle(sg)}</span>
                          <Link href={`/ingresar?next=${encodeURIComponent(`/casos/nuevo?modulo=${t.servicio}&asunto=${encodeURIComponent(t.asunto)}`)}`} className="lookup-signal-cta">
                            Quiero solucionarlo →
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <p className="lookup-note">En los datos públicos del SII no aparecen señales de alerta para esta empresa.</p>
              )}
              <div className="lookup-deep">
                <b>¿Es tu empresa? Obtén su hoja de vida tributaria completa.</b>
                <span>
                  Tus declaraciones de IVA y renta y las observaciones del SII no son públicas. Crea tu cuenta, genera tu Carpeta Tributaria
                  Electrónica en sii.cl con tu propia clave (ENQORA nunca te la pide) y súbela: te mostramos qué está al día, qué hay que
                  regularizar y cómo lo resolvemos.
                </span>
                <Link href="/registro" className="btn btn-gold btn-inline btn-sm">Crear mi hoja de vida</Link>
              </div>
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
                Tu consulta puso en marcha el conector de ENQORA con las nóminas públicas del SII. La primera carga toma unos minutos;
                vuelve a consultar este RUT en un rato.
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
