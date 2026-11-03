"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { consultaCoraAction } from "@/app/actions/cora";
import type { PublicCompany } from "@/app/actions/public";
import { InvestigacionEnVivo, PropuestaView } from "@/app/cora-solucion";
import { PriceLine } from "@/app/diagnostico-360";
import { ExpedienteCora } from "@/app/expediente-cora";
import { investigar } from "@/lib/cora/director";
import { evidenciasDe, MAX_PREGUNTAS, type Evidencia, type Informe, type Turno } from "@/lib/cora/estratega";
import { CAPACIDADES } from "@/lib/cora/estratega";
import type { HallazgoWeb } from "@/lib/cora/web/hallazgos";
import { QUESTIONS, type Answer } from "@/lib/diagnostic-360";
import type { Catalog } from "@/lib/initial-report";

// Consulta Estratégica 360° (CORA): investiga primero, conversa después (una pregunta a la vez, solo si
// resuelve una incertidumbre relevante) y termina con un informe ejecutivo y un plan de acción.
// Nada se guarda: las respuestas viven en esta página.

const OPCIONES: [Answer, string][] = [["si", "Sí"], ["no", "No"], ["no_se", "No sé"], ["ayuda", "Necesito ayuda"]];
const LABEL: Record<Answer, string> = { si: "Sí", no: "No", no_se: "No sé", ayuda: "Necesito ayuda", na: "No aplica" };

