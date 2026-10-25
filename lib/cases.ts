import { Disclosure, FactTag } from "@/components/disclosure";
import { IconActivity, IconCheck, IconDocument, IconShield, IconUsers } from "@/components/icons";
import { AGENT_KEYS, AGENTS, mirrorState, STAGES, type MirrorStep } from "@/lib/mirror";

// Explorar el análisis: preguntas que el cliente puede abrir bajo demanda.
// Solo aparecen las que corresponden a su caso y todo sale de datos reales registrados.
const STATE_LABEL = { inactivo: "En espera", trabajando: "Trabajando", completado: "Completado", revision: "Espera autorización" } as const;

export function MirrorExplore({
  caseId,
  caseStatus,
  steps,
  documents,
  pendingAuthorizations,
}: {
  caseId: string;
  caseStatus: string;
  steps: MirrorStep[];
  documents: { id: string; file_name: string }[];
  pendingAuthorizations: number;
}) {
  const { agents, current } = mirrorState(steps, caseStatus);
  const working = steps.filter((s) => s.status === "trabajando");
  const review = steps.filter((s) => s.status === "revision");
  const lastByAgent = new Map(steps.map((s) => [s.agent, s] as const));
  const active = AGENT_KEYS.filter((k) => agents[k] !== "inactivo");
  const counts = {
    trabajando: AGENT_KEYS.filter((k) => agents[k] === "trabajando").length,
    completado: AGENT_KEYS.filter((k) => agents[k] === "completado").length,
  };

  return (
    <section className="zone" aria-label="Explorar el análisis">
      <h2 className="zone-title">Explora el análisis</h2>
      <div className="disclosures">
        <Disclosure
          icon={<IconActivity size={18} />}
          title="¿Qué está investigando ENQORA?"
          summary={`Etapa actual: ${STAGES[current].label}`}
          tone="blue"
        >
          {working.length ? (
            <ul className="explore-list">
              {working.map((s) => (
                <li key={s.id}>
                  <b>{s.title}</b>
                  <small>{AGENTS[s.agent]?.name ?? s.agent}{s.detail ? ` · ${s.detail}` : ""}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="disc-lead">En este momento no hay tareas de análisis en curso. {STAGES[current].message}</p>
          )}
        </Disclosure>

        <Disclosure
          icon={<IconDocument size={18} />}
          title="¿Qué documentos está revisando?"
          summary={documents.length ? (documents.length === 1 ? "1 documento en el expediente" : `${documents.length} documentos en el expediente`) : "Aún no hay documentos"}
          tone="blue"
        >
          {documents.length ? (
            <ul className="explore-list">
              {documents.slice(0, 12).map((d) => (
                <li key={d.id}><a href={`/casos/${caseId}/documentos/${d.id}`} target="_blank" rel="noopener">{d.file_name}</a></li>
              ))}
              {documents.length > 12 ? <li><a href={`/casos/${caseId}#documentos`}>Ver el expediente completo</a></li> : null}
            </ul>
          ) : (
            <p className="disc-lead">Puedes subir antecedentes desde el expediente del caso.</p>
          )}
        </Disclosure>

        {active.length ? (
          <Disclosure
            icon={<IconUsers size={18} />}
            title="¿Qué agentes están trabajando?"
            summary={[counts.trabajando ? `${counts.trabajando} trabajando` : null, counts.completado ? `${counts.completado} completado${counts.completado > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ") || "Con tareas registradas"}
            tone="blue"
          >
            <ul className="explore-list">
              {active.map((k) => (
                <li key={k}>
                  <b>{AGENTS[k].name} <span className={`status status-${agents[k] === "completado" ? "ok" : "gold"}`}>{STATE_LABEL[agents[k]]}</span></b>
                  <small>{lastByAgent.get(k)?.title ?? ""}</small>
                </li>
              ))}
            </ul>
          </Disclosure>
        ) : null}

        {review.length ? (
          <Disclosure
            icon={<IconCheck size={18} />}
            title="¿Qué conclusiones están pendientes?"
            summary={review.length === 1 ? "1 conclusión espera revisión profesional" : `${review.length} conclusiones esperan revisión profesional`}
            tone="gold"
          >
            <FactTag kind="revision" />
            <ul className="explore-list">
              {review.map((s) => (
                <li key={s.id}>
                  <b>{s.title}</b>
                  <small>{AGENTS[s.agent]?.name ?? s.agent} · aún no es una conclusión definitiva</small>
                </li>
              ))}
            </ul>
          </Disclosure>
        ) : null}

        {pendingAuthorizations ? (
          <Disclosure
            icon={<IconShield size={18} />}
            title="¿Qué autorizaciones se necesitan?"
            summary={pendingAuthorizations === 1 ? "1 autorización espera tu decisión" : `${pendingAuthorizations} autorizaciones esperan tu decisión`}
            tone="gold"
          >
            <FactTag kind="autorizacion" />
            <p className="disc-lead">ENQORA no actuará ante ninguna institución sin tu autorización explícita.</p>
            <a href={`/casos/${caseId}#autorizaciones`} className="btn btn-gold btn-inline btn-sm">Ir a las autorizaciones</a>
          </Disclosure>
        ) : null}
      </div>
    </section>
  );
}
