import { setCasePartyAction } from "@/app/actions/case-party";

export type CaseParty = {
  lado: "trabajador" | "empleador"; contraparte_nombre: string | null; contraparte_rut: boolean; registrado_at: string;
  conflicto_profesional?: boolean; casos_opuestos?: number;
} | null;

// Partes del conflicto laboral (0057): de qué lado está el cliente y quién es la contraparte.
// Con este dato ENQORA impide que un mismo profesional represente a ambas partes del conflicto.
export function CasePartyPanel({ caseId, party, canEdit, worker, ladoSugerido }: {
  caseId: string; party: CaseParty; canEdit: boolean; worker: boolean; ladoSugerido: "trabajador" | "empleador" | null;
}) {
  const lado = party?.lado ?? ladoSugerido ?? "trabajador";
  return (
    <div className="partes">
      {party ? (
        <dl className="kv">
          <div><dt>Lado del cliente</dt><dd>{party.lado === "trabajador" ? "Trabajador" : "Empleador"}</dd></div>
          <div><dt>Contraparte</dt><dd>{party.contraparte_nombre ?? "—"}{party.contraparte_rut ? " · RUT registrado" : ""}</dd></div>
        </dl>
      ) : (
        <p className="muted-line">Indica quién es la otra parte del conflicto. Así ENQORA asigna un abogado que no represente a la contraparte.</p>
      )}
      {worker && party?.conflicto_profesional ? (
        <p className="alert alert-error" role="alert">Conflicto de interés: un profesional asignado trabaja en un caso de la contraparte. La supervisión debe reasignar antes de continuar.</p>
      ) : null}
      {worker && party && !party.conflicto_profesional && (party.casos_opuestos ?? 0) > 0 ? (
        <p className="alert alert-info" role="status">ENQORA atiende a la contraparte en {party.casos_opuestos} caso{party.casos_opuestos === 1 ? "" : "s"}. Mantén equipos separados: el sistema bloquea asignar aquí a quien trabaja en esos casos.</p>
      ) : null}
      {canEdit ? (
        <details className="partes-form" open={!party}>
          <summary className="btn btn-ghost btn-inline btn-sm">{party ? "Corregir las partes" : "Registrar las partes"}</summary>
          <form action={setCasePartyAction} className="form-grid">
            <input type="hidden" name="case_id" value={caseId} />
            <fieldset>
              <legend>El cliente es</legend>
              <div className="chips-radio">
                <label className="check"><input type="radio" name="lado" value="trabajador" defaultChecked={lado === "trabajador"} /> Trabajador</label>
                <label className="check"><input type="radio" name="lado" value="empleador" defaultChecked={lado === "empleador"} /> Empleador</label>
              </div>
            </fieldset>
            <label className="field">
              <span>Nombre o razón social de la contraparte</span>
              <input className="input" name="contraparte_nombre" maxLength={160} defaultValue={party?.contraparte_nombre ?? ""} placeholder="Ej.: Comercial Los Andes SpA" />
            </label>
            <label className="field">
              <span>RUT de la contraparte (si lo conoces)</span>
              <input className="input mono" name="contraparte_rut" inputMode="text" maxLength={12} placeholder="76.123.456-0" />
              <small className="muted-line">Se guarda cifrado: solo se usa para detectar conflictos de interés, nunca se muestra.</small>
            </label>
            <button type="submit" className="btn btn-gold btn-inline">Guardar partes</button>
          </form>
        </details>
      ) : null}
    </div>
  );
}
