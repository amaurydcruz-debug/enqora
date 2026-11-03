"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PriceLine } from "@/app/diagnostico-360";
import { ESTADOS } from "@/lib/cora/secciones";
import type { Propuesta } from "@/lib/cora/soluciones";

// Propuesta de solución CORA (Motor de Soluciones): planes por etapas con su necesidad, evidencia, beneficio,
// servicio ENQORA (o «Próximamente») y ruta oficial alternativa. La persona decide libremente.
export function PropuestaView({ propuesta }: { propuesta: Propuesta }) {
  return (
    <div className="d360-route cora-propuesta">
      <span className="eyebrow">Propuesta de solución ENQORA</span>
      <b>{propuesta.mensaje}</b>
      {propuesta.planes.map((plan, i) => (
        <details key={plan.key} className="cora-plan" open={i === 0}>
          <summary>
            <span className="report-tag">{i === 0 ? "Recomendado primero" : `Plan ${i + 1}`}</span>
            <b>{plan.nombre}</b>
            <span className="report-note">{plan.objetivo}</span>
          </summary>
          <ol className="cora-etapas">
            {plan.etapas.map(({ orden, necesidad: n }) => (
              <li key={n.id}>
                <span className="report-tag">Etapa {orden}</span>
                <b>{n.necesidad}</b>
                <dl className="cora-dl">
                  <div><dt>Evidencia</dt><dd>{n.evidencia} <span className="report-note">({ESTADOS[n.certeza]} · {n.fuente} · {n.fecha})</span></dd></div>
                  {n.consecuencia ? <div><dt>Si no se atiende</dt><dd>{n.consecuencia}</dd></div> : null}
                  <div><dt>Qué ganas al resolverlo</dt><dd>{n.beneficio}</dd></div>
                  <div><dt>Próximo paso</dt><dd>{n.proximo}</dd></div>
                  {n.documentos ? <div><dt>Documentos necesarios</dt><dd>{n.documentos}</dd></div> : null}
                  {n.servicio ? (
                    <div>
                      <dt>Con ENQORA</dt>
                      <dd>
                        {n.servicio.nombre} · {n.servicio.disponible ? <PriceLine s={n.servicio} /> : <span className="report-price">Próximamente</span>}{" "}
                        <Link href={`/comenzar?servicio=${n.servicio.categoria}`} className="lookup-signal-cta">{n.servicio.disponible ? "Contratar o cotizar →" : "Solicitar contacto →"}</Link>
                      </dd>
                    </div>
                  ) : null}
                  {n.externa ? (
                    <div><dt>O por tu cuenta</dt><dd><a href={n.externa.url} target="_blank" rel="noopener noreferrer">{n.externa.nombre}</a>. {n.externa.nota}</dd></div>
                  ) : null}
                </dl>
              </li>
            ))}
          </ol>
          <span className="report-note">Costo estimado: {plan.costo}.</span>
        </details>
      ))}
      <span className="report-note">
        CORA recomienda lo que conviene a tu situación, no lo más caro. No contratar nada también es una opción: tú decides.
      </span>
    </div>
  );
}

// Investigación en vivo: muestra, uno a uno, los pasos que CORA realmente ejecutó (bitácora real, no simulada).
export function InvestigacionEnVivo({ pasos, children }: { pasos: { agente: string; resultado: string }[]; children: React.ReactNode }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setN(pasos.length + 1); return; }
    const t = setInterval(() => setN((x) => (x > pasos.length ? x : x + 1)), 260);
    return () => clearInterval(t);
  }, [pasos.length]);
  if (n > pasos.length) return <>{children}</>;
  return (
    <div className="cora-live" role="status" aria-live="polite">
      <span className="eyebrow">CORA está investigando</span>
      <b>Cruzando las fuentes oficiales disponibles y la normativa vigente.</b>
      <ol>
        {pasos.slice(0, n).map((p) => <li key={p.agente}><span className="cora-live-dot" aria-hidden="true" /><b>{p.agente}</b> <span>{p.resultado}</span></li>)}
      </ol>
      <button type="button" className="btn btn-ghost btn-inline btn-sm" onClick={() => setN(pasos.length + 1)}>Ver el expediente ahora</button>
    </div>
  );
}
