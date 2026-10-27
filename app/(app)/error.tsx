"use client";

import { useEffect } from "react";
import Link from "next/link";

// Error inesperado dentro del área privada: se mantiene la navegación y se ofrece reintentar.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[ENQORA error]", error.digest ?? error.message);
  }, [error]);
  return (
    <div className="page">
      <section className="card error-card" role="alert">
        <span className="eyebrow">Error inesperado</span>
        <h1>No pudimos mostrar esta sección</h1>
        <p className="panel-lead">No se perdió ninguna información. Intenta nuevamente; si se repite, avísanos indicando el código de referencia.</p>
        <div className="error-actions">
          <button type="button" className="btn btn-gold btn-inline" onClick={() => reset()}>Reintentar</button>
          <Link href="/panel" className="btn btn-ghost btn-inline">Ir al Centro de control</Link>
        </div>
        {error.digest ? <p className="error-ref">Código de referencia: <code>{error.digest}</code></p> : null}
      </section>
    </div>
  );
}
