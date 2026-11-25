import Link from "next/link";

// Franja del equipo ENQORA cuando opera una empresa. Se muestra en TODAS las pantallas desde el layout (app);
// las páginas que la incluían siguen llamando a OperandoAviso, que ahora no dibuja nada para no duplicarla.
export function OperandoAviso(_props: { empresa: { name: string; rut: string; role: string | null } | null }) {
  return null;
}

export function FranjaOperando({ empresa }: { empresa: { nombre: string; rut: string; prueba: boolean } }) {
  return (
    <div className="rem-operando" role="status">
      <span>
        <b>Sesión del equipo ENQORA</b> (no es la sesión del cliente) · operando para <b>{empresa.nombre}</b> ({empresa.rut})
        {empresa.prueba ? " · EMPRESA FICTICIA DE PRUEBA" : ""} · queda registrado
      </span>
      <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link href="/mando/operar?salir=1" className="btn btn-gold btn-inline btn-sm">Dejar de operar y volver al Centro de Mando</Link>
      </span>
    </div>
  );
}
