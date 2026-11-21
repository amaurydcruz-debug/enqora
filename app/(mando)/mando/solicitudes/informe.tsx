import { corregirInformeAction, crearCasoDesdeSolicitudAction, regenerarInformeAction } from "@/app/actions/informe";
import { SubmitButton } from "@/components/submit-button";
import { DOCUMENTOS } from "@/lib/cora/caso";
import type { Afirmacion, FuenteInforme, Informe, Paso } from "@/lib/cora/informe-ingreso";
import { LINEAS, esLinea } from "@/lib/lineas";
import { clp } from "@/lib/pricing";

export type InformeRow = {
  solicitud: string; version: number; origen: "enjambre" | "reglas" | "correccion"; informe: Informe; fuentes: FuenteInforme[];
  bitacora: Paso[]; modelo: string | null; conflicto: { cliente_es_contraparte?: boolean; contraparte_es_cliente?: boolean; contraparte?: string | null } | null;
  correccion: string | null; creado: string;
};

const CERTEZA: Record<string, string> = { alta: "Certeza alta", media: "Certeza media", baja: "Certeza baja" };
const ORIGEN: Record<InformeRow["origen"], string> = { enjambre: "Enjambre", reglas: "Por reglas (sin IA)", correccion: "Corregido por el equipo" };
const fecha = (d: string) => new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(d));

function Fuente({ id, fuentes }: { id: string; fuentes: FuenteInforme[] }) {
  if (id === "relato") return <span className="ii-fuente ii-fuente-relato" title="Lo dijo el cliente: falta verificarlo">Relato</span>;
  if (id === "profesional") return <span className="ii-fuente ii-fuente-prof" title="Corrección del profesional">Profesional</span>;
  const f = fuentes.find((x) => x.id === id);
  return <span className="ii-fuente" title={f ? `${f.titulo}${f.verificada ? ` · verificada ${f.verificada}` : ""}` : "Fuente"}>{id}</span>;
}

function Lista({ items, fuentes }: { items: Afirmacion[]; fuentes: FuenteInforme[] }) {
  return (
    <ul className="ii-lista">
      {items.map((a, i) => (
        <li key={i}>
          <span>{a.texto}</span>
          <span className="ii-meta"><Fuente id={a.fuente} fuentes={fuentes} /> <small>{CERTEZA[a.certeza] ?? a.certeza}</small></span>
        </li>
      ))}
    </ul>
  );
}

