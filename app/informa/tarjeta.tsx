import Link from "next/link";
import { ALERTAS, fechaCL, TIPO_CONTENIDO, type Publicacion } from "@/lib/informa";

// Tarjeta de una publicación de ENQORA Informa: siempre con institución, fecha, estado de verificación y fuente.
export function TarjetaInforma({ p, destacada = false }: { p: Publicacion; destacada?: boolean }) {
  const alerta = ALERTAS[p.alerta] ?? ALERTAS.informativa;
  return (
    <article className={`inf-card${destacada ? " inf-card-destacada" : ""}`}>
      <header className="inf-card-top">
        <span className="inf-inst">{p.institucion ?? "Fuente oficial"}</span>
        {p.alerta !== "informativa" ? <span className={`inf-alerta ${alerta.clase}`}>{alerta.texto}</span> : null}
      </header>
      <h3><Link href={`/informa/${p.id}`}>{p.titulo}</Link></h3>
      <p>{p.resumen}</p>
      <dl className="inf-meta">
        <div><dt>{TIPO_CONTENIDO[p.tipo_contenido] ?? "Información"}</dt><dd>{p.publicado ? `Publicado el ${fechaCL(p.publicado)}` : `Consultado el ${fechaCL(p.consultado)}`}</dd></div>
        {p.vigente_desde ? <div><dt>Desde</dt><dd>{fechaCL(p.vigente_desde)}</dd></div> : null}
        {p.vigente_hasta ? <div><dt>Hasta</dt><dd>{fechaCL(p.vigente_hasta)}</dd></div> : null}
      </dl>
      <footer className="inf-card-pie">
        <span className="inf-verif">✓ Verificado en la fuente{p.revision_profesional ? " · revisión profesional" : ""}</span>
        <span className="inf-links">
          <Link href={`/informa/${p.id}`}>Ver ficha</Link>
          <a href={p.fuente} target="_blank" rel="noopener noreferrer">Fuente oficial ↗</a>
        </span>
      </footer>
    </article>
  );
}
