"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CasoForm } from "@/app/cora-caso";
import { identidadEmpresa, objetivosOrdenados } from "@/lib/cora/caso";
import { respuestaDesdeVoz } from "@/lib/voz/interpretar";
import { activarModoVoz, escuchar, hablar, modoVozActivo, useModoVoz } from "@/lib/voz/navegador";
import { consultaCoraAction } from "@/app/actions/cora";
import type { PublicCompany } from "@/app/actions/public";
import { InvestigacionEnVivo, PropuestaView } from "@/app/cora-solucion";
import { PriceLine } from "@/app/diagnostico-360";
import { ExpedienteCora } from "@/app/expediente-cora";
import { investigar } from "@/lib/cora/director";
import { CAPACIDADES, evidenciasDe, MAX_PREGUNTAS, TIPOS_HALLAZGO, type Evidencia, type Informe, type Turno } from "@/lib/cora/estratega";
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
  const [verDiag, setVerDiag] = useState(false);
  const [relato, setRelato] = useState("");
  const exp = useMemo(() => investigar(r, catalog, respuestas, new Date(), web), [r, catalog, respuestas, web]);
  // Las evidencias que cita el estratega son las que armó el servidor (misma numeración que su respuesta).
  const ev = useMemo(() => new Map((evServidor.length ? evServidor : evidenciasDe(exp, respuestas)).map((e) => [e.id, e])), [evServidor, exp, respuestas]);
  const [pasos] = useState(() => exp.bitacora);
  const identidad = useMemo(() => identidadEmpresa(r, exp), [r, exp]);
  // Evaluación de situación por área: una línea por área, sin repetir las oportunidades.
  const evaluacion = useMemo(() => {
    const NIVEL: Record<string, string> = { solido: "Hecho confirmado", atencion: "Hipótesis pendiente", prioritario: "Riesgo potencial" };
    const base = exp.secciones.filter((x) => x.nivel !== "sin_info" && x.key !== "identidad").map((x) => ({
      area: x.nombre,
      clase: x.key === "laboral" && x.obligaciones?.some((o) => o.aplicacion === "potencial") ? "Obligación verificada"
        : x.key === "crecimiento" && x.nivel !== "sin_info" ? "Oportunidad detectada" : NIVEL[x.nivel] ?? "Información insuficiente",
      texto: (x.nivel === "solido" ? x.encontrado[0] : x.falta[0] ?? x.encontrado[0] ?? "").replace(/\. Fuente:.*$/, "."),
    })).filter((f) => f.texto);
    // Áreas con el mismo texto se agrupan en una sola línea (sin repetir).
    const filas: typeof base = [];
    for (const f of base) {
      const g = filas.find((x) => x.texto === f.texto);
      if (g) g.area = `${g.area.replace(/ y ([^,]+)$/, ", $1")} y ${f.area}`; else filas.push({ ...f });
    }
    const sinInfo = exp.secciones.filter((x) => x.nivel === "sin_info").map((x) => x.nombre);
    return { filas: filas.slice(0, 6), sinInfo };
  }, [exp]);
  // Servicios: solo los activos en el catálogo y ligados a una necesidad identificada (uno por servicio).
  const servicios = useMemo(() => {
    const vistos = new Set<string>();
    return exp.necesidades.filter((n) => n.servicio?.disponible && !vistos.has(n.servicio.id) && vistos.add(n.servicio.id)).slice(0, 3);
  }, [exp]);
  const objetivos = useMemo(() => objetivosOrdenados([...(turno?.descubrimientos ?? []).map((d) => `${d.titulo} ${d.hallazgo ?? ""}`), ...exp.necesidades.map((n) => n.necesidad)]), [turno, exp]);
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

  // ── Modo voz (piloto): CORA lee lo esencial de cada turno, escucha la respuesta y avanza. Todo sigue en pantalla. ──
  const voz = useModoVoz();
  const hablado = useRef("");
  const cartaHablada = useRef(false);
  // Primer turno por voz: CORA lee la identidad, el resumen y las oportunidades, y pregunta qué quiere conseguir.
  useEffect(() => {
    if (!voz.activo || cartaHablada.current || informe || !turno) return;
    cartaHablada.current = true;
    void (async () => {
      const id = identidad.filter((d) => ["Constitución", "Inicio de actividades", "Situación"].includes(d.etiqueta)).map((d) => `${d.etiqueta}: ${d.valor}.`);
      const op = turno.descubrimientos.map((d, i) => `${i + 1}. ${d.titulo}.`);
      await hablar([`${exp.empresa.razon}.`, ...id, turno.apertura, op.length ? `Oportunidades identificadas: ${op.join(" ")}` : "",
        "Conozcamos qué quieres conseguir con tu empresa. Cuéntamelo con tus palabras."].filter(Boolean).join(" "));
      if (!modoVozActivo()) return;
      const txt = await escuchar(20_000);
      if (txt) {
        setRelato(txt);
        await hablar("Gracias, ya lo anoté. Ahora escribe tu nombre y elige si quieres la respuesta por WhatsApp o por correo.");
      } else if (txt === "") {
        await hablar("Puedes escribirlo en pantalla, o tocar Dictar por voz.");
      }
      activarModoVoz(false);
      setTimeout(() => { const el = document.getElementById("caso-nombre"); el?.scrollIntoView({ block: "center", behavior: "smooth" }); el?.focus(); }, 150);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voz.activo, turno]);
  useEffect(() => {
    if (!voz.activo || cargando || !verDiag) return;
    const clave = informe ? "informe" : turno && preguntaVista ? `t:${preguntaVista.id}:${historial.length}` : "";
    if (!clave || hablado.current === clave) return;
    hablado.current = clave;
    void (async () => {
      if (informe) {
        const oport = informe.oportunidades_perdidas[0]?.texto;
        await hablar([informe.resumen_estrategico, oport ? `Lo más importante que podrías estar dejando pasar: ${oport}` : "", informe.propuesta_enqora,
          "Te dejé el informe completo en pantalla. Si quieres aprovechar estos beneficios, toca Crear mi cuenta gratis."].filter(Boolean).join(" "));
        activarModoVoz(false);
        return;
      }
      if (!turno || !preguntaVista) return;
      const primera = historial.length === 0;
      const opciones = `Puedes decir sí, no, no sé o necesito ayuda${preguntaVista.noAplica ? `, o ${preguntaVista.noAplica.toLowerCase()}` : ""}.`;
      const guion = [
        primera ? turno.apertura : "Gracias.",
        primera ? "Para afinar tu plan, una pregunta." : "",
        preguntaVista.q, opciones,
      ].filter(Boolean).join(" ");
      let decir = guion;
      for (let intento = 0; intento < 3 && modoVozActivo(); intento++) {
        await hablar(decir);
        if (!modoVozActivo()) return;
        const txt = await escuchar(9000);
        if (txt === null) { activarModoVoz(false); return; }
        const cmd = respuestaDesdeVoz(txt, preguntaVista.noAplica);
        if (cmd === "informe") { void pedir("informe", respuestas); return; }
        if (cmd === "texto") { activarModoVoz(false); return; }
        if (cmd === "repetir") { decir = `${preguntaVista.q} ${opciones}`; continue; }
        if (cmd) { responder(preguntaVista.id, cmd); return; }
        decir = txt ? `No te entendí bien. ${preguntaVista.q} ${opciones}` : `No te escuché. ${preguntaVista.q} ${opciones}`;
      }
      if (modoVozActivo()) { await hablar("Seguimos en pantalla: elige tu respuesta con los botones."); activarModoVoz(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voz.activo, cargando, turno, informe, preguntaVista?.id, historial.length, verDiag]);

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

        {!informe ? (
          <>
            {/* A · Identidad empresarial: solo antecedentes encontrados */}
            <section className="cora-carta" aria-label="Identidad empresarial">
              <span className="report-tag">Identidad empresarial</span>
              <h4>{exp.empresa.razon}</h4>
              <dl className="cora-identidad">
                {identidad.map((d) => (
                  <div key={d.etiqueta}><dt>{d.etiqueta}</dt><dd>{d.valor} <span className="report-note">· {d.fuente}</span></dd></div>
                ))}
              </dl>
            </section>

            {/* B · Resumen estratégico */}
            <div className="report-verdict">
              <span className="report-tag">Resumen estratégico</span>
              <b>{turno ? turno.apertura : cargando ? "CORA está cruzando la información encontrada…" : "Preparando el análisis…"}</b>
            </div>

            {/* C · Oportunidades identificadas (solo con evidencia; hasta 3) */}
            {turno?.descubrimientos.length ? (
              <section aria-label="Oportunidades identificadas">
                <span className="report-tag">Oportunidades identificadas en tu empresa</span>
                <ol className="report-recs cora-oport">
                  {turno.descubrimientos.map((d) => (
                    <li key={d.titulo} className="lookup-signal">
                      <span className="cora-oport-head"><b>{d.titulo}</b>{d.tipo ? <span className={`status status-${d.tipo === "riesgo" ? "risk" : d.tipo === "hecho" || d.tipo === "obligacion" ? "ok" : d.tipo === "oportunidad" ? "gold" : "muted"}`}>{TIPOS_HALLAZGO[d.tipo]}</span> : null}</span>
                      <dl className="cora-oport-dl">
                        {d.hallazgo ? <><dt>Evidencia y fuente</dt><dd>{d.hallazgo}</dd></> : null}
                        <dt>Por qué es relevante</dt><dd>{d.por_que_importa}</dd>
                        {d.en_juego ? <><dt>Beneficio potencial</dt><dd>{d.en_juego}</dd></> : null}
                        {d.falta ? <><dt>Qué falta confirmar</dt><dd>{d.falta}</dd></> : null}
                        {d.con_enqora ? <><dt>Cómo ayuda ENQORA</dt><dd>{d.con_enqora}</dd></> : null}
                        {d.proximo ? <><dt>Próximo paso</dt><dd>{d.proximo}</dd></> : null}
                      </dl>
                      <Evidencias ids={d.evidencias} />
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            {/* D · Evaluación de situación por área */}
            {turno && (evaluacion.filas.length || evaluacion.sinInfo.length) ? (
              <section aria-label="Evaluación de situación" className="cora-eval">
                <span className="report-tag">Evaluación de situación</span>
                <ul>
                  {evaluacion.filas.map((f) => <li key={f.area}><b>{f.area}</b> <span className="report-note">· {f.clase}</span><span>{f.texto}</span></li>)}
                  {evaluacion.sinInfo.length ? <li><b>Información insuficiente</b><span>{evaluacion.sinInfo.join(", ")}: no hay datos públicos suficientes para evaluarlo.</span></li> : null}
                </ul>
              </section>
            ) : null}

            {/* E · Servicios ENQORA ligados a una necesidad (solo activos en el catálogo) */}
            {turno ? (
              <section aria-label="Servicios ENQORA" className="cora-eval">
                <span className="report-tag">Servicios ENQORA para lo que encontramos</span>
                {servicios.length ? (
                  <ul>
                    {servicios.map((n) => (
                      <li key={n.servicio!.id}><b>{n.servicio!.nombre}</b><span>Para: {n.necesidad}</span><PriceLine s={n.servicio!} /></li>
                    ))}
                  </ul>
                ) : <p className="report-note">Aún no hay un servicio publicado que calce exactamente con lo encontrado. Un profesional ENQORA puede evaluarlo contigo y cotizarlo.</p>}
              </section>
            ) : null}

            {/* F · Cierre estratégico */}
            <CasoForm rut={r.rut ?? ""} razon={r.razon_social ?? ""} relato={relato} setRelato={setRelato} objetivos={objetivos} />
            {!verDiag ? (
              <button type="button" className="btn btn-ghost btn-inline btn-sm cora-diag-btn" onClick={() => setVerDiag(true)}>
                ¿Prefieres un diagnóstico guiado? Responde hasta 5 preguntas y CORA arma tu plan
              </button>
            ) : null}
          </>
        ) : null}

        {!informe ? (verDiag ? (
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
                <div className="cora-progress" aria-hidden="true"><span style={{ width: `${Math.round(((historial.length) / MAX_PREGUNTAS) * 100)}%` }} /></div>
                <span className="report-note">
                  Pregunta {historial.length + 1} de un máximo de {MAX_PREGUNTAS}. Cada respuesta afina tu plan; solo preguntamos lo que no aparece en fuentes públicas.
                </span>
              </fieldset>
            ) : null}
          </div>
        ) : null) : (
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
