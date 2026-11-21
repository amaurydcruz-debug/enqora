import Link from "next/link";
import { diasHasta, type Vencimiento } from "@/lib/calendario-cumplimiento";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const corta = (f: string) => `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7)) - 1]}`;

// Próximos vencimientos de la empresa según su diagnóstico (0072). ENQORA avisa 7 días y 1 día antes.
export function Calendario({ items, hoy, compacto = false }: { items: Vencimiento[]; hoy: string; compacto?: boolean }) {
  if (!items.length) return <p className="muted-line">No hay vencimientos en los próximos días.</p>;
  return (
    <ol className={`cal${compacto ? " cal-compacto" : ""}`}>
      {items.map((v) => {
        const d = diasHasta(hoy, v.fecha);
        return (
          <li key={v.clave} className={d <= 3 ? "is-pronto" : ""}>
            <span className="cal-fecha"><b>{corta(v.fecha)}</b><small>{d === 0 ? "hoy" : d === 1 ? "mañana" : `en ${d} días`}</small></span>
            <span className="cal-que"><b>{v.titulo}</b>{compacto ? null : <small>{v.institucion} · {v.detalle}</small>}</span>
            {!compacto && v.categoria ? <Link href={`/panel?tramite=${v.categoria}#tramites`} className="btn btn-ghost btn-inline btn-sm">Que lo haga ENQORA</Link> : null}
          </li>
        );
      })}
    </ol>
  );
}
