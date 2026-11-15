"use client";

export function Imprimir() {
  return <button type="button" className="btn btn-gold btn-inline btn-sm" onClick={() => window.print()}>Imprimir o guardar PDF</button>;
}
