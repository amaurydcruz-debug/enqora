"use client";

// Abre el diálogo de impresión del navegador (desde ahí se puede guardar como PDF).
export function PrintButton() {
  return (
    <button type="button" className="btn btn-gold btn-inline btn-sm" onClick={() => window.print()}>
      Imprimir o guardar en PDF
    </button>
  );
}
