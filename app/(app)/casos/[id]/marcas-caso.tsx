import { revisarMarcasCasoAction } from "@/app/actions/marcas";
import { SubmitButton } from "@/components/submit-button";

export type RevisionMarcas = {
  consulta: string; clases: number[]; total: number; indice_marcas: number; hecho_at: string;
  resultados: { nombre: string; similitud: number; clases: number[]; estado: string; registro: number | null; solicitud: number; titulares: string | null; vence: string | null; etiqueta: string | null }[];
};
const dmy = (iso: string | null) => (iso ? iso.split("-").reverse().join("-") : "");

// Solo equipo: revisión única de marcas parecidas (INAPI) para un caso de registro de marca. El cliente no la ve.
export function MarcasCaso({ caseId, revision, puedeRevisar, sugerido }: { caseId: string; revision: RevisionMarcas | null; puedeRevisar: boolean; sugerido: string }) {
  if (revision) {
    return (
      <div className="setting-body">
        <p className="muted-line">
          Revisión hecha el {new Date(revision.hecho_at).toLocaleString("es-CL", { timeZone: "America/Santiago" })} para «{revision.consulta}»
          {revision.clases.length ? ` en clases ${revision.clases.join(", ")}` : " en todas las clases"} · {revision.total} resultado(s) sobre {revision.indice_marcas.toLocaleString("es-CL")} marcas del índice. Solo la ve el equipo.
        </p>
        {revision.resultados.length ? (
          <ul className="ps-filas">
            {revision.resultados.map((m) => (
              <li key={m.solicitud}>
                <span>
                  <b>{m.nombre}</b>
                  <small>
                    {m.similitud >= 0.7 ? "Muy parecida" : m.similitud >= 0.5 ? "Parecida" : "Algo parecida"} · {m.estado}{m.registro ? ` · registro ${m.registro}` : ` · solicitud ${m.solicitud}`} · clases {[...m.clases].sort((a, b) => a - b).join(", ") || "—"}
                    {m.vence ? ` · vence ${dmy(m.vence)}` : ""}{m.titulares ? ` · ${m.titulares}` : ""}
                    {m.etiqueta ? <> · <a href={m.etiqueta} target="_blank" rel="noopener noreferrer">ver etiqueta</a></> : null}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="muted-line">Sin marcas parecidas registradas o en trámite.</p>}
      </div>
    );
  }
  if (!puedeRevisar) return <p className="muted-line">Aún no se revisan las marcas parecidas de este caso.</p>;
  return (
    <form action={revisarMarcasCasoAction} className="form-grid setting-body">
      <input type="hidden" name="caso" value={caseId} />
      <div className="field field-wide">
        <label htmlFor="rm-q">Marca que quiere registrar el cliente</label>
        <input id="rm-q" name="q" className="input" required minLength={2} maxLength={120} defaultValue={sugerido} />
      </div>
      <div className="field">
        <label htmlFor="rm-c">Clases de Niza (opcional)</label>
        <input id="rm-c" name="clases" className="input" placeholder="Ej.: 30, 43" />
      </div>
      <div className="field"><label>&nbsp;</label><SubmitButton className="btn-inline btn-sm" pendingText="Revisando…">Revisar una vez</SubmitButton></div>
      <p className="muted-line field-wide">Se hace una sola vez por caso y queda guardada en el expediente (solo equipo) con una nota interna en la línea de tiempo.</p>
    </form>
  );
}
