import { responderPreguntaAction } from "@/app/actions/conciliador";
import { SubmitButton } from "@/components/submit-button";

export type PreguntaCliente = { id: string; pregunta: string; opciones: string[] };

// Preguntas del contador sobre movimientos del banco que nadie puede explicar con documentos. Un toque por respuesta.
export function PreguntasCard({ preguntas }: { preguntas: PreguntaCliente[] }) {
  return (
    <section className="ps-card" id="preguntas" aria-labelledby="pq-t">
      <div className="ps-card-cab"><h2 id="pq-t">Preguntas de tu contador ({preguntas.length})</h2></div>
      <p className="muted-line">Movimientos de tu banco que no calzan con tus documentos. Tu respuesta nos ayuda a cerrar tu mes sin errores.</p>
      <ul className="pq-lista">
        {preguntas.map((q) => (
          <li key={q.id}>
            <form action={responderPreguntaAction}>
              <input type="hidden" name="id" value={q.id} />
              <b>{q.pregunta}</b>
              <div className="pq-opciones">
                {q.opciones.map((o) => (
                  <SubmitButton key={o} name="respuesta" value={o} variant="ghost" className="btn-inline btn-sm" pendingText="…">{o}</SubmitButton>
                ))}
              </div>
              <input name="nota" className="input input-sm" maxLength={500} placeholder="Detalle opcional (ej.: pago a Juan por flete)" aria-label="Detalle opcional" />
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
