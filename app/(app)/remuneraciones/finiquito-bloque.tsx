import Link from "next/link";
import { anularFiniquitoAction, calcularFiniquitoAction } from "@/app/actions/finiquito";
import { SubmitButton } from "@/components/submit-button";
import { CAUSALES_AFC, CAUSALES_IAS, type DatosFiniquito, type ResultadoFiniquito } from "@/lib/finiquito";
import { clp } from "@/lib/pricing";

export type Fin = {
  id: string; trabajador_id: string; version: number; estado: "en_revision" | "observado" | "aprobado" | "anulado";
  datos: DatosFiniquito; detalle: ResultadoFiniquito; total: number; creado: string; revisado_at: string | null; observacion: string | null;
};
const ESTADO: Record<Fin["estado"], string> = {
  en_revision: "En revisión del equipo ENQORA", observado: "Con observaciones", aprobado: "Aprobado", anulado: "Anulado",
};

// Finiquito de un trabajador dado de baja: propuesta calculada por la empresa y revisada por el equipo ENQORA.
export function FiniquitoBloque({ t, fin, prefill }: {
  t: { id: string; causal_termino: number | null; fecha_baja: string | null };
  fin: Fin | null;
  prefill: { base: number; base_feriado: number; uf: number | null };
}) {
  const causal = t.causal_termino ?? 0;
  const conIas = CAUSALES_IAS.has(causal);
  const d = fin?.datos;
  const puedeCalcular = !fin || fin.estado !== "aprobado";
  return (
    <div className="rem-acciones">
      {fin ? (
        <div className="rem-fin">
          <p>
            <b>Finiquito v{fin.version} · {ESTADO[fin.estado]}</b> · total {clp(Number(fin.total))}
            {fin.detalle?.plazo_pago ? ` · pagar a más tardar el ${fin.detalle.plazo_pago.split("-").reverse().join("-")} (referencial)` : ""}
          </p>
          <ul className="rem-fin-lineas">
            {fin.detalle?.haberes?.map((l, i) => <li key={`h${i}`}>{l.concepto}: <b>{clp(l.monto)}</b></li>)}
            {fin.detalle?.descuentos?.map((l, i) => <li key={`d${i}`}>Menos {l.concepto}: <b>{clp(l.monto)}</b></li>)}
          </ul>
          {fin.detalle?.advertencias?.length ? <ul className="rem-adv">{fin.detalle.advertencias.map((a) => <li key={a}>{a}</li>)}</ul> : null}
          {fin.observacion ? <p className="muted-line">Observación del equipo: {fin.observacion}</p> : null}
          <div className="upload-row">
            <Link className={`btn ${fin.estado === "aprobado" ? "btn-gold" : "btn-ghost"} btn-inline btn-sm`} href={`/remuneraciones/finiquito/${fin.id}`}>
              {fin.estado === "aprobado" ? "Ver e imprimir" : "Ver borrador"}
            </Link>
          </div>
          {fin.estado !== "anulado" ? (
            <details className="ps-docs">
              <summary>Anular esta versión</summary>
              <form action={anularFiniquitoAction} className="upload-row">
                <input type="hidden" name="id" value={fin.id} />
                <input name="motivo" className="input input-sm" required minLength={3} maxLength={300} placeholder="Motivo" aria-label="Motivo de anulación" />
                <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Anular</SubmitButton>
              </form>
            </details>
          ) : null}
        </div>
      ) : null}
      {puedeCalcular ? (
        <details className="ps-docs" open={!fin || fin.estado === "observado"}>
          <summary>{fin ? "Calcular una versión nueva" : "Calcular finiquito"}</summary>
          <form action={calcularFiniquitoAction} className="form-grid">
            <input type="hidden" name="trabajador" value={t.id} />
            {conIas ? (
              <>
                <div className="field">
                  <label htmlFor={`fb-${t.id}`}>Última remuneración mensual ($)</label>
                  <input id={`fb-${t.id}`} name="base_indemnizacion" className="input" inputMode="numeric" required defaultValue={String(d?.base_indemnizacion ?? prefill.base)} />
                  <span className="hint">Art. 172: todo lo que recibía cada mes (sueldo, gratificación mensual, colación, movilización y bonos fijos), sin horas extra ni asignación familiar.</span>
                </div>
                <div className="field">
                  <label htmlFor={`fu-${t.id}`}>Valor de la UF ($)</label>
                  <input id={`fu-${t.id}`} name="uf" className="input" inputMode="decimal" required defaultValue={d?.uf ? String(d.uf).replace(".", ",") : prefill.uf ? String(prefill.uf).replace(".", ",") : ""} />
                  <span className="hint">Del último día del mes anterior al pago: tope de 90 UF.</span>
                </div>
                {causal !== 20 ? (
                  <div className="field">
                    <label htmlFor={`fa-${t.id}`}>¿Se avisó con 30 días de anticipación?</label>
                    <select id={`fa-${t.id}`} name="aviso_dado" className="input" defaultValue={d?.aviso_dado ? "si" : "no"}>
                      <option value="no">No: se paga el mes de aviso</option>
                      <option value="si">Sí, con carta y 30 días</option>
                    </select>
                  </div>
                ) : null}
                {CAUSALES_AFC.has(causal) ? (
                  <div className="field">
                    <label htmlFor={`fc-${t.id}`}>Aporte del empleador al seguro de cesantía ($)</label>
                    <input id={`fc-${t.id}`} name="aporte_afc" className="input" inputMode="numeric" defaultValue={String(d?.aporte_afc ?? 0)} />
                    <span className="hint">Cuenta individual más rentabilidad, según el certificado de la AFC. Se descuenta de la indemnización (art. 13 Ley 19.728).</span>
                  </div>
                ) : null}
              </>
            ) : null}
            <div className="field">
              <label htmlFor={`ff-${t.id}`}>Remuneración mensual para el feriado ($)</label>
              <input id={`ff-${t.id}`} name="base_feriado" className="input" inputMode="numeric" required defaultValue={String(d?.base_feriado ?? prefill.base_feriado)} />
              <span className="hint">Sueldo base; si tiene remuneración variable, súmale el promedio de los últimos tres meses (art. 71).</span>
            </div>
            <div className="field">
              <label htmlFor={`fp-${t.id}`}>Días hábiles de vacaciones pendientes</label>
              <input id={`fp-${t.id}`} name="dias_pendientes" className="input" inputMode="decimal" defaultValue={String(d?.dias_pendientes ?? 0).replace(".", ",")} />
              <span className="hint">De años ya cumplidos y no tomados. El proporcional del último año lo calcula ENQORA.</span>
            </div>
            <div className="field">
              <label htmlFor={`fn-${t.id}`}>Feriado anual (días hábiles)</label>
              <input id={`fn-${t.id}`} name="feriado_anual" className="input" inputMode="decimal" defaultValue={String(d?.feriado_anual ?? 15)} />
              <span className="hint">15, o más si tiene feriado progresivo.</span>
            </div>
            <div className="field">
              <label htmlFor={`fo-${t.id}`}>Otros haberes ($)</label>
              <input id={`fo-${t.id}`} name="otros_haberes" className="input" inputMode="numeric" defaultValue={String(d?.otros_haberes ?? 0)} />
            </div>
            <div className="field">
              <label htmlFor={`fd-${t.id}`}>Otros descuentos ($)</label>
              <input id={`fd-${t.id}`} name="otros_descuentos" className="input" inputMode="numeric" defaultValue={String(d?.otros_descuentos ?? 0)} />
              <span className="hint">Solo los que el trabajador autorizó por escrito (por ejemplo, un préstamo).</span>
            </div>
            <div className="field field-wide">
              <label htmlFor={`fx-${t.id}`}>Detalle de otros haberes o descuentos</label>
              <input id={`fx-${t.id}`} name="detalle_otros" className="input" maxLength={300} defaultValue={d?.detalle_otros ?? ""} />
            </div>
            <div className="field"><label>&nbsp;</label><SubmitButton className="btn-inline btn-sm" pendingText="Calculando…">Calcular y enviar a revisión</SubmitButton></div>
          </form>
          <p className="muted-line">El sueldo de los días trabajados del último mes va en su liquidación de ese mes. La propuesta la revisa el equipo ENQORA antes de que puedas imprimirla.</p>
        </details>
      ) : null}
    </div>
  );
}