// Informe de ingreso de una solicitud: una pantalla para leer, corregir y decidir. Nada sale al cliente sin
// que una persona lo envíe: el borrador abre el correo o WhatsApp del profesional.
export function InformeIngreso({
  sol, row, supervisor, respuestaHref,
}: {
  sol: { id: string; relato: string; company_id?: string | null; case_id?: string | null; linea?: string | null };
  row: InformeRow | null;
  supervisor: boolean;
  respuestaHref: (mensaje: string) => string;
}) {
  if (!row) {
    return (
      <div className="ii ii-vacio">
        <b>Informe de ingreso</b>
        <p className="muted-line">El enjambre aún no entrega el informe de esta solicitud (llega en segundos al recibirla; si falló, usa «Generar informe ahora» o espera el cron diario).</p>
        <form action={regenerarInformeAction}>
          <input type="hidden" name="id" value={sol.id} />
          <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="El enjambre está analizando…">Generar informe ahora</SubmitButton>
        </form>
      </div>
    );
  }
  const inf = row.informe;
  const fuentes = Array.isArray(row.fuentes) ? row.fuentes : [];
  const linea = esLinea(inf.linea) ? inf.linea : "GEN";
  const conflicto = !!(row.conflicto?.cliente_es_contraparte || row.conflicto?.contraparte_es_cliente);
  const docs = (inf.documentos ?? []).map((d) => DOCUMENTOS[d]?.nombre ?? d);
  const mensaje = [inf.mensaje_cliente, docs.length ? `\nPara avanzar, ¿nos puedes enviar?\n${docs.map((d) => `• ${d}`).join("\n")}` : ""].filter(Boolean).join("\n");

  return (
    <div className="ii">
      <div className="ii-cab">
        <b>Informe de ingreso</b>
        <span className="muted-line">v{row.version} · {ORIGEN[row.origen]} · {fecha(row.creado)}{row.modelo ? ` · ${row.modelo}` : ""}</span>
        <span className={`badge ${inf.confianza === "alta" ? "badge-ok" : "badge-gold"}`}>{CERTEZA[inf.confianza] ?? "Certeza"}</span>
      </div>

      {conflicto ? (
        <p className="ii-alerta" role="alert">
          ⚠ Posible conflicto de interés: {row.conflicto?.cliente_es_contraparte ? "ENQORA tiene un caso donde este cliente es la contraparte." : ""}
          {row.conflicto?.contraparte_es_cliente ? ` ENQORA atiende a «${row.conflicto?.contraparte}». ` : ""} Decide la supervisión antes de asignar.
        </p>
      ) : null}
      {inf.urgencia ? <p className="ii-urgente"><b>Plazo:</b> {inf.urgencia.texto} <Fuente id={inf.urgencia.fuente} fuentes={fuentes} /></p> : null}

      <dl className="ii-datos">
        <div><dt>Qué pide</dt><dd>{inf.pide}</dd></div>
        <div><dt>Línea</dt><dd><span className="mono">{linea}</span> · {LINEAS[linea]} · {inf.especialista}</dd></div>
        <div><dt>Servicio sugerido</dt><dd>{inf.servicio ? <>{inf.servicio.codigo} · {inf.servicio.nombre} · {inf.servicio.precio_desde != null ? `desde ${clp(inf.servicio.precio_desde)} por ${inf.servicio.unidad}` : "sin precio vigente (lo define el equipo)"}{inf.servicio.motivo ? <small> — {inf.servicio.motivo}</small> : null}</> : "Ninguno del catálogo activo calza: cotización a medida."}</dd></div>
        <div><dt>Conflicto de interés</dt><dd>{conflicto ? "Revisar (ver alerta)" : `No detectado${row.conflicto?.contraparte ? ` · contraparte mencionada: ${row.conflicto.contraparte}` : ""}`}</dd></div>
      </dl>

      {inf.hechos?.length ? <><h4>Hechos clave</h4><Lista items={inf.hechos} fuentes={fuentes} /></> : null}
      {inf.faltantes?.length ? (
        <><h4>Falta saber</h4><ul className="ii-lista">{inf.faltantes.map((f, i) => <li key={i}><span><b>{f.dato}</b>{f.por_que ? ` — ${f.por_que}` : ""}</span></li>)}</ul></>
      ) : null}
      {docs.length ? <><h4>Documentos a pedir</h4><p className="muted-line">{docs.join(" · ")}</p></> : null}
      {inf.ruta?.length ? <><h4>Ruta sugerida</h4><Lista items={inf.ruta} fuentes={fuentes} /></> : null}
      {inf.riesgos?.length ? (
        <><h4>Riesgos</h4><ul className="ii-lista">{inf.riesgos.map((r, i) => (
          <li key={i}><span><b className={`ii-nivel ii-${r.nivel}`}>{r.nivel}</b> {r.texto}</span><span className="ii-meta"><Fuente id={r.fuente} fuentes={fuentes} /></span></li>
        ))}</ul></>
      ) : null}
      {inf.preguntas?.length ? <><h4>Preguntas para el cliente</h4><ul className="ii-lista">{inf.preguntas.map((p, i) => <li key={i}><span>{p}</span></li>)}</ul></> : null}
      {row.correccion ? <p className="muted-line"><b>Corrección del equipo:</b> {row.correccion}</p> : null}

      {inf.mensaje_cliente ? (
        <details className="ii-det">
          <summary>Borrador del mensaje al cliente</summary>
          <p style={{ whiteSpace: "pre-wrap" }}>{mensaje}</p>
          <a className="btn btn-gold btn-inline btn-sm" href={respuestaHref(mensaje)} target="_blank" rel="noopener noreferrer">Revisar y enviar desde mi correo o WhatsApp</a>
        </details>
      ) : null}

      <details className="ii-det">
        <summary>Fuentes consultadas ({fuentes.length}) y bitácora del enjambre</summary>
        <ol className="ii-fuentes">
          {fuentes.map((f) => (
            <li key={f.id} id={`f-${sol.id}-${f.id}`}>
              <b className="mono">{f.id}</b> {f.url ? <a href={f.url} target="_blank" rel="noopener noreferrer">{f.titulo}</a> : f.titulo}
              {f.verificada ? <small> · verificada {f.verificada}</small> : null}
            </li>
          ))}
        </ol>
        <ul className="ii-bitacora">{(row.bitacora ?? []).map((p, i) => <li key={i}><b>{p.agente}:</b> {p.resultado}</li>)}</ul>
      </details>

      <div className="ii-acciones">
        {supervisor && sol.company_id && !sol.case_id ? (
          <form action={crearCasoDesdeSolicitudAction}>
            <input type="hidden" name="id" value={sol.id} />
            <input type="hidden" name="company_id" value={sol.company_id} />
            <input type="hidden" name="linea" value={linea} />
            <input type="hidden" name="titulo" value={inf.pide.slice(0, 160)} />
            <input type="hidden" name="descripcion" value={[inf.pide, inf.ruta?.length ? `Ruta sugerida: ${inf.ruta.map((r) => r.texto).join(" → ")}` : ""].filter(Boolean).join("\n\n").slice(0, 4000)} />
            <SubmitButton variant="gold" className="btn-inline btn-sm" pendingText="Creando el caso…">Crear caso {linea} con esta ruta</SubmitButton>
          </form>
        ) : null}
        <form action={regenerarInformeAction}>
          <input type="hidden" name="id" value={sol.id} />
          <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="El enjambre está analizando…">Volver a analizar</SubmitButton>
        </form>
      </div>
      <details className="ii-det">
        <summary>Corregir el informe (enseña al enjambre de esta línea)</summary>
        <form action={corregirInformeAction} className="mini-form">
          <input type="hidden" name="id" value={sol.id} />
          <label className="field"><span>¿Qué estaba mal y cuál es el criterio correcto? (sin nombres ni RUT)</span>
            <textarea name="correccion" className="input" rows={3} minLength={10} maxLength={2000} required placeholder="Ej.: en despidos, el plazo se cuenta desde la separación, no desde la carta." /></label>
          <label className="field"><span>Ruta corregida (opcional, un paso por línea)</span>
            <textarea name="ruta" className="input" rows={3} maxLength={4000} defaultValue={(inf.ruta ?? []).map((r) => r.texto).join("\n")} /></label>
          <label className="field"><span>Mensaje al cliente corregido (opcional)</span>
            <textarea name="mensaje_cliente" className="input" rows={4} maxLength={2500} defaultValue={inf.mensaje_cliente} /></label>
          <SubmitButton className="btn-inline btn-sm" pendingText="Guardando la corrección…">Guardar corrección (versión nueva)</SubmitButton>
        </form>
      </details>
    </div>
  );
}
