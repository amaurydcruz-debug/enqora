/* eslint-disable @next/next/no-img-element */
// Pantallas de acceso (registro, ingreso, recuperación, segundo factor) con la línea visual de la portada:
// fotografía ilustrativa a un lado, tarjeta enmarcada en dorado al otro. `foto={null}` la quita (p. ej., sin conexión).
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
  foto = "/entrada/hero.webp",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  foto?: string | null;
}) {
  return (
    <main className={`auth-shell${foto ? " auth-con-foto" : ""}`}>
      {foto ? (
        <aside className="auth-foto" aria-hidden="true">
          <img src={foto} alt="" />
          <div className="auth-foto-txt">
            <b>La complejidad es nuestra. <span>La claridad, tuya.</span></b>
            <ul>
              <li>Contabilidad, impuestos y legalidad en un solo lugar</li>
              <li>Agentes de IA y especialistas reales</li>
              <li>Nunca te pedimos tu ClaveÚnica ni tu clave del SII</li>
            </ul>
          </div>
        </aside>
      ) : null}
      <div className="auth-lado">
        <section className="auth-card">
          <img src="/brand/enqora-logo.webp" alt="ENQORA — Inteligencia contable y tributaria" className="auth-logo" width={949} height={302} />
          <h1 className="auth-title">{title}</h1>
          {subtitle ? <p className="auth-sub">{subtitle}</p> : null}
          {children}
          {footer ? <div className="auth-foot">{footer}</div> : null}
        </section>
        <nav className="legal-links auth-legal" aria-label="Información legal">
          <a href="/terminos">Términos del servicio</a>
          <a href="/privacidad">Privacidad</a>
        </nav>
      </div>
    </main>
  );
}

export function Notice({ kind, children }: { kind: "error" | "ok" | "info"; children: React.ReactNode }) {
  return (
    <div className={`alert alert-${kind}`} role={kind === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}
