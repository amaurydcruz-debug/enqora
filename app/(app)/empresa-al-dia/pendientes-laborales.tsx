import Link from "next/link";
import type { Pendiente } from "@/lib/pendientes-laborales";

const NIVEL = { urgente: "Urgente", importante: "Importante", aviso: "Revisar" } as const;

// Lo que falta en lo laboral, calculado con los datos reales de Remuneraciones y de los documentos laborales.
// Para el cliente, cada punto se pide a ENQORA (el equipo presta el servicio); el equipo lo resuelve en la herramienta.
export function PendientesLaborales({ items, cliente = false }: { items: Pendiente[]; cliente?: boolean }) {
  if (!items.length) return <p className="muted-line">Todo en orden según los datos registrados en ENQORA.</p>;
  return (
    <ul className="pl-lista">
      {items.map((p) => (
        <li key={p.clave} className={`pl-${p.nivel}`}>
          <span className="pl-nivel">{NIVEL[p.nivel]}</span>
          <span className="pl-que"><b>{p.titulo}</b><small>{p.detalle}</small></span>
          {cliente ? (
            <Link href={`/casos/nuevo?modulo=gestion&asunto=${encodeURIComponent(`Remuneraciones: ${p.titulo}`)}`} className="btn btn-ghost btn-inline btn-sm">Pedir a ENQORA</Link>
          ) : <Link href={p.href} className="btn btn-ghost btn-inline btn-sm">Resolver</Link>}
        </li>
      ))}
    </ul>
  );
}
