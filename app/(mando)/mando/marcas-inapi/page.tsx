import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Callout } from "@/components/disclosure";
import { conjuntoInapi, CONJUNTOS_MARCAS, descargarRecurso, type Conjunto } from "@/lib/inapi-datos";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";
import { leerXlsx, type HojaXlsx } from "@/lib/xlsx-lector";

export const metadata: Metadata = { title: "Marcas INAPI · datos abiertos" };
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const mb = (n: number | null) => (n == null ? "" : `${(n / 1048576).toFixed(1)} MB`);

// Paso 1 de la búsqueda de marcas: ver qué publica INAPI en datos.gob.cl (API oficial, CC0) y una muestra de cada
// archivo, descargada por el servidor de ENQORA. No guarda nada todavía.
export default async function MarcasInapiPage({ searchParams }: { searchParams: Promise<{ conjunto?: string; recurso?: string }> }) {
  const role = await myStaffRole();
  if (!role || !isSupervisorRole(role)) notFound();
  const sp = await searchParams;
  const conjuntos: (Conjunto | { id: string; error: string })[] = await Promise.all(
    CONJUNTOS_MARCAS.map((id) => conjuntoInapi(id).catch((e: Error) => ({ id, error: e.message }))),
  );
  let muestra: { nombre: string; bytes: number; hoja: HojaXlsx } | { nombre: string; error: string } | null = null;
  const elegido = conjuntos.find((c) => c.id === sp.conjunto && "recursos" in c) as Conjunto | undefined;
  const recurso = elegido?.recursos.find((r) => r.id === sp.recurso);
  if (recurso) {
    try {
      const buf = await descargarRecurso(recurso.url);
      muestra = { nombre: recurso.nombre, bytes: buf.length, hoja: leerXlsx(buf, 25) };
    } catch (e) {
      muestra = { nombre: recurso.nombre, error: (e as Error).message };
    }
  }

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Operación · datos abiertos</span>
          <h1>Marcas INAPI</h1>
          <p className="hero-lead">Archivos que INAPI publica en datos.gob.cl (licencia CC0), leídos por la API oficial. Elige uno para ver sus columnas y las primeras filas: ENQORA lo descarga desde su servidor.</p>
        </div>
      </header>

      {muestra ? (
        <section className="card" id="muestra">
          <h2>Muestra · {muestra.nombre}</h2>
          {"error" in muestra ? <Callout kind="risk" title="No se pudo leer">{muestra.error}</Callout> : (
            <>
              <p className="muted-line">{mb(muestra.bytes)} · hoja «{muestra.hoja.hoja}» · primeras {muestra.hoja.filas.length} filas{muestra.hoja.truncado ? " (hay más)" : ""}. Las fechas pueden verse como número de serie de Excel.</p>
              {muestra.hoja.diagnostico ? <pre className="doc-editor" style={{ minHeight: 0, whiteSpace: "pre-wrap" }}>{muestra.hoja.diagnostico}</pre> : null}
              <div className="table-scroll">
                <table className="ledger-table">
                  <tbody>
                    {muestra.hoja.filas.map((f, i) => (
                      <tr key={i}>{f.map((c, j) => (i === 0 ? <th key={j}>{c}</th> : <td key={j}>{c}</td>))}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      ) : null}

      {conjuntos.map((c) => (
        <section className="card" key={c.id}>
          {"error" in c ? (
            <Callout kind="risk" title={`No se pudo consultar «${c.id}»`}>{c.error}</Callout>
          ) : (
            <>
              <h2>{c.titulo}</h2>
              <p className="muted-line">Actualizado {c.actualizado ? new Date(c.actualizado).toLocaleString("es-CL", { timeZone: "America/Santiago" }) : "—"} · {c.licencia ?? "licencia no informada"} · {c.recursos.length} archivos</p>
              <ul className="ps-filas">
                {c.recursos.map((r) => (
                  <li key={r.id}>
                    <span><b>{r.nombre}</b><small>{r.formato} {mb(r.tamano)}</small></span>
                    <Link className="ps-link" href={`/mando/marcas-inapi?conjunto=${c.id}&recurso=${r.id}#muestra`}>Ver muestra</Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      ))}
    </div>
  );
}
