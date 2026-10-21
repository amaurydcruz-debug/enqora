/* eslint-disable @next/next/no-img-element */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <img src="/brand/enqora-logo.webp" alt="ENQORA — Inteligencia contable y tributaria" className="auth-logo" width={1200} height={500} />
        <h1 className="auth-title">{title}</h1>
        {subtitle ? <p className="auth-sub">{subtitle}</p> : null}
        {children}
        {footer ? <div className="auth-foot">{footer}</div> : null}
      </section>
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
