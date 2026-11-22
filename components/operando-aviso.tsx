import Link from "next/link";

// Franja visible cuando una persona del equipo ENQORA opera una empresa (Remuneraciones y Laboral como servicio).
export function OperandoAviso({ empresa }: { empresa: { name: string; rut: string; role: string | null } | null }) {
  if (!empresa || empresa.role !== null) return null;
  return (
    <div className="rem-operando">
      <span>Equipo ENQORA · operando para <b>{empresa.name}</b> ({empresa.rut})</span>
      <Link href="/mando/operar?salir=1" className="btn btn-ghost btn-inline btn-sm">Dejar de operar</Link>
    </div>
  );
}