export function ConsultaEstrategica({ r }: { r: PublicCompany }) {
  const catalog = (r.catalogo ?? []) as Catalog;
  const [respuestas, setRespuestas] = useState<Record<string, Answer>>({});
  const [turno, setTurno] = useState<Turno | null>(null);
  const [informe, setInforme] = useState<Informe | null>(null);
  const [origen, setOrigen] = useState<"ia" | "reglas" | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [evServidor, setEvServidor] = useState<Evidencia[]>([]);
  const [web, setWeb] = useState<HallazgoWeb[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expediente, setExpediente] = useState(false);
  const exp = useMemo(() => investigar(r, catalog, respuestas, new Date(), web), [r, catalog, respuestas, web]);
  // Las evidencias que cita el estratega son las que armó el servidor (misma numeración que su respuesta).
  const ev = useMemo(() => new Map((evServidor.length ? evServidor : evidenciasDe(exp, respuestas)).map((e) => [e.id, e])), [evServidor, exp, respuestas]);
  const [pasos] = useState(() => exp.bitacora);
  const iniciado = useRef(false);

  async function pedir(fase: "turno" | "informe", resp: Record<string, Answer>) {
    setCargando(true); setError(null);
    const res = await consultaCoraAction({ rut: r.rut ?? "", respuestas: resp, fase }).catch(() => ({ ok: false as const, error: "No pudimos conectar con CORA. Recarga la página e intenta nuevamente." }));
    setCargando(false);
    if (!res.ok) { setError(res.error); return; }
    setOrigen(res.origen);
    setMotivo(res.motivo ?? null);
    setEvServidor(res.evidencias ?? []);
    setWeb(res.web ?? []);
    if (res.fase === "turno") {
      setTurno(res.turno);
      if (!res.turno.pregunta_id) await pedir("informe", resp);
    } else setInforme(res.informe);
  }

  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;
    void pedir("turno", {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const responder = (id: string, a: Answer) => {
    const nuevo = { ...respuestas, [id]: a };
    setRespuestas(nuevo);
    if (Object.keys(nuevo).length >= MAX_PREGUNTAS) void pedir("informe", nuevo);
    else void pedir("turno", nuevo);
  };

  const pregunta = turno?.pregunta_id ? QUESTIONS.find((q) => q.id === turno.pregunta_id) : null;
  const preguntaVista = pregunta ? exp.preguntas.find((q) => q.id === pregunta.id) ?? pregunta : null;
  const historial = Object.entries(respuestas).map(([id, a]) => ({ q: QUESTIONS.find((x) => x.id === id)?.q ?? id, a }));

  const Evidencias = ({ ids }: { ids: string[] }) => (
    <details className="cora-evid">
      <summary>Evidencia ({ids.length})</summary>
      <ul>{ids.map((id) => ev.get(id)).filter(Boolean).map((e) => <li key={e!.id}>{e!.texto} <span className="report-note">· {e!.fuente}{e!.fecha ? ` · ${e!.fecha}` : ""}</span></li>)}</ul>
    </details>
  );

  return (
    <InvestigacionEnVivo pasos={pasos}>
      <div className="report cora consulta">
        <div className="report-head">
          <span className="eyebrow">CORA · Consulta estratégica 360°</span>
          <small>
            {origen === "ia" ? "Análisis del estratega CORA, validado con evidencias" : origen === "reglas" ? `Análisis por reglas: el estratega IA no estuvo disponible${motivo ? ` (${motivo})` : ""}` : "Preparando el análisis…"}
            {" "}· expediente {exp.completitud.pct}% completo · no se guarda
          </small>
        </div>

        {error ? <p className="lookup-error" role="alert">{error}</p> : null}

        {turno ? (
          <>
            <div className="report-verdict">
              <span className="report-tag">Lo que CORA encontró</span>
              <b>{turno.apertura}</b>
            </div>
            {turno.descubrimientos.length ? (
              <ol className="report-recs">
                {turno.descubrimientos.map((d) => (
                  <li key={d.titulo} className="lookup-signal">
                    <b>{d.titulo}</b>
                    <span>{d.por_que_importa}</span>
                    <Evidencias ids={d.evidencias} />
                  </li>
                ))}
              </ol>
            ) : null}
          </>
        ) : null}

        {!informe ? (
          <div className="cora-chat">
            {historial.map((h) => (
              <div key={h.q} className="cora-turn">
                <span className="cora-q">{h.q}</span>
                <span className="cora-a">{LABEL[h.a]}</span>
              </div>
            ))}
            {cargando ? <p className="report-note" role="status">CORA está analizando…</p> : preguntaVista ? (
              <fieldset className="cora-ask">
                {turno?.contexto ? <span className="report-note">{turno.contexto}</span> : null}
                <legend>{preguntaVista.q}</legend>
                {preguntaVista.ayuda ? <small className="d360-help">{preguntaVista.ayuda}</small> : null}
                <div className="natural-opts">
                  {[...OPCIONES, ...(preguntaVista.noAplica ? [["na", preguntaVista.noAplica] as [Answer, string]] : [])].map(([v, label]) => (
                    <button key={v} type="button" className="natural-opt" onClick={() => responder(preguntaVista.id, v)}>{label}</button>
                  ))}
                </div>
                <button type="button" className="btn btn-ghost btn-inline btn-sm" onClick={() => void pedir("informe", respuestas)}>Ver mi informe ahora</button>
                <span className="report-note">Pregunta {historial.length + 1} de un máximo de {MAX_PREGUNTAS}. Solo preguntamos lo que no aparece en fuentes públicas.</span>
              </fieldset>
            ) : null}
          </div>
        ) : (
          <InformeView informe={informe} exp={exp} Evidencias={Evidencias} />
        )}

        {informe ? (
          <>
            <details className="report-detail" open={expediente} onToggle={(e) => setExpediente((e.target as HTMLDetailsElement).open)}>
              <summary>Ver el expediente completo (16 secciones, fuentes y normativa)</summary>
              {expediente ? <ExpedienteCora p={r} catalog={catalog} onClose={() => setExpediente(false)} embebido respuestas={respuestas} /> : null}
            </details>
            <div className="lookup-deep">
              <b>Próximos pasos</b>
              <span>Elige el primer paso de tu plan. Solicitar atención no tiene costo ni compromiso, y también puedes avanzar por la ruta oficial indicada.</span>
              <span className="report-note">
                CORA usa solo fuentes públicas y lo que tú respondes. «Sin resultados localizados» no significa que algo no exista. Las conclusiones legales,
                laborales o tributarias de alto impacto las confirma un profesional ENQORA. ENQORA nunca te pedirá claves del SII, Previred, AFC ni bancos.
              </span>
              <div className="inline-form">
                <Link href={`/comenzar?servicio=${exp.necesidades[0]?.servicio?.categoria ?? "contabilidad"}`} className="btn btn-gold btn-inline btn-sm">Crear mi cuenta gratis</Link>
                <button type="button" className="btn btn-ghost btn-inline btn-sm" onClick={() => window.print()}>Guardar en PDF</button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </InvestigacionEnVivo>
  );
}

function InformeView({ informe, exp, Evidencias }: { informe: Informe; exp: ReturnType<typeof investigar>; Evidencias: (p: { ids: string[] }) => React.ReactNode }) {
  const nec = new Map(exp.necesidades.map((n) => [n.id, n]));
  const plan = informe.prioridades.map((p) => ({ ...p, n: nec.get(p.necesidad_id)! })).filter((x) => x.n);
  const normas = exp.secciones.flatMap((s) => (s.obligaciones ?? []).filter((o) => o.aplicacion === "potencial"));
  const Lista = ({ titulo, items }: { titulo: string; items: { texto: string; evidencias: string[] }[] }) => (items.length ? (
    <section className="elite-sec">
      <h4 className="lookup-acts-title">{titulo}</h4>
      <ul className="report-insights">{items.map((i) => <li key={i.texto}>{i.texto} <Evidencias ids={i.evidencias} /></li>)}</ul>
    </section>
  ) : null);

  return (
    <div className="elite">
      <section className="elite-sec elite-lead">
        <span className="eyebrow">Resumen estratégico</span>
        <b>{informe.resumen_estrategico}</b>
        <span>{informe.situacion}</span>
      </section>

      {informe.oportunidades_perdidas.length ? (
        <section className="elite-sec elite-loss">
          <span className="eyebrow">Lo que podrías estar dejando pasar</span>
          <ul className="report-insights">{informe.oportunidades_perdidas.map((o) => <li key={o.texto}>{o.texto} <Evidencias ids={o.evidencias} /></li>)}</ul>
        </section>
      ) : null}

      <section className="elite-sec elite-enqora">
        <span className="eyebrow">Tu empresa con ENQORA</span>
        <b>{informe.propuesta_enqora}</b>
        {informe.capacidades.length ? (
          <ul className="elite-caps">{informe.capacidades.map((c) => <li key={c}>{CAPACIDADES[c]}</li>)}</ul>
        ) : null}
      </section>

      <section className="d360-route">
        <span className="eyebrow">Plan de acción priorizado</span>
        <b>{plan.length ? "Lo que recomendamos atender primero, y por qué." : "Con la información disponible no hay acciones urgentes: hoy no necesitas contratar nada."}</b>
        {plan.length ? (
          <ol className="report-recs">
            {plan.map(({ n, por_que }, i) => (
              <li key={n.id} className="lookup-signal">
                <span className="report-tag">Paso {i + 1}</span>
                <b>{n.necesidad}</b>
                <span>{por_que}</span>
                <span className="report-note">Qué ganas: {n.beneficio}</span>
                {n.documentos ? <span className="report-note">Documentos: {n.documentos}</span> : null}
                {n.servicio ? (
                  <span>{n.servicio.nombre} · {n.servicio.disponible ? <PriceLine s={n.servicio} /> : <span className="report-price">Próximamente</span>}{" "}
                    <Link href={`/comenzar?servicio=${n.servicio.categoria}`} className="lookup-signal-cta">{n.servicio.disponible ? "Contratar o cotizar →" : "Solicitar contacto →"}</Link>
                  </span>
                ) : null}
                {n.externa ? <span className="report-note">O por tu cuenta: <a href={n.externa.url} target="_blank" rel="noopener noreferrer">{n.externa.nombre}</a>. {n.externa.nota}</span> : null}
              </li>
            ))}
          </ol>
        ) : null}
      </section>

      <Lista titulo="Hallazgos verificados" items={informe.hallazgos_verificados} />
      <Lista titulo="Fortalezas y ventajas" items={informe.fortalezas} />
      {informe.oportunidades.length ? (
        <section className="elite-sec">
          <h4 className="lookup-acts-title">Oportunidades descubiertas</h4>
          <ul className="report-insights">
            {informe.oportunidades.map((o) => (
              <li key={o.titulo}><b>{o.titulo}</b> <span className="report-tag report-tag-muted">{o.estado === "confirmada" ? "Confirmada" : "Por confirmar"}</span> {o.explicacion} <Evidencias ids={o.evidencias} /></li>
            ))}
          </ul>
        </section>
      ) : null}
      <Lista titulo="Necesidades confirmadas" items={informe.necesidades_confirmadas} />
      {informe.riesgos.length ? (
        <section className="elite-sec">
          <h4 className="lookup-acts-title">Riesgos y posibles consecuencias</h4>
          <ul className="report-insights">{informe.riesgos.map((x) => <li key={x.texto}>{x.texto} <span className="report-note">Fundamento: {x.fundamento}</span> <Evidencias ids={x.evidencias} /></li>)}</ul>
        </section>
      ) : null}
      {normas.length ? (
        <section className="elite-sec">
          <h4 className="lookup-acts-title">Fundamento normativo</h4>
          <ul className="report-insights">
            {normas.map((o) => <li key={o.id}><b>{o.nombre}</b>: <a href={o.fuente.url} target="_blank" rel="noopener noreferrer">{o.fundamento}</a>. <span className="report-note">Potencialmente aplicable · {o.datos}</span></li>)}
          </ul>
        </section>
      ) : null}
      {informe.pendientes.length ? (
        <section className="elite-sec">
          <h4 className="lookup-acts-title">Información pendiente de confirmar</h4>
          <ul className="report-check">{informe.pendientes.map((p) => <li key={p}>{p}</li>)}</ul>
        </section>
      ) : null}
      <details className="report-detail">
        <summary>Cómo ENQORA puede ayudar: todas las soluciones por plan</summary>
        <PropuestaView propuesta={exp.propuesta} />
      </details>
    </div>
  );
}
