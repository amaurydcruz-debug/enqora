import type { Metadata } from "next";
import { Notice } from "@/components/auth-card";
import { Callout } from "@/components/disclosure";
import { messageForCode } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Buscar marca" };

type Res = { nombre: string; similitud: number; clases: number[]; estado: string; registro: number | null; solicitud: number; titulares: string | null;
  tipo_signo: string | null; vence: string | null; etiqueta: string | null };
const fecha = (iso: string | null) => (iso ? iso.split("-").reverse().join("-") : "—");

// Búsqueda de marcas parecidas en los datos abiertos de INAPI (orientación previa a una solicitud de registro).
export default async function MarcasPage({ searchParams }: { searchParams: Promise<{ q?: string; clases?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 120);
  const clases = [...new Set((sp.clases ?? "").split(/[^\d]+/).filter(Boolean).map(Number).filter((n) => n >= 1 && n <= 45))];
  let res: Res[] | null = null;
  let error: string | null = null;
  if (q.length >= 2) {
    const { data, error: e } = await (await createClient()).rpc("buscar_marcas", { p_texto: q, p_clases: clases.length ? clases : null });
    if (e) error = /ENQ_[A-Z_]+/.exec(e.message)?.[0] ?? "ENQ_DATOS_INVALIDOS";
    else res = (data ?? []) as Res[];
  }
  const nivel = (s: number) => (s >= 0.7 ? "Muy parecida" : s >= 0.5 ? "Parecida" : "Algo parecida");

  return (
    <div className="page narrow ps">
      {error ? <Notice kind="error">{messageForCode(error) ?? "No pudimos buscar. Intenta nuevamente."}</Notice> : null}
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Tu marca</span>
          <h1>Buscar marca</h1>
          <p className="hero-lead">Antes de registrar tu marca, revisa si ya hay marcas parecidas registradas o en trámite en INAPI, en las mismas clases de productos o servicios.</p>
        </div>
      </header>

      <section className="ps-card">
        <form method="get" className="form-grid">
          <div className="field field-wide">
            <label htmlFor="mq">Nombre de tu marca</label>
            <input id="mq" name="q" className="input" required minLength={2} maxLength={120} defaultValue={q} placeholder="Ej.: Café Andes" />
          </div>
          <div className="field">
            <label htmlFor="mc">Clases de Niza (opcional)</label>
            <input id="mc" name="clases" className="input" defaultValue={clases.join(", ")} placeholder="Ej.: 30, 43" />
            <span className="hint">Si las dejas vacías, se busca en todas.</span>
          </div>
          <div className="field"><label>&nbsp;</label><button type="submit" className="btn btn-gold btn-inline">Buscar</button></div>
        </form>
      </section>

      {res ? (
        <section className="ps-card">
          <div className="ps-card-cab"><h2>{res.length ? `${res.length} marca(s) parecida(s)` : "Sin marcas parecidas"}</h2></div>
          {res.length ? (
            <ul className="ps-filas">
              {res.map((m) => (
                <li key={m.solicitud}>
                  <span>
                    <b>{m.nombre}</b>
                    <small>
                      {nivel(m.similitud)} · {m.estado}{m.registro ? ` · registro ${m.registro}` : ` · solicitud ${m.solicitud}`} · clases {m.clases.join(", ") || "—"}
                      {m.vence ? ` · vence ${fecha(m.vence)}` : ""}{m.titulares ? ` · ${m.titulares}` : ""}
                      {m.etiqueta ? <> · <a href={m.etiqueta} target="_blank" rel="noopener noreferrer">ver etiqueta</a></> : null}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="muted-line">No encontramos marcas registradas o en trámite con un nombre parecido{clases.length ? " en esas clases" : ""}. Eso no garantiza que tu marca se pueda registrar.</p>}
        </section>
      ) : null}

      <Callout kind="info" title="Es una orientación, no un informe legal">
        Usamos los datos abiertos que INAPI publica cada día (licencia CC0) y mostramos solo marcas registradas vigentes y solicitudes en trámite. La búsqueda compara nombres escritos: no revisa logotipos, sonidos parecidos ni marcas notorias. Antes de presentar tu solicitud, el equipo legal de ENQORA puede revisarla contigo. Para la consulta oficial, usa el buscador de INAPI.
      </Callout>
    </div>
  );
}
