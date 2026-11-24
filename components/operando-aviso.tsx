import Link from "next/link";

// Franja visible cuando una persona del equipo ENQORA opera una empresa (Remuneraciones y Laboral como servicio).
export function OperandoAviso({ empresa }: { empresa: { name: string; rut: string; role: string | null } | null }) {
  if (!empresa || empresa.role !== null) return null;
  const prueba = /sala de pruebas/i.test(empresa.name);
  return (
    <div className="rem-operando">
      <span>Equipo ENQORA · operando para <b>{empresa.name}</b> ({empresa.rut}){prueba ? " · EMPRESA FICTICIA DE PRUEBA" : ""}</span>
      <Link href="/mando/operar?salir=1" className="btn btn-ghost btn-inline btn-sm">Dejar de operar</Link>
    </div>
  );
}
