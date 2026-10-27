"use client";

// Último recurso: falla el diseño raíz. Sin dependencias externas ni estilos globales.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es-CL">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#050914", color: "#c3ccda", fontFamily: "system-ui, sans-serif", padding: 16 }}>
        <main style={{ maxWidth: 460, background: "#0b1425", border: "1px solid rgba(154,168,189,.2)", borderTop: "2px solid #c6a66b", borderRadius: 14, padding: 28 }}>
          <p style={{ margin: "0 0 6px", letterSpacing: ".3em", fontSize: 12, color: "#c6a66b" }}>ENQORA</p>
          <h1 style={{ margin: "0 0 10px", fontSize: 20, color: "#f3f5fa" }}>El servicio no está disponible en este momento</h1>
          <p style={{ margin: "0 0 18px" }}>No se perdió ninguna información. Intenta nuevamente en unos segundos.</p>
          <button type="button" onClick={() => reset()} style={{ background: "#c6a66b", color: "#050914", border: 0, borderRadius: 10, padding: "10px 18px", fontWeight: 600, cursor: "pointer" }}>Reintentar</button>
          {error.digest ? <p style={{ margin: "16px 0 0", fontSize: 12, color: "#9aa8bd" }}>Código de referencia: {error.digest}</p> : null}
        </main>
      </body>
    </html>
  );
}
