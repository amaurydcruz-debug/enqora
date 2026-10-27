import Link from "next/link";
import { Accordion, type AccordionItem } from "@/components/accordion";
import { Emblem } from "@/components/emblems";
import { benefitsFor, type Profile } from "@/lib/benefits";
import { institution } from "@/lib/institutions";
import { ENTRIES, LIFECYCLE, PROBLEMS, RUBROS, type Rubro } from "@/lib/rubros";

// Portal de entrada (M16): cuatro puertas según quién eres. Cada una se despliega por tipo de
// negocio con los requisitos, las instituciones y los beneficios que podrían aplicar. Todo lleva
// al mismo motor existente: /comenzar → registro o diagnóstico → caso con su módulo.

const stageName = (k: string) => LIFECYCLE.find((s) => s.key === k)?.titulo ?? k;

function RubroDetail({ r, profile }: { r: Rubro; profile: Profile }) {
  const stages = profile === "idea" ? ["constitucion", "tributaria", "local", "inicio"] : ["tributaria", "local", "operacion", "crecimiento"];
  const reqs = r.requisitos.filter((q) => stages.includes(q.etapa));
  const benefits = benefitsFor(profile, r.key);
  return (
    <details className="rubro">
      <summary>
        <span className="rubro-name"><b>{r.nombre}</b><small>{r.ejemplos}</small></span>
        <span className="rubro-count">{reqs.length} requisitos</span>
      </summary>
      <div className="rubro-body">
        <ul className="req-list" role="list">
          {reqs.map((q, i) => {
            const inst = institution(q.institucion);
            return (
              <li key={i}>
                <span className="req-stage">{stageName(q.etapa)}</span>
                <span className="req-main">
                  <b>{q.tramite}</b>
                  <small>{inst ? `${inst.sigla} · ` : ""}{q.cuando}</small>
                </span>
                {q.url ? <a href={q.url} target="_blank" rel="noopener noreferrer" className="req-src">Fuente</a> : null}
              </li>
            );
          })}
        </ul>
        {r.riesgos.length ? (
          <div className="rubro-risks">
            <h5>Lo que más se escapa en este rubro</h5>
            <ul>{r.riesgos.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        ) : null}
        {benefits.length ? (
          <div className="rubro-benefits">
            <h5>Ayudas y beneficios que podrían corresponderte</h5>
            <ul>
              {benefits.map((b) => (
                <li key={b.id}>
                  <a href={b.url} target="_blank" rel="noopener noreferrer"><b>{b.nombre}</b></a> <small>· {institution(b.institucion)?.sigla}</small>
                  <span>{b.entrega}</span>
                </li>
              ))}
            </ul>
            <p className="muted-line">Las convocatorias cambian cada año: revisamos las bases vigentes y tus requisitos antes de postular. Ningún beneficio está garantizado.</p>
          </div>
        ) : null}
        <div className="panel-actions">
          <Link href={`/comenzar?servicio=${r.categoria}`} className="btn btn-gold btn-inline btn-sm">Comenzar mi ruta: {r.nombre.toLowerCase()}</Link>
        </div>
      </div>
    </details>
  );
}

export function Portal() {
  const items: AccordionItem[] = ENTRIES.map((e) => ({
    id: `perfil-${e.key}`,
    title: e.titulo,
    description: e.lead,
    emblem: <Emblem name={e.emblem} size="md" />,
    content: e.key === "problema" ? (
      <div className="portal-body">
        <p className="panel-lead">Elige tu situación. No necesitas saber si es contable, legal o municipal: ENQORA identifica la ruta.</p>
        <ul className="problem-grid" role="list">
          {PROBLEMS.map((p) => (
            <li key={p.key}>
              <Link href={p.categoria ? `/comenzar?servicio=${p.categoria}` : "/comenzar"} className="problem-card">
                <Emblem name={p.emblem} size="sm" />
                <span><b>{p.titulo}</b><small>{p.detalle}</small></span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    ) : (
      <div className="portal-body">
        <div className="portal-intro">
          <ul className="cat-solves">{e.incluye.map((x) => <li key={x}>{x}</li>)}</ul>
          <p className="portal-result"><b>Resultado:</b> {e.resultado}</p>
        </div>
        <ol className="lifecycle" aria-label="Etapas de tu ruta">
          {LIFECYCLE.filter((s) => e.etapas.includes(s.key)).map((s) => (
            <li key={s.key}><span>{s.n}</span><b>{s.titulo}</b><small>{s.detalle}</small></li>
          ))}
        </ol>
        {e.key === "enterprise" ? (
          <div className="panel-actions">
            <Link href="/comenzar?servicio=enterprise" className="btn btn-gold btn-inline">Conversar sobre ENQORA Enterprise</Link>
            <span className="muted-line">Un profesional revisa tu caso y te propone el alcance antes de cualquier cobro.</span>
          </div>
        ) : (
          <>
            <h4 className="sub-title">Elige tu tipo de negocio</h4>
            <div className="rubro-list">
              {RUBROS.map((r) => <RubroDetail key={r.key} r={r} profile={e.key as Profile} />)}
            </div>
            <p className="muted-line">¿Tu negocio no aparece? <Link href={`/comenzar?servicio=${e.key === "idea" ? "constitucion" : "contabilidad"}`}>Cuéntanos tu caso</Link> y lo diagnosticamos.</p>
          </>
        )}
      </div>
    ),
  }));

  return (
    <section className="welcome-portal" id="perfil" aria-labelledby="perfil-titulo">
      <span className="eyebrow">02 · Tu camino</span>
      <h2 id="perfil-titulo">¿Quién eres?</h2>
      <p className="welcome-lead">Elige cómo llegas a ENQORA. Verás la ruta, los trámites y las ayudas que corresponden a tu tipo de negocio.</p>
      <Accordion label="Perfiles" variant="tiles" items={items} className="portal-gallery" />
    </section>
  );
}
