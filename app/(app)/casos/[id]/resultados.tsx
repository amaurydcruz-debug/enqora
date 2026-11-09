import { rateCaseAction, recordSavingAction, verifySavingAction } from "@/app/actions/resultados";
import { SubmitButton } from "@/components/submit-button";

// Resultados del caso: ahorro verificado (con fundamento y evidencia) y calificación del cliente (0033).
export type Rating = { resuelto: "si" | "parcial" | "no"; satisfaccion: number; comentario: string | null; created_at: string };
export type Saving = {
  id: string; monto: number; concepto: string; fundamento: string; evidencia_document_id: string | null;
  estado: "propuesto" | "verificado" | "rechazado"; registrado_por: string | null; nota: string | null;
};

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
const RESUELTO: Record<Rating["resuelto"], string> = { si: "Sí, se resolvió", parcial: "En parte", no: "No se resolvió" };
const ESTADO: Record<Saving["estado"], string> = { propuesto: "Por verificar", verificado: "Verificado", rechazado: "Rechazado" };

export function ResultadosCaso({
  caseId, status, rating, savings, docs, canRate, worker, supervisor, userId,
}: {
  caseId: string; status: string; rating: Rating | null; savings: Saving[]; docs: { id: string; file_name: string }[];
  canRate: boolean; worker: boolean; supervisor: boolean; userId: string;
}) {
  const verificados = savings.filter((s) => s.estado === "verificado");
  const total = verificados.reduce((s, x) => s + Number(x.monto), 0);
  const editable = !rating || Date.now() - new Date(rating.created_at).getTime() < 30 * 86_400_000;
  const docName = (id: string | null) => docs.find((d) => d.id === id)?.file_name;

  return (
    <div className="sub-block" id="resultados">
      {verificados.length || (worker && savings.length) ? (
        <>
          <h4 className="sub-title">Ahorro {worker ? "del caso" : "verificado para tu empresa"}{total ? ` · ${pesos(total)}` : ""}</h4>
          <ul className="hoy-list">
            {(worker ? savings : verificados).map((s) => (
              <li key={s.id}>
                <b>{pesos(Number(s.monto))} · {s.concepto}</b>
                <small>Fundamento: {s.fundamento}</small>
                {s.evidencia_document_id ? <small>Evidencia: {docName(s.evidencia_document_id) ?? "documento del caso"}</small> : null}
                {worker ? <small>Estado: {ESTADO[s.estado]}{s.nota ? ` · Nota: ${s.nota}` : ""}</small> : null}
                {worker && supervisor && s.estado === "propuesto" ? (
                  <form action={verifySavingAction} className="inline-form" style={{ flexWrap: "wrap" }}>
                    <input type="hidden" name="case_id" value={caseId} />
                    <input type="hidden" name="saving_id" value={s.id} />
                    <input name="nota" className="input input-sm" placeholder="Nota (opcional)" maxLength={500} aria-label="Nota" />
                    <button type="submit" name="decision" value="verificar" className="btn-inline btn-sm"
                      disabled={s.registrado_por === userId && !s.evidencia_document_id}
                      title={s.registrado_por === userId && !s.evidencia_document_id ? "Lo registraste tú sin evidencia: debe verificarlo otra persona" : undefined}>Verificar</button>
                    <button type="submit" name="decision" value="rechazar" className="btn-inline btn-sm">Rechazar</button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
          {!worker ? <p className="hoy-note">Solo se informa el ahorro con fundamento verificado por la supervisión de ENQORA.</p> : null}
        </>
      ) : null}

      {worker && ["verificacion", "cerrado"].includes(status) ? (
        <details className="sub-block">
          <summary className="sub-title">Registrar un ahorro logrado para el cliente</summary>
          <p className="muted-line">Solo ahorros reales y demostrables (multas condonadas, impuestos recuperados, costos evitados). El cliente lo verá cuando la supervisión lo verifique.</p>
          <form action={recordSavingAction} className="mini-form">
            <input type="hidden" name="case_id" value={caseId} />
            <input name="monto" className="input" inputMode="numeric" required placeholder="Monto en pesos (p. ej., 450000)" aria-label="Monto" />
            <input name="concepto" className="input" required minLength={10} maxLength={300} placeholder="Concepto (p. ej., condonación de multas del F29)" aria-label="Concepto" />
            <textarea name="fundamento" className="input" rows={2} required minLength={30} maxLength={1500} placeholder="Fundamento: norma, cálculo o resolución que lo acredita" aria-label="Fundamento" />
            <select name="documento" className="input" aria-label="Evidencia" defaultValue="">
              <option value="">Sin documento de evidencia (lo debe verificar otra persona)</option>
              {docs.map((d) => <option key={d.id} value={d.id}>{d.file_name}</option>)}
            </select>
            <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Registrar ahorro</SubmitButton>
          </form>
        </details>
      ) : null}

      {status === "cerrado" && (canRate || rating) ? (
        <div className="sub-block" id="calificacion">
          <h4 className="sub-title">{worker ? "Calificación del cliente" : "¿Cómo te fue con ENQORA?"}</h4>
          {rating ? (
            <p className="muted-line">
              {RESUELTO[rating.resuelto]} · {"★".repeat(rating.satisfaccion)}{"☆".repeat(5 - rating.satisfaccion)}
              {rating.comentario ? ` · «${rating.comentario}»` : ""}
            </p>
          ) : null}
          {canRate && editable && !worker ? (
            <form action={rateCaseAction} className="mini-form">
              <input type="hidden" name="case_id" value={caseId} />
              <fieldset className="choice-row">
                <legend>¿Se resolvió tu problema?</legend>
                {(["si", "parcial", "no"] as const).map((v) => (
                  <label key={v}><input type="radio" name="resuelto" value={v} required defaultChecked={rating?.resuelto === v} /> {RESUELTO[v]}</label>
                ))}
              </fieldset>
              <fieldset className="choice-row">
                <legend>Tu satisfacción con el servicio</legend>
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n}><input type="radio" name="satisfaccion" value={n} required defaultChecked={rating?.satisfaccion === n} /> {"★".repeat(n)}</label>
                ))}
              </fieldset>
              <textarea name="comentario" className="input" rows={2} maxLength={1000} defaultValue={rating?.comentario ?? ""} placeholder="Comentario (opcional): qué valoras y qué podemos mejorar" aria-label="Comentario" />
              <SubmitButton className="btn-inline btn-sm" pendingText="…">{rating ? "Actualizar calificación" : "Enviar calificación"}</SubmitButton>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
