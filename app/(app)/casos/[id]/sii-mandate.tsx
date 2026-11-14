import { requestSiiMandateAction, siiMandateStepAction } from "@/app/actions/sii-mandate";
import { SubmitButton } from "@/components/submit-button";
import { formatoRut, SII_MANDATE_STATUS, SII_RUTA, SII_TRAMITES, type SiiMandate } from "@/lib/sii-mandate";

// «Autorizar a ENQORA en el SII»: Mandato Digital, nunca la clave del cliente.
const dia = (d: string) => d.split("-").reverse().join("-");

export function SiiMandatePanel({
  caseId, mandates, canDecide, worker, userId, defaultName, isClosed,
}: {
  caseId: string; mandates: SiiMandate[]; canDecide: boolean; worker: boolean; userId: string; defaultName: string; isClosed: boolean;
}) {
  const activo = mandates.find((m) => ["solicitado", "otorgado", "aceptado"].includes(m.status)) ?? null;
  const historial = mandates.filter((m) => m !== activo);
  const vencido = !!activo && activo.vence < new Date().toISOString().slice(0, 10);
  const enDosMeses = new Date(Date.now() + 75 * 86_400_000).toISOString().slice(0, 10);

  return (
    <>
      <p className="panel-lead">
        Para hacer trámites en el SII por ti, ENQORA <b>nunca</b> usa tu clave. Tú autorizas en sii.cl a la persona de ENQORA que lleva tu caso
        (Mandato Digital), solo para los trámites que elijas y hasta la fecha que elijas. Ella actúa con su propia clave, el SII registra que fue ella,
        y al terminar revocas el mandato.
      </p>

      {activo ? (
        <div className="auth-item">
          <div className="auth-head">
            <b>{activo.mandatario_nombre} · RUT {formatoRut(activo.mandatario_rut)}</b>
            <span className={`status status-${vencido ? "muted" : SII_MANDATE_STATUS[activo.status].tone}`}>
              {vencido ? "Vencido" : SII_MANDATE_STATUS[activo.status].label}
            </span>
          </div>
          <p className="muted-line">Hasta el {dia(activo.vence)} · solo estos trámites:</p>
          <ul className="check-list">
            {activo.tramites.map((t) => <li key={t}>☑ {SII_TRAMITES[t] ?? t}</li>)}
          </ul>

          {activo.status === "solicitado" && canDecide ? (
            <>
              <h3 className="sub-title">Cómo otorgarlo (5 minutos)</h3>
              <ol className="install-steps">
                <li>Entra a <b>sii.cl</b> con tu RUT y tu clave (o ClaveÚnica).</li>
                <li>Ve a <b>{SII_RUTA.replace("sii.cl → ", "")}</b>.</li>
                <li>Elige el perfil <b>Mandante</b> y presiona <b>«Agregar Mandato»</b>.</li>
                <li>RUT del mandatario: <b className="mono">{formatoRut(activo.mandatario_rut)}</b> ({activo.mandatario_nombre}). Presiona <b>«Validar»</b>.</li>
                <li>En <b>«Trámite»</b> marca <b>solo</b> los de la lista de arriba. Fecha de término: <b>{dia(activo.vence)}</b>.</li>
                <li>Presiona <b>«Registrar mandato»</b> y vuelve aquí.</li>
              </ol>
              <form action={siiMandateStepAction} className="mini-form">
                <input type="hidden" name="case_id" value={caseId} />
                <input type="hidden" name="mandate_id" value={activo.id} />
                <input type="hidden" name="paso" value="otorgado" />
                <label className="check-inline">
                  <input type="checkbox" required />
                  <span>Registré el mandato en sii.cl solo para estos trámites y hasta esa fecha.</span>
                </label>
                <SubmitButton className="btn-inline" pendingText="…">Ya lo otorgué en el SII</SubmitButton>
              </form>
            </>
          ) : null}

          {activo.status === "otorgado" && activo.mandatario_id === userId ? (
            <>
              <h3 className="sub-title">Acéptalo en el SII</h3>
              <ol className="install-steps">
                <li>Entra a sii.cl con <b>tu</b> RUT y clave → {SII_RUTA.replace("sii.cl → ", "")}.</li>
                <li>Elige el perfil <b>Mandatario</b>, busca el mandato «Pendiente de aceptar mandatario» y presiona <b>«Aceptar»</b>.</li>
                <li>Para trabajar: Mandatario Digital → <b>«Ingresar a representar»</b>.</li>
              </ol>
              <form action={siiMandateStepAction}>
                <input type="hidden" name="case_id" value={caseId} />
                <input type="hidden" name="mandate_id" value={activo.id} />
                <input type="hidden" name="paso" value="aceptado" />
                <SubmitButton className="btn-inline" pendingText="…">Lo acepté en el SII</SubmitButton>
              </form>
            </>
          ) : activo.status === "otorgado" ? (
            <p className="muted-line">Esperando que {activo.mandatario_nombre} lo acepte en el SII.</p>
          ) : null}

          {activo.status === "aceptado" ? (
            <p className="muted-line">
              {isClosed
                ? "Tu caso terminó: revoca el mandato en sii.cl (perfil Mandante, en la misma pantalla) y confírmalo aquí."
                : "ENQORA puede hacer en el SII solo esos trámites. Al terminar el caso te pediremos revocarlo."}
            </p>
          ) : null}

          {canDecide && (activo.status === "otorgado" || activo.status === "aceptado") ? (
            <form action={siiMandateStepAction} className="inline-form">
              <input type="hidden" name="case_id" value={caseId} />
              <input type="hidden" name="mandate_id" value={activo.id} />
              <input type="hidden" name="paso" value="revocado" />
              <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Ya lo revoqué en el SII</SubmitButton>
            </form>
          ) : null}

          {activo.status === "solicitado" && (worker || canDecide) ? (
            <form action={siiMandateStepAction} className="inline-form">
              <input type="hidden" name="case_id" value={caseId} />
              <input type="hidden" name="mandate_id" value={activo.id} />
              <input type="hidden" name="paso" value="anular" />
              <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Anular solicitud</SubmitButton>
            </form>
          ) : null}
        </div>
      ) : worker && !isClosed ? (
        <form action={requestSiiMandateAction} className="mini-form">
          <input type="hidden" name="case_id" value={caseId} />
          <p className="muted-line">Pide el mandato a tu nombre: el cliente verá estos datos y los pasos para otorgarlo.</p>
          <div className="inline-form">
            <input name="nombre" className="input" required minLength={5} maxLength={120} defaultValue={defaultName} placeholder="Tu nombre completo" aria-label="Tu nombre" />
            <input name="rut" className="input input-sm" required maxLength={12} placeholder="Tu RUT" aria-label="Tu RUT" />
          </div>
          <fieldset className="mini-form">
            <legend className="muted-line">Trámites (marca solo los que el caso necesita)</legend>
            {Object.entries(SII_TRAMITES).map(([k, v]) => (
              <label key={k} className="check-inline">
                <input type="checkbox" name="tramites" value={k} defaultChecked={["dj_renta", "declarar_f22", "rectificar_f22"].includes(k)} />
                <span>{v}</span>
              </label>
            ))}
          </fieldset>
          <label className="check-inline">Hasta <input type="date" name="vence" className="input input-sm" required defaultValue={enDosMeses} aria-label="Fecha de término" /></label>
          <SubmitButton className="btn-inline btn-sm" pendingText="…">Pedir Mandato Digital al cliente</SubmitButton>
        </form>
      ) : (
        <p className="muted-line">No hay un mandato pedido para este caso.</p>
      )}

      {historial.length ? (
        <details>
          <summary className="muted-line">Mandatos anteriores ({historial.length})</summary>
          <ul className="ref-list" role="list">
            {historial.map((m) => (
              <li key={m.id}><span className="ref-main"><b>{m.mandatario_nombre}</b><small className="muted-line">{SII_MANDATE_STATUS[m.status].label} · hasta {dia(m.vence)}</small></span></li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}
