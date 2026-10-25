// Revelación progresiva: componentes reutilizables de ENQORA.
// La complejidad pertenece al sistema; la claridad pertenece al cliente.
// Todo se basa en <details>/<summary> nativos: accesibles, funcionan sin JavaScript
// y nunca se abren solos (salvo que la pantalla lo indique con `open`).

type Tone = "neutral" | "gold" | "ok" | "risk" | "blue";

const Chevron = () => (
  <svg className="disc-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

// Elemento desplegable: muestra un resumen y revela el detalle solo cuando el usuario lo pide.
export function Disclosure({
  title,
  summary,
  meta,
  icon,
  tone = "neutral",
  cta = "Explorar",
  open,
  id,
  children,
}: {
  title: React.ReactNode;
  summary?: React.ReactNode;
  meta?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: Tone;
  cta?: string;
  open?: boolean;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <details className={`disclosure tone-${tone}`} open={open} id={id}>
      <summary>
        {icon ? <span className="disc-icon" aria-hidden="true">{icon}</span> : null}
        <span className="disc-text">
          <b>{title}</b>
          {summary ? <small>{summary}</small> : null}
        </span>
        {meta ? <span className="disc-meta">{meta}</span> : null}
        <span className="disc-cta">
          <span className="disc-cta-open">{cta}</span>
          <span className="disc-cta-close">Cerrar</span>
          <Chevron />
        </span>
      </summary>
      <div className="disclosure-body">{children}</div>
    </details>
  );
}

// Sección plegable de una pantalla (historial, expediente, sesiones…).
export function Fold({
  title,
  summary,
  icon,
  open,
  id,
  children,
}: {
  title: string;
  summary?: React.ReactNode;
  icon?: React.ReactNode;
  open?: boolean;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="fold" open={open} id={id}>
      <summary>
        {icon ? <span className="fold-icon" aria-hidden="true">{icon}</span> : null}
        <span className="fold-title">{title}</span>
        {summary ? <span className="fold-summary">{summary}</span> : null}
        <Chevron />
      </summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}

// Naturaleza de una afirmación: el cliente siempre sabe qué es hecho y qué no.
const FACT_KINDS = {
  verificado: "Hecho verificado",
  interpretacion: "Interpretación",
  estimacion: "Estimación",
  alternativa: "Alternativa posible",
  autorizacion: "Requiere tu autorización",
  revision: "Sujeto a revisión profesional",
} as const;
export type FactKind = keyof typeof FACT_KINDS;

export function FactTag({ kind }: { kind: FactKind }) {
  return <span className={`fact fact-${kind}`}>{FACT_KINDS[kind]}</span>;
}

// Advertencia importante: nunca se oculta dentro de un desplegable.
export function Callout({
  kind = "info",
  title,
  children,
  action,
}: {
  kind?: "info" | "warn" | "risk";
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className={`callout callout-${kind}`} role={kind === "info" ? "status" : "alert"}>
      <span className="callout-mark" aria-hidden="true" />
      <div className="callout-text">
        <b>{title}</b>
        {children ? <div>{children}</div> : null}
      </div>
      {action ? <div className="callout-action">{action}</div> : null}
    </div>
  );
}

// Fuentes y evidencias de una conclusión.
export function Evidence({ items }: { items: { label: string; href?: string; detail?: string }[] }) {
  if (!items.length) return null;
  return (
    <ul className="evidence">
      {items.map((it, i) => (
        <li key={i}>
          {it.href ? <a href={it.href} target="_blank" rel="noopener">{it.label}</a> : <span>{it.label}</span>}
          {it.detail ? <small>{it.detail}</small> : null}
        </li>
      ))}
    </ul>
  );
}

// Acción recomendada al final de un análisis o asunto.
export function NextAction({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="next-action">
      <div>
        <span className="next-label">Próximo paso</span>
        <b>{title}</b>
        {children ? <p>{children}</p> : null}
      </div>
      {action ? <div className="next-cta">{action}</div> : null}
    </div>
  );
}
