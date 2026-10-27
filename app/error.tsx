"use client";

import { useEffect } from "react";
import { AuthCard } from "@/components/auth-card";

// Error inesperado fuera del área privada. No muestra detalles técnicos: solo un código de referencia.
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[ENQORA error]", error.digest ?? error.message);
  }, [error]);
  return (
    <AuthCard title="Algo no salió como esperábamos" subtitle="No se perdió ninguna información. Intenta nuevamente en unos segundos.">
      <div className="error-actions">
        <button type="button" className="btn btn-gold" onClick={() => reset()}>Reintentar</button>
        <a href="/" className="btn btn-ghost">Ir al inicio</a>
      </div>
      {error.digest ? <p className="error-ref">Código de referencia: <code>{error.digest}</code></p> : null}
    </AuthCard>
  );
}
