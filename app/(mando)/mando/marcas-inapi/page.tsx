import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cargarMarcasAhoraAction } from "@/app/actions/marcas";
import { Notice } from "@/components/auth-card";
import { Callout } from "@/components/disclosure";
import { SubmitButton } from "@/components/submit-button";
import { createClient } from "@/lib/supabase/server";
import { conjuntoInapi, CONJUNTOS_MARCAS, descargarRecurso, type Conjunto } from "@/lib/inapi-datos";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";
import { normalizarMarca, prepararFilasMarcas } from "@/lib/marcas";
import { messageForCode } from "@/lib/db-errors";
import { leerXlsx, type HojaXlsx } from "@/lib/xlsx-lector";

export const metadata: Metadata = { title: "Marcas INAPI · datos abiertos" };
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const mb = (n: number | null) => (n == null ? "" : `${(n / 1048576).toFixed(1)} MB`);

// Paso 1 de la búsqueda de marcas: ver qué publica INAPI en datos.gob.cl (API oficial, CC0) y una muestra de cada
// archivo, descargada por el servidor de ENQORA. No guarda nada todavía.
export default async function MarcasInapiPage({ searchParams }: { searchParams: Promise<{ conjunto?: string; recurso?: string; aviso?: string; q?: string; clases?: string }> }) {
  const role = await myStaffRole();
  if (!role || !["enqora_admin", "ops_director", "lawyer_pro", "accountant_pro"].includes(role)) notFound();
  const supervisor = isSupervisorRole(role);
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 120);
  const clasesQ = [...new Set((sp.clases ?? "").split(/[^\d]+/).filter(Boolean).map(Number).filter((n) => n >= 1 && n <= 45))];
  let encontradas: Encontrada[] | null = null;
  let errorBusqueda: string | null = null;
  if (normalizarMarca(q).length >= 2) {
    const { data, error } = await (await createClient()).rpc("buscar_marcas", { p_texto: normalizarMarca(q), p_clases: clasesQ.length ? clasesQ : null });
    if (error) errorBusqueda = /ENQ_[A-Z_]+/.exec(error.message)?.[0] ?? "ENQ_DATOS_INVALIDOS";
    else encontradas = (data ?? []) as Encontrada[];
  }
  const conjuntos: (Conjunto | { id: string; error: string })[] = supervisor ? await Promise.all(
    CONJUNTOS_MARCAS.map((id) => conjuntoInapi(id).catch((e: Error) => ({ id, error: e.message }))),
  ) : [];
  const { data: res } = await (await createClient()).rpc("inapi_resumen");
  const resumen = res as { marcas: number; ultima_carga: string | null; por_estado: Record<string, number>; busquedas_7d: number;
    cargas: { nombre: string; conjunto: string; estado: string; filas: number; cursor: number; detalle: string | null; actualizado: string }[] } | null;
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
          <p className="hero-lead">Herramienta interna del equipo ENQORA: índice de marcas registradas vigentes y solicitudes en trámite, con los datos abiertos de INAPI (licencia CC0). No está disponible para clientes.</p>
        </div>
      </header>

      {errorBusqueda ? <Notice kind="error">{messageForCode(errorBusqueda) ?? "No se pudo buscar."}</Notice> : null}
      <section className="card">
        <h2>Buscar marcas parecidas</h2>
        <form method="get" className="form-grid">
          <div className="field field-wide">
            <label htmlFor="mq">Nombre de la marca</label>
            <input id="mq" name="q" className="input" required minLength={2} maxLength={120} defaultValue={q} placeholder="Ej.: Café Andes" />
          </div>
          <div className="field">
            <label htmlFor="mc">Clases de Niza (opcional)</label>
            <input id="mc" name="clases" className="input" defaultValue={clasesQ.join(", ")} placeholder="Ej.: 30, 43" />
          </div>
          <div className="field"><label>&nbsp;</label><button type="submit" className="btn btn-gold btn-inline">Buscar</button></div>
        </form>
        {encontradas ? (
          encontradas.length ? (
            <ul className="ps-filas">
              {encontradas.map((m) => (
                <li key={m.solicitud}>
                  <span>
                    <b>{m.nombre}</b>
                    <small>
                      {m.similitud >= 0.7 ? "Muy parecida" : m.similitud >= 0.5 ? "Parecida" : "Algo parecida"} · {m.estado}{m.registro ? ` · registro ${m.registro}` : ` · solicitud ${m.solicitud}`} · clases {[...m.clases].sort((x, y) => x - y).join(", ") || "—"}
                      {m.vence ? ` · vence ${dmy(m.vence)}` : ""}{m.titulares ? ` · ${m.titulares}` : ""}
                      {m.etiqueta ? <> · <a href={m.etiqueta} target="_blank" rel="noopener noreferrer">ver etiqueta</a></> : null}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="muted-line">Sin marcas parecidas registradas o en trámite{clasesQ.length ? " en esas clases" : ""}.</p>
        ) : null}
        <p className="muted-line">Compara nombres escritos; no revisa logotipos, parecido fonético ni marcas notorias. Cada búsqueda queda registrada.</p>
      </section>

      {sp.aviso === "iniciada" ? <Notice kind="ok">Carga iniciada. Sigue sola en el servidor, archivo por archivo; recarga esta página en un par de minutos.</Notice> : null}
      {sp.aviso === "sin_secreto" ? <Notice kind="error">Falta la variable CRON_SECRET en Vercel.</Notice> : null}
      {supervisor ? (<>
      <section className="card">
        <h2>Índice de marcas en ENQORA</h2>
        {resumen ? (
          <>
            <p className="muted-line">{resumen.marcas.toLocaleString("es-CL")} marcas vigentes o en trámite · última carga {resumen.ultima_carga ? new Date(resumen.ultima_carga).toLocaleString("es-CL", { timeZone: "America/Santiago" }) : "—"} · {resumen.busquedas_7d} búsquedas de clientes en 7 días</p>
            <ul className="ps-filas">
              {resumen.cargas.slice(0, 80).map((c) => (
                <li key={c.conjunto + c.nombre}><span><b>{c.nombre} · {c.estado}</b><small>{c.conjunto} · {c.estado === "completada" ? `${c.filas.toLocaleString("es-CL")} filas` : `fila ${c.cursor.toLocaleString("es-CL")}`}{c.detalle ? ` · ${c.detalle}` : ""}</small></span></li>
              ))}
            </ul>
          </>
        ) : <p className="muted-line">Falta pegar la migración 0077 en Supabase.</p>}
        <form action={cargarMarcasAhoraAction}><SubmitButton className="btn-inline btn-sm" pendingText="Iniciando…">Cargar ahora</SubmitButton></form>
        <p className="muted-line">También se carga sola todos los días a las 12:00 (hora de Chile). La primera vez tarda varias ejecuciones: son más de 60 archivos.</p>
      </section>

      {muestra ? (
        <section className="card" id="muestra">
          <h2>Muestra · {muestra.nombre}</h2>
          {"error" in muestra ? <Callout kind="risk" title="No se pudo leer">{muestra.error}</Callout> : (
            <>
              <p className="muted-line">{mb(muestra.bytes)} · hoja «{muestra.hoja.hoja}» · primeras filas del archivo{muestra.hoja.truncado ? " (hay más)" : ""}.</p>
              {muestra.hoja.diagnostico ? <pre className="doc-editor" style={{ minHeight: 0, whiteSpace: "pre-wrap" }}>{muestra.hoja.diagnostico}</pre> : null}
              <VistaMarcas filas={muestra.hoja.filas} />
              <details className="ps-docs">
                <summary>Ver columnas originales de INAPI</summary>
                <div className="table-scroll">
                  <table className="ledger-table">
                    <tbody>
                      {muestra.hoja.filas.map((f, i) => (
                        <tr key={i}>{f.map((c, j) => (i === 0 ? <th key={j}>{c}</th> : <td key={j}>{c}</td>))}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
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
      </>) : null}
    </div>
  );
}

type Encontrada = { nombre: string; similitud: number; clases: number[]; estado: string; registro: number | null; solicitud: number;
  titulares: string | null; vence: string | null; etiqueta: string | null };
const dmy = (iso: string | null) => (iso ? iso.split("-").reverse().join("-") : "—");

// Vista legible: las mismas filas, ya interpretadas como las guarda ENQORA.
function VistaMarcas({ filas }: { filas: string[][] }) {
  const prep = prepararFilasMarcas(filas, new Date());
  if ("error" in prep) return <Callout kind="warn" title="No se reconocieron las columnas">{prep.error}</Callout>;
  return (
    <div className="table-scroll">
      <table className="ledger-table">
        <thead>
          <tr><th>Marca</th><th>Estado</th><th>¿Entra al buscador?</th><th>Clases</th><th>Titular</th><th>N° registro</th><th>N° solicitud</th><th>Presentada</th><th>Vence</th><th>Tipo</th><th>Etiqueta</th></tr>
        </thead>
        <tbody>
          {prep.filas.map((m) => (
            <tr key={m.clave}>
              <td><b>{m.nombre || "(solo figura)"}</b></td>
              <td>{m.estado}</td>
              <td>{m.vigente ? "Sí" : "No"}</td>
              <td>{m.clases.sort((a, b) => a - b).join(", ") || "—"}</td>
              <td>{m.titulares || "—"}</td>
              <td>{m.registro ?? "—"}</td>
              <td>{m.solicitud}</td>
              <td>{dmy(m.presentada)}</td>
              <td>{dmy(m.vence)}</td>
              <td>{m.tipo_signo || "—"}</td>
              <td>{m.etiqueta ? <a href={m.etiqueta} target="_blank" rel="noopener noreferrer">ver</a> : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
